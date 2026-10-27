import Link from "next/link";
import { Card } from "../components/Card";
import { GetStarted } from "../components/GetStarted";
import styles from "./page.module.css";

const features = [
  { title: "Freeze", body: "Turn the current page into a canvas." },
  { title: "Arrange", body: "Drag layers, build Stacks, tune spacing." },
  { title: "Apply", body: "Your Agent writes the changes into code." },
];

/** A server component, as are `Card` and the layout; `GetStarted` is the client component. */
export default function Home() {
  return (
    <main className={styles.main}>
      <section className={styles.hero} data-testid="hero">
        <h1 className={styles.title}>Vernier Kit</h1>
        <p className={styles.lead}>
          A Framer-style editor layer for <strong>any</strong> page.
        </p>
        <GetStarted />
      </section>
      <div className={styles.grid}>
        {features.map((feature) => (
          <Card key={feature.title} title={feature.title} body={feature.body} />
        ))}
        <Card title="Your turn" body="Open the editor and try it." />
      </div>
      <footer>
        <Link href="/about">About</Link>
      </footer>
    </main>
  );
}
