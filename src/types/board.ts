/** Coin normalisé (0–1) dans le flux vidéo. Ordre : haut-gauche, haut-droit, bas-droit, bas-gauche. */
export interface NormPoint {
  x: number;
  y: number;
}

export interface BoardCalibration {
  corners: [NormPoint, NormPoint, NormPoint, NormPoint];
}

export type CalibrationPhase = "adjust" | "preview" | "playing";

export type GamePhase = "calibration" | "playing";

export interface BoardDetectionResult {
  timestamp: number;
  points: { index: number; white: number; black: number }[];
  barWhite: number;
  barBlack: number;
  offWhite: number;
  offBlack: number;
  confidence: number;
  pointConfidence: Record<number, number>;
  source: "camera-cv";
}

export const DEFAULT_CALIBRATION: BoardCalibration = {
  corners: [
    { x: 0.12, y: 0.22 },
    { x: 0.88, y: 0.22 },
    { x: 0.88, y: 0.78 },
    { x: 0.12, y: 0.78 },
  ],
};

const STORAGE_KEY = "bgv-board-calibration";

export function loadCalibration(): BoardCalibration {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CALIBRATION;
    const parsed = JSON.parse(raw) as BoardCalibration;
    if (parsed.corners?.length === 4) return parsed;
  } catch {
    // ignore
  }
  return DEFAULT_CALIBRATION;
}

export function saveCalibration(cal: BoardCalibration) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cal));
}

/** Numérotation standard : bas = 1–12 (droite→gauche), haut = 13–24. */
export const POINT_GRID: (number | "bar")[][] = [
  [13, 14, 15, 16, 17, 18, "bar", 19, 20, 21, 22, 23, 24],
  [12, 11, 10, 9, 8, 7, "bar", 6, 5, 4, 3, 2, 1],
];
