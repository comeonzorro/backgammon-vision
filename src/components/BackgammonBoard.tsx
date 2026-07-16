import type { BackgammonPoint } from "../types";
import styles from "./BackgammonBoard.module.css";

interface Props {
  points: BackgammonPoint[];
  barWhite: number;
  barBlack: number;
  offWhite: number;
  offBlack: number;
  compact?: boolean;
  live?: boolean;
  confidence?: number;
  pointConfidence?: Record<number, number>;
}

export function BackgammonBoard({
  points,
  barWhite,
  barBlack,
  offWhite,
  offBlack,
  compact,
  live,
  confidence = 0,
  pointConfidence,
}: Props) {
  const top = [...points.slice(12, 24)].reverse();
  const bottom = points.slice(0, 12);

  return (
    <div className={`${styles.board} ${compact ? styles.compact : ""} ${live ? styles.live : ""}`}>
      <div className={styles.boardHeader}>
        <span className={styles.boardTitle}>Plateau</span>
        {live && (
          <span className={styles.liveBadge}>
            LIVE {(confidence * 100).toFixed(0)}%
          </span>
        )}
      </div>
      <div className={styles.offArea}>
        <span className={styles.offLabel}>Sorties ○ {offWhite}</span>
        <span className={styles.offLabel}>Sorties ● {offBlack}</span>
      </div>
      <div className={styles.inner}>
        <div className={styles.half}>
          {top.map((p, i) => (
            <Point
              key={p.index}
              point={p}
              direction="down"
              alt={i % 2 === 0}
              confidence={pointConfidence?.[p.index]}
            />
          ))}
        </div>
        <div className={styles.bar}>
          <div className={styles.barStack}>
            {Array.from({ length: barWhite }).map((_, i) => (
              <span key={`w${i}`} className={`${styles.checker} ${styles.white}`} />
            ))}
          </div>
          <div className={styles.barStack}>
            {Array.from({ length: barBlack }).map((_, i) => (
              <span key={`b${i}`} className={`${styles.checker} ${styles.black}`} />
            ))}
          </div>
        </div>
        <div className={styles.half}>
          {bottom.map((p, i) => (
            <Point
              key={p.index}
              point={p}
              direction="up"
              alt={i % 2 === 0}
              confidence={pointConfidence?.[p.index]}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Point({
  point,
  direction,
  alt,
  confidence,
}: {
  point: BackgammonPoint;
  direction: "up" | "down";
  alt: boolean;
  confidence?: number;
}) {
  const count = Math.max(point.white, point.black);
  const color = point.white > point.black ? "white" : point.black > 0 ? "black" : null;
  const shown = Math.min(count, 5);
  const lowConf = confidence !== undefined && confidence < 0.45;

  return (
    <div
      className={`${styles.point} ${styles[direction]} ${alt ? styles.alt : ""} ${lowConf ? styles.uncertain : ""}`}
    >
      <div className={styles.triangle} />
      <div className={styles.stack}>
        {color &&
          Array.from({ length: shown }).map((_, i) => (
            <span
              key={i}
              className={`${styles.checker} ${styles[color]}`}
              style={{ zIndex: i }}
            />
          ))}
        {count > 5 && <span className={styles.count}>{count}</span>}
      </div>
      <span className={styles.pointNum}>{point.index}</span>
    </div>
  );
}
