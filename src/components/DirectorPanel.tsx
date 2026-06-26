import type { SpectatorLayout, SpectatorZone } from "../types/live";
import { ALL_SPECTATOR_ZONES } from "../types/live";
import styles from "./DirectorPanel.module.css";

interface Props {
  layout: SpectatorLayout;
  onChange: (layout: SpectatorLayout) => void;
  disabled?: boolean;
}

export function DirectorPanel({ layout, onChange, disabled }: Props) {
  const toggle = (zone: SpectatorZone) => {
    const has = layout.zones.includes(zone);
    const zones = has
      ? layout.zones.filter((z) => z !== zone)
      : [...layout.zones, zone];
    onChange({ zones });
  };

  return (
    <section className={styles.panel}>
      <header>
        <h2>Zones spectateurs</h2>
        <p>Choisissez ce qui apparaît sur le direct</p>
      </header>
      <ul className={styles.list}>
        {ALL_SPECTATOR_ZONES.map(({ id, label }) => (
          <li key={id}>
            <label className={styles.item}>
              <input
                type="checkbox"
                checked={layout.zones.includes(id)}
                disabled={disabled}
                onChange={() => toggle(id)}
              />
              <span>{label}</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
