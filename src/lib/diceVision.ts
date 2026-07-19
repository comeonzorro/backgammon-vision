import type { DetectionFrame, DiceDetection } from "../types";
import type { BoardCalibration } from "../types/board";
import { boardBoundingRect, getBoardSearchZone, pointInPolygon } from "./autoCalibrateBoard";

/**
 * Lecture des dés par vision :
 *  1. repérage des candidats sur le tapis calibré, DANS LES DEUX POLARITÉS
 *     (dés clairs à pips foncés ET dés foncés à pips clairs), avec un a
 *     priori de taille relatif au plateau (un dé ≈ 1/20 à 1/55 de la
 *     longueur du plateau) qui exclut les pions, plus gros,
 *  2. lecture de chaque face en pleine résolution : seuil d'Otsu local,
 *     extraction des pips (composantes connexes) avec filtres géométriques,
 *  3. validation du MOTIF de la face (1–6), invariante en rotation :
 *     symétrie centrale, colinéarité, pip central — un simple comptage de
 *     taches ne suffit pas (ombres, reflets, pions).
 */

// Largeur max du crop pour la recherche de candidats (la lecture de face
// se fait toujours en pleine résolution sur le crop du dé).
const MAX_WIDTH = 960;
const MIN_FACE_CONFIDENCE = 0.48;

/** Taille d'un dé en fraction de la longueur du plateau. */
const DIE_MIN_FRACTION = 1 / 60;
const DIE_MAX_FRACTION = 1 / 12;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Candidate extends Box {
  score: number;
  meanLum: number;
}

export function detectDiceWithCamera(
  imageData: ImageData,
  calibration?: BoardCalibration | null,
): DetectionFrame {
  const { width, height, data } = imageData;

  let crop = { x0: 0, y0: 0, w: width, h: height };
  const boardPoly = calibration ? getBoardSearchZone(calibration) : null;

  if (calibration) {
    const rect = boardBoundingRect(calibration, width, height);
    crop = { x0: rect.x0, y0: rect.y0, w: rect.w, h: rect.h };
  }

  const scale = crop.w > MAX_WIDTH ? MAX_WIDTH / crop.w : 1;
  const sw = Math.max(1, Math.round(crop.w * scale));
  const sh = Math.max(1, Math.round(crop.h * scale));
  const gray = downscaleGrayRegion(data, width, crop, sw, sh);

  // A priori de taille : la longueur du plateau (grand côté du crop).
  const boardSpan = Math.max(sw, sh);
  const sideMin = Math.max(5, boardSpan * DIE_MIN_FRACTION);
  const sideMax = Math.max(sideMin + 4, boardSpan * DIE_MAX_FRACTION);

  const candidates = findDiceCandidates(gray, sw, sh, sideMin, sideMax).filter((c) => {
    if (!boardPoly) return true;
    const nx = (crop.x0 + ((c.x + c.w / 2) / sw) * crop.w) / width;
    const ny = (crop.y0 + ((c.y + c.h / 2) / sh) * crop.h) / height;
    return pointInPolygon(nx, ny, boardPoly);
  });

  const invScale = 1 / scale;
  const scored: DiceDetection[] = [];

  for (const c of candidates.slice(0, 16)) {
    // La dilatation élargit le blob : on recentre une fenêtre carrée un peu
    // plus petite que le bbox pour exclure le cork périphérique.
    const side = Math.max(c.w, c.h);
    const cx = c.x + c.w / 2;
    const cy = c.y + c.h / 2;
    // Retranche surtout le halo de dilatation (~4 px), pas les coins du dé
    // (les pips du 6 sont près des bords).
    const tight = Math.max(sideMin, side - 5);
    const box = {
      x: Math.round(crop.x0 + (cx - tight / 2) * invScale),
      y: Math.round(crop.y0 + (cy - tight / 2) * invScale),
      w: Math.max(8, Math.round(tight * invScale)),
      h: Math.max(8, Math.round(tight * invScale)),
    };
    const read = readDieFace(data, width, height, box);
    if (read.value < 1 || read.value > 6 || read.confidence < MIN_FACE_CONFIDENCE) continue;

    scored.push({
      value: read.value,
      confidence: read.confidence,
      x: box.x / width,
      y: box.y / height,
      width: box.w / width,
      height: box.h / height,
    });
  }

  scored.sort((a, b) => b.confidence - a.confidence);
  const deduped = dedupeNearbyDice(scored);
  const dice = pickBestPair(deduped);
  dice.sort((a, b) => a.x - b.x);

  return {
    timestamp: Date.now(),
    dice,
    source: "camera-cv",
    motionScore: 0,
  };
}

/**
 * Deux dés d'un même jet ont des tailles quasi identiques : on choisit la
 * paire maximisant confiance + similarité de taille (rejette les faux
 * positifs isolés type reflet ou ombre).
 */
function pickBestPair(dice: DiceDetection[]): DiceDetection[] {
  if (dice.length <= 2) return dice.slice(0, 2);

  const top = dice.slice(0, 6);
  let best: [DiceDetection, DiceDetection] | null = null;
  let bestScore = -Infinity;

  for (let i = 0; i < top.length; i++) {
    for (let j = i + 1; j < top.length; j++) {
      const a = top[i];
      const b = top[j];
      const sa = Math.max(a.width, a.height);
      const sb = Math.max(b.width, b.height);
      const sizeSim = Math.min(sa, sb) / Math.max(sa, sb);
      if (sizeSim < 0.55) continue;
      const score = a.confidence + b.confidence + sizeSim * 0.5;
      if (score > bestScore) {
        bestScore = score;
        best = [a, b];
      }
    }
  }

  return best ? [...best] : dice.slice(0, 2);
}

function dedupeNearbyDice(dice: DiceDetection[]): DiceDetection[] {
  const kept: DiceDetection[] = [];
  for (const d of dice) {
    const cx = d.x + d.width / 2;
    const cy = d.y + d.height / 2;
    const dup = kept.some((k) => {
      const kx = k.x + k.width / 2;
      const ky = k.y + k.height / 2;
      const dist = Math.hypot(cx - kx, cy - ky);
      const span = Math.max(d.width, d.height, k.width, k.height);
      return dist < span * 0.85;
    });
    if (!dup) kept.push(d);
  }
  return kept;
}

export function frameMotionScore(prev: Uint8Array | null, gray: Uint8Array): number {
  if (!prev || prev.length !== gray.length) return 0;
  let sum = 0;
  const step = 4;
  let n = 0;
  for (let i = 0; i < gray.length; i += step) {
    sum += Math.abs(gray[i] - prev[i]);
    n++;
  }
  return n ? sum / n : 0;
}

function downscaleGrayRegion(
  data: Uint8ClampedArray,
  width: number,
  crop: { x0: number; y0: number; w: number; h: number },
  sw: number,
  sh: number,
): Uint8Array {
  const out = new Uint8Array(sw * sh);
  for (let y = 0; y < sh; y++) {
    const sy = crop.y0 + Math.min(crop.h - 1, Math.floor((y / sh) * crop.h));
    for (let x = 0; x < sw; x++) {
      const sx = crop.x0 + Math.min(crop.w - 1, Math.floor((x / sw) * crop.w));
      const i = (sy * width + sx) * 4;
      out[y * sw + x] = luminance(data[i], data[i + 1], data[i + 2]);
    }
  }
  return out;
}

/**
 * Candidats dés : blobs clairs (dés blancs) ET blobs foncés (dés noirs /
 * colorés à pips blancs). Les dés foncés sont cherchés via l'image
 * inversée — même pipeline que les dés clairs, plus robuste qu'un seuil
 * global bas (qui rate les petits cubes noirs sur tapis moyen).
 */
function findDiceCandidates(
  gray: Uint8Array,
  w: number,
  h: number,
  sideMin: number,
  sideMax: number,
): Candidate[] {
  const inverted = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) inverted[i] = 255 - gray[i];

  const bright = collectBrightBlobs(gray, w, h, sideMin, sideMax, true);
  const dark = collectBrightBlobs(inverted, w, h, sideMin, sideMax, false);

  const all = [...bright, ...dark];
  const merged: Candidate[] = [];
  for (const c of all.sort((a, b) => b.score - a.score)) {
    const cx = c.x + c.w / 2;
    const cy = c.y + c.h / 2;
    const dup = merged.some((m) => {
      const mx = m.x + m.w / 2;
      const my = m.y + m.h / 2;
      return Math.hypot(cx - mx, cy - my) < Math.max(c.w, c.h, m.w, m.h) * 0.7;
    });
    if (!dup) merged.push(c);
  }
  return merged;
}

function collectBrightBlobs(
  gray: Uint8Array,
  w: number,
  h: number,
  sideMin: number,
  sideMax: number,
  isBrightPass: boolean,
): Candidate[] {
  const total = w * h;
  const minArea = sideMin * sideMin * 0.45;
  const maxArea = sideMax * sideMax * 1.8;

  // Dilatation (max 5×5) : comble les trous des pips (rayon jusqu'à ~2–3 px
  // après sous-échantillonnage) pour que le blob du dé reste d'un seul tenant.
  const filled = dilateMax(gray, w, h, 2);

  const hist = new Uint32Array(256);
  for (let i = 0; i < total; i++) hist[filled[i]]++;
  let sum = 0;
  for (let v = 0; v < 256; v++) sum += v * hist[v];
  const mean = total ? sum / total : 128;

  const thresholds = [
    Math.min(210, Math.max(118, mean + 18)),
    percentileFromHist(hist, total, 0.92, 115),
  ];

  const out: Candidate[] = [];
  for (const threshold of thresholds) {
    const mask = new Uint8Array(total);
    for (let i = 0; i < total; i++) mask[i] = filled[i] >= threshold ? 1 : 0;

    const labels = labelComponents(mask, w, h);
    const stats = new Map<
      number,
      { count: number; minX: number; minY: number; maxX: number; maxY: number; lumSum: number }
    >();

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const label = labels[idx];
        if (label <= 0) continue;
        let s = stats.get(label);
        if (!s) {
          s = { count: 0, minX: x, minY: y, maxX: x, maxY: y, lumSum: 0 };
          stats.set(label, s);
        }
        s.count++;
        // Luminance réelle (pas inversée) pour le score / filtre.
        s.lumSum += isBrightPass ? gray[idx] : 255 - gray[idx];
        if (x < s.minX) s.minX = x;
        if (y < s.minY) s.minY = y;
        if (x > s.maxX) s.maxX = x;
        if (y > s.maxY) s.maxY = y;
      }
    }

    for (const s of stats.values()) {
      if (s.count < minArea || s.count > maxArea) continue;
      const bw = s.maxX - s.minX + 1;
      const bh = s.maxY - s.minY + 1;
      if (bw < sideMin * 0.65 || bh < sideMin * 0.65) continue;
      if (bw > sideMax * 1.55 || bh > sideMax * 1.55) continue;
      const aspect = bw / bh;
      if (aspect < 0.52 || aspect > 1.9) continue;
      const fill = s.count / (bw * bh);
      if (fill < 0.35) continue;
      const meanLum = s.lumSum / s.count;
      if (isBrightPass && meanLum < 110) continue;
      if (!isBrightPass && meanLum > 130) continue;

      out.push({
        x: s.minX,
        y: s.minY,
        w: bw,
        h: bh,
        meanLum,
        score: s.count * fill,
      });
    }
  }
  return out;
}

function percentileFromHist(
  hist: Uint32Array,
  total: number,
  p: number,
  floor: number,
): number {
  const target = total * p;
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= target) return Math.max(floor, v);
  }
  return Math.max(floor, 200);
}

/** Max-filter (2*radius+1)² : comble les pips au sein d'une face. */
function dilateMax(gray: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  const out = new Uint8Array(gray.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const v = gray[ny * w + nx];
          if (v > m) m = v;
        }
      }
      out[y * w + x] = m;
    }
  }
  return out;
}

interface PipBlob {
  area: number;
  cx: number;
  cy: number;
  bw: number;
  bh: number;
}

interface FaceReading {
  value: number;
  confidence: number;
}

/**
 * Lecture d'une face en pleine résolution, POLARITÉ AUTOMATIQUE.
 * Plusieurs recadrages (léger shrink / expand) sont essayés pour absorber
 * les artefacts d'aliasing sur les très petits dés (surtout face 6).
 */
function readDieFace(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  box: Box,
): FaceReading {
  const scales = [1, 0.9, 1.1, 0.8];
  let best: FaceReading = { value: 0, confidence: 0 };

  for (const s of scales) {
    const side = Math.max(9, Math.round(Math.min(box.w, box.h) * s));
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const sub = {
      x: Math.round(cx - side / 2),
      y: Math.round(cy - side / 2),
      w: side,
      h: side,
    };
    const reading = readDieFaceOnce(data, width, height, sub);
    if (reading.confidence > best.confidence) best = reading;
    if (best.confidence >= 0.9 && best.value >= 1) break;
  }
  return best;
}

function readDieFaceOnce(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  box: Box,
): FaceReading {
  const pad = Math.round(Math.min(box.w, box.h) * 0.04);
  const x0 = clamp(box.x - pad, 0, width - 1);
  const y0 = clamp(box.y - pad, 0, height - 1);
  const x1 = clamp(box.x + box.w + pad, 0, width);
  const y1 = clamp(box.y + box.h + pad, 0, height);
  const cw = x1 - x0;
  const ch = y1 - y0;
  if (cw < 9 || ch < 9) return { value: 0, confidence: 0 };

  const step = Math.max(1, Math.ceil(Math.max(cw, ch) / 120));
  const gw = Math.floor(cw / step);
  const gh = Math.floor(ch / step);
  if (gw < 9 || gh < 9) return { value: 0, confidence: 0 };

  const lum = new Uint8Array(gw * gh);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const i = ((y0 + y * step) * width + (x0 + x * step)) * 4;
      lum[y * gw + x] = luminance(data[i], data[i + 1], data[i + 2]);
    }
  }

  let sum = 0;
  let minL = 255;
  let maxL = 0;
  for (let i = 0; i < lum.length; i++) {
    const v = lum[i];
    sum += v;
    if (v < minL) minL = v;
    if (v > maxL) maxL = v;
  }
  const mean = sum / lum.length;
  const contrast = maxL - minL;
  if (contrast < 30) return { value: 0, confidence: 0 };

  const faceIsBright = mean > (minL + maxL) / 2;
  const readings: FaceReading[] = [];

  if (faceIsBright || mean >= 100) {
    const pipTh = mean - Math.max(16, contrast * 0.25);
    readings.push(analyzeFace(lum, gw, gh, true, pipTh, contrast));
  }
  if (!faceIsBright || mean <= 140) {
    const pipTh = mean + Math.max(16, contrast * 0.25);
    readings.push(analyzeFace(lum, gw, gh, false, pipTh, contrast));
  }

  let best: FaceReading = { value: 0, confidence: 0 };
  for (const r of readings) {
    if (r.confidence > best.confidence) best = r;
  }
  return best;
}

function analyzeFace(
  lum: Uint8Array,
  gw: number,
  gh: number,
  pipsAreDark: boolean,
  pipThreshold: number,
  contrast: number,
): FaceReading {
  const mask = new Uint8Array(gw * gh);
  let maskCount = 0;
  for (let i = 0; i < lum.length; i++) {
    const isPip = pipsAreDark ? lum[i] <= pipThreshold : lum[i] >= pipThreshold;
    if (isPip) {
      mask[i] = 1;
      maskCount++;
    }
  }

  const faceArea = gw * gh;
  // Les pips ne couvrent jamais plus de ~40 % d'une face de dé.
  if (maskCount === 0 || maskCount > faceArea * 0.4) return { value: 0, confidence: 0 };

  // 4-connexité par défaut (évite de fusionner des pips en diagonale).
  // Sur les tout petits crops on essaie aussi la 8-connexité et on garde
  // le comptage le plus crédible (1–6).
  const blobs4 = extractPipBlobs(mask, gw, gh, false);
  const blobs8 = Math.min(gw, gh) < 40 ? extractPipBlobs(mask, gw, gh, true) : blobs4;
  const pickBlobs = (a: PipBlob[], b: PipBlob[]) => {
    const score = (arr: PipBlob[]) => {
      const n = arr.length;
      if (n < 1 || n > 7) return -1;
      return n <= 6 ? n + 0.5 : 6;
    };
    return score(a) >= score(b) ? a : b;
  };
  const blobs = pickBlobs(blobs4, blobs8);
  const dieSize = Math.min(gw, gh);

  const pips = blobs.filter((b) => {
    if (b.area < Math.max(2, faceArea * 0.005) || b.area > faceArea * 0.13) return false;
    const aspect = b.bw / Math.max(1, b.bh);
    if (aspect < 0.4 || aspect > 2.5) return false;
    if (Math.max(b.bw, b.bh) > dieSize * 0.48) return false;
    const mx = b.cx / gw;
    const my = b.cy / gh;
    return mx > 0.08 && mx < 0.92 && my > 0.08 && my < 0.92;
  });

  if (pips.length === 0) return { value: 0, confidence: 0 };

  // Pips fusionnés (flou / petit dé) : estimation par surface relative.
  const areas = pips.map((p) => p.area).sort((a, b) => a - b);
  const medianArea = areas[Math.floor(areas.length / 2)];
  let mergedExtra = 0;
  for (const p of pips) {
    if (p.area > medianArea * 1.75) {
      mergedExtra += Math.min(2, Math.round(p.area / medianArea) - 1);
    }
  }

  let blobCount = pips.length;
  // Sur les petits dés, deux pips du 6 peuvent fusionner ou un pip se
  // fragmenter : on borne à 6 et on laisse la géométrie trancher.
  let value = blobCount + mergedExtra;
  if (value > 6 && blobCount >= 5) {
    value = 6;
    blobCount = Math.min(blobCount, 6);
  }
  if (value < 1 || value > 6) return { value: 0, confidence: 0 };

  // Une face « 1 » a un pip unique, rond, centré, de taille significative
  // (rejette les reflets sur pions et les ombres).
  if (value === 1) {
    const p = pips[0];
    if (p.area < faceArea * 0.02 || p.area > faceArea * 0.13) return { value: 0, confidence: 0 };
    const aspect = p.bw / Math.max(1, p.bh);
    if (aspect < 0.6 || aspect > 1.65) return { value: 0, confidence: 0 };
  }

  const centers = pips.map((p) => ({
    x: (p.cx / gw) * 2 - 1,
    y: (p.cy / gh) * 2 - 1,
  }));
  // Sur les très petits dés / pips fusionnés la géométrie est bruitée.
  let patternScore: number;
  if (mergedExtra > 0 || pips.length !== value) {
    patternScore = value === 6 && pips.length >= 5 ? 0.5 : 0.42;
  } else {
    patternScore = validatePipPattern(centers, value);
  }
  const minPattern = dieSize < 22 ? 0.2 : 0.26;
  if (patternScore < minPattern) return { value: 0, confidence: 0 };

  const areaMean = areas.reduce((a, b) => a + b, 0) / areas.length;
  let areaVar = 0;
  for (const a of areas) areaVar += (a - areaMean) ** 2;
  areaVar /= areas.length;
  const uniformity = 1 - Math.min(1, Math.sqrt(areaVar) / (areaMean || 1));

  let confidence =
    0.3 +
    patternScore * 0.34 +
    uniformity * 0.14 +
    Math.min(0.14, (contrast - 26) / 320) +
    0.06;
  if (mergedExtra > 0) confidence -= 0.12;

  return { value, confidence: Math.max(0, Math.min(0.97, confidence)) };
}

interface PipCenter {
  x: number;
  y: number;
}

/**
 * Validation invariante en rotation des motifs de faces :
 *  1 → pip central ; 2/4/6 → paires symétriques par rapport au centre ;
 *  3/5 → idem + pip central ; 3 → colinéaires ; 6 → deux rangées de 3.
 * Retourne un score 0..1.
 */
function validatePipPattern(centers: PipCenter[], count: number): number {
  const n = centers.length;
  if (n !== count || n < 1 || n > 6) return 0;

  const norm = (c: PipCenter) => Math.hypot(c.x, c.y);

  if (n === 1) {
    return norm(centers[0]) < 0.42 ? 1 - norm(centers[0]) / 0.42 : 0;
  }

  const sorted = [...centers].sort((a, b) => norm(a) - norm(b));
  const hasCenter = n % 2 === 1;
  const centerPip = hasCenter ? sorted[0] : null;
  const outer = hasCenter ? sorted.slice(1) : sorted;

  let score = 1;

  if (hasCenter && centerPip) {
    const d = norm(centerPip);
    if (d > 0.4) return 0;
    score -= d * 0.6;
  }

  for (const c of outer) {
    const d = norm(c);
    if (d < 0.14) return 0;
    if (d < 0.28) score -= 0.12;
  }

  const used = new Array(outer.length).fill(false);
  let pairPenalty = 0;
  for (let i = 0; i < outer.length; i++) {
    if (used[i]) continue;
    let bestJ = -1;
    let bestErr = Infinity;
    for (let j = i + 1; j < outer.length; j++) {
      if (used[j]) continue;
      const err = Math.hypot(outer[i].x + outer[j].x, outer[i].y + outer[j].y);
      if (err < bestErr) {
        bestErr = err;
        bestJ = j;
      }
    }
    if (bestJ < 0 || bestErr > 0.7) return 0;
    used[i] = true;
    used[bestJ] = true;
    pairPenalty += Math.min(0.3, bestErr * 0.3);
  }
  score -= pairPenalty;

  if (n === 3) {
    const [a, b, c] = centers;
    const area2 = Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y));
    if (area2 > 0.7) return 0;
    score -= Math.min(0.35, area2 * 0.35);
  }

  if (n === 6) {
    let bestSplit = 0;
    for (let deg = 0; deg < 180; deg += 10) {
      const rad = (deg * Math.PI) / 180;
      const nx = Math.cos(rad);
      const ny = Math.sin(rad);
      let pos = 0;
      let neg = 0;
      let minAbs = Infinity;
      for (const c of centers) {
        const d = c.x * nx + c.y * ny;
        minAbs = Math.min(minAbs, Math.abs(d));
        if (d > 0) pos++;
        else neg++;
      }
      if (pos === 3 && neg === 3 && minAbs > 0.08) {
        bestSplit = Math.max(bestSplit, Math.min(1, minAbs / 0.25));
      }
    }
    // Fallback : 6 pips avec 3 paires symétriques déjà validées.
    if (bestSplit === 0) score -= 0.15;
    else score -= (1 - bestSplit) * 0.15;
  }

  return Math.max(0, Math.min(1, score));
}

function extractPipBlobs(
  mask: Uint8Array,
  w: number,
  h: number,
  useDiagonals: boolean,
): PipBlob[] {
  const visited = new Uint8Array(w * h);
  const blobs: PipBlob[] = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const start = y * w + x;
      if (!mask[start] || visited[start]) continue;

      let area = 0;
      let sx = 0;
      let sy = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      const stack = [start];
      visited[start] = 1;

      while (stack.length) {
        const idx = stack.pop()!;
        const cx = idx % w;
        const cy = (idx / w) | 0;
        area++;
        sx += cx;
        sy += cy;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            if (!useDiagonals && dx !== 0 && dy !== 0) continue;
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const ni = ny * w + nx;
            if (!mask[ni] || visited[ni]) continue;
            visited[ni] = 1;
            stack.push(ni);
          }
        }
      }

      if (area >= 2) {
        blobs.push({
          area,
          cx: sx / area,
          cy: sy / area,
          bw: maxX - minX + 1,
          bh: maxY - minY + 1,
        });
      }
    }
  }
  return blobs;
}

function labelComponents(mask: Uint8Array, w: number, h: number): Int32Array {
  const labels = new Int32Array(w * h);
  let current = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (!mask[idx] || labels[idx] !== 0) continue;
      current++;
      const stack = [idx];
      labels[idx] = current;
      while (stack.length) {
        const i = stack.pop()!;
        const cx = i % w;
        const cy = (i / w) | 0;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (!mask[ni] || labels[ni] !== 0) continue;
          labels[ni] = current;
          stack.push(ni);
        }
      }
    }
  }
  return labels;
}

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
