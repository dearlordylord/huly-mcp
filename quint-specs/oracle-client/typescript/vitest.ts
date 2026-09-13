/**
 * The vitest adapter: one config line for customers —
 *
 * ```ts
 * // vitest.config.ts
 * export default defineConfig({
 *   test: { setupFiles: ["./path/to/quint-oracle/vitest.ts"] },
 * });
 * ```
 *
 * — and every test is registered with the oracle as it starts (under its
 * full name: describe path + title) and reported as it finishes. Only
 * meaningful together with `QUINT_ORACLE_URL`, which the oracle sets when it
 * spawns the test process; without it this file is a no-op.
 *
 * `test.concurrent` is unsupported: a second test starting while a run is
 * still open is refused loudly rather than risk misattributed observations.
 */

import { beforeEach } from "vitest";

import { enabled, registerTest } from "./index.js";
import { oracleState } from "./registry.js";

interface TaskLike {
  name: string;
  suite?: TaskLike;
  /** Present only on file tasks, which the run name must not include. */
  filepath?: string;
}

/**
 * A task's full name — describe path and title, exactly as this adapter
 * registers it (the functional suite recomputes names with this).
 */
export function taskFullName(task: TaskLike): string {
  const parts = [task.name];
  for (
    let suite = task.suite;
    suite !== undefined && suite.filepath === undefined && suite.name !== "";
    suite = suite.suite
  ) {
    parts.unshift(suite.name);
  }
  return parts.join(" > ");
}

beforeEach((ctx) => {
  if (!enabled()) {
    return;
  }
  if (oracleState().open.length > 0) {
    throw new Error(
      "quint-oracle: a run is still open as this test starts — concurrent " +
        "tests are unsupported, and every registerTest guard must be closed " +
        "before its test ends",
    );
  }
  const guard = registerTest(taskFullName(ctx.task as TaskLike));
  ctx.onTestFailed(() => {
    guard.fail();
  });
  ctx.onTestFinished(async () => {
    // Belt and braces: onTestFailed covers body failures, the result state
    // covers everything else (a failed hook, a bail).
    if (ctx.task.result?.state === "fail") {
      guard.fail();
    }
    // Rethrows a stored POST failure, failing the test whose trace is broken.
    await guard.close();
  });
});
