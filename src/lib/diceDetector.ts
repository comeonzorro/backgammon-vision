import type { DetectionFrame } from "../types";
import type { BoardCalibration } from "../types/board";
import { detectDiceWithCamera } from "./diceVision";

/** Analyse une frame caméra — comptage de points sur dés blancs (sans capteur externe). */
export async function detectDiceFromFrame(
  imageData: ImageData,
  options?: { useOnnx?: boolean; calibration?: BoardCalibration | null },
): Promise<DetectionFrame> {
  if (options?.useOnnx) {
    try {
      return await detectWithOnnx(imageData, options.calibration);
    } catch {
      // fallback CV
    }
  }

  return detectDiceWithCamera(imageData, options?.calibration);
}

async function detectWithOnnx(
  imageData: ImageData,
  calibration?: BoardCalibration | null,
): Promise<DetectionFrame> {
  const { getOnnxSession } = await import("./onnxDiceModel");
  const session = await getOnnxSession();
  if (!session) {
    throw new Error("ONNX model not loaded");
  }

  // Placeholder — compléter le pré/post-processing YOLO quand le modèle sera disponible.
  void session;
  return detectDiceWithCamera(imageData, calibration);
}
