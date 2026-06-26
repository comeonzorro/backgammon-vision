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
  const inner = shrinkQuad(quad, 0.28);
  const px = inner.map((p) => ({ x: p.x * width, y: p.y * height }));
  const minX = clamp(Math.floor(Math.min(...px.map((p) => p.x))), 0, width - 1);
  const maxX = clamp(Math.ceil(Math.max(...px.map((p) => p.x))), 0, width - 1);
  const minY = clamp(Math.floor(Math.min(...px.map((p) => p.y))), 0, height - 1);
  const maxY = clamp(Math.ceil(Math.max(...px.map((p) => p.y))), 0, height - 1);

  const cx = Math.round((minX + maxX) / 2);
  const profileW: number[] = [];
  const profileB: number[] = [];

  for (let y = minY; y <= maxY; y++) {
    if (!pointInQuad(cx, y, px)) continue;
    const i = (y * width + cx) * 4;
    profileW.push(luminance(data[i], data[i + 1], data[i + 2]));
  }

  for (let x = minX; x <= maxX; x++) {
    const midY = Math.round((minY + maxY) / 2);
    if (!pointInQuad(x, midY, px)) continue;
    const i = (midY * width + x) * 4;
    profileB.push(luminance(data[i], data[i + 1], data[i + 2]));
  }

  const prof = profileW.length >= 6 ? profileW : profileB.length >= 6 ? profileB : profileW;
  if (prof.length < 4) return { white: 0, black: 0, confidence: 0 };

  const mean = prof.reduce((a, b) => a + b, 0) / prof.length;
  const whitePeaks = countPeaks(prof, true, mean);
  const blackPeaks = countPeaks(prof, false, mean);

  const white = whitePeaks;
  const black = blackPeaks;
  const dominant = white >= black ? white : black;
  const confidence =
    dominant > 0
      ? Math.min(0.9, 0.42 + dominant * 0.07 + Math.min(0.2, Math.abs(mean - 128) / 200))
      : 0.15;

  return {
    white: white > black ? white : 0,
    black: black > white ? black : 0,
    confidence,
  };
}

function shrinkQuad(quad: NormPoint[], amount: number): NormPoint[] {
  const cx = quad.reduce((s, p) => s + p.x, 0) / quad.length;
  const cy = quad.reduce((s, p) => s + p.y, 0) / quad.length;
  return quad.map((p) => ({
    x: p.x + (cx - p.x) * amount,
    y: p.y + (cy - p.y) * amount,
  }));
}

function countPeaks(profile: number[], white: boolean, mean: number): number {
  const th = white ? Math.max(145, mean + 25) : Math.min(105, mean - 25);
  let peaks = 0;
  let inBand = false;
  for (const v of profile) {
    const hit = white ? v >= th : v <= th;
    if (hit && !inBand) {
      peaks++;
      inBand = true;
    } else if (!hit) {
      inBand = false;
    }
  }
  return Math.min(15, peaks);
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
