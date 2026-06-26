import { attachHlsToVideo } from "./streamSources";

export function getLiveWsUrl(): string {
  const fromEnv = import.meta.env.VITE_LIVE_WS_URL?.trim();
  if (fromEnv) return fromEnv;
  if (import.meta.env.DEV) return "ws://localhost:8787";
  return "";
}

export function createRoomId(): string {
  const part = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  return `bg-${part}`;
}

export function spectatorUrl(room: string): string {
  const base = `${window.location.origin}${import.meta.env.BASE_URL}`;
  const normalized = base.endsWith("/") ? base : `${base}/`;
  return `${normalized}#/spectateur/${room}`;
}

export function cameraRelayUrl(room: string): string {
  const base = `${window.location.origin}${import.meta.env.BASE_URL}`;
  const normalized = base.endsWith("/") ? base : `${base}/`;
  return `${normalized}#/camera/${room}`;
}

export function attachMjpegToVideo(
  video: HTMLVideoElement,
  url: string,
): () => void {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const img = new Image();
  let active = true;
  let timer: number | null = null;

  const draw = () => {
    if (!active || !ctx || !img.naturalWidth) return;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);
    if (!video.srcObject) {
      const stream = canvas.captureStream(5);
      video.srcObject = stream;
      void video.play().catch(() => undefined);
    }
  };

  const poll = () => {
    if (!active) return;
    img.src = `${url}${url.includes("?") ? "&" : "?"}_t=${Date.now()}`;
  };

  img.onload = draw;
  img.onerror = () => {
    if (active) timer = window.setTimeout(poll, 1200);
  };
  poll();
  timer = window.setInterval(poll, 400);

  return () => {
    active = false;
    if (timer) window.clearInterval(timer);
    img.src = "";
    if (video.srcObject instanceof MediaStream) {
      video.srcObject.getTracks().forEach((t) => t.stop());
    }
    video.srcObject = null;
  };
}

export { attachHlsToVideo };
