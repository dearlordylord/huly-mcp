/**
 * Which test an observation belongs to, how a run's outcome is reported, and
 * the live implementations of the whole public surface.
 *
 * All module state lives on `globalThis` under one registered symbol, so a
 * duplicated module resolution (two copies of this package in one process, or
 * a jest sandbox sharing state with the outer realm) cannot split the
 * registry.
 *
 * Transport is a per-run promise chain: `log` serializes its body
 * synchronously (snapshot semantics — later mutation of a logged value never
 * reaches the wire), then appends the POST to the run's chain. A failed POST
 * marks the run failed and stores the error, which is rethrown from the next
 * `log` on that run, from `flush()`, and from the guard's `close()`. The
 * completion PATCH is appended to the same chain, so it always follows every
 * event, and its own transport errors are swallowed.
 */

import {
  encodeLazy,
  PostState,
  renderPathSegment,
  Tagged,
  type LazyLoggable,
  type PathSegment,
} from "./itf.js";
import { patchStatus, postEvent } from "./transport.js";

// Symbol.dispose ships natively only in newer Nodes; this registered-symbol
// shim is the same key TypeScript's own `using` downlevel interoperates with.
(Symbol as { dispose?: symbol }).dispose ??= Symbol.for("Symbol.dispose");

/** Named values of one observation; a plain value logs as itself, {@link Tagged} adds a domain. */
export type Args = Record<string, LazyLoggable | Tagged>;

/** The common-case sugar for options that are only scopes. */
export type Scopes = [string, ...string[]];

/** The full options of one observation. */
export interface Opts {
  /** The component scopes the action belongs to; the daemon needs at least one. */
  scopes: Scopes;
  /** Post-state assertions, built with `postState(path, expected)`. */
  assert?: PostState[];
}

/**
 * Cheap cross-task test identity; `event(handle, action)` takes one. Obtained
 * from `registerTest(...).handle` or `currentTest()`.
 */
export interface TestHandle {
  readonly name: string;
}

/**
 * Owner of one run's status report: `close()` signals the outcome to the
 * daemon (`fail()` forces it to failed — a discarded trace) and resolves when
 * everything this run sent has landed, rethrowing a stored POST failure.
 * `Symbol.dispose` is `close()` for `using` declarations, minus the await.
 */
export interface TestGuard {
  readonly handle: TestHandle;
  fail(): void;
  close(): Promise<void>;
  [Symbol.dispose](): void;
}

/** The un-sugared escape hatch `log` lowers into; parts in any order, then `send()`. */
export interface EventBuilder {
  argument(name: string, value: LazyLoggable, domain?: string): EventBuilder;
  assert(path: PathSegment[], expected: LazyLoggable): EventBuilder;
  scope(scope: string): EventBuilder;
  send(): void;
}

/** One open or in-flight run. Internal: the concrete shape behind {@link TestHandle}. */
class Run implements TestHandle {
  /** Sequences this run's POSTs and its final PATCH. Never rejects — errors are stored. */
  chain: Promise<void> = Promise.resolve();
  failed = false;
  /** The first failed POST's error, rethrown from the next `log`, `flush()` and `close()`. */
  error: unknown = undefined;

  constructor(readonly name: string) {}
}

interface OracleState {
  /** `QUINT_ORACLE_URL`, latched once when the state is created; null means inert. */
  baseUrl: string | null;
  /** Every registered, not yet closed run — the sole-open fallback resolves against this. */
  open: Run[];
  /** The most recently registered run, what ambient `log` resolves to first. */
  current: Run | null;
  /** Every run with unlanded sends or an unreported error; what `flush()` awaits. */
  runs: Set<Run>;
}

/** @internal The one process-wide state slot (see the module doc). */
export const STATE_KEY = Symbol.for("quint.oracle.state.v1");

/** @internal The process-wide oracle state, created (and the URL latched) on first use. */
export function oracleState(): OracleState {
  const host = globalThis as Record<symbol, OracleState | undefined>;
  return (host[STATE_KEY] ??= {
    baseUrl: readBaseUrl(),
    open: [],
    current: null,
    runs: new Set(),
  });
}

function readBaseUrl(): string | null {
  // Reached through globalThis so the payload type-checks without Node's type
  // definitions installed.
  const env = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env;
  const url = env?.["QUINT_ORACLE_URL"]?.trim().replace(/\/+$/, "");
  return url ? url : null;
}

export function isEnabled(): boolean {
  return oracleState().baseUrl !== null;
}

/** The run ambient logging resolves against; loud when that would be a guess. */
function resolveRun(state: OracleState): Run {
  if (state.current !== null) {
    return state.current;
  }
  if (state.open.length === 1) {
    return state.open[0]!;
  }
  throw new Error(
    `cannot attribute this event: ${state.open.length} tests are open and ` +
      `none is current; register with registerTest(...) — and note that ` +
      `concurrent tests are unsupported`,
  );
}

export function liveRegisterTest(name: string): TestGuard {
  const state = oracleState();
  const run = new Run(name);
  state.open.push(run);
  state.current = run;
  state.runs.add(run);
  let settled: Promise<void> | null = null;
  return {
    handle: run,
    fail() {
      run.failed = true;
    },
    close() {
      if (settled !== null) {
        return settled;
      }
      // Leave the open registry (and the current slot) synchronously, so a
      // late event errors rather than attach to a finalized run.
      state.open.splice(state.open.indexOf(run), 1);
      if (state.current === run) {
        state.current = null;
      }
      run.chain = run.chain.then(async () => {
        // Read `failed` only after every POST has settled: a stored POST
        // failure must discard the run even when it landed after close().
        const status = run.failed || run.error !== undefined ? "failed" : "ok";
        try {
          await patchStatus(state.baseUrl!, run.name, status);
        } catch {
          // Completion PATCHes are best-effort by contract.
        }
      });
      settled = run.chain.then(() => {
        state.runs.delete(run);
        if (run.error !== undefined) {
          throw run.error;
        }
      });
      // Reported by whoever awaits close() (or by an earlier log/flush
      // rethrow) — never as an unhandled rejection.
      settled.catch(() => {});
      return settled;
    },
    [Symbol.dispose]() {
      void this.close();
    },
  };
}

export function liveCurrentTest(): TestHandle {
  return resolveRun(oracleState());
}

export function liveLog(
  action: string,
  args?: Args,
  opts?: Opts | Scopes,
): void {
  const state = oracleState();
  const run = resolveRun(state);
  enqueue(state, run, renderEventBody(action, args, opts));
}

export function liveEvent(handle: TestHandle, action: string): EventBuilder {
  if (!(handle instanceof Run)) {
    throw new TypeError(
      "event() takes a handle from registerTest(...).handle or currentTest()",
    );
  }
  return new LiveEventBuilder(handle, action);
}

export async function liveFlush(): Promise<void> {
  const state = oracleState();
  await Promise.all([...state.runs].map((run) => run.chain));
  for (const run of state.runs) {
    if (run.error !== undefined) {
      throw run.error;
    }
  }
}

/**
 * @internal Append one already-serialized event body to the run's chain.
 * Rethrows the run's stored error instead of sending anything further.
 */
export function sendEvent(handle: TestHandle, body: string): void {
  if (!(handle instanceof Run)) {
    throw new TypeError("not a live test handle");
  }
  enqueue(oracleState(), handle, body);
}

function enqueue(state: OracleState, run: Run, body: string): void {
  if (run.error !== undefined) {
    throw run.error;
  }
  run.chain = run.chain.then(async () => {
    if (run.error !== undefined) {
      return; // the run is already broken; don't pile more sends on it
    }
    try {
      await postEvent(state.baseUrl!, run.name, body);
    } catch (error) {
      run.error = error;
      run.failed = true;
    }
  });
}

class LiveEventBuilder implements EventBuilder {
  private readonly scopes: string[] = [];
  private readonly args: string[] = [];
  private readonly asserts: string[] = [];

  constructor(
    private readonly run: Run,
    private readonly action: string,
  ) {}

  /** Values are serialized here, not at send: snapshot semantics. */
  argument(name: string, value: LazyLoggable, domain?: string): EventBuilder {
    this.args.push(
      renderArgument(
        name,
        domain === undefined ? value : new Tagged(value, domain),
      ),
    );
    return this;
  }

  assert(path: PathSegment[], expected: LazyLoggable): EventBuilder {
    this.asserts.push(renderAssertion(new PostState(path, expected)));
    return this;
  }

  scope(scope: string): EventBuilder {
    this.scopes.push(scope);
    return this;
  }

  send(): void {
    if (this.scopes.length === 0) {
      throw scopelessError(this.action);
    }
    sendEvent(
      this.run,
      assembleBody(this.action, this.scopes, this.args, this.asserts),
    );
  }
}

/**
 * @internal The wire body of one observation, exactly as `log` sends it (the
 * functional suite builds its expected events with this). The wire omits an
 * absent domain; the daemon persists it as `"domain": null`.
 */
export function renderEventBody(
  action: string,
  args?: Args,
  opts?: Opts | Scopes,
): string {
  const scopes = Array.isArray(opts) ? opts : (opts?.scopes ?? []);
  if (scopes.length === 0 || scopes.some((s) => typeof s !== "string")) {
    throw scopelessError(action);
  }
  const asserts = Array.isArray(opts) ? [] : (opts?.assert ?? []);
  return assembleBody(
    action,
    scopes,
    Object.entries(args ?? {}).map(([name, v]) => renderArgument(name, v)),
    asserts.map((assertion) => {
      if (!(assertion instanceof PostState)) {
        throw new TypeError(
          "assert entries must be built with postState(path, expected)",
        );
      }
      return renderAssertion(assertion);
    }),
  );
}

function scopelessError(action: string): Error {
  return new Error(
    `cannot log "${action}": every observation needs at least one component ` +
      `scope — the daemon records a scopeless event as dropped, invalidating ` +
      `the whole run`,
  );
}

function renderArgument(name: string, v: LazyLoggable | Tagged): string {
  const [val, domain] =
    v instanceof Tagged ? [v.value, v.domain] : [v, undefined];
  const encoded = encodeLazy(val);
  return domain === undefined
    ? `{"name":${JSON.stringify(name)},"value":${encoded}}`
    : `{"name":${JSON.stringify(name)},"value":${encoded},"domain":${JSON.stringify(domain)}}`;
}

function renderAssertion(assertion: PostState): string {
  const path = assertion.path.map(renderPathSegment);
  return `{"path":${JSON.stringify(path)},"value":${encodeLazy(assertion.expected)}}`;
}

function assembleBody(
  action: string,
  scopes: readonly string[],
  args: readonly string[],
  asserts: readonly string[],
): string {
  return (
    `{"action":${JSON.stringify(action)},"scopes":${JSON.stringify(scopes)},` +
    `"arguments":[${args.join(",")}],"assertions":[${asserts.join(",")}]}`
  );
}
