import { useEffect, useState } from "react";
import type { CameraDevice } from "../hooks/useCameraDevices";
import type { VideoSourceState } from "../hooks/useVideoSource";
import { cameraRelayUrl } from "../lib/videoInputs";
import styles from "./CameraSourcesPanel.module.css";

interface Props {
  state: VideoSourceState;
  devices: CameraDevice[];
  devicesReady: boolean;
  onRequestPermission: () => Promise<boolean>;
  onStartCamera: (deviceId?: string, label?: string) => void;
  onStartObs: () => void;
  onStartHls: (url: string) => void;
  onStartMjpeg: (url: string) => void;
  onStartYouTube: (url: string) => void;
  onStop: () => void;
  liveRoomId?: string;
}

export function CameraSourcesPanel({
  state,
  devices,
  devicesReady,
  onRequestPermission,
  onStartCamera,
  onStartObs,
  onStartHls,
  onStartMjpeg,
  onStartYouTube,
  onStop,
  liveRoomId,
}: Props) {
  const [selectedDevice, setSelectedDevice] = useState("");
  const [hlsUrl, setHlsUrl] = useState("");
  const [mjpegUrl, setMjpegUrl] = useState("");
  const [ytUrl, setYtUrl] = useState("");

  useEffect(() => {
    if (selectedDevice || devices.length === 0) return;
    setSelectedDevice(devices[0].deviceId);
  }, [devices, selectedDevice]);

  const selected = devices.find((d) => d.deviceId === selectedDevice);

  return (
    <section className={styles.panel}>
      <div className={styles.status}>
        <span className={state.active ? styles.live : styles.off}>
          {state.active ? "● LIVE" : "○ OFF"}
        </span>
        <span className={styles.label}>{state.label}</span>
      </div>

      {state.error && <p className={styles.error}>{state.error}</p>}

      <div className={styles.block}>
        <h3>Caméra locale (USB, intégrée, téléphone)</h3>
        {!devicesReady && (
          <button type="button" className="primary" onClick={() => void onRequestPermission()}>
            Autoriser les caméras
          </button>
        )}
        {devices.length > 0 && (
          <select
            value={selectedDevice}
            onChange={(e) => setSelectedDevice(e.target.value)}
            className={styles.select}
          >
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label}
              </option>
            ))}
          </select>
        )}
        <div className={styles.row}>
          <button
            type="button"
            className="primary"
            onClick={() => onStartCamera(selectedDevice || undefined, selected?.label)}
          >
            Utiliser cette caméra
          </button>
          <button type="button" onClick={() => onStartCamera(undefined)}>
            Caméra arrière (mobile)
          </button>
          <button type="button" onClick={onStartObs}>
            OBS / capture
          </button>
        </div>
      </div>

      <div className={styles.block}>
        <h3>Flux sans fil / réseau</h3>
        <label className={styles.fieldLabel}>HLS (.m3u8) — OBS, Restream, caméra IP</label>
        <div className={styles.row}>
          <input
            placeholder="https://…/stream.m3u8"
            value={hlsUrl}
            onChange={(e) => setHlsUrl(e.target.value)}
          />
          <button type="button" disabled={!hlsUrl.trim()} onClick={() => onStartHls(hlsUrl.trim())}>
            HLS
          </button>
        </div>
        <label className={styles.fieldLabel}>MJPEG — caméra IP (CORS / HTTPS selon modèle)</label>
        <div className={styles.row}>
          <input
            placeholder="http://192.168.x.x/video.mjpg"
            value={mjpegUrl}
            onChange={(e) => setMjpegUrl(e.target.value)}
          />
          <button
            type="button"
            disabled={!mjpegUrl.trim()}
            onClick={() => onStartMjpeg(mjpegUrl.trim())}
          >
            MJPEG
          </button>
        </div>
        <label className={styles.fieldLabel}>YouTube Live (visualisation)</label>
        <div className={styles.row}>
          <input
            placeholder="URL ou ID YouTube Live"
            value={ytUrl}
            onChange={(e) => setYtUrl(e.target.value)}
          />
          <button
            type="button"
            disabled={!ytUrl.trim()}
            onClick={() => onStartYouTube(ytUrl.trim())}
          >
            YouTube
          </button>
        </div>
      </div>

      {liveRoomId && (
        <div className={styles.block}>
          <h3>Téléphone comme caméra sans fil</h3>
          <p className={styles.hint}>
            Ouvrez ce lien sur un 2ᵉ téléphone fixé au-dessus du plateau — il rejoint la room
            et envoie le flux WebRTC automatiquement.
          </p>
          <code className={styles.link}>{cameraRelayUrl(liveRoomId)}</code>
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(cameraRelayUrl(liveRoomId))}
          >
            Copier lien caméra
          </button>
        </div>
      )}

      {state.active && (
        <button type="button" onClick={onStop} className={styles.stop}>
          Arrêter le flux
        </button>
      )}
    </section>
  );
}
