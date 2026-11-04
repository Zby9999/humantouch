import styles from "./Stat.module.css";

/** A server component, used three times on the page: one figure and what it counts. */
export function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className={styles.stat}>
      <span className={styles.value}>{value}</span>
      <span className={styles.label}>{label}</span>
    </div>
  );
}
