import type { BoardDetectionResult, CalibrationPhase, GamePhase } from "../types/board";
import styles from "./CalibrationPanel.module.css";

interface Props {
  calibrationPhase: CalibrationPhase;
  gamePhase: GamePhase;
  preview: BoardDetectionResult | null;
  confidence: number;
  detecting: boolean;
  onConfirmPreview: () => void;
  onStartGame: () => void;
  onBackToAdjust: () => void;
  onReset: () => void;
  onApplyStandard: () => void;
}

export function CalibrationPanel({
  calibrationPhase,
  gamePhase,
  preview,
  confidence,
  detecting,
  onConfirmPreview,
  onStartGame,
  onBackToAdjust,
  onReset,
  onApplyStandard,
}: Props) {
  const step =
    calibrationPhase === "adjust" ? 1 : calibrationPhase === "preview" ? 2 : 3;

  const totalCheckers =
    preview?.points.reduce((s, p) => s + p.white + p.black, 0) ?? 0;

  return (
    <section className={styles.panel}>
      <header>
        <h2>Calibration plateau</h2>
        <span className={styles.step}>Étape {step}/2</span>
      </header>

      {gamePhase === "calibration" ? (
        <>
          {calibrationPhase === "adjust" && (
            <>
              <ol className={styles.steps}>
                <li>Placez le plateau entier dans le cadre vidéo</li>
                <li>Glissez les 4 coins (HG, HD, BD, BG) sur les bords du tapis</li>
                <li>Vérifiez l’aperçu des pions détectés ci-dessous</li>
              </ol>
              <button type="button" className="primary" onClick={onConfirmPreview}>
                Valider l’alignement
              </button>
            </>
          )}

          {calibrationPhase === "preview" && (
            <>
              <p className={styles.status}>
                Aperçu live · confiance {(confidence * 100).toFixed(0)}%
                {detecting && " · scan…"}
              </p>
              <p className={styles.meta}>
                {totalCheckers} pions détectés sur le plateau
                {totalCheckers === 30 && " — position standard OK"}
              </p>
              <div className={styles.actions}>
                <button type="button" className="primary" onClick={onStartGame}>
                  Lancer la partie
                </button>
                <button type="button" onClick={onApplyStandard}>
                  Forcer position standard
                </button>
                <button type="button" onClick={onBackToAdjust}>
                  Réajuster les coins
                </button>
              </div>
            </>
          )}
        </>
      ) : (
        <p className={styles.statusOk}>
          ● Partie en cours — plateau mis à jour en direct ({(confidence * 100).toFixed(0)}%)
        </p>
      )}

      <button type="button" className={styles.reset} onClick={onReset}>
        Recalibrer
      </button>
    </section>
  );
}
