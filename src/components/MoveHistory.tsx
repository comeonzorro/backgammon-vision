import type { HistoryEntry } from "../types";
import styles from "./MoveHistory.module.css";

interface Props {
  entries: HistoryEntry[];
}

export function MoveHistory({ entries }: Props) {
  return (
    <section className={styles.panel}>
      <h2>Historique</h2>
      {entries.length === 0 ? (
        <p className={styles.empty}>Les coups détectés apparaîtront ici.</p>
      ) : (
        <ul className={styles.list}>
          {entries.map((e) => (
            <li key={e.id} className={styles.item}>
              <time>{new Date(e.timestamp).toLocaleTimeString("fr-FR")}</time>
              <span className={styles.label}>{e.label}</span>
              <span className={styles.dice}>
                {e.dice.length > 0 ? e.dice.join(" · ") : "—"}
              </span>
              {e.move && <span className={styles.move}>{e.move}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
