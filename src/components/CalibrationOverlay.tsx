import { useCallback, useRef } from "react";
import type { BoardCalibration, CalibrationPhase } from "../types/board";
import styles from "./CalibrationOverlay.module.css";

interface Props {
  calibration: BoardCalibration;
  onCornerMove: (index: 0 | 1 | 2 | 3, point: { x: number; y: number }) => void;
  phase: CalibrationPhase;
  editable: boolean;
}

const CORNER_LABELS = ["HG", "HD", "BD", "BG"];

export function CalibrationOverlay({ calibration, onCornerMove, phase, editable }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);

  const pointerToNorm = useCallback((clientX: number, clientY: number) => {
    const box = boxRef.current?.parentElement;
    if (!box) return null;
    const rect = box.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height,
    };
  }, []);

  const startDrag = (index: 0 | 1 | 2 | 3) => (e: React.PointerEvent) => {
    if (!editable) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const move = (ev: PointerEvent) => {
      const p = pointerToNorm(ev.clientX, ev.clientY);
      if (p) onCornerMove(index, p);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const [tl, tr, br, bl] = calibration.corners;
  const poly = `${tl.x * 100}% ${tl.y * 100}%, ${tr.x * 100}% ${tr.y * 100}%, ${br.x * 100}% ${br.y * 100}%, ${bl.x * 100}% ${bl.y * 100}%`;

  return (
    <div ref={boxRef} className={styles.overlay} aria-hidden={phase === "playing"}>
      <div
        className={styles.boardOutline}
        style={{ clipPath: `polygon(${poly})` }}
      />
      <svg className={styles.grid} viewBox="0 0 100 100" preserveAspectRatio="none">
        <polygon
          points={`${tl.x * 100},${tl.y * 100} ${tr.x * 100},${tr.y * 100} ${br.x * 100},${br.y * 100} ${bl.x * 100},${bl.y * 100}`}
          fill="none"
          stroke="rgba(201,162,39,0.85)"
          strokeWidth="0.4"
        />
        {Array.from({ length: 12 }).map((_, i) => {
          const u = (i + 1) / 13;
          const top = lerpPt(tl, tr, u);
          const bot = lerpPt(bl, br, u);
          return (
            <line
              key={`v${i}`}
              x1={top.x * 100}
              y1={top.y * 100}
              x2={bot.x * 100}
              y2={bot.y * 100}
              stroke="rgba(201,162,39,0.25)"
              strokeWidth="0.15"
            />
          );
        })}
        <line
          x1={lerpPt(tl, bl, 0.5).x * 100}
          y1={lerpPt(tl, bl, 0.5).y * 100}
          x2={lerpPt(tr, br, 0.5).x * 100}
          y2={lerpPt(tr, br, 0.5).y * 100}
          stroke="rgba(201,162,39,0.35)"
          strokeWidth="0.2"
        />
      </svg>

      {calibration.corners.map((c, i) => (
        <button
          key={i}
          type="button"
          className={`${styles.handle} ${editable ? styles.handleActive : ""}`}
          style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}
          onPointerDown={startDrag(i as 0 | 1 | 2 | 3)}
          aria-label={`Coin ${CORNER_LABELS[i]}`}
        >
          {editable ? CORNER_LABELS[i] : ""}
        </button>
      ))}

      {editable && (
        <span className={styles.hint}>Ajustez les 4 coins sur le bord du plateau</span>
      )}
    </div>
  );
}

function lerpPt(a: { x: number; y: number }, b: { x: number; y: number }, t: number) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
