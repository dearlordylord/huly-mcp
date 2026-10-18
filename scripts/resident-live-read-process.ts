import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { once } from "node:events"
import { Effect, Exit, Redacted, Schema } from "effect"

import { LIVE_PROBE_IO_BOUND, type LiveProbeEnvironment, LiveReadProbeError } from "./resident-live-read-contract.js"

const ChildExit = Schema.Tuple([Schema.NullOr(Schema.Int), Schema.NullOr(Schema.String)])
// Internal owned process capability; serialized input and receipts use the contract schemas.
export interface LiveProbeChild {
  readonly process: ChildProcessWithoutNullStreams
  readonly exited: Effect.Effect<void, LiveReadProbeError>
  readonly closed: Effect.Effect<Schema.Schema.Type<typeof ChildExit>, LiveReadProbeError>
}
export const probeIo = <A>(phase: LiveReadProbeError["phase"], run: () => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: () => new LiveReadProbeError({ phase }) }).pipe(
    Effect.timeout(LIVE_PROBE_IO_BOUND),
    Effect.mapError(() => new LiveReadProbeError({ phase }))
  )

const acquire = (args: ReadonlyArray<string>, environment: LiveProbeEnvironment) =>
  Effect.try({
    try: () => {
      const child = spawn(process.execPath, [...args], {
        env: { ...Object.fromEntries(Object.entries(environment).map(([key, value]) => [key, Redacted.value(value)])) }
      })
      const closed = once(child, "close")
      void closed.catch(() => {})
      let inputFailed = false
      child.stdin.on("error", () => {
        inputFailed = true
      })
      child.stderr.resume()
      const closedEffect = probeIo("exit", () => closed).pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(ChildExit)),
        Effect.mapError(() => new LiveReadProbeError({ phase: "exit" }))
      )
      const exited = closedEffect.pipe(
        Effect.flatMap(([code, signal]) =>
          code === 0 && signal === null && !inputFailed
            ? Effect.void
            : Effect.fail(new LiveReadProbeError({ phase: "exit" }))
        ),
        Effect.mapError(() => new LiveReadProbeError({ phase: "exit" }))
      )
      return { process: child, exited, closed: closedEffect } satisfies LiveProbeChild
    },
    catch: () => new LiveReadProbeError({ phase: "spawn" })
  })
const close = (owned: LiveProbeChild, useExit: Exit.Exit<unknown, unknown>) =>
  Effect.gen(function* () {
    owned.process.stdin.end()
    const normal = yield* Effect.exit(Exit.isSuccess(useExit) ? owned.exited : owned.closed)
    if (Exit.isSuccess(normal)) return
    if (owned.process.exitCode === null && owned.process.signalCode === null) owned.process.kill("SIGKILL")
    yield* owned.closed
    return yield* new LiveReadProbeError({ phase: "cleanup" })
  })
export const withLiveProbeChild = <A, E, R>(
  args: ReadonlyArray<string>,
  environment: LiveProbeEnvironment,
  use: (owned: LiveProbeChild) => Effect.Effect<A, E, R>
) => Effect.acquireUseRelease(acquire(args, environment), use, close)
