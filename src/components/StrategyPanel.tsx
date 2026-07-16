import type { DetectionStatus, StrategyAdvice } from "../types";
import styles from "./StrategyPanel.module.css";

interface Props {
  advice: StrategyAdvice | null;
  dice: number[];
  detecting: boolean;
  status: DetectionStatus;
  confirmed: boolean;
  variant?: "full" | "dice-only";
  compact?: boolean;
}

const STATUS_LABELS: Record<DetectionStatus, string> = {
  idle: "Caméra inactive",
  searching: "Recherche de 2 dés blancs sur le plateau",
  rolling: "Dés en mouvement — attendez l'arrêt",
  tracking: "Analyse en cours…",
  confirmed: "Lecture validée",
};

export function StrategyPanel({ advice, dice, detecting, status, confirmed, variant = "full", compact = false }: Props) {
  const diceOnly = variant === "dice-only";

  return (
    <section className={`${styles.panel} ${compact ? styles.compact : ""}`}>
      {!diceOnly && (
        <header className={styles.header}>
          <h2>Analyse stratégique</h2>
          {detecting && <span className={styles.pulse}>Calcul…</span>}
        </header>
      )}

      {!diceOnly && (
        <p className={confirmed ? styles.statusOk : styles.statusHint}>
          {STATUS_LABELS[status]}
        </p>
      )}

      <div className={styles.diceRow}>
        <span className={styles.diceLabel}>Dés lus</span>
        <div className={styles.diceFaces}>
          {dice.length > 0 ? (
            dice.map((v, i) => (
              <span
                key={i}
                className={confirmed ? styles.die : `${styles.die} ${styles.diePreview}`}
              >
                {v}
              </span>
            ))
          ) : (
            <span className={styles.muted}>Placez les dés sous la caméra</span>
          )}
        </div>
      </div>

      {!diceOnly && advice ? (
        <>
          <div className={styles.metricRow}>
            <Metric label="Équité" value={fmtEquity(advice.equity)} />
            <Metric label="Win %" value={`${advice.winChance}%`} />
            <Metric
              label="Risque"
              value={advice.riskLevel}
              variant={advice.riskLevel === "high" ? "danger" : "default"}
            />
          </div>

          {advice.pipCounts && (
            <div className={styles.metricRow}>
              <Metric label="Pips ○" value={String(advice.pipCounts.white)} />
              <Metric label="Pips ●" value={String(advice.pipCounts.black)} />
              <Metric
                label="Écart"
                value={fmtPipLead(advice.pipCounts.white, advice.pipCounts.black)}
              />
            </div>
          )}

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
      ) : !diceOnly ? (
        <p className={styles.muted}>
          Une fois les dés lus et immobiles, l'analyse et le commentaire spectateur s'affichent
          ici.
        </p>
      ) : null}
    </section>
  );
}

function fmtEquity(e: number): string {
  return `${e >= 0 ? "+" : ""}${e.toFixed(3)}`;
}

function fmtPipLead(white: number, black: number): string {
  const d = black - white;
  if (d === 0) return "égalité";
  return d > 0 ? `○ +${d}` : `● +${-d}`;
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
