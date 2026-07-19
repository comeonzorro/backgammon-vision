/**
 * Banc d'essai synthétique vision : `npm run check:vision`
 *  - faces de dés 1–6, polarités claire/foncée, petits dés (~1/32 du plateau)
 *  - plateau paysage + portrait (charnière horizontale) en position initiale
 */

if (typeof globalThis.ImageData === "undefined") {
  class ImageDataPolyfill {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    colorSpace = "srgb" as const;
    constructor(dataOrW: Uint8ClampedArray | number, wOrH: number, h?: number) {
      if (typeof dataOrW === "number") {
        this.width = dataOrW;
        this.height = wOrH;
        this.data = new Uint8ClampedArray(dataOrW * wOrH * 4);
      } else {
        this.data = dataOrW;
        this.width = wOrH;
        this.height = h ?? dataOrW.length / (4 * wOrH);
      }
    }
  }
  (globalThis as unknown as { ImageData: typeof ImageData }).ImageData =
    ImageDataPolyfill as unknown as typeof ImageData;
}

import { detectDiceWithCamera } from "../src/lib/diceVision";
import {
  detectBoardFromFrame,
  inferDefaultMapping,
  resolveBoardMapping,
} from "../src/lib/boardVision";
import type { BoardCalibration } from "../src/types/board";
import { standardBoard } from "../src/lib/bg/engine";

let failures = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function fillRect(
  data: Uint8ClampedArray,
  width: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
  r: number,
  g: number,
  b: number,
) {
  x0 |= 0;
  y0 |= 0;
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      if (x < 0 || y < 0 || x >= width) continue;
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
}

function fillCircle(
  data: Uint8ClampedArray,
  width: number,
  cx: number,
  cy: number,
  radius: number,
  r: number,
  g: number,
  b: number,
) {
  cx = Math.round(cx);
  cy = Math.round(cy);
  const r2 = radius * radius;
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > r2) continue;
      if (x < 0 || y < 0 || x >= width) continue;
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
}

function pipCenters(value: number): { x: number; y: number }[] {
  const d = 0.62;
  switch (value) {
    case 1:
      return [{ x: 0, y: 0 }];
    case 2:
      return [
        { x: -d, y: -d },
        { x: d, y: d },
      ];
    case 3:
      return [
        { x: -d, y: -d },
        { x: 0, y: 0 },
        { x: d, y: d },
      ];
    case 4:
      return [
        { x: -d, y: -d },
        { x: d, y: -d },
        { x: -d, y: d },
        { x: d, y: d },
      ];
    case 5:
      return [
        { x: -d, y: -d },
        { x: d, y: -d },
        { x: 0, y: 0 },
        { x: -d, y: d },
        { x: d, y: d },
      ];
    case 6:
      return [
        { x: -d, y: -d },
        { x: d, y: -d },
        { x: -d, y: 0 },
        { x: d, y: 0 },
        { x: -d, y: d },
        { x: d, y: d },
      ];
    default:
      return [];
  }
}

function drawDie(
  data: Uint8ClampedArray,
  width: number,
  cx: number,
  cy: number,
  side: number,
  value: number,
  darkFace: boolean,
) {
  const face = darkFace ? [28, 28, 32] : [240, 240, 245];
  const pip = darkFace ? [250, 250, 255] : [20, 20, 25];
  const half = side >> 1;
  fillRect(data, width, cx - half, cy - half, side, side, face[0], face[1], face[2]);
  const pipR = Math.max(1.6, side * 0.1);
  for (const p of pipCenters(value)) {
    fillCircle(
      data,
      width,
      cx + p.x * side * 0.34,
      cy + p.y * side * 0.34,
      pipR,
      pip[0],
      pip[1],
      pip[2],
    );
  }
}

const CALIB: BoardCalibration = {
  corners: [
    { x: 0.08, y: 0.08 },
    { x: 0.92, y: 0.08 },
    { x: 0.92, y: 0.92 },
    { x: 0.08, y: 0.92 },
  ],
};

console.log("Dés — faces 1–6, polarité claire, petits (~1/32 plateau)");
{
  const W = 720;
  const H = 1280;
  // ~1/30 de la longueur du plateau (petits dés type photos utilisateur).
  const side = Math.round((H * 0.84) / 30);
  let ok = 0;
  for (let v = 1; v <= 6; v++) {
    const v2 = (v % 6) + 1;
    const data = new Uint8ClampedArray(W * H * 4);
    fillRect(data, W, 0, 0, W, H, 145, 120, 85);
    drawDie(data, W, Math.round(W * 0.4), Math.round(H * 0.5), side, v, false);
    drawDie(data, W, Math.round(W * 0.58), Math.round(H * 0.52), side, v2, false);
    const vals = detectDiceWithCamera(new ImageData(data, W, H), CALIB)
      .dice.map((d) => d.value)
      .sort((a, b) => a - b);
    const exp = [v, v2].sort((a, b) => a - b);
    const good = vals.length === 2 && vals[0] === exp[0] && vals[1] === exp[1];
    if (good) ok++;
    check(
      `clair ${exp.join("+")} → ${vals.join(",") || "∅"}`,
      good,
      `side=${side}`,
    );
  }
  check(`clair : au moins 5/6 paires`, ok >= 5, `ok=${ok}`);
}

console.log("Dés — faces 1–6, polarité FONCÉE (pips clairs), petits");
{
  const W = 720;
  const H = 1280;
  const side = Math.round((H * 0.84) / 30);
  let ok = 0;
  for (let v = 1; v <= 6; v++) {
    const v2 = (v % 6) + 1;
    const data = new Uint8ClampedArray(W * H * 4);
    fillRect(data, W, 0, 0, W, H, 145, 120, 85);
    drawDie(data, W, Math.round(W * 0.4), Math.round(H * 0.5), side, v, true);
    drawDie(data, W, Math.round(W * 0.58), Math.round(H * 0.52), side, v2, true);
    const vals = detectDiceWithCamera(new ImageData(data, W, H), CALIB)
      .dice.map((d) => d.value)
      .sort((a, b) => a - b);
    const exp = [v, v2].sort((a, b) => a - b);
    const good = vals.length === 2 && vals[0] === exp[0] && vals[1] === exp[1];
    if (good) ok++;
    check(
      `foncé ${exp.join("+")} → ${vals.join(",") || "∅"}`,
      good,
      `side=${side}`,
    );
  }
  check(`foncé : au moins 5/6 paires`, ok >= 5, `ok=${ok}`);
}

console.log("Dés — rejet des pions (gros blobs ronds)");
{
  const W = 400;
  const H = 400;
  const data = new Uint8ClampedArray(W * H * 4);
  fillRect(data, W, 0, 0, W, H, 120, 100, 70);
  fillCircle(data, W, 160, 200, 28, 230, 230, 230);
  fillCircle(data, W, 240, 200, 28, 230, 230, 230);
  const frame = detectDiceWithCamera(new ImageData(data, W, H), CALIB);
  check("pions seuls → 0 dé", frame.dice.length === 0, `n=${frame.dice.length}`);
}

console.log("Régression — 2+6 foncé (cas photo utilisateur, jamais 2→1)");
{
  const W = 720;
  const H = 1280;
  const sizes = [22, 28, 34, 42, 52];
  let pairOk = 0;
  let neverFalseOne = true;
  for (const side of sizes) {
    const data = new Uint8ClampedArray(W * H * 4);
    fillRect(data, W, 0, 0, W, H, 145, 120, 85);
    drawDie(data, W, Math.round(W * 0.4), Math.round(H * 0.5), side, 2, true);
    drawDie(data, W, Math.round(W * 0.58), Math.round(H * 0.52), side, 6, true);
    const vals = detectDiceWithCamera(new ImageData(data, W, H), CALIB).dice.map(
      (d) => d.value,
    );
    const sorted = [...vals].sort((a, b) => a - b);
    const good = sorted.length === 2 && sorted[0] === 2 && sorted[1] === 6;
    if (good) pairOk++;
    // Interdit : lire un 1 alors que les dés sont 2 et 6.
    if (vals.includes(1)) {
      neverFalseOne = false;
      check(`2+6 side=${side} → PAS de faux 1`, false, `lu=${vals.join(",")}`);
    } else {
      check(
        `2+6 side=${side} → ${vals.join(",") || "∅"}`,
        good || (vals.includes(2) && !vals.includes(1)),
        good ? undefined : "paire incomplète mais sans confusion 2→1",
      );
    }
  }
  check(`2+6 foncé : 5/5 paires exactes`, pairOk === 5, `ok=${pairOk}`);
  check(`2+6 foncé : jamais de faux 1`, neverFalseOne);
}

console.log("Régression — face 2 seule (crop serré / recentrage) ≠ 1");
{
  const W = 360;
  const H = 640;
  let falseOnes = 0;
  let twos = 0;
  for (const side of [20, 24, 30, 36, 44]) {
    for (const ox of [-0.04, 0, 0.04]) {
      for (const oy of [-0.03, 0, 0.03]) {
        const data = new Uint8ClampedArray(W * H * 4);
        fillRect(data, W, 0, 0, W, H, 145, 120, 85);
        drawDie(
          data,
          W,
          Math.round(W * (0.5 + ox)),
          Math.round(H * (0.5 + oy)),
          side,
          2,
          true,
        );
        const vals = detectDiceWithCamera(new ImageData(data, W, H), CALIB).dice.map(
          (d) => d.value,
        );
        if (vals.includes(1)) falseOnes++;
        if (vals.includes(2)) twos++;
      }
    }
  }
  check(`face 2 seule : 0 lecture « 1 »`, falseOnes === 0, `faux1=${falseOnes}`);
  check(`face 2 seule : détectée au moins 10 fois`, twos >= 10, `twos=${twos}`);
}

function renderBoard(
  width: number,
  height: number,
  transposed: boolean,
): { image: ImageData; calibration: BoardCalibration } {
  const data = new Uint8ClampedArray(width * height * 4);
  fillRect(data, width, 0, 0, width, height, 40, 40, 45);

  const marginX = Math.round(width * 0.08);
  const marginY = Math.round(height * 0.08);
  const bx0 = marginX;
  const by0 = marginY;
  const bw = width - 2 * marginX;
  const bh = height - 2 * marginY;

  fillRect(data, width, bx0, by0, bw, bh, 160, 130, 95);

  const COLS = 13;
  const triA = { r: 230, g: 220, b: 200 };
  const triB = { r: 55, g: 50, b: 45 };
  const white = { r: 240, g: 240, b: 245 };
  const black = { r: 30, g: 30, b: 35 };

  const cellMain = (col: number) => {
    if (transposed) {
      return {
        m0: by0 + (col / COLS) * bh,
        m1: by0 + ((col + 1) / COLS) * bh,
        axis0: bx0,
        axis1: bx0 + bw,
      };
    }
    return {
      m0: bx0 + (col / COLS) * bw,
      m1: bx0 + ((col + 1) / COLS) * bw,
      axis0: by0,
      axis1: by0 + bh,
    };
  };

  const fillTriangle = (
    col: number,
    row: number,
    color: { r: number; g: number; b: number },
  ) => {
    const { m0, m1, axis0, axis1 } = cellMain(col);
    const mid = (m0 + m1) / 2;
    const base = row === 0 ? axis0 : axis1;
    const tip = (axis0 + axis1) / 2;
    // Remplissage dense : une ligne pleine par pas d'axe.
    const steps = Math.max(40, Math.round(Math.abs(tip - base)));
    for (let k = 0; k < steps; k++) {
      const t = k / Math.max(1, steps - 1);
      const axis = base + (tip - base) * t;
      const half = ((m1 - m0) / 2) * (1 - t) * 0.95;
      if (transposed) {
        fillRect(
          data,
          width,
          Math.round(axis),
          Math.round(mid - half),
          1,
          Math.max(1, Math.round(half * 2)),
          color.r,
          color.g,
          color.b,
        );
      } else {
        fillRect(
          data,
          width,
          Math.round(mid - half),
          Math.round(axis),
          Math.max(1, Math.round(half * 2)),
          1,
          color.r,
          color.g,
          color.b,
        );
      }
    }
  };

  const GRID: (number | "bar")[][] = [
    [13, 14, 15, 16, 17, 18, "bar", 19, 20, 21, 22, 23, 24],
    [12, 11, 10, 9, 8, 7, "bar", 6, 5, 4, 3, 2, 1],
  ];

  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < COLS; col++) {
      if (GRID[row][col] === "bar") {
        const { m0, m1, axis0, axis1 } = cellMain(col);
        if (transposed) {
          fillRect(
            data,
            width,
            Math.round(axis0),
            Math.round(m0),
            bw,
            Math.round(m1 - m0),
            90,
            80,
            70,
          );
        } else {
          fillRect(
            data,
            width,
            Math.round(m0),
            Math.round(axis0),
            Math.round(m1 - m0),
            bh,
            90,
            80,
            70,
          );
        }
        continue;
      }
      fillTriangle(col, row, (row + col) % 2 === 0 ? triA : triB);
    }
  }

  const board = standardBoard();
  const checkerR = transposed
    ? Math.max(4, (bw / 2 / 5.5) * 0.4)
    : Math.max(4, (bh / 2 / 5.5) * 0.4);

  for (const p of board.points) {
    let row = -1;
    let col = -1;
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < COLS; c++) {
        if (GRID[r][c] === p.index) {
          row = r;
          col = c;
        }
      }
    }
    if (row < 0) continue;
    const count = Math.max(p.white, p.black);
    const color = p.white > 0 ? white : black;
    if (count === 0) continue;

    const { m0, m1, axis0, axis1 } = cellMain(col);
    const mid = (m0 + m1) / 2;
    const base = row === 0 ? axis0 : axis1;
    const tip = (axis0 + axis1) / 2;
    const dir = tip > base ? 1 : -1;

    for (let i = 0; i < count; i++) {
      const t = (i + 0.55) / 5.4;
      const axis = base + dir * Math.abs(tip - base) * t;
      if (transposed) {
        fillCircle(data, width, axis, mid, checkerR, color.r, color.g, color.b);
      } else {
        fillCircle(data, width, mid, axis, checkerR, color.r, color.g, color.b);
      }
    }
  }

  const calibration: BoardCalibration = {
    corners: [
      { x: bx0 / width, y: by0 / height },
      { x: (bx0 + bw) / width, y: by0 / height },
      { x: (bx0 + bw) / width, y: (by0 + bh) / height },
      { x: bx0 / width, y: (by0 + bh) / height },
    ],
  };

  return { image: new ImageData(data, width, height), calibration };
}

function boardDistance(det: {
  points: { index: number; white: number; black: number }[];
  barWhite: number;
  barBlack: number;
}): number {
  const ref = standardBoard();
  let d = Math.abs(det.barWhite) + Math.abs(det.barBlack);
  for (const p of det.points) {
    const r = ref.points[p.index - 1];
    d += Math.abs(p.white - r.white) + Math.abs(p.black - r.black);
  }
  return d;
}

console.log("Plateau — paysage, position initiale");
{
  const { image, calibration } = renderBoard(640, 400, false);
  const mapping = inferDefaultMapping(calibration, image.width, image.height);
  check("paysage : transposed=false", mapping.transposed === false);
  const resolved = resolveBoardMapping(image, calibration);
  check(
    "paysage : mapping résolu",
    resolved !== null && resolved.distance <= 40,
    `d=${resolved?.distance}`,
  );
  const det = detectBoardFromFrame(image, calibration, resolved?.mapping);
  const dist = boardDistance(det);
  const p24 = det.points.find((p) => p.index === 24);
  const p1 = det.points.find((p) => p.index === 1);
  check(
    `paysage : points clés (24○=${p24?.white} 1●=${p1?.black}, d=${dist})`,
    (p24?.white ?? 0) >= 1 && (p1?.black ?? 0) >= 1 && dist <= 40,
  );
  const totalW = det.points.reduce((a, p) => a + p.white, 0) + det.barWhite;
  const totalB = det.points.reduce((a, p) => a + p.black, 0) + det.barBlack;
  check(`paysage : ~15 pions/couleur (${totalW}/${totalB})`, totalW >= 10 && totalB >= 10 && totalW <= 20 && totalB <= 20);
}

console.log("Plateau — PORTRAIT (charnière horizontale), position initiale");
{
  const { image, calibration } = renderBoard(480, 720, true);
  const mapping = inferDefaultMapping(calibration, image.width, image.height);
  check("portrait : transposed=true", mapping.transposed === true);
  const resolved = resolveBoardMapping(image, calibration);
  check(
    "portrait : mapping résolu",
    resolved !== null && resolved.mapping.transposed === true && resolved.distance <= 40,
    `d=${resolved?.distance} t=${resolved?.mapping.transposed}`,
  );
  const det = detectBoardFromFrame(image, calibration, resolved?.mapping);
  const dist = boardDistance(det);
  const p24 = det.points.find((p) => p.index === 24);
  const p1 = det.points.find((p) => p.index === 1);
  check(
    `portrait : points clés (24○=${p24?.white} 1●=${p1?.black}, d=${dist})`,
    (p24?.white ?? 0) >= 1 && (p1?.black ?? 0) >= 1 && dist <= 40,
  );
  const totalW = det.points.reduce((a, p) => a + p.white, 0) + det.barWhite;
  const totalB = det.points.reduce((a, p) => a + p.black, 0) + det.barBlack;
  check(`portrait : ~15 pions/couleur (${totalW}/${totalB})`, totalW >= 10 && totalB >= 10 && totalW <= 20 && totalB <= 20);
}

if (failures > 0) {
  console.error(`\n${failures} vérification(s) vision en échec`);
  process.exit(1);
}
console.log("\nToutes les vérifications vision passent.");
