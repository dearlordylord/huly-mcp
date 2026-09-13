/**
 * The jest adapter: one config line for customers —
 *
 * ```js
 * // jest.config.js
 * module.exports = { testEnvironment: "./path/to/quint-oracle/jest-env.ts" };
 * ```
 *
 * — a jest-circus test environment that registers every test with the oracle
 * as it starts and reports its outcome as it finishes (jest's default runner
 * has been jest-circus since jest 27). Requires `jest-environment-node`,
 * which jest itself ships; it is resolved at runtime so this package carries
 * no jest dependency for non-jest users.
 */

import { createRequire } from "node:module";
import { join } from "node:path";

import { JestOracleAdapter, type JestEventLike } from "./jest-adapter.js";
import { oracleState, STATE_KEY } from "./registry.js";

// Anchored at the working directory, not this file (`import.meta` — and a
// top-level `require` binding — would be compile errors under the CJS
// emission that produces the javascript client's dist/cjs). Equivalent for
// vendored copies — the payload lives inside the host repo, whose
// node_modules carries jest. Monorepo caveat: jest invoked from a subpackage
// resolves from that subpackage upward, which is still correct.
const requireHost = createRequire(join(process.cwd(), "package.json"));
// Untyped on purpose: depending on jest's type packages would tax every
// non-jest consumer of this package for one adapter file.
const { TestEnvironment: NodeEnvironment } = requireHost(
  "jest-environment-node",
);

export default class QuintOracleEnvironment extends NodeEnvironment {
  private readonly oracle = new JestOracleAdapter();

  async setup(): Promise<void> {
    await super.setup();
    // Jest evaluates test code in a sandboxed realm with its own globalThis.
    // Planting the (already-created) oracle state into that realm's slot
    // makes the sandboxed copy of this package share one registry with this
    // adapter — otherwise its logs could not see the runs opened here.
    (this.global as Record<symbol, unknown>)[STATE_KEY] = oracleState();
  }

  async handleTestEvent(event: unknown, state: unknown): Promise<void> {
    await super.handleTestEvent?.(event, state);
    await this.oracle.handleTestEvent(event as JestEventLike);
  }
}
