import * as ort from "onnxruntime-web";

let sessionPromise: Promise<ort.InferenceSession | null> | null = null;

const MODEL_URL = "/models/dice-yolo.onnx";

export async function getOnnxSession(): Promise<ort.InferenceSession | null> {
  if (!sessionPromise) {
    sessionPromise = loadSession();
  }
  return sessionPromise;
}

async function loadSession(): Promise<ort.InferenceSession | null> {
  try {
    const res = await fetch(MODEL_URL, { method: "HEAD" });
    if (!res.ok) return null;
    return ort.InferenceSession.create(MODEL_URL, {
      executionProviders: ["wasm"],
    });
  } catch {
    return null;
  }
}

export function resetOnnxSession(): void {
  sessionPromise = null;
}
