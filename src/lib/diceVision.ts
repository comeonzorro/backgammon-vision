import type { DetectionFrame, DiceDetection } from "../types";
import type { BoardCalibration } from "../types/board";
import { boardBoundingRect, getBoardSearchZone, pointInPolygon } from "./autoCalibrateBoard";

const MAX_WIDTH = 520;
const MIN_PIP_CONFIDENCE = 0.38;

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

/** Détection caméra : repère les dés blancs n'importe où sur le tapis calibré. */
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

  const cropped = cropRegion(data, width, height, crop.x0, crop.y0, crop.w, crop.h);
  const scale = cropped.width > MAX_WIDTH ? MAX_WIDTH / cropped.width : 1;
  const sw = Math.max(1, Math.round(cropped.width * scale));
  const sh = Math.max(1, Math.round(cropped.height * scale));
  const gray = downscaleGray(cropped.data, cropped.width, cropped.height, sw, sh);

  const candidates = findDiceCandidates(gray, sw, sh)
    .filter((c) => {
      if (!boardPoly) return true;
      const nx = (crop.x0 + ((c.x + c.w / 2) / sw) * cropped.width) / width;
      const ny = (crop.y0 + ((c.y + c.h / 2) / sh) * cropped.height) / height;
      return pointInPolygon(nx, ny, boardPoly);
    });

  const invScale = 1 / scale;
  const scored: DiceDetection[] = [];

  for (const c of candidates.slice(0, 12)) {
    const box = {
      x: Math.round(crop.x0 + c.x * invScale),
      y: Math.round(crop.y0 + c.y * invScale),
      w: Math.round(c.w * invScale),
      h: Math.round(c.h * invScale),
    };
    const read = readDieFace(data, width, height, box);
    if (read.value < 1 || read.value > 6 || read.confidence < MIN_PIP_CONFIDENCE) continue;

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
  const dice = dedupeNearbyDice(scored).slice(0, 2);
  dice.sort((a, b) => a.x - b.x);

  return {
    timestamp: Date.now(),
    dice,
    source: "camera-cv",
    motionScore: 0,
  };
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

function cropRegion(
  data: Uint8ClampedArray,
  width: number,
  _height: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
): { data: Uint8ClampedArray; width: number; height: number } {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = ((y0 + y) * width + (x0 + x)) * 4;
      const di = (y * w + x) * 4;
      out[di] = data[si];
      out[di + 1] = data[si + 1];
      out[di + 2] = data[si + 2];
      out[di + 3] = data[si + 3];
    }
  }
  return { data: out, width: w, height: h };
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

function downscaleGray(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  sw: number,
  sh: number,
): Uint8Array {
  const out = new Uint8Array(sw * sh);
  for (let y = 0; y < sh; y++) {
    const sy = Math.min(h - 1, Math.floor((y / sh) * h));
    for (let x = 0; x < sw; x++) {
      const sx = Math.min(w - 1, Math.floor((x / sw) * w));
      const i = (sy * w + sx) * 4;
      out[y * sw + x] = luminance(data[i], data[i + 1], data[i + 2]);
    }
  }
  return out;
}

function findDiceCandidates(gray: Uint8Array, w: number, h: number): Candidate[] {
  const total = w * h;
  const minArea = total * 0.0012;
  const maxArea = total * 0.065;
  const threshold = computeBrightThreshold(gray);
  const mask = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    mask[i] = gray[i] >= threshold ? 1 : 0;
  }

  const labels = labelComponents(mask, w, h);
  const stats = new Map<number, { count: number; minX: number; minY: number; maxX: number; maxY: number; lumSum: number }>();

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

  const candidates: Candidate[] = [];
  for (const s of stats.values()) {
    if (s.count < minArea || s.count > maxArea) continue;
    const bw = s.maxX - s.minX + 1;
    const bh = s.maxY - s.minY + 1;
    const aspect = bw / bh;
    if (aspect < 0.58 || aspect > 1.72) continue;
    const fill = s.count / (bw * bh);
    if (fill < 0.32) continue;
    const meanLum = s.lumSum / s.count;
    if (meanLum < 128) continue;

    candidates.push({
      x: s.minX,
      y: s.minY,
      w: bw,
      h: bh,
      meanLum,
      score: s.count * fill * (meanLum / 255),
    });
  }

  return candidates.sort((a, b) => b.score - a.score);
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

function readDieFace(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  box: Box,
): { value: number; confidence: number } {
  const pad = Math.round(Math.min(box.w, box.h) * 0.08);
  const x0 = clamp(box.x - pad, 0, width - 1);
  const y0 = clamp(box.y - pad, 0, height - 1);
  const x1 = clamp(box.x + box.w + pad, 0, width);
  const y1 = clamp(box.y + box.h + pad, 0, height);
  const cw = x1 - x0;
  const ch = y1 - y0;
  if (cw < 8 || ch < 8) return { value: 0, confidence: 0 };

  const pixels: number[] = [];
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const i = (y * width + x) * 4;
      pixels.push(luminance(data[i], data[i + 1], data[i + 2]));
    }
  }
  if (pixels.length === 0) return { value: 0, confidence: 0 };

  const mean = pixels.reduce((a, b) => a + b, 0) / pixels.length;
  let variance = 0;
  for (const p of pixels) variance += (p - mean) ** 2;
  variance /= pixels.length;
  const std = Math.sqrt(variance);

  const thresholds = [
    Math.min(125, mean - Math.max(18, std * 0.85)),
    Math.min(110, mean - Math.max(28, std * 1.1)),
  ];

  let best = { value: 0, confidence: 0, blobs: 0 };

  for (const threshold of thresholds) {
    const mask = new Uint8Array(cw * ch);
    for (let y = 0; y < ch; y += 2) {
      for (let x = 0; x < cw; x += 2) {
        const i = ((y0 + y) * width + (x0 + x)) * 4;
        const lum = luminance(data[i], data[i + 1], data[i + 2]);
        if (lum <= threshold) {
          mask[(y >> 1) * (cw >> 1) + (x >> 1)] = 1;
        }
      }
    }
    const mw = Math.ceil(cw / 2);
    const mh = Math.ceil(ch / 2);
    const blobs = countPipBlobs(mask, mw, mh);
    const dieArea = mw * mh;
    const valid = blobs.filter(
      (b) => b.area >= dieArea * 0.004 && b.area <= dieArea * 0.14,
    );
    const value = valid.length;
    if (value < 1 || value > 6) continue;

    const areaMean = valid.reduce((s, b) => s + b.area, 0) / valid.length;
    let areaVar = 0;
    for (const b of valid) areaVar += (b.area - areaMean) ** 2;
    areaVar /= valid.length;
    const uniformity = 1 - Math.min(1, Math.sqrt(areaVar) / (areaMean || 1));

    let confidence = 0.48;
    confidence += Math.min(0.22, (mean - 120) / 180);
    confidence += uniformity * 0.18;
    confidence += Math.min(0.12, valid.length * 0.02);
    if (std > 22) confidence += 0.06;

    if (confidence > best.confidence) {
      best = { value, confidence: Math.min(0.96, confidence), blobs: valid.length };
    }
  }

  return { value: best.value, confidence: best.confidence };
}

function countPipBlobs(mask: Uint8Array, w: number, h: number): { area: number }[] {
  const visited = new Uint8Array(w * h);
  const blobs: { area: number }[] = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const start = y * w + x;
      if (!mask[start] || visited[start]) continue;
      let area = 0;
      const stack = [start];
      visited[start] = 1;
      while (stack.length) {
        const idx = stack.pop()!;
        area++;
        const cx = idx % w;
        const cy = (idx / w) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (!mask[ni] || visited[ni]) continue;
          visited[ni] = 1;
          stack.push(ni);
        }
      }
      if (area >= 2) blobs.push({ area });
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
