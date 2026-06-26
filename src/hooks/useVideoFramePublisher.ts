import { useEffect, useRef } from "react";

/** Capture périodique du flux vidéo en JPEG pour les spectateurs (multi-viewers sans SFU). */
export function useVideoFramePublisher(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  enabled: boolean,
  publish: (jpegBase64: string) => void,
  fps = 3,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) window.clearInterval(timerRef.current);
      return;
    }

    const interval = Math.round(1000 / fps);
    timerRef.current = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;

      let canvas = canvasRef.current;
      if (!canvas) {
        canvas = document.createElement("canvas");
        canvasRef.current = canvas;
      }

      const maxW = 640;
      const scale = video.videoWidth > maxW ? maxW / video.videoWidth : 1;
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.62);
      const base64 = dataUrl.split(",")[1];
      if (base64) publish(base64);
    }, interval);

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [enabled, fps, publish, videoRef]);
}
