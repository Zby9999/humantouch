import Link from "next/link";
import { BillingPicker } from "../components/BillingPicker";
import { Card } from "../components/Card";
import { GetStarted } from "../components/GetStarted";
import { Stat } from "../components/Stat";
import styles from "./page.module.css";

const features = [
  { title: "Freeze", body: "Turn the current page into a canvas." },
  { title: "Arrange", body: "Drag layers, build Stacks, tune spacing." },
  { title: "Apply", body: "Your Agent writes the changes into code." },
];

/** A server component, as are `Card`, `Stat` and the layout; `GetStarted` and `BillingPicker` are client components. */
export default function Home() {
  return (
    <main className={styles.main}>
      <section className={styles.hero} data-testid="hero">
        <h1 className={styles.title}>Third Kind</h1>
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
      <section className={styles.stats} data-testid="stats">
        <Stat value="3" label="views side by side" />
        <Stat value="5,000" label="layers at 60fps" />
        <Stat value="0" label="bytes in production" />
      </section>
      <BillingPicker />
      <footer>
        <Link href="/about">About</Link>
      </footer>
    </main>
  );
}
