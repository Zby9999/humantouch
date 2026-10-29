import { expect, test } from "vitest";
import { createLater } from "../src/client/later";

/** Once the frame under way is drawn and the task after it has run. */
const frame = () => new Promise((done) => requestAnimationFrame(() => setTimeout(() => setTimeout(done))));
const task = () => new Promise((done) => setTimeout(done));

test("jobs wait for the next frame, then run in order, one a task", async () => {
  const later = createLater();
  const ran: string[] = [];
  let framed = false;
  requestAnimationFrame(() => (framed = true));
  later.add(() => ran.push(`a${framed ? " after a frame" : ""}`));
  later.add(() => ran.push("b"));
  await task();
  expect(ran).toEqual([]);
  await frame();
  expect(ran[0]).toBe("a after a frame");
  for (let i = 0; i < 5 && ran.length < 2; i++) await task();
  expect(ran).toEqual(["a after a frame", "b"]);
});

test("each job runs in a task of its own: what the one before left for the next task runs first", async () => {
  const later = createLater();
  const ran: string[] = [];
  later.add(() => {
    ran.push("a");
    setTimeout(() => ran.push("a's next task"));
  });
  later.add(() => ran.push("b"));
  while (ran.length < 3) await frame();
  expect(ran).toEqual(["a", "a's next task", "b"]);
});

test("flush runs what is left at once; cancel drops it", async () => {
  const later = createLater();
  const ran: string[] = [];
  later.add(() => ran.push("a"));
  later.add(() => ran.push("b"));
  later.flush();
  expect(ran).toEqual(["a", "b"]);
  await frame();
  await frame();
  expect(ran).toEqual(["a", "b"]);

  const dropped = createLater();
  dropped.add(() => ran.push("c"));
  dropped.cancel();
  await frame();
  await frame();
  expect(ran).toEqual(["a", "b"]);
});

test("a job added once the others have run waits for the next frame again", async () => {
  const later = createLater();
  const ran: string[] = [];
  later.add(() => ran.push("a"));
  later.flush();
  later.add(() => ran.push("b"));
  expect(ran).toEqual(["a"]);
  await frame();
  for (let i = 0; i < 5 && ran.length < 2; i++) await task();
  expect(ran).toEqual(["a", "b"]);
});
