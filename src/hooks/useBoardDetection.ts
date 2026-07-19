import { useCallback, useEffect, useRef, useState } from "react";
import { boardStatesMatch, detectBoardFromFrame } from "../lib/boardVision";
import type { BoardCalibration, BoardDetectionResult, BoardMapping } from "../types/board";

const PREVIEW_HZ = 1.2;
const LIVE_HZ = 1;
const STABLE_FRAMES = 2;

export function useBoardDetection(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  calibration: BoardCalibration,
  enabled: boolean,
  liveMode: boolean,
  mapping: BoardMapping | null = null,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stableBufferRef = useRef<BoardDetectionResult[]>([]);
  const [preview, setPreview] = useState<BoardDetectionResult | null>(null);
  const [stable, setStable] = useState<BoardDetectionResult | null>(null);
  const [detecting, setDetecting] = useState(false);

  const capture = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !enabled) return null;

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
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    return detectBoardFromFrame(imageData, calibration, mapping);
  }, [videoRef, enabled, calibration, mapping]);

  const runOnce = useCallback(async () => {
    setDetecting(true);
    try {
      const result = await capture();
      if (result) setPreview(result);
      return result;
    } finally {
      setDetecting(false);
    }
  }, [capture]);

  useEffect(() => {
    if (!enabled) {
      stableBufferRef.current = [];
      return;
    }

    const hz = liveMode ? LIVE_HZ : PREVIEW_HZ;
    const ms = Math.round(1000 / hz);
    void runOnce();
    const id = window.setInterval(() => void runOnce(), ms);
    return () => window.clearInterval(id);
  }, [enabled, liveMode, runOnce]);

  useEffect(() => {
    if (!preview) return;

    if (!liveMode) {
      setStable(preview);
      return;
    }

    const buf = [...stableBufferRef.current, preview].slice(-STABLE_FRAMES);
    stableBufferRef.current = buf;

    if (
      buf.length >= STABLE_FRAMES &&
      boardStatesMatch(buf[0], buf[buf.length - 1], 1)
    ) {
      setStable(buf[buf.length - 1]);
    }
  }, [preview, liveMode]);

  return {
    preview,
    stable: liveMode ? stable : preview,
    detecting,
    runOnce,
    confidence: (liveMode ? stable : preview)?.confidence ?? 0,
  };
}
