import type { BoardCalibration, NormPoint } from "../types/board";

/** Détecte automatiquement le tapis (vert / marron) et propose les 4 coins. */
export function autoDetectBoardCorners(imageData: ImageData): BoardCalibration | null {
  const { width, height, data } = imageData;
  const sw = 160;
  const sh = Math.max(1, Math.round((height / width) * sw));
  const mask = new Uint8Array(sw * sh);

  for (let y = 0; y < sh; y++) {
    const sy = Math.floor((y / sh) * height);
    for (let x = 0; x < sw; x++) {
      const sx = Math.floor((x / sw) * width);
      const i = (sy * width + sx) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (isFeltPixel(r, g, b)) mask[y * sw + x] = 1;
    }
  }

  const labels = labelComponents(mask, sw, sh);
  const stats = new Map<
    number,
    { count: number; minX: number; minY: number; maxX: number; maxY: number }
  >();

  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const idx = y * sw + x;
      const label = labels[idx];
      if (label <= 0) continue;
      let s = stats.get(label);
      if (!s) {
        s = { count: 0, minX: x, minY: y, maxX: x, maxY: y };
        stats.set(label, s);
      }
      s.count++;
      if (x < s.minX) s.minX = x;
      if (y < s.minY) s.minY = y;
      if (x > s.maxX) s.maxX = x;
      if (y > s.maxY) s.maxY = y;
    }
  }

  const minArea = sw * sh * 0.08;
  let best: { count: number; minX: number; minY: number; maxX: number; maxY: number } | null =
    null;
  for (const s of stats.values()) {
    if (s.count < minArea) continue;
    const bw = s.maxX - s.minX + 1;
    const bh = s.maxY - s.minY + 1;
    const aspect = bw / bh;
    if (aspect < 1.1 || aspect > 2.4) continue;
    if (!best || s.count > best.count) best = s;
  }

  if (!best) return null;

  const padX = (best.maxX - best.minX) * 0.04;
  const padY = (best.maxY - best.minY) * 0.04;
  const x0 = Math.max(0, best.minX - padX) / sw;
  const x1 = Math.min(sw - 1, best.maxX + padX) / sw;
  const y0 = Math.max(0, best.minY - padY) / sh;
  const y1 = Math.min(sh - 1, best.maxY + padY) / sh;

  return {
    corners: [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ],
  };
}

function isFeltPixel(r: number, g: number, b: number): boolean {
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const greenish = g > r * 0.92 && g > b * 0.85 && g > 55;
  const brownish = r > 60 && g > 40 && b < r * 0.75 && lum > 45 && lum < 150;
  const darkFelt = lum > 35 && lum < 120 && g >= b && Math.abs(r - g) < 45;
  return greenish || brownish || darkFelt;
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

/** Zone de recherche des dés = tout le tapis calibré (les dés peuvent atterrir n'importe où). */
export function getBoardSearchZone(calibration: BoardCalibration): NormPoint[] {
  return calibration.corners;
}

/** @deprecated Alias — recherche sur le plateau entier, pas une zone de lancer fixe. */
export function getDiceSearchZone(calibration: BoardCalibration): NormPoint[] {
  return getBoardSearchZone(calibration);
}

export function boardBoundingRect(
  calibration: BoardCalibration,
  width: number,
  height: number,
): { x0: number; y0: number; w: number; h: number } {
  const zone = getBoardSearchZone(calibration);
  const xs = zone.map((p) => p.x * width);
  const ys = zone.map((p) => p.y * height);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const x1 = Math.min(width, Math.ceil(Math.max(...xs)));
  const y1 = Math.min(height, Math.ceil(Math.max(...ys)));
  return { x0, y0, w: Math.max(40, x1 - x0), h: Math.max(40, y1 - y0) };
}

export function pointInPolygon(x: number, y: number, poly: NormPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-6) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
