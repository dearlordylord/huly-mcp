/**
 * The jest-circus event mapping behind `jest-env.ts`, kept free of jest
 * imports so it stays unit-testable (and vendorable) without jest installed.
 */

import { registerTest, type TestGuard } from "./index.js";

/** The slice of a jest-circus describe block this adapter reads. */
export interface JestDescribeLike {
  name: string;
  parent?: JestDescribeLike;
}

/** The slice of a jest-circus test entry this adapter reads. */
export interface JestTestLike {
  name: string;
  parent: JestDescribeLike;
  errors: unknown[];
}

/** The slice of a jest-circus event this adapter reads. */
export interface JestEventLike {
  name: string;
  test?: JestTestLike;
}

/**
 * A test's full name — describe path and title. The root describe block is
 * jest's own wrapper, not a name the user wrote, so it is excluded (it is
 * the one block with no parent).
 */
export function jestTestName(test: JestTestLike): string {
  const parts = [test.name];
  for (
    let block: JestDescribeLike | undefined = test.parent;
    block?.parent !== undefined;
    block = block.parent
  ) {
    parts.unshift(block.name);
  }
  return parts.join(" > ");
}

/**
 * Opens a run on `test_start` and reports it on `test_done` (failed when the
 * test collected errors). Guards are keyed by test entry, so concurrently
 * finishing tests report to their own runs. Inert-safe with no check of its
 * own: `registerTest` already hands out no-op guards when the oracle is
 * disabled.
 */
export class JestOracleAdapter {
  private readonly guards = new Map<JestTestLike, TestGuard>();

  constructor(
    private readonly register: (name: string) => TestGuard = registerTest,
  ) {}

  async handleTestEvent(event: JestEventLike): Promise<void> {
    if (event.test === undefined) {
      return;
    }
    if (event.name === "test_start") {
      this.guards.set(event.test, this.register(jestTestName(event.test)));
    } else if (event.name === "test_done") {
      const guard = this.guards.get(event.test);
      this.guards.delete(event.test);
      if (guard === undefined) {
        return;
      }
      if (event.test.errors.length > 0) {
        guard.fail();
      }
      await guard.close();
    }
  }
}
