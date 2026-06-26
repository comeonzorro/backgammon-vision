import { useCallback, useEffect, useRef, useState } from "react";
import { detectDiceFromFrame } from "../lib/diceDetector";
import { getDiceSearchZone } from "../lib/autoCalibrateBoard";
import type { BoardCalibration } from "../types/board";
import type { ConfirmedRoll, DetectionFrame, DetectionStatus } from "../types";

const DETECTION_HZ = 2.5;
const INTERVAL_MS = Math.round(1000 / DETECTION_HZ);
const STABLE_FRAMES = 2;
const MIN_CONFIDENCE = 0.42;
const MOTION_THRESHOLD = 24;

function rollKey(dice: number[]): string {
  if (dice.length < 2) return dice.join("-");
  return [...dice].sort((a, b) => a - b).join("-");
}

export function useDiceDetection(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  streamActive: boolean,
  calibration: BoardCalibration | null,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevGrayRef = useRef<Uint8Array | null>(null);
  const stableBufferRef = useRef<string[]>([]);
  const lastConfirmedKeyRef = useRef<string>("");
  const lastConfirmedAtRef = useRef(0);

  const [detecting, setDetecting] = useState(false);
  const [liveMode, setLiveMode] = useState(false);
  const [lastFrame, setLastFrame] = useState<DetectionFrame | null>(null);
  const [previewDice, setPreviewDice] = useState<number[]>([]);
  const [status, setStatus] = useState<DetectionStatus>("idle");
  const [confirmedRoll, setConfirmedRoll] = useState<ConfirmedRoll | null>(null);
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

    const gray = downscaleGrayInZone(imageData, calibration);
    let motion = 0;
    if (prevGrayRef.current && prevGrayRef.current.length === gray.length) {
      let sum = 0;
      for (let i = 0; i < gray.length; i++) sum += Math.abs(gray[i] - prevGrayRef.current[i]);
      motion = sum / gray.length;
    }
    prevGrayRef.current = gray;

    const result = await detectDiceFromFrame(imageData, { useOnnx, calibration });
    result.motionScore = motion;
    setLastFrame(result);

    const values = result.dice.map((d) => d.value);
    const avgConf =
      result.dice.length > 0
        ? result.dice.reduce((s, d) => s + d.confidence, 0) / result.dice.length
        : 0;

    if (motion > MOTION_THRESHOLD) {
      setStatus("rolling");
      setPreviewDice(values);
      stableBufferRef.current = [];
      return result;
    }

    if (result.dice.length === 0) {
      setStatus("searching");
      setPreviewDice([]);
      stableBufferRef.current = [];
      return result;
    }

    if (result.dice.length < 2 || avgConf < MIN_CONFIDENCE) {
      setStatus("tracking");
      setPreviewDice(values);
      stableBufferRef.current = [];
      return result;
    }

    setStatus("tracking");
    setPreviewDice(values);

    const key = rollKey(values);
    stableBufferRef.current = [...stableBufferRef.current, key].slice(-STABLE_FRAMES);

    const stable =
      stableBufferRef.current.length >= STABLE_FRAMES &&
      stableBufferRef.current.every((k) => k === key);

    const now = Date.now();
    const canConfirm =
      stable &&
      avgConf >= MIN_CONFIDENCE &&
      (key !== lastConfirmedKeyRef.current || now - lastConfirmedAtRef.current > 2500);

    if (canConfirm) {
      lastConfirmedKeyRef.current = key;
      lastConfirmedAtRef.current = now;
      stableBufferRef.current = [];
      setConfirmedRoll({
        timestamp: now,
        dice: values,
        confidence: avgConf,
        frame: result,
      });
      setStatus("confirmed");
    }

    return result;
  }, [videoRef, streamActive, useOnnx, calibration]);

  const runOnce = useCallback(async (force = false) => {
    setDetecting(true);
    try {
      const result = await captureAndDetect();
      if (force && result && result.dice.length >= 2) {
        const values = result.dice.map((d) => d.value);
        const avgConf =
          result.dice.reduce((s, d) => s + d.confidence, 0) / result.dice.length;
        setConfirmedRoll({
          timestamp: Date.now(),
          dice: values,
          confidence: avgConf,
          frame: result,
        });
        setStatus("confirmed");
      }
      return result;
    } finally {
      setDetecting(false);
    }
  }, [captureAndDetect]);

  useEffect(() => {
    if (!streamActive) {
      setStatus("idle");
      setPreviewDice([]);
      prevGrayRef.current = null;
      stableBufferRef.current = [];
    }
  }, [streamActive]);

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

  const diceValues = confirmedRoll?.dice ?? previewDice;

  return {
    detecting,
    liveMode,
    setLiveMode,
    lastFrame,
    previewDice,
    confirmedRoll,
    diceValues,
    status,
    runOnce,
    useOnnx,
    setUseOnnx,
    canDetect: streamActive,
    detectionHz: DETECTION_HZ,
  };
}

function downscaleGrayInZone(imageData: ImageData, calibration: BoardCalibration | null): Uint8Array {
  const { width, height, data } = imageData;
  let x0 = 0;
  let y0 = 0;
  let x1 = width;
  let y1 = height;

  if (calibration) {
    const zone = getDiceSearchZone(calibration);
    x0 = Math.floor(Math.min(...zone.map((p) => p.x * width)));
    y0 = Math.floor(Math.min(...zone.map((p) => p.y * height)));
    x1 = Math.ceil(Math.max(...zone.map((p) => p.x * width)));
    y1 = Math.ceil(Math.max(...zone.map((p) => p.y * height)));
  }

  const rw = Math.max(1, x1 - x0);
  const rh = Math.max(1, y1 - y0);
  const sw = Math.max(8, Math.round(rw / 6));
  const sh = Math.max(8, Math.round(rh / 6));
  const out = new Uint8Array(sw * sh);

  for (let y = 0; y < sh; y++) {
    const sy = y0 + Math.min(rh - 1, Math.floor((y / sh) * rh));
    for (let x = 0; x < sw; x++) {
      const sx = x0 + Math.min(rw - 1, Math.floor((x / sw) * rw));
      const i = (sy * width + sx) * 4;
      out[y * sw + x] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
  }
  return out;
}
