import { useState } from "react";
import { isLiveServerConfigured } from "../lib/liveRoomClient";
import { cameraRelayUrl, createRoomId, spectatorUrl } from "../lib/videoInputs";
import type { SpectatorLayout } from "../types/live";
import { DirectorPanel } from "./DirectorPanel";
import styles from "./LiveConnectPanel.module.css";

interface Props {
  roomId: string;
  onRoomIdChange: (id: string) => void;
  liveEnabled: boolean;
  onLiveEnabledChange: (v: boolean) => void;
  connected: boolean;
  peerCount: number;
  error: string | null;
  layout: SpectatorLayout;
  onLayoutChange: (layout: SpectatorLayout) => void;
  hostName: string;
  onHostNameChange: (name: string) => void;
}

export function LiveConnectPanel({
  roomId,
  onRoomIdChange,
  liveEnabled,
  onLiveEnabledChange,
  connected,
  peerCount,
  error,
  layout,
  onLayoutChange,
  hostName,
  onHostNameChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const configured = isLiveServerConfigured();

  const generate = () => onRoomIdChange(createRoomId());

  return (
    <section className={styles.panel}>
      <button
        type="button"
        className={styles.toggle}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {open ? "▾" : "▸"} Diffusion spectateurs & chat
        {connected && <span className={styles.badgeLive}>LIVE · {peerCount}</span>}
      </button>

      {open && (
        <div className={styles.body}>
          {!configured && (
            <p className={styles.warn}>
              Serveur live non configuré. Déployez <code>server/live-room.mjs</code> et définissez{" "}
              <code>VITE_LIVE_WS_URL</code> (ex. wss://votre-serveur).
            </p>
          )}

          <label className={styles.field}>
            Nom du diffuseur / table
            <input value={hostName} onChange={(e) => onHostNameChange(e.target.value)} maxLength={32} />
          </label>

          <label className={styles.field}>
            Room (compétition / table)
            <div className={styles.row}>
              <input value={roomId} onChange={(e) => onRoomIdChange(e.target.value)} />
              <button type="button" onClick={generate}>
                Générer
              </button>
            </div>
          </label>

          <label className={styles.check}>
            <input
              type="checkbox"
              checked={liveEnabled}
              disabled={!configured || !roomId.trim()}
              onChange={(e) => onLiveEnabledChange(e.target.checked)}
            />
            Activer la diffusion live
          </label>

          {error && <p className={styles.error}>{error}</p>}

          {connected && roomId && (
            <>
              <div className={styles.links}>
                <div>
                  <span className={styles.linkLabel}>Lien spectateurs</span>
                  <code>{spectatorUrl(roomId)}</code>
                  <button type="button" onClick={() => void navigator.clipboard.writeText(spectatorUrl(roomId))}>
                    Copier
                  </button>
                </div>
                <div>
                  <span className={styles.linkLabel}>Lien caméra sans fil</span>
                  <code>{cameraRelayUrl(roomId)}</code>
                  <button type="button" onClick={() => void navigator.clipboard.writeText(cameraRelayUrl(roomId))}>
                    Copier
                  </button>
                </div>
              </div>
              <DirectorPanel layout={layout} onChange={onLayoutChange} />
            </>
          )}
        </div>
      )}
    </section>
  );
}
