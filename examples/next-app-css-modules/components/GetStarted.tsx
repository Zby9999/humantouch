"use client";

import { useState } from "react";
import styles from "./GetStarted.module.css";

export function GetStarted() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={styles.button} onClick={() => setOpen(true)}>
        Get started
      </button>
      {open && (
        <div className={styles.backdrop}>
          <div role="dialog" aria-modal="true" aria-labelledby="dialog-title" className={styles.dialog}>
            <h2 id="dialog-title">Ship it?</h2>
            <p>Freeze the page with this dialog open to edit it.</p>
            <button type="button" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
