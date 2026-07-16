import type { DetectionFrame, DiceDetection } from "../types";
import type { BoardCalibration } from "../types/board";
import { boardBoundingRect, getBoardSearchZone, pointInPolygon } from "./autoCalibrateBoard";

/**
 * Lecture des dés par vision :
 *  1. repérage des blobs clairs carrés sur le tapis calibré (multi-seuils),
 *  2. lecture de chaque face en pleine résolution : seuil d'Otsu local,
 *     extraction des pips (composantes connexes) avec filtres géométriques,
 *  3. validation du MOTIF de la face (1–6), invariante en rotation :
 *     symétrie centrale, colinéarité, pip central — un simple comptage de
 *     taches ne suffit pas (ombres, reflets, pions blancs).
 */

const MAX_WIDTH = 640;
const MIN_FACE_CONFIDENCE = 0.5;

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

  const candidates = findDiceCandidates(gray, sw, sh).filter((c) => {
    if (!boardPoly) return true;
    const nx = (crop.x0 + ((c.x + c.w / 2) / sw) * crop.w) / width;
    const ny = (crop.y0 + ((c.y + c.h / 2) / sh) * crop.h) / height;
    return pointInPolygon(nx, ny, boardPoly);
  });

  const invScale = 1 / scale;
  const scored: DiceDetection[] = [];

  for (const c of candidates.slice(0, 14)) {
    const box = {
      x: Math.round(crop.x0 + c.x * invScale),
      y: Math.round(crop.y0 + c.y * invScale),
      w: Math.round(c.w * invScale),
      h: Math.round(c.h * invScale),
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
 * positifs isolés type pion blanc ou reflet).
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

function findDiceCandidates(gray: Uint8Array, w: number, h: number): Candidate[] {
  const total = w * h;
  const minArea = total * 0.0008;
  const maxArea = total * 0.05;

  // Deux seuils : moyenne relevée + percentile haut — fusion des candidats.
  const thresholds = [computeBrightThreshold(gray), percentile(gray, 0.93)];
  const all: Candidate[] = [];

  for (const threshold of thresholds) {
    const mask = new Uint8Array(total);
    for (let i = 0; i < total; i++) {
      mask[i] = gray[i] >= threshold ? 1 : 0;
    }

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
        s.lumSum += gray[idx];
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
      const aspect = bw / bh;
      if (aspect < 0.55 || aspect > 1.8) continue;
      const fill = s.count / (bw * bh);
      if (fill < 0.42) continue;
      const meanLum = s.lumSum / s.count;
      if (meanLum < 120) continue;

      all.push({
        x: s.minX,
        y: s.minY,
        w: bw,
        h: bh,
        meanLum,
        score: s.count * fill * (meanLum / 255),
      });
    }
  }

  // Fusion des doublons issus des deux seuils.
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

function computeBrightThreshold(gray: Uint8Array): number {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  let sum = 0;
  let count = 0;
  for (let v = 0; v < 256; v++) {
    sum += v * hist[v];
    count += hist[v];
  }
  const mean = count ? sum / count : 128;
  return Math.min(205, Math.max(125, mean + 16));
}

function percentile(gray: Uint8Array, p: number): number {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const target = gray.length * p;
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= target) return Math.max(120, v);
  }
  return 200;
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
 * Lecture d'une face en pleine résolution : Otsu local, extraction des pips
 * avec filtres (taille, rondeur, position), gestion des pips fusionnés et
 * validation géométrique du motif 1–6.
 */
function readDieFace(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  box: Box,
): FaceReading {
  const pad = Math.round(Math.min(box.w, box.h) * 0.06);
  const x0 = clamp(box.x - pad, 0, width - 1);
  const y0 = clamp(box.y - pad, 0, height - 1);
  const x1 = clamp(box.x + box.w + pad, 0, width);
  const y1 = clamp(box.y + box.h + pad, 0, height);
  const cw = x1 - x0;
  const ch = y1 - y0;
  if (cw < 10 || ch < 10) return { value: 0, confidence: 0 };

  // Échantillonnage adaptatif : pleine résolution jusqu'à ~120 px de côté.
  const step = Math.max(1, Math.ceil(Math.max(cw, ch) / 120));
  const gw = Math.floor(cw / step);
  const gh = Math.floor(ch / step);
  if (gw < 10 || gh < 10) return { value: 0, confidence: 0 };

  const lum = new Uint8Array(gw * gh);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const i = ((y0 + y * step) * width + (x0 + x * step)) * 4;
      lum[y * gw + x] = luminance(data[i], data[i + 1], data[i + 2]);
    }
  }

  const otsu = otsuThreshold(lum);

  // Vérifier qu'il s'agit bien d'une face claire (dé blanc).
  let faceSum = 0;
  let faceN = 0;
  let pipSum = 0;
  let pipN = 0;
  for (let i = 0; i < lum.length; i++) {
    if (lum[i] >= otsu) {
      faceSum += lum[i];
      faceN++;
    } else {
      pipSum += lum[i];
      pipN++;
    }
  }
  if (faceN === 0) return { value: 0, confidence: 0 };
  const faceMean = faceSum / faceN;
  const pipMean = pipN > 0 ? pipSum / pipN : faceMean;
  const contrast = faceMean - pipMean;
  if (faceMean < 115 || contrast < 25) return { value: 0, confidence: 0 };

  // Masque des pips (pixels nettement sous le seuil).
  const pipThreshold = Math.min(otsu, faceMean - contrast * 0.45);
  const mask = new Uint8Array(gw * gh);
  for (let i = 0; i < lum.length; i++) {
    mask[i] = lum[i] <= pipThreshold ? 1 : 0;
  }

  const blobs = extractPipBlobs(mask, gw, gh);
  const faceArea = gw * gh;
  const dieSize = Math.min(gw, gh);

  const pips = blobs.filter((b) => {
    if (b.area < faceArea * 0.006 || b.area > faceArea * 0.11) return false;
    const aspect = b.bw / Math.max(1, b.bh);
    if (aspect < 0.4 || aspect > 2.5) return false;
    if (Math.max(b.bw, b.bh) > dieSize * 0.48) return false;
    // Les pips sont à l'intérieur de la face, pas collés au bord du crop.
    const mx = b.cx / gw;
    const my = b.cy / gh;
    return mx > 0.08 && mx < 0.92 && my > 0.08 && my < 0.92;
  });

  if (pips.length === 0) return { value: 0, confidence: 0 };

  // Pips fusionnés (ombre/flou) : estimation par surface relative.
  const areas = pips.map((p) => p.area).sort((a, b) => a - b);
  const medianArea = areas[Math.floor(areas.length / 2)];
  let mergedExtra = 0;
  for (const p of pips) {
    if (p.area > medianArea * 1.75) {
      mergedExtra += Math.min(2, Math.round(p.area / medianArea) - 1);
    }
  }

  const blobCount = pips.length;
  const value = blobCount + mergedExtra;
  if (value < 1 || value > 6) return { value: 0, confidence: 0 };

  // Validation géométrique du motif (centres normalisés en [-1, 1]).
  // Avec des pips fusionnés le motif exact n'est plus vérifiable : score réduit.
  const centers = pips.map((p) => ({
    x: (p.cx / gw) * 2 - 1,
    y: (p.cy / gh) * 2 - 1,
  }));
  const patternScore =
    mergedExtra > 0 ? 0.45 : validatePipPattern(centers, blobCount);
  if (patternScore < 0.3) return { value: 0, confidence: 0 };

  // Uniformité de taille des pips.
  const areaMean = areas.reduce((a, b) => a + b, 0) / areas.length;
  let areaVar = 0;
  for (const a of areas) areaVar += (a - areaMean) ** 2;
  areaVar /= areas.length;
  const uniformity = 1 - Math.min(1, Math.sqrt(areaVar) / (areaMean || 1));

  let confidence =
    0.3 +
    patternScore * 0.34 +
    uniformity * 0.14 +
    Math.min(0.12, (contrast - 25) / 350) +
    Math.min(0.1, (faceMean - 115) / 600);
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

  // Sépare pip central éventuel / pips périphériques.
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

  // Les pips périphériques doivent être écartés du centre…
  for (const c of outer) {
    const d = norm(c);
    if (d < 0.18) return 0;
    if (d < 0.3) score -= 0.15;
  }

  // …et s'apparier par symétrie centrale (c_i ≈ −c_j).
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
    if (bestJ < 0 || bestErr > 0.55) return 0;
    used[i] = true;
    used[bestJ] = true;
    pairPenalty += Math.min(0.25, bestErr * 0.35);
  }
  score -= pairPenalty;

  // 3 : les trois pips doivent être colinéaires.
  if (n === 3) {
    const [a, b, c] = centers;
    const area2 = Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y));
    if (area2 > 0.5) return 0;
    score -= Math.min(0.3, area2 * 0.4);
  }

  // 6 : deux rangées parallèles de 3 → la meilleure paire d'axes doit
  // séparer les pips en 2×3 de part et d'autre d'une droite par le centre.
  if (n === 6) {
    let bestSplit = 0;
    for (let deg = 0; deg < 180; deg += 15) {
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
      if (pos === 3 && neg === 3 && minAbs > 0.12) {
        bestSplit = Math.max(bestSplit, Math.min(1, minAbs / 0.3));
      }
    }
    if (bestSplit === 0) return 0;
    score -= (1 - bestSplit) * 0.2;
  }

  return Math.max(0, Math.min(1, score));
}

function extractPipBlobs(mask: Uint8Array, w: number, h: number): PipBlob[] {
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

        // 8-connexité pour ne pas fragmenter les pips.
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
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

      if (area >= 3) {
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

function otsuThreshold(lum: Uint8Array): number {
  const hist = new Float64Array(256);
  for (let i = 0; i < lum.length; i++) hist[lum[i]]++;

  const total = lum.length;
  let sumAll = 0;
  for (let v = 0; v < 256; v++) sumAll += v * hist[v];

  let sumB = 0;
  let wB = 0;
  let best = 127;
  let bestVar = -1;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > bestVar) {
      bestVar = between;
      best = t;
    }
  }
  return best;
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
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
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
