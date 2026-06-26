import type { DetectionFrame, DetectionStatus } from "../types";
import styles from "./DiceOverlay.module.css";

interface Props {
  frame: DetectionFrame | null;
  show: boolean;
  status: DetectionStatus;
}

export function DiceOverlay({ frame, show, status }: Props) {
  if (!show) return null;

  const showGuide = status === "searching" || status === "tracking";

  return (
    <div className={styles.overlay}>
      {showGuide && (
        <div className={styles.guideZone} aria-hidden>
          <span className={styles.guideLabel}>Zone de lecture des dés</span>
        </div>
      )}

      {frame?.dice.map((d, i) => (
        <div
          key={i}
          className={styles.box}
          style={{
            left: `${d.x * 100}%`,
            top: `${d.y * 100}%`,
            width: `${d.width * 100}%`,
            height: `${d.height * 100}%`,
          }}
        >
          <span className={styles.label}>
            {d.value} ({Math.round(d.confidence * 100)}%)
          </span>
        </div>
      ))}

      <span className={styles.badge}>
        CV caméra
        {frame ? ` · ${new Date(frame.timestamp).toLocaleTimeString("fr-FR")}` : ""}
      </span>
    </div>
  );
}
