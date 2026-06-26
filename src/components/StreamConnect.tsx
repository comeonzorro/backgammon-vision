import { useState } from "react";
import type { VideoSourceState } from "../hooks/useVideoSource";
import styles from "./StreamConnect.module.css";

interface Props {
  state: VideoSourceState;
  localOffer: string;
  onStartCamera: () => void;
  onStartObs: () => void;
  onStartYouTube: (url: string) => void;
  onStartWebRtcViewer: () => void;
  onStartWebRtcBroadcast: () => void;
  onApplyAnswer: (json: string) => void;
  onStop: () => void;
}

export function StreamConnect({
  state,
  localOffer,
  onStartCamera,
  onStartObs,
  onStartYouTube,
  onStartWebRtcViewer,
  onStartWebRtcBroadcast,
  onApplyAnswer,
  onStop,
}: Props) {
  const [ytUrl, setYtUrl] = useState("");
  const [answer, setAnswer] = useState("");

  return (
    <section className={styles.panel}>
      <div className={styles.status}>
        <span className={state.active ? styles.live : styles.off}>
          {state.active ? "● LIVE" : "○ OFF"}
        </span>
        <span className={styles.label}>{state.label}</span>
      </div>

      {state.error && <p className={styles.error}>{state.error}</p>}

      <div className={styles.grid}>
        <button type="button" className="primary" onClick={onStartCamera}>
          📱 Caméra / iPhone
        </button>
        <button type="button" onClick={onStartObs}>
          🎬 OBS
        </button>
        <button
          type="button"
          disabled={!ytUrl.trim()}
          onClick={() => onStartYouTube(ytUrl.trim())}
        >
          ▶ YouTube Live
        </button>
        <button type="button" onClick={onStartWebRtcBroadcast}>
          WebRTC broadcast
        </button>
        <button type="button" onClick={onStartWebRtcViewer}>
          WebRTC viewer
        </button>
        {state.active && (
          <button type="button" onClick={onStop} className={styles.stop}>
            Arrêter
          </button>
        )}
      </div>

      <div className={styles.ytRow}>
        <input
          placeholder="URL ou ID YouTube Live"
          value={ytUrl}
          onChange={(e) => setYtUrl(e.target.value)}
        />
      </div>

      {(localOffer || answer) && (
        <div className={styles.sdp}>
          <label>Signaling WebRTC (SDP manuel)</label>
          {localOffer && (
            <>
              <textarea readOnly value={localOffer} rows={3} />
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(localOffer)}
              >
                Copier offer
              </button>
            </>
          )}
          <textarea
            placeholder="Coller remote answer JSON ici"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={3}
          />
          <button type="button" onClick={() => onApplyAnswer(answer)}>
            Appliquer answer
          </button>
        </div>
      )}
    </section>
  );
}
