import { useState } from "react";
import { OBS_SETUP_STEPS } from "../lib/streamSources";
import styles from "./ObsConnectModal.module.css";

interface Props {
  open: boolean;
  onClose: () => void;
  onConnectVirtualCam: () => void;
  onConnectHls: (url: string) => void;
}

export function ObsConnectModal({ open, onClose, onConnectVirtualCam, onConnectHls }: Props) {
  const [hlsUrl, setHlsUrl] = useState("");

  if (!open) return null;

  return (
    <div className={styles.backdrop} onClick={onClose} role="presentation">
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="obs-title"
      >
        <header className={styles.header}>
          <h2 id="obs-title">Connecter OBS</h2>
          <button type="button" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </header>

        <p className={styles.intro}>
          Intégrez votre setup streamer existant sans changer votre workflow : Virtual Cam pour
          l'analyse locale, ou flux HLS pour reprendre la sortie RTMP d'OBS.
        </p>

        <ol className={styles.steps}>
          {OBS_SETUP_STEPS.map((s) => (
            <li key={s.title}>
              <strong>{s.title}</strong>
              <p>{s.description}</p>
            </li>
          ))}
        </ol>

        <div className={styles.actions}>
          <button type="button" className="primary" onClick={onConnectVirtualCam}>
            Utiliser OBS Virtual Camera
          </button>
        </div>

        <div className={styles.hlsBlock}>
          <label htmlFor="hls-url">URL HLS (.m3u8) depuis votre relay RTMP</label>
          <input
            id="hls-url"
            placeholder="https://…/live/stream.m3u8"
            value={hlsUrl}
            onChange={(e) => setHlsUrl(e.target.value)}
          />
          <button
            type="button"
            disabled={!hlsUrl.trim()}
            onClick={() => {
              onConnectHls(hlsUrl.trim());
              onClose();
            }}
          >
            Connecter flux HLS
          </button>
        </div>
      </div>
    </div>
  );
}
