import type { BoardCalibration, BoardDetectionResult, BoardMapping } from "../types/board";
import { POINT_GRID } from "../types/board";
import type { NormPoint } from "../types/board";
import { standardBoard } from "./bg/engine";

/**
 * Lecture des pions par vision, quelle que soit l'orientation du plateau :
 *
 *  - GRILLE ORIENTABLE : le plateau peut être filmé en paysage (13 colonnes
 *    × 2 rangées) ou en portrait (charnière horizontale, colonnes
 *    verticales). L'orientation est déduite du quad de calibration et la
 *    numérotation (sens des points) est résolue automatiquement en
 *    comparant la détection à la position de départ standard.
 *
 *  - FOND DES FLÈCHES MODÉLISÉ : les triangles alternent deux couleurs
 *    (souvent noir/blanc — comme les pions !). Pour chaque échantillon on
 *    calcule le fond ATTENDU (triangle ou tapis selon la position
 *    transversale et la largeur du triangle qui décroît vers la pointe) et
 *    on ne déclare un pion que si la couleur observée s'en écarte. Un pion
 *    déborde du triangle en largeur, ce qui le distingue du fond même à
 *    couleur identique.
 *
 *  - COMPTAGE PAR LONGUEUR DE PILE (≈ 5 pions par flèche) et bear-off
 *    déduit (15 − pions vus par couleur).
 */

const COLS = 13;
const BAR_COL = 6;

const AXIS_SAMPLES = 26;
const CROSS_POSITIONS = [0.14, 0.32, 0.5, 0.68, 0.86];
const CHECKERS_PER_POINT = 5.4;

interface RGB {
  r: number;
  g: number;
  b: number;
}

interface CellReading {
  white: number;
  black: number;
  confidence: number;
}

/**
 * Orientation par défaut : transposée si le quad (en pixels) est plus haut
 * que large. Les coins sont normalisés 0–1 : il faut donc le ratio d'aspect
 * de l'image pour ne pas confondre un cadre portrait rempli avec un paysage.
 */
export function inferDefaultMapping(
  calibration: BoardCalibration,
  imageWidth = 1,
  imageHeight = 1,
): BoardMapping {
  const [tl, tr, br, bl] = calibration.corners;
  const w =
    (pixelDist(tl, tr, imageWidth, imageHeight) +
      pixelDist(bl, br, imageWidth, imageHeight)) /
    2;
  const h =
    (pixelDist(tl, bl, imageWidth, imageHeight) +
      pixelDist(tr, br, imageWidth, imageHeight)) /
    2;
  return { transposed: h > w * 1.05, flipMain: false, flipCross: false };
}

function pixelDist(a: NormPoint, b: NormPoint, w: number, h: number): number {
  return Math.hypot((a.x - b.x) * w, (a.y - b.y) * h);
}

export function detectBoardFromFrame(
  imageData: ImageData,
  calibration: BoardCalibration,
  mapping?: BoardMapping | null,
): BoardDetectionResult {
  const { width, height, data } = imageData;
  const m = mapping ?? inferDefaultMapping(calibration, width, height);
  const corners = calibration.corners;

  const cork = estimateCork(data, width, height, corners);
  const triColors = estimateTriangleColors(data, width, height, corners, m, cork);

  const points: BoardDetectionResult["points"] = [];
  const pointConfidence: Record<number, number> = {};
  let barWhite = 0;
  let barBlack = 0;
  let confSum = 0;
  let confN = 0;

  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < COLS; col++) {
      const id = POINT_GRID[row][col];

      if (id === "bar") {
        const read = readBarCell(data, width, height, corners, m, row, col, cork);
        barWhite += read.white;
        barBlack += read.black;
        confSum += read.confidence;
        confN++;
        continue;
      }

      const parity = cellParity(m, row, col);
      const read = readCell(
        data,
        width,
        height,
        corners,
        m,
        row,
        col,
        cork,
        triColors[parity],
      );

      points.push({ index: id, white: read.white, black: read.black });
      pointConfidence[id] = read.confidence;
      confSum += read.confidence;
      confN++;
    }
  }

  points.sort((a, b) => a.index - b.index);

  barWhite = Math.min(barWhite, 15);
  barBlack = Math.min(barBlack, 15);

  const seenWhite = points.reduce((a, p) => a + p.white, 0) + barWhite;
  const seenBlack = points.reduce((a, p) => a + p.black, 0) + barBlack;
  const confidence = confN ? confSum / confN : 0;

  return {
    timestamp: Date.now(),
    points,
    barWhite,
    barBlack,
    offWhite: confidence >= 0.45 ? Math.max(0, 15 - seenWhite) : 0,
    offBlack: confidence >= 0.45 ? Math.max(0, 15 - seenBlack) : 0,
    confidence,
    pointConfidence,
    source: "camera-cv",
  };
}

/**
 * Résolution automatique de l'orientation / numérotation : essaie les
 * 4 sens possibles et garde celui dont la détection est la plus proche de
 * la position de départ standard. À utiliser quand les pions sont en
 * position initiale (validation de calibration / début de partie).
 */
export function resolveBoardMapping(
  imageData: ImageData,
  calibration: BoardCalibration,
): { mapping: BoardMapping; distance: number } | null {
  // Essaie les deux orientations (portrait/paysage) × 4 sens de numérotation.
  const reference = standardBoard();
  let best: { mapping: BoardMapping; distance: number } | null = null;

  for (const transposed of [false, true]) {
    for (const flipMain of [false, true]) {
      for (const flipCross of [false, true]) {
        const mapping: BoardMapping = { transposed, flipMain, flipCross };
        const det = detectBoardFromFrame(imageData, calibration, mapping);

        let distance = Math.abs(det.barWhite) + Math.abs(det.barBlack);
        for (const p of det.points) {
          const ref = reference.points[p.index - 1];
          distance += Math.abs(p.white - ref.white) + Math.abs(p.black - ref.black);
        }

        if (!best || distance < best.distance) {
          best = { mapping, distance };
        }
      }
    }
  }

  return best;
}

/** Parité physique d'une cellule (les triangles alternent 2 couleurs). */
function cellParity(m: BoardMapping, row: number, col: number): number {
  const c = m.flipMain ? COLS - 1 - col : col;
  const r = m.flipCross ? 1 - row : row;
  return (r + c) % 2;
}

/**
 * Point d'échantillonnage d'une cellule :
 *  t ∈ [0,1] le long de la pile (0 = base au bord extérieur, 1 = pointe),
 *  s ∈ [0,1] en travers de la flèche.
 */
function samplePoint(
  corners: [NormPoint, NormPoint, NormPoint, NormPoint],
  m: BoardMapping,
  row: number,
  col: number,
  t: number,
  s: number,
): NormPoint {
  const c = m.flipMain ? COLS - 1 - col : col;
  const r = m.flipCross ? 1 - row : row;

  const main = (c + s) / COLS;
  const axis = r === 0 ? t / 2 : 1 - t / 2;

  const u = m.transposed ? axis : main;
  const v = m.transposed ? main : axis;
  return bilinear(corners, u, v);
}

function readPixel(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  p: NormPoint,
): RGB | null {
  const x = Math.round(p.x * width);
  const y = Math.round(p.y * height);
  if (x < 0 || y < 0 || x >= width || y >= height) return null;
  const i = (y * width + x) * 4;
  return { r: data[i], g: data[i + 1], b: data[i + 2] };
}

/** Tapis (cork/feutre) : médiane robuste sur l'intérieur du plateau. */
function estimateCork(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  corners: [NormPoint, NormPoint, NormPoint, NormPoint],
): RGB & { lum: number } {
  const samples: (RGB & { lum: number })[] = [];
  for (let iu = 0; iu < 30; iu++) {
    for (let iv = 0; iv < 30; iv++) {
      const u = 0.05 + (iu / 29) * 0.9;
      const v = 0.05 + (iv / 29) * 0.9;
      const px = readPixel(data, width, height, bilinear(corners, u, v));
      if (!px) continue;
      samples.push({ ...px, lum: luminance(px.r, px.g, px.b) });
    }
  }
  if (samples.length === 0) return { r: 150, g: 120, b: 90, lum: 125 };

  samples.sort((a, b) => a.lum - b.lum);
  const med = samples[Math.floor(samples.length / 2)].lum;
  const near = samples.filter((s) => Math.abs(s.lum - med) < 24);
  const n = near.length || 1;
  const acc = near.reduce(
    (s, x) => ({ r: s.r + x.r, g: s.g + x.g, b: s.b + x.b, lum: s.lum + x.lum }),
    { r: 0, g: 0, b: 0, lum: 0 },
  );
  return { r: acc.r / n, g: acc.g / n, b: acc.b / n, lum: acc.lum / n };
}

/**
 * Couleurs des deux familles de triangles : médiane des pointes (zone
 * t ≈ 0.9, rarement couverte par les piles) par parité.
 */
function estimateTriangleColors(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  corners: [NormPoint, NormPoint, NormPoint, NormPoint],
  m: BoardMapping,
  cork: RGB & { lum: number },
): [RGB, RGB] {
  const groups: RGB[][] = [[], []];

  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < COLS; col++) {
      if (col === BAR_COL) continue;
      const acc = { r: 0, g: 0, b: 0 };
      let n = 0;
      for (const t of [0.86, 0.92]) {
        const px = readPixel(
          data,
          width,
          height,
          samplePoint(corners, m, row, col, t, 0.5),
        );
        if (!px) continue;
        acc.r += px.r;
        acc.g += px.g;
        acc.b += px.b;
        n++;
      }
      if (n === 0) continue;
      groups[cellParity(m, row, col)].push({ r: acc.r / n, g: acc.g / n, b: acc.b / n });
    }
  }

  const medianOf = (arr: RGB[]): RGB => {
    if (arr.length === 0) return cork;
    const byLum = [...arr].sort(
      (a, b) => luminance(a.r, a.g, a.b) - luminance(b.r, b.g, b.b),
    );
    return byLum[Math.floor(byLum.length / 2)];
  };

  return [medianOf(groups[0]), medianOf(groups[1])];
}

/** Demi-largeur du triangle (fraction de la cellule) à la position t. */
function triangleHalfWidth(t: number): number {
  return Math.max(0.05, 0.46 * (1 - t));
}

function colorDist(a: RGB, b: RGB): number {
  return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
}

function readCell(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  corners: [NormPoint, NormPoint, NormPoint, NormPoint],
  m: BoardMapping,
  row: number,
  col: number,
  cork: RGB & { lum: number },
  triangleColor: RGB,
): CellReading {
  const coverTh = Math.max(40, cork.lum * 0.25) * 1.9;

  let coveredSteps = 0;
  let whiteVotes = 0;
  let blackVotes = 0;
  let marginSum = 0;
  let uncoveredStreak = 0;
  let seenCovered = false;

  for (let k = 0; k < AXIS_SAMPLES; k++) {
    const t = 0.03 + (k / (AXIS_SAMPLES - 1)) * 0.9;
    const halfW = triangleHalfWidth(t);

    let covered = 0;
    let stepWhite = 0;
    let stepBlack = 0;
    let stepMargin = 0;

    for (const s of CROSS_POSITIONS) {
      const px = readPixel(
        data,
        width,
        height,
        samplePoint(corners, m, row, col, t, s),
      );
      if (!px) continue;

      const onTriangle = Math.abs(s - 0.5) <= halfW;
      const expected = onTriangle ? triangleColor : cork;
      const diff = colorDist(px, expected);
      if (diff <= coverTh) continue;

      covered++;
      stepMargin += Math.min(1, diff / (coverTh * 2));
      const lum = luminance(px.r, px.g, px.b);
      if (lum >= cork.lum) stepWhite++;
      else stepBlack++;
    }

    const isCovered = covered >= 1;
    if (isCovered) {
      seenCovered = true;
      uncoveredStreak = 0;
      coveredSteps++;
      whiteVotes += stepWhite;
      blackVotes += stepBlack;
      marginSum += stepMargin / Math.max(1, covered);
    } else if (seenCovered) {
      uncoveredStreak++;
      if (uncoveredStreak >= 3) break;
    }
  }

  if (coveredSteps === 0) {
    return { white: 0, black: 0, confidence: 0.6 };
  }

  const stepsPerChecker = AXIS_SAMPLES / CHECKERS_PER_POINT;
  const count = Math.max(1, Math.min(7, Math.round(coveredSteps / stepsPerChecker)));

  const totalVotes = whiteVotes + blackVotes;
  const isWhite = whiteVotes >= blackVotes;
  const purity = totalVotes > 0 ? Math.max(whiteVotes, blackVotes) / totalVotes : 0;
  const avgMargin = marginSum / coveredSteps;
  const confidence = Math.min(0.95, 0.25 + purity * 0.4 + avgMargin * 0.3);

  return {
    white: isWhite ? count : 0,
    black: isWhite ? 0 : count,
    confidence,
  };
}

/**
 * Bar (charnière) : fond différent du tapis → référence locale = médiane
 * des échantillons de la cellule elle-même. Les deux couleurs peuvent
 * coexister.
 */
function readBarCell(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  corners: [NormPoint, NormPoint, NormPoint, NormPoint],
  m: BoardMapping,
  row: number,
  col: number,
  cork: RGB & { lum: number },
): CellReading {
  const all: { px: RGB; lum: number }[] = [];

  for (let k = 0; k < AXIS_SAMPLES; k++) {
    const t = 0.05 + (k / (AXIS_SAMPLES - 1)) * 0.9;
    for (const s of [0.3, 0.5, 0.7]) {
      const px = readPixel(
        data,
        width,
        height,
        samplePoint(corners, m, row, col, t, s),
      );
      if (!px) continue;
      all.push({ px, lum: luminance(px.r, px.g, px.b) });
    }
  }
  if (all.length < 8) return { white: 0, black: 0, confidence: 0.3 };

  const sorted = [...all].sort((a, b) => a.lum - b.lum);
  const bg = sorted[Math.floor(sorted.length / 2)].px;
  const coverTh = Math.max(40, cork.lum * 0.25) * 1.9;

  let whiteSamples = 0;
  let blackSamples = 0;
  for (const { px, lum } of all) {
    if (colorDist(px, bg) <= coverTh) continue;
    if (lum >= cork.lum + 20) whiteSamples++;
    else if (lum <= cork.lum - 20) blackSamples++;
  }

  const samplesPerChecker = (all.length / CHECKERS_PER_POINT) * 0.8;
  const white = Math.min(6, Math.round(whiteSamples / samplesPerChecker));
  const black = Math.min(6, Math.round(blackSamples / samplesPerChecker));

  return { white, black, confidence: 0.5 };
}

function bilinear(
  corners: [NormPoint, NormPoint, NormPoint, NormPoint],
  u: number,
  v: number,
): NormPoint {
  const [tl, tr, br, bl] = corners;
  const tx = lerp(tl.x, tr.x, u);
  const ty = lerp(tl.y, tr.y, u);
  const bx = lerp(bl.x, br.x, u);
  const by = lerp(bl.y, br.y, u);
  return { x: lerp(tx, bx, v), y: lerp(ty, by, v) };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

export function boardStatesMatch(
  a: BoardDetectionResult,
  b: BoardDetectionResult,
  tolerance = 1,
): boolean {
  for (const p of a.points) {
    const other = b.points.find((x) => x.index === p.index);
    if (!other) return false;
    if (Math.abs(p.white - other.white) > tolerance) return false;
    if (Math.abs(p.black - other.black) > tolerance) return false;
  }
  return (
    Math.abs(a.barWhite - b.barWhite) <= tolerance &&
    Math.abs(a.barBlack - b.barBlack) <= tolerance
  );
}

export function detectionToSnapshot(det: BoardDetectionResult) {
  return {
    points: det.points.map((p) => ({ index: p.index, white: p.white, black: p.black })),
    barWhite: det.barWhite,
    barBlack: det.barBlack,
    offWhite: det.offWhite,
    offBlack: det.offBlack,
  };
}
