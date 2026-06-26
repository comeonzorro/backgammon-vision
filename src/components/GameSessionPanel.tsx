import { formatDuration } from "../hooks/useGameSession";
import styles from "./GameSessionPanel.module.css";

interface Props {
  playerWhite: string;
  playerBlack: string;
  onPlayerWhiteChange: (value: string) => void;
  onPlayerBlackChange: (value: string) => void;
  sessionDate: Date;
  elapsedMs: number;
  streamActive: boolean;
  detectionCount: number;
  liveMode: boolean;
}

export function GameSessionPanel({
  playerWhite,
  playerBlack,
  onPlayerWhiteChange,
  onPlayerBlackChange,
  sessionDate,
  elapsedMs,
  streamActive,
  detectionCount,
  liveMode,
}: Props) {
  const dateLabel = sessionDate.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <section className={styles.panel} aria-label="Session de partie">
      <header className={styles.brand}>
        <div className={styles.logo} aria-hidden>
          <span className={styles.logoMark}>◆</span>
        </div>
        <div>
          <h1 className={styles.title}>Backgammon Vision</h1>
          <p className={styles.subtitle}>Table · caméra overhead</p>
        </div>
      </header>

      <div className={styles.metaGrid}>
        <MetaItem label="Date" value={dateLabel} />
        <MetaItem
          label="Durée"
          value={streamActive ? formatDuration(elapsedMs) : "—"}
          highlight={streamActive}
        />
        <MetaItem label="Détections" value={String(detectionCount)} />
        <MetaItem label="Live" value={liveMode ? "ON" : "OFF"} highlight={liveMode} />
      </div>

      <div className={styles.players}>
        <PlayerField
          label="Blancs"
          value={playerWhite}
          onChange={onPlayerWhiteChange}
          variant="white"
        />
        <span className={styles.vs}>vs</span>
        <PlayerField
          label="Noirs"
          value={playerBlack}
          onChange={onPlayerBlackChange}
          variant="black"
        />
      </div>
    </section>
  );
}

function MetaItem({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={styles.metaItem}>
      <span className={styles.metaLabel}>{label}</span>
      <span className={highlight ? styles.metaValueOn : styles.metaValue}>{value}</span>
    </div>
  );
}

function PlayerField({
  label,
  value,
  onChange,
  variant,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  variant: "white" | "black";
}) {
  return (
    <label className={styles.playerField}>
      <span className={styles.playerLabel}>
        <span className={variant === "white" ? styles.chipWhite : styles.chipBlack} />
        {label}
      </span>
      <input
        className={styles.playerInput}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={32}
        spellCheck={false}
      />
    </label>
  );
}
