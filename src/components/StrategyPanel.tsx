import type { StrategyAdvice } from "../types";
import styles from "./StrategyPanel.module.css";

interface Props {
  advice: StrategyAdvice | null;
  dice: number[];
  detecting: boolean;
}

export function StrategyPanel({ advice, dice, detecting }: Props) {
  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <h2>Analyse stratégique</h2>
        {detecting && <span className={styles.pulse}>Calcul…</span>}
      </header>

      <div className={styles.diceRow}>
        <span className={styles.diceLabel}>Dés lus</span>
        <div className={styles.diceFaces}>
          {dice.length > 0 ? (
            dice.map((v, i) => (
              <span key={i} className={styles.die}>
                {v}
              </span>
            ))
          ) : (
            <span className={styles.muted}>En attente de détection visuelle</span>
          )}
        </div>
      </div>

      {advice ? (
        <>
          <div className={styles.metricRow}>
            <Metric label="Équité" value={advice.equity.toFixed(3)} />
            <Metric label="Win %" value={`${advice.winChance}%`} />
            <Metric
              label="Risque"
              value={advice.riskLevel}
              variant={advice.riskLevel === "high" ? "danger" : "default"}
            />
          </div>

          <div className={styles.block}>
            <h3>Meilleur coup</h3>
            <p className={styles.move}>{advice.bestMove}</p>
          </div>

          <div className={styles.block}>
            <h3>Commentaire spectateur</h3>
            <p className={styles.comment}>{advice.spectatorComment}</p>
          </div>

          <div className={styles.block}>
            <h3>Alternatives</h3>
            <ul className={styles.list}>
              {advice.alternatives.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
        </>
      ) : (
        <p className={styles.muted}>
          Lancez la détection sur le flux vidéo pour obtenir une recommandation de coup et un
          commentaire pour les spectateurs.
        </p>
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  variant = "default",
}: {
  label: string;
  value: string;
  variant?: "default" | "danger";
}) {
  return (
    <div className={styles.metric}>
      <span className={styles.metricLabel}>{label}</span>
      <span className={variant === "danger" ? styles.danger : styles.metricValue}>
        {value}
      </span>
    </div>
  );
}
