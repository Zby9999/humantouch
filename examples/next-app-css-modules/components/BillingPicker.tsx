"use client";

import { useState } from "react";
import styles from "./BillingPicker.module.css";

/** A client component: which billing is picked, and what picking yearly saves, shown only then. */
export function BillingPicker() {
  const [yearly, setYearly] = useState(true);
  return (
    <section className={styles.picker} data-testid="billing">
      <h2 className={styles.heading}>Billing</h2>
      <div className={styles.options}>
        <button type="button" className={`${styles.option} ${yearly ? "" : styles.selected}`} onClick={() => setYearly(false)}>
          Monthly
        </button>
        <button type="button" className={`${styles.option} ${yearly ? styles.selected : ""}`} onClick={() => setYearly(true)}>
          Yearly
        </button>
      </div>
      {yearly && <p className={styles.saving}>Two months free</p>}
    </section>
  );
}
