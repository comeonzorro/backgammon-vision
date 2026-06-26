import { getDiceSearchZone } from "../lib/autoCalibrateBoard";
import type { BoardCalibration } from "../types/board";
import type { DetectionFrame, DetectionStatus } from "../types";
import styles from "./DiceOverlay.module.css";

interface Props {
  frame: DetectionFrame | null;
  show: boolean;
  status: DetectionStatus;
  calibration?: BoardCalibration | null;
}

function zoneStyle(calibration: BoardCalibration) {
  const zone = getDiceSearchZone(calibration);
  const xs = zone.map((p) => p.x);
  const ys = zone.map((p) => p.y);
  const left = Math.min(...xs) * 100;
  const top = Math.min(...ys) * 100;
  const width = (Math.max(...xs) - Math.min(...xs)) * 100;
  const height = (Math.max(...ys) - Math.min(...ys)) * 100;
  return { left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` };
}

export function DiceOverlay({ frame, show, status, calibration }: Props) {
  if (!show) return null;

  const showGuide = status === "searching" || status === "tracking" || status === "rolling";
  const guideStyle = calibration ? zoneStyle(calibration) : undefined;

  return (
    <div className={styles.overlay}>
      {showGuide && (
        <div
          className={styles.guideZone}
          style={guideStyle}
          aria-hidden
        >
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
