/**
 * Work put off till the next frame is up: each job runs in a task of its
 * own, in order, from the task after that frame on, so the frames between
 * them are drawn. What is left can be run at once, when it is needed now.
 */
export interface Later {
  /** Runs `job` once the jobs added before it have run, after the next frame. */
  add(job: () => void): void;
  /** Runs every job left now, in order. */
  runNow(): void;
  /** Drops every job left. */
  cancel(): void;
}

/** Work put off till the next frame is up, none of it yet. */
export function createLater(): Later {
  const jobs: (() => void)[] = [];
  /** The frame, then the task, the next job waits for. */
  let frame = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    cancelAnimationFrame(frame);
    clearTimeout(timer);
    frame = 0;
    timer = undefined;
  };
  const next = () => {
    timer = undefined;
    try {
      jobs.shift()?.();
    } finally {
      // A job that fails leaves the others to run, each in its task.
      if (jobs.length) timer = setTimeout(next);
      else frame = 0;
    }
  };
  return {
    add(job) {
      jobs.push(job);
      if (frame || timer !== undefined) return;
      frame = requestAnimationFrame(() => {
        timer = setTimeout(next);
      });
    },
    runNow() {
      stop();
      while (jobs.length) jobs.shift()!();
    },
    cancel() {
      stop();
      jobs.length = 0;
    },
  };
}
