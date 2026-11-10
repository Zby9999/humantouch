import { version } from "vite";
import { describe, expect, test } from "vitest";
import thirdKind from "../src/vite";
import { updatesInTurn } from "../src/vite-version";

describe("whether Vite handles its updates one at a time (ticket 125)", () => {
  test("from 6.3.0 on", () => {
    for (const v of ["6.3.0", "6.3.1", "6.4.3", "7.0.0", "8.3.4", "10.0.0-beta.1"]) expect(updatesInTurn(v), v).toBe(true);
  });

  test("not before 6.3.0, nor in 6.3.0's prereleases", () => {
    for (const v of ["4.5.3", "5.0.0", "5.4.11", "6.0.0", "6.2.7", "6.3.0-beta.2"]) expect(updatesInTurn(v), v).toBe(false);
  });

  test("a version it cannot read is taken as not", () => {
    for (const v of [undefined, "", "latest", "6.x"]) expect(updatesInTurn(v), String(v)).toBe(false);
  });

  test("the plugin tells the page, by the Vite it runs on", () => {
    const load = thirdKind().load as (id: string) => string | undefined;
    expect(load.call({}, "\0virtual:03kind/code-updates")).toContain(`inTurn: ${updatesInTurn(version)}`);
    expect(updatesInTurn(version)).toBe(true);
  });
});
