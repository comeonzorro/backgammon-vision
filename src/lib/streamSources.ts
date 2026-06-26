import Hls from "hls.js";

export function attachHlsToVideo(video: HTMLVideoElement, url: string): () => void {
  if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = url;
    void video.play().catch(() => undefined);
    return () => {
      video.removeAttribute("src");
      video.load();
    };
  }

  if (!Hls.isSupported()) {
    video.src = url;
    return () => {
      video.removeAttribute("src");
      video.load();
    };
  }

  const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
  hls.loadSource(url);
  hls.attachMedia(video);
  void video.play().catch(() => undefined);

  return () => {
    hls.destroy();
    video.removeAttribute("src");
    video.load();
  };
}

export function extractYouTubeVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    if (url.hostname.includes("youtu.be")) {
      return url.pathname.slice(1).split("/")[0] || null;
    }
    if (url.hostname.includes("youtube.com")) {
      return url.searchParams.get("v") ?? url.pathname.split("/").pop() ?? null;
    }
  } catch {
    return null;
  }
  return null;
}

export const OBS_SETUP_STEPS = [
  {
    title: "Virtual Camera (recommandé pour les joueurs)",
    description:
      "Dans OBS : Outils → Virtual Camera → Démarrer. Puis dans l'app, source « Caméra / OBS Virtual Cam ».",
  },
  {
    title: "Sortie HLS pour streamers",
    description:
      "Configurez OBS → Paramètres → Diffusion vers un serveur RTMP (Restream, nginx-rtmp, etc.) et collez l'URL HLS (.m3u8) ici.",
  },
  {
    title: "Browser Source overlay",
    description:
      "Ajoutez une Browser Source pointant vers cette app en mode « streamer » pour superposer le board d'analyse sur votre scène OBS.",
  },
] as const;
