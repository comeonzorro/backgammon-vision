import type { BoardCalibration, BoardDetectionResult } from "../types/board";
import { POINT_GRID } from "../types/board";
import type { NormPoint } from "../types/board";

const COLS = 13;
const ROWS = 2;

export function detectBoardFromFrame(
  imageData: ImageData,
  calibration: BoardCalibration,
): BoardDetectionResult {
  const { width, height, data } = imageData;
  const points: BoardDetectionResult["points"] = [];
  const pointConfidence: Record<number, number> = {};
  let barWhite = 0;
  let barBlack = 0;
  let confSum = 0;
  let confN = 0;

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const id = POINT_GRID[row][col];
      const region = getCellQuad(calibration.corners, col, row, COLS, ROWS);
      const read = countCheckersInRegion(data, width, height, region);

      if (id === "bar") {
        barWhite += read.white;
        barBlack += read.black;
        confSum += read.confidence;
        confN++;
        continue;
      }

      points.push({
        index: id,
        white: read.white > read.black ? read.white : 0,
        black: read.black > read.white ? read.black : 0,
      });
      pointConfidence[id] = read.confidence;
      confSum += read.confidence;
      confN++;
    }
  }

  points.sort((a, b) => a.index - b.index);

  return {
    timestamp: Date.now(),
    points,
    barWhite: Math.min(barWhite, 15),
    barBlack: Math.min(barBlack, 15),
    offWhite: 0,
    offBlack: 0,
    confidence: confN ? confSum / confN : 0,
    pointConfidence,
    source: "camera-cv",
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

function bilinear(corners: [NormPoint, NormPoint, NormPoint, NormPoint], u: number, v: number): NormPoint {
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

function countCheckersInRegion(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  quad: NormPoint[],
): { white: number; black: number; confidence: number } {
  const px = quad.map((p) => ({ x: p.x * width, y: p.y * height }));
  const minX = clamp(Math.floor(Math.min(...px.map((p) => p.x))), 0, width - 1);
  const maxX = clamp(Math.ceil(Math.max(...px.map((p) => p.x))), 0, width - 1);
  const minY = clamp(Math.floor(Math.min(...px.map((p) => p.y))), 0, height - 1);
  const maxY = clamp(Math.ceil(Math.max(...px.map((p) => p.y))), 0, height - 1);

  const rw = maxX - minX + 1;
  const rh = maxY - minY + 1;
  if (rw < 4 || rh < 4) return { white: 0, black: 0, confidence: 0 };

  const samples: number[] = [];
  for (let y = minY; y <= maxY; y += 2) {
    for (let x = minX; x <= maxX; x += 2) {
      if (!pointInQuad(x, y, px)) continue;
      const i = (y * width + x) * 4;
      samples.push(luminance(data[i], data[i + 1], data[i + 2]));
    }
  }

  if (samples.length < 8) return { white: 0, black: 0, confidence: 0 };

  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const whiteTh = Math.max(130, mean + 18);
  const blackTh = Math.min(110, mean - 22);

  const mw = Math.ceil(rw / 2);
  const mh = Math.ceil(rh / 2);
  const whiteMask = new Uint8Array(mw * mh);
  const blackMask = new Uint8Array(mw * mh);

  for (let y = minY; y <= maxY; y += 2) {
    for (let x = minX; x <= maxX; x += 2) {
      if (!pointInQuad(x, y, px)) continue;
      const i = (y * width + x) * 4;
      const lum = luminance(data[i], data[i + 1], data[i + 2]);
      const mx = (x - minX) >> 1;
      const my = (y - minY) >> 1;
      const mi = my * mw + mx;
      if (lum >= whiteTh) whiteMask[mi] = 1;
      if (lum <= blackTh) blackMask[mi] = 1;
    }
  }

  const cellArea = mw * mh;
  const minBlob = Math.max(3, cellArea * 0.015);
  const maxBlob = cellArea * 0.35;

  const whiteBlobs = countBlobs(whiteMask, mw, mh, minBlob, maxBlob);
  const blackBlobs = countBlobs(blackMask, mw, mh, minBlob, maxBlob);

  const white = whiteBlobs.length;
  const black = blackBlobs.length;
  const blobScore = Math.min(1, (whiteBlobs.length + blackBlobs.length) > 0 ? 0.55 : 0.25);
  const contrast = Math.min(1, Math.abs(mean - 128) / 64);
  const confidence = Math.min(0.92, 0.35 + blobScore * 0.35 + contrast * 0.22);

  return { white, black, confidence };
}

function countBlobs(
  mask: Uint8Array,
  w: number,
  h: number,
  minArea: number,
  maxArea: number,
): { area: number }[] {
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
      if (area >= minArea && area <= maxArea) blobs.push({ area });
    }
  }
  return blobs;
}

function pointInQuad(x: number, y: number, quad: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = quad.length - 1; i < quad.length; j = i++) {
    const xi = quad[i].x;
    const yi = quad[i].y;
    const xj = quad[j].x;
    const yj = quad[j].y;
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-6) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
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
