import styles from "./Card.module.css";

export function Card({ title, body }: { title: string; body: string }) {
  return (
    <article className={styles.card}>
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.body}>{body}</p>
    </article>
  );
}
