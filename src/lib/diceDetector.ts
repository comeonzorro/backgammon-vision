import type { DetectionFrame, DiceDetection } from "../types";

const DICE_VALUES = [1, 2, 3, 4, 5, 6] as const;

/** Stub — remplacer par inférence ONNX YOLO sur le canvas. */
export async function detectDiceFromFrame(
  imageData: ImageData,
  options?: { useOnnx?: boolean },
): Promise<DetectionFrame> {
  if (options?.useOnnx) {
    try {
      return await detectWithOnnx(imageData);
    } catch {
      // fallback mock si modèle absent
    }
  }

  return detectWithHeuristic(imageData);
}

async function detectWithOnnx(imageData: ImageData): Promise<DetectionFrame> {
  const { getOnnxSession } = await import("./onnxDiceModel");
  const session = await getOnnxSession();
  if (!session) {
    throw new Error("ONNX model not loaded");
  }

  // Placeholder tensor pipeline — brancher le vrai pré/post-processing YOLO ici
  void session;
  void imageData;
  return detectWithHeuristic(imageData, "onnx");
}

function detectWithHeuristic(
  imageData: ImageData,
  source: DetectionFrame["source"] = "mock",
): DetectionFrame {
  const { width, height, data } = imageData;
  const regions = findBrightRegions(data, width, height);
  const dice: DiceDetection[] = [];

  for (let i = 0; i < Math.min(2, regions.length); i++) {
    const r = regions[i];
    const brightness = sampleBrightness(data, width, r);
    const value = DICE_VALUES[Math.abs(Math.round(brightness * 6)) % 6];
    dice.push({
      value,
      confidence: 0.55 + (brightness % 0.35),
      x: r.x / width,
      y: r.y / height,
      width: r.w / width,
      height: r.h / height,
    });
  }

  if (dice.length === 0) {
    dice.push(
      { value: rollDie(), confidence: 0.42, x: 0.35, y: 0.55, width: 0.12, height: 0.12 },
      { value: rollDie(), confidence: 0.41, x: 0.55, y: 0.55, width: 0.12, height: 0.12 },
    );
  } else if (dice.length === 1) {
    dice.push({
      value: rollDie(),
      confidence: 0.38,
      x: dice[0].x + 0.18,
      y: dice[0].y,
      width: dice[0].width,
      height: dice[0].height,
    });
  }

  return { timestamp: Date.now(), dice, source };
}

function rollDie(): number {
  return DICE_VALUES[Math.floor(Math.random() * 6)];
}

interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
  score: number;
}

function findBrightRegions(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Region[] {
  const grid = 8;
  const cellW = Math.floor(width / grid);
  const cellH = Math.floor(height / grid);
  const scores: Region[] = [];

  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      let sum = 0;
      let count = 0;
      const x0 = gx * cellW;
      const y0 = gy * cellH;
      for (let y = y0; y < y0 + cellH && y < height; y += 4) {
        for (let x = x0; x < x0 + cellW && x < width; x += 4) {
          const i = (y * width + x) * 4;
          const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
          sum += lum;
          count++;
        }
      }
      const avg = sum / count;
      if (avg > 140) {
        scores.push({
          x: x0,
          y: y0,
          w: cellW,
          h: cellH,
          score: avg,
        });
      }
    }
  }

  return scores.sort((a, b) => b.score - a.score).slice(0, 4);
}

function sampleBrightness(
  data: Uint8ClampedArray,
  width: number,
  r: Region,
): number {
  let sum = 0;
  let n = 0;
  for (let y = r.y; y < r.y + r.h; y += 2) {
    for (let x = r.x; x < r.x + r.w; x += 2) {
      const i = (y * width + x) * 4;
      sum += (data[i] + data[i + 1] + data[i + 2]) / 765;
      n++;
    }
  }
  return n ? sum / n : 0.5;
}
