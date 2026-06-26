import type { DetectionFrame } from "../types";
import styles from "./DiceOverlay.module.css";

interface Props {
  frame: DetectionFrame | null;
  show: boolean;
}

export function DiceOverlay({ frame, show }: Props) {
  if (!show || !frame) return null;

  return (
    <div className={styles.overlay}>
      {frame.dice.map((d, i) => (
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
        YOLO {frame.source} · {new Date(frame.timestamp).toLocaleTimeString("fr-FR")}
      </span>
    </div>
  );
}
