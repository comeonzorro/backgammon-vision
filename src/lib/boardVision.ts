import type { BoardCalibration, BoardDetectionResult } from "../types/board";
import { POINT_GRID } from "../types/board";
import type { NormPoint } from "../types/board";

/**
 * Lecture des pions par vision :
 *  1. estimation de la couleur de référence du tapis sur la bande médiane,
 *  2. pour chaque flèche : échantillonnage multi-colonnes le long de l'axe
 *     de la pile (base → pointe), classification blanc / noir / tapis par
 *     écart de luminance ET de chrominance à la référence,
 *  3. comptage par LONGUEUR de pile (≈ 5 pions par flèche) au lieu d'un
 *     comptage de pics sur une seule ligne (fragile aux ombres),
 *  4. bear-off déduit : 15 − pions vus (par couleur).
 */

const COLS = 13;
const ROWS = 2;

/** Pas d'échantillonnage le long d'une flèche. */
const AXIS_SAMPLES = 26;
/** Positions transversales échantillonnées (fraction de la largeur de case). */
const CROSS_POSITIONS = [0.35, 0.5, 0.65];
/** Un pion occupe ≈ 1/5,4 de la longueur de la flèche. */
const CHECKERS_PER_POINT = 5.4;

interface FeltReference {
  lum: number;
  r: number;
  g: number;
  b: number;
}

interface CellReading {
  white: number;
  black: number;
  confidence: number;
}

export function detectBoardFromFrame(
  imageData: ImageData,
  calibration: BoardCalibration,
): BoardDetectionResult {
  const { width, height, data } = imageData;
  const felt = estimateFelt(data, width, height, calibration.corners);

  const points: BoardDetectionResult["points"] = [];
  const pointConfidence: Record<number, number> = {};
  let barWhite = 0;
  let barBlack = 0;
  let confSum = 0;
  let confN = 0;

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const id = POINT_GRID[row][col];
      const quad = getCellQuad(calibration.corners, col, row, COLS, ROWS);
      const read = readCell(data, width, height, quad, row, felt, id === "bar");

      if (id === "bar") {
        barWhite += read.white;
        barBlack += read.black;
        confSum += read.confidence;
        confN++;
        continue;
      }

      points.push({
        index: id,
        white: read.white,
        black: read.black,
      });
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
    // Pions sortis (bear-off) : déduits du total, seulement si la lecture
    // est assez fiable pour ne pas inventer des sorties sur du bruit.
    offWhite: confidence >= 0.45 ? Math.max(0, 15 - seenWhite) : 0,
    offBlack: confidence >= 0.45 ? Math.max(0, 15 - seenBlack) : 0,
    confidence,
    pointConfidence,
    source: "camera-cv",
  };
}

/** Référence tapis : médiane des échantillons de la bande médiane du plateau. */
function estimateFelt(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  corners: [NormPoint, NormPoint, NormPoint, NormPoint],
): FeltReference {
  const samples: { lum: number; r: number; g: number; b: number }[] = [];

  for (const v of [0.45, 0.5, 0.55]) {
    for (let u = 0.04; u <= 0.96; u += 0.02) {
      const p = bilinear(corners, u, v);
      const x = Math.round(p.x * width);
      const y = Math.round(p.y * height);
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      samples.push({ lum: luminance(r, g, b), r, g, b });
    }
  }

  if (samples.length === 0) return { lum: 100, r: 90, g: 110, b: 80 };

  // Médiane robuste : ignorer le quart le plus clair et le plus sombre
  // (pions posés sur la bande médiane, reflets).
  samples.sort((a, b) => a.lum - b.lum);
  const q = Math.floor(samples.length / 4);
  const mid = samples.slice(q, samples.length - q);
  const n = mid.length || 1;
  const acc = mid.reduce(
    (s, x) => ({ lum: s.lum + x.lum, r: s.r + x.r, g: s.g + x.g, b: s.b + x.b }),
    { lum: 0, r: 0, g: 0, b: 0 },
  );

  return { lum: acc.lum / n, r: acc.r / n, g: acc.g / n, b: acc.b / n };
}

type SampleClass = "white" | "black" | "felt";

interface ClassifiedSample {
  cls: SampleClass;
  margin: number;
}

function classifySample(
  r: number,
  g: number,
  b: number,
  felt: FeltReference,
): ClassifiedSample {
  const lum = luminance(r, g, b);
  const dLum = lum - felt.lum;
  const chroma = Math.abs(r - felt.r) + Math.abs(g - felt.g) + Math.abs(b - felt.b);

  const whiteTh = Math.max(30, felt.lum * 0.28);
  const blackTh = Math.max(24, felt.lum * 0.34);

  if (dLum > whiteTh && chroma > whiteTh * 0.8) {
    return { cls: "white", margin: Math.min(1, (dLum - whiteTh) / whiteTh + 0.5) };
  }
  if (dLum < -blackTh && chroma > blackTh * 0.6) {
    return { cls: "black", margin: Math.min(1, (-dLum - blackTh) / blackTh + 0.5) };
  }
  return { cls: "felt", margin: Math.min(1, 1 - Math.abs(dLum) / Math.max(whiteTh, blackTh)) };
}

/**
 * Lit une case (flèche ou bar) : échantillonne le long de l'axe de la pile
 * depuis la base et convertit la longueur de pile en nombre de pions.
 */
function readCell(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  quad: NormPoint[],
  row: number,
  felt: FeltReference,
  isBar: boolean,
): CellReading {
  // t = 0 à la BASE de la pile (bord extérieur), t = 1 vers le milieu.
  // row 0 : base en haut du quad (v' = 0) ; row 1 : base en bas (v' = 1).
  const classes: ClassifiedSample[] = [];

  for (let s = 0; s < AXIS_SAMPLES; s++) {
    const t = 0.03 + (s / (AXIS_SAMPLES - 1)) * 0.94;
    const v = row === 0 ? t : 1 - t;

    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    let n = 0;
    for (const u of CROSS_POSITIONS) {
      const p = bilinearQuad(quad, u, v);
      const x = Math.round(p.x * width);
      const y = Math.round(p.y * height);
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const i = (y * width + x) * 4;
      rSum += data[i];
      gSum += data[i + 1];
      bSum += data[i + 2];
      n++;
    }
    if (n === 0) {
      classes.push({ cls: "felt", margin: 0 });
      continue;
    }
    classes.push(classifySample(rSum / n, gSum / n, bSum / n, felt));
  }

  const stepsPerChecker = AXIS_SAMPLES / CHECKERS_PER_POINT;

  if (isBar) {
    // Sur le bar les deux couleurs coexistent (chacun son côté) :
    // comptage par longueur cumulée de chaque couleur.
    const whiteSteps = classes.filter((c) => c.cls === "white").length;
    const blackSteps = classes.filter((c) => c.cls === "black").length;
    const white = Math.round(whiteSteps / stepsPerChecker);
    const black = Math.round(blackSteps / stepsPerChecker);
    const conf = white + black > 0 ? 0.55 : 0.35;
    return { white, black, confidence: conf };
  }

  // Pile depuis la base : run de la couleur dominante, tolère 1 trou
  // (reflet / liseré entre pions).
  let runEnd = 0;
  let gap = 0;
  let whiteVotes = 0;
  let blackVotes = 0;
  let marginSum = 0;

  for (let s = 0; s < classes.length; s++) {
    const c = classes[s];
    if (c.cls === "felt") {
      gap++;
      if (gap >= 2) break;
    } else {
      gap = 0;
      runEnd = s + 1;
      marginSum += c.margin;
      if (c.cls === "white") whiteVotes++;
      else blackVotes++;
    }
  }

  const checkerSteps = whiteVotes + blackVotes;
  if (checkerSteps === 0) {
    return { white: 0, black: 0, confidence: 0.6 };
  }

  const count = Math.max(
    1,
    Math.min(7, Math.round((runEnd - Math.min(gap, 1)) / stepsPerChecker)),
  );
  const isWhite = whiteVotes >= blackVotes;
  const purity = Math.max(whiteVotes, blackVotes) / checkerSteps;
  const avgMargin = marginSum / checkerSteps;
  const confidence = Math.min(0.95, 0.3 + purity * 0.35 + avgMargin * 0.3);

  return {
    white: isWhite ? count : 0,
    black: isWhite ? 0 : count,
    confidence,
  };
}

function getCellQuad(
  corners: [NormPoint, NormPoint, NormPoint, NormPoint],
  col: number,
  row: number,
  cols: number,
  rows: number,
): NormPoint[] {
  const u0 = col / cols;
  const u1 = (col + 1) / cols;
  const v0 = row / rows;
  const v1 = (row + 1) / rows;
  return [
    bilinear(corners, u0, v0),
    bilinear(corners, u1, v0),
    bilinear(corners, u1, v1),
    bilinear(corners, u0, v1),
  ];
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

/** Interpolation bilinéaire à l'intérieur d'un quad quelconque (4 coins). */
function bilinearQuad(quad: NormPoint[], u: number, v: number): NormPoint {
  const [tl, tr, br, bl] = quad;
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
