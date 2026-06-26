import type { RefObject } from "react";
import { extractYouTubeVideoId } from "../lib/streamSources";
import type { DetectionFrame, DetectionStatus } from "../types";
import { DiceOverlay } from "./DiceOverlay";
import styles from "./VideoPanel.module.css";

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>;
  sourceKind: string | null;
  youtubeInput?: string;
  active: boolean;
  detectionFrame: DetectionFrame | null;
  showOverlay: boolean;
  detectionStatus?: DetectionStatus;
  fillStage?: boolean;
}

export function VideoPanel({
  videoRef,
  sourceKind,
  youtubeInput,
  active,
  detectionFrame,
  showOverlay,
  detectionStatus = "idle",
  fillStage = false,
}: Props) {
  const ytId =
    sourceKind === "youtube" && youtubeInput
      ? extractYouTubeVideoId(youtubeInput)
      : null;

  return (
    <div className={fillStage ? `${styles.wrap} ${styles.fillStage}` : styles.wrap}>
      <div className={fillStage ? `${styles.videoBox} ${styles.videoBoxFill}` : styles.videoBox}>
        {sourceKind === "youtube" && ytId ? (
          <iframe
            className={styles.yt}
            src={`https://www.youtube.com/embed/${ytId}?autoplay=1&mute=1`}
            title="YouTube Live"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <>
            <video
              ref={videoRef}
              className={styles.video}
              playsInline
              muted
              autoPlay
            />
            <DiceOverlay
              frame={detectionFrame}
              show={showOverlay && sourceKind !== "youtube"}
              status={detectionStatus}
            />
          </>
        )}
        {!active && (
          <div className={styles.placeholder}>
            <p>Connectez une source vidéo</p>
            <span>iPhone · OBS · YouTube · WebRTC</span>
          </div>
        )}
      </div>
      {sourceKind === "youtube" && (
        <p className={styles.ytNote}>
          YouTube est en lecture intégrée. Pour la détection des dés, utilisez en parallèle la
          caméra ou le flux HLS/OBS (CORS YouTube).
        </p>
      )}
    </div>
  );
}
