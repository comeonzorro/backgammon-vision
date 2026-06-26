import { useState } from "react";
import type { CameraDevice } from "../hooks/useCameraDevices";
import type { VideoSourceState } from "../hooks/useVideoSource";
import { CameraSourcesPanel } from "./CameraSourcesPanel";
import styles from "./SidebarControls.module.css";

interface Props {
  state: VideoSourceState;
  devices: CameraDevice[];
  devicesReady: boolean;
  onRequestPermission: () => Promise<boolean>;
  detecting: boolean;
  liveMode: boolean;
  useOnnx: boolean;
  detectionHz: number;
  streamActiveForDetection: boolean;
  liveRoomId?: string;
  onStartCamera: (deviceId?: string, label?: string) => void;
  onStartObs: () => void;
  onStartHls: (url: string) => void;
  onStartMjpeg: (url: string) => void;
  onStartYouTube: (url: string) => void;
  onStop: () => void;
  onDetectOnce: () => void;
  onToggleLive: () => void;
  onToggleOnnx: (value: boolean) => void;
}

export function SidebarControls({
  state,
  devices,
  devicesReady,
  onRequestPermission,
  detecting,
  liveMode,
  useOnnx,
  detectionHz,
  streamActiveForDetection,
  liveRoomId,
  onStartCamera,
  onStartObs,
  onStartHls,
  onStartMjpeg,
  onStartYouTube,
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
          ONNX (optionnel)
        </label>
      </div>

      <button
        type="button"
        className={styles.sourcesToggle}
        aria-expanded={sourcesOpen}
        onClick={() => setSourcesOpen((o) => !o)}
      >
        {sourcesOpen ? "Masquer les sources vidéo" : "Sources vidéo (USB · sans fil · réseau)"}
      </button>

      {sourcesOpen && (
        <CameraSourcesPanel
          state={state}
          devices={devices}
          devicesReady={devicesReady}
          onRequestPermission={onRequestPermission}
          onStartCamera={onStartCamera}
          onStartObs={onStartObs}
          onStartHls={onStartHls}
          onStartMjpeg={onStartMjpeg}
          onStartYouTube={onStartYouTube}
          onStop={onStop}
          liveRoomId={liveRoomId}
        />
      )}
    </section>
  );
}
