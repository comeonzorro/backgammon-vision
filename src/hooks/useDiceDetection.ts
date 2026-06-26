import { useCallback, useEffect, useRef, useState } from "react";
import { detectDiceFromFrame } from "../lib/diceDetector";
import type { DetectionFrame } from "../types";

const DETECTION_HZ = 1.4;
const INTERVAL_MS = Math.round(1000 / DETECTION_HZ);

export function useDiceDetection(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  streamActive: boolean,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [liveMode, setLiveMode] = useState(false);
  const [lastFrame, setLastFrame] = useState<DetectionFrame | null>(null);
  const [useOnnx, setUseOnnx] = useState(false);
  const intervalRef = useRef<number | null>(null);

  const captureAndDetect = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !streamActive) return;

    let canvas = canvasRef.current;
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvasRef.current = canvas;
    }

    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    const result = await detectDiceFromFrame(imageData, { useOnnx });
    setLastFrame(result);
    return result;
  }, [videoRef, streamActive, useOnnx]);

  const runOnce = useCallback(async () => {
    setDetecting(true);
    try {
      await captureAndDetect();
    } finally {
      setDetecting(false);
    }
  }, [captureAndDetect]);

  useEffect(() => {
    if (!liveMode || !streamActive) {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    void captureAndDetect();
    intervalRef.current = window.setInterval(() => {
      void captureAndDetect();
    }, INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [liveMode, streamActive, captureAndDetect]);

  const diceValues = lastFrame?.dice.map((d) => d.value) ?? [];

  return {
    detecting,
    liveMode,
    setLiveMode,
    lastFrame,
    diceValues,
    runOnce,
    useOnnx,
    setUseOnnx,
    canDetect: streamActive,
    detectionHz: DETECTION_HZ,
  };
}
