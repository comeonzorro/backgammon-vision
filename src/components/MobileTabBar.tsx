import type { MobileTab } from "../hooks/useCompactLayout";
import styles from "./MobileTabBar.module.css";

interface Props {
  tab: MobileTab;
  onChange: (tab: MobileTab) => void;
}

export function MobileTabBar({ tab, onChange }: Props) {
  return (
    <nav className={styles.bar} aria-label="Navigation mobile">
      <button
        type="button"
        className={tab === "camera" ? styles.active : ""}
        onClick={() => onChange("camera")}
      >
        Caméra
      </button>
      <button
        type="button"
        className={tab === "game" ? styles.active : ""}
        onClick={() => onChange("game")}
      >
        Partie & analyse
      </button>
    </nav>
  );
}
