import type { DetectionFrame } from "../types";
import { detectDiceWithCamera } from "./diceVision";

/** Analyse une frame caméra — comptage de points sur dés blancs (sans capteur externe). */
export async function detectDiceFromFrame(
  imageData: ImageData,
  options?: { useOnnx?: boolean },
): Promise<DetectionFrame> {
  if (options?.useOnnx) {
    try {
      return await detectWithOnnx(imageData);
    } catch {
      // Modèle absent ou pipeline incomplet → retomber sur la CV caméra.
    }
  }

  return detectDiceWithCamera(imageData);
}

async function detectWithOnnx(imageData: ImageData): Promise<DetectionFrame> {
  const { getOnnxSession } = await import("./onnxDiceModel");
  const session = await getOnnxSession();
  if (!session) {
    throw new Error("ONNX model not loaded");
  }

  // Placeholder — compléter le pré/post-processing YOLO quand le modèle sera disponible.
  void session;
  return detectDiceWithCamera(imageData);
}
