import { useState } from "react";
import type { VideoSourceState } from "../hooks/useVideoSource";
import { StreamConnect } from "./StreamConnect";
import styles from "./SidebarControls.module.css";

interface Props {
  state: VideoSourceState;
  localOffer: string;
  detecting: boolean;
  liveMode: boolean;
  useOnnx: boolean;
  detectionHz: number;
  streamActiveForDetection: boolean;
  onStartCamera: () => void;
  onStartObs: () => void;
  onStartYouTube: (url: string) => void;
  onStartWebRtcViewer: () => void;
  onStartWebRtcBroadcast: () => void;
  onApplyAnswer: (json: string) => void;
  onStop: () => void;
  onDetectOnce: () => void;
  onToggleLive: () => void;
  onToggleOnnx: (value: boolean) => void;
}

export function SidebarControls({
  state,
  localOffer,
  detecting,
  liveMode,
  useOnnx,
  detectionHz,
  streamActiveForDetection,
  onStartCamera,
  onStartObs,
  onStartYouTube,
  onStartWebRtcViewer,
  onStartWebRtcBroadcast,
  onApplyAnswer,
  onStop,
  onDetectOnce,
  onToggleLive,
  onToggleOnnx,
}: Props) {
  const [sourcesOpen, setSourcesOpen] = useState(false);

  return (
    <section className={styles.wrap}>
      <div className={styles.detectBar}>
        <button
          type="button"
          className="primary"
          disabled={!streamActiveForDetection || detecting}
          onClick={onDetectOnce}
        >
          Détecter
        </button>
        <button
          type="button"
          disabled={!streamActiveForDetection}
          className={liveMode ? styles.liveOn : ""}
          onClick={onToggleLive}
        >
          {liveMode ? `Live ${detectionHz} Hz` : "Live auto"}
        </button>
        <label className={styles.onnxToggle}>
          <input
            type="checkbox"
            checked={useOnnx}
            onChange={(e) => onToggleOnnx(e.target.checked)}
          />
          ONNX
        </label>
      </div>

      <button
        type="button"
        className={styles.sourcesToggle}
        aria-expanded={sourcesOpen}
        onClick={() => setSourcesOpen((o) => !o)}
      >
        {sourcesOpen ? "Masquer les sources" : "Sources vidéo (OBS · YouTube · WebRTC)"}
      </button>

      {sourcesOpen && (
        <StreamConnect
          state={state}
          localOffer={localOffer}
          onStartCamera={onStartCamera}
          onStartObs={onStartObs}
          onStartYouTube={onStartYouTube}
          onStartWebRtcViewer={onStartWebRtcViewer}
          onStartWebRtcBroadcast={onStartWebRtcBroadcast}
          onApplyAnswer={onApplyAnswer}
          onStop={onStop}
        />
      )}
    </section>
  );
}
