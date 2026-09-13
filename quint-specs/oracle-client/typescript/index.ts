/**
 * Instrumentation client for the Quint Studio oracle: logs what your tests
 * actually do, so Quint Studio can validate those observations against a
 * Quint specification.
 *
 * # The model
 *
 * An *observation* is one action your code took, logged at the moment it
 * happened: an action name, the values involved (each one named, optionally
 * tagged with the spec constant — its *domain* — the value is added to),
 * optional post-state *assertions* (what a spec variable must now contain),
 * and the component *scopes* the action belongs to. Observations logged
 * during one test form that test's *trace*; the oracle buffers each trace
 * under the test's name and, when the test finishes successfully, replays it
 * against the spec. A test that fails has its trace discarded.
 *
 * Each execution of a test is one *run*: registering the same test name again
 * (a parameterized case, a table-driven loop) opens a fresh run rather than
 * appending to the previous trace.
 *
 * # The no-op guarantee
 *
 * This module is **inert by default**: it reads `QUINT_ORACLE_URL` once, at
 * import, and when the variable is unset every exported function is bound to
 * a no-op — no sockets, no serialization, no errors. Consequently the
 * variable must be set before the module is first imported; that always
 * holds in practice, because the oracle spawns the test process with it set
 * (and the vitest global setup runs before any worker imports test code).
 * Where a value is expensive to even build, pass a zero-argument thunk at
 * value position — it is invoked only when the oracle is live. {@link enabled}
 * is the hot-path guard for whole instrumentation blocks.
 *
 * # Registering tests
 *
 * The test framework adapter registers each test as it starts and reports its
 * outcome as it finishes — one config line:
 *
 * - vitest: add this package's `vitest.ts` to `test.setupFiles`;
 * - jest (jest-circus): point `testEnvironment` at this package's
 *   `jest-env.ts`.
 *
 * Reach for {@link registerTest} when the adapter cannot see your run — a
 * process outside the test framework, or a run whose name the framework
 * cannot supply. Keep the returned guard for the whole run and `close()` it
 * (`fail()` first when the run failed). Concurrent tests
 * (`test.concurrent`) are unsupported: with more than one run open, ambient
 * attribution refuses to guess and errors loudly.
 *
 * # Logging observations
 *
 * Everything goes through {@link log}: the action name, then named values,
 * then scopes (with assertions, when present, in the options form):
 *
 * ```ts
 * import { domain, log, postState } from "quint-oracle";
 *
 * log("deposit", { amount: 100 }, ["bank"]);
 *
 * // Variables under their own names, via object shorthand:
 * log("deposit", { account, amount }, ["bank"]);
 *
 * // domain(value, "ACCOUNTS") tags a value with the spec constant it is
 * // appended to — how the spec learns your test's actual account names:
 * log("deposit", { account: domain(account, "ACCOUNTS"), amount }, ["bank"]);
 *
 * // Assertions pin the post-state; the options form carries them:
 * log(
 *   "transfer",
 *   { from: domain(from, "ACCOUNTS") },
 *   { scopes: ["bank"], assert: [postState(["accounts", from], 900)] },
 * );
 * ```
 *
 * Values cross the wire in the ITF dialect; see the {@link value}
 * constructors for hand-built shapes (records, tuples) and the `toLogged()`
 * hook for domain types. Values are snapshotted synchronously at the `log`
 * call; mutating them afterwards does not alter the trace.
 */

import {
  isEnabled,
  liveCurrentTest,
  liveEvent,
  liveFlush,
  liveLog,
  liveRegisterTest,
  type Args,
  type EventBuilder,
  type Opts,
  type Scopes,
  type TestGuard,
  type TestHandle,
} from "./registry.js";
import {
  PostState,
  Tagged,
  type LazyLoggable,
  type PathSegment,
} from "./itf.js";

export { value, PostState, Tagged, Value } from "./itf.js";
export type { LazyLoggable, Loggable, PathSegment, ToLogged } from "./itf.js";
export { PROTOCOL_VERSION } from "./transport.js";
export type {
  Args,
  EventBuilder,
  Opts,
  Scopes,
  TestGuard,
  TestHandle,
} from "./registry.js";

/**
 * Whether instrumentation is live: `QUINT_ORACLE_URL` was set when this
 * module first loaded. The guard for hot paths and for code that only makes
 * sense against a live daemon ({@link currentTest}, hand-rolled assertions).
 */
export function enabled(): boolean {
  return live;
}

/** Tag a value with the spec constant (its *domain*) it is appended to. */
export function domain(value: LazyLoggable, name: string): Tagged {
  return new Tagged(value, name);
}

/**
 * A post-state assertion for {@link log}'s options form: after this action,
 * the spec value at `path` must equal `expected`. Path segments are strings
 * (variable names, record fields) or integers within i64 (map keys).
 */
export function postState(
  path: PathSegment[],
  expected: LazyLoggable,
): PostState {
  return new PostState(path, expected);
}

// ─── The load-time swap ─────────────────────────────────────────────────────
//
// The one latch: everything below is bound to its live implementation or to a
// no-op, decided when this module first loads (see "The no-op guarantee").

const live = isEnabled();

/**
 * Log one observation of `action`: named values in `args` (each value a
 * loggable, a {@link domain}-tagged loggable, or a zero-argument thunk), and
 * either the component scopes directly or an options object carrying scopes
 * and post-state assertions. Attribution is ambient — the currently open run.
 *
 * Throws when the event cannot be attributed to exactly one run, when no
 * scope is given, or when a value has no ITF form; a rejected or unreachable
 * POST surfaces asynchronously, rethrown from the next `log`, from
 * {@link flush}, and from the guard's `close()`. Inert (a bound no-op,
 * thunks never invoked) when the oracle is disabled.
 */
export const log: (action: string, args?: Args, opts?: Opts | Scopes) => void =
  live ? liveLog : () => {};

/**
 * Register `name` as the current test and return the guard that reports its
 * outcome — the escape hatch for runs the framework adapter cannot see.
 * Registering a name the oracle has already seen completed opens a new run.
 * Inert (a guard of no-ops) when the oracle is disabled.
 */
export const registerTest: (name: string) => TestGuard = live
  ? liveRegisterTest
  : inertRegisterTest;

/**
 * The test the calling code's observations attribute to. Unlike everything
 * else this throws when the oracle is disabled — an unguarded call site is a
 * programming error, not a no-op; guard with {@link enabled}.
 */
export const currentTest: () => TestHandle = live
  ? liveCurrentTest
  : () => {
      throw new Error(
        "currentTest() needs a live oracle — guard call sites with enabled()",
      );
    };

/**
 * Start an observation of `action` in the given test: the un-sugared layer
 * under {@link log}, for accumulating an event across worker tasks or helper
 * code that holds a {@link TestHandle}. Inert when the oracle is disabled.
 */
export const event: (handle: TestHandle, action: string) => EventBuilder = live
  ? liveEvent
  : inertEvent;

/**
 * Wait until everything logged so far has landed on the daemon, rethrowing
 * any stored POST failure. Test teardown for hand-registered runs; the
 * framework adapters do the equivalent per test.
 */
export const flush: () => Promise<void> = live ? liveFlush : async () => {};

// ─── The inert twins ────────────────────────────────────────────────────────

const inertHandle: TestHandle = { name: "" };

const inertGuard: TestGuard = {
  handle: inertHandle,
  fail() {},
  close: () => Promise.resolve(),
  [Symbol.dispose]() {},
};

function inertRegisterTest(): TestGuard {
  return inertGuard;
}

const inertBuilder: EventBuilder = {
  argument: () => inertBuilder,
  assert: () => inertBuilder,
  scope: () => inertBuilder,
  send() {},
};

function inertEvent(): EventBuilder {
  return inertBuilder;
}
