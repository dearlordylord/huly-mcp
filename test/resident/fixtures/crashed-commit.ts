import { strict as assert } from "node:assert"
import type { ChildProcessWithoutNullStreams } from "node:child_process"
import * as fs from "node:fs/promises"
import { join } from "node:path"
import { Effect, Schema } from "effect"

import type { LiveReadProtocol } from "../../../scripts/resident-live-read-contract.js"
import type { ResidentRegistryEnvelope } from "../../../src/resident/managed-contract.js"
import type { ResidentDirectory, ResidentFilePath } from "../../../src/resident/protected-path.js"
import { HostMessage } from "../../../src/resident/request-headers.js"
import { CrashedCommitObservation } from "../crashed-commit-observation.js"
import { RetiredCommitState } from "../retired-commit-observation.js"
import type { startRetiredCommitCounter } from "../retired-commit-remote.js"

const RESPONSE_BOUND = 5_000
const bounded = <A>(promise: Promise<A>) =>
  Effect.runPromise(Effect.promise(() => promise).pipe(Effect.timeout(RESPONSE_BOUND)))
// Internal owned process ports; all wire and storage records are schema-owned.
type OwnedProcess = { readonly child: ChildProcessWithoutNullStreams; readonly closed: Promise<unknown[]> }
export const qualifyCrashedCommit = async (input: {
  readonly directory: ResidentDirectory
  readonly stateFile: ResidentFilePath
  readonly protocol: LiveReadProtocol
  readonly generation: Schema.Schema.Type<typeof ResidentRegistryEnvelope>["generation"]
  readonly startRecovering: () => OwnedProcess & {
    readonly output: readonly Buffer[]
    readonly diagnostics: readonly Buffer[]
  }
  readonly negotiationStdoutBytes: number
  readonly original: OwnedProcess
  readonly caller: OwnedProcess
  readonly callerOutput: readonly Buffer[]
  readonly callerDiagnostics: readonly Buffer[]
  readonly remote: Awaited<ReturnType<typeof startRetiredCommitCounter>>
}) => {
  const registry = join(input.directory, "generations", `${input.generation}.json`)
  const originalBytes = await fs.readFile(registry)
  const inventory = (await fs.readdir(input.directory)).sort()
  const generationInventory = (await fs.readdir(join(input.directory, "generations"))).sort()
  process.stderr.write("Crashed commit: kill owned backend\n")
  assert.equal(input.original.child.kill("SIGKILL"), true)
  assert.deepEqual(await bounded(input.original.closed), [null, "SIGKILL"])
  process.stderr.write("Crashed commit: backend exit confirmed; wait remote disconnect\n")
  await Effect.runPromise(input.remote.disconnected.pipe(Effect.timeout(RESPONSE_BOUND)))
  process.stderr.write("Crashed commit: wait original adapter exit\n")
  assert.deepEqual(await bounded(input.caller.closed), [1, null])
  assert.equal(Buffer.concat(input.callerOutput).length, input.negotiationStdoutBytes)
  const diagnostics = Buffer.concat(input.callerDiagnostics).toString("utf8")
  assert.ok(diagnostics.includes("operation outcome may be unknown"))
  assert.ok(diagnostics.includes("No request was replayed"))
  process.stderr.write("Crashed commit: original unknown outcome confirmed\n")
  const recover = async () => {
    const { child, closed, diagnostics: errors, output } = input.startRecovering()
    try {
      child.stdin.end(
        `${Schema.encodeSync(Schema.fromJsonString(HostMessage))({
          jsonrpc: "2.0",
          id: 41,
          method: "tools/call",
          params: { name: "fixture_increment", arguments: {} }
        })}\n`
      )
      process.stderr.write("Crashed commit: wait fresh adapter refusal\n")
      assert.deepEqual(await bounded(closed), [1, null])
      assert.equal(Buffer.concat(output).length, 0)
      assert.ok(Buffer.concat(errors).toString("utf8").includes("no Huly request was dispatched"))
      process.stderr.write("Crashed commit: check protected records\n")
      assert.ok((await fs.readFile(registry)).equals(originalBytes))
      assert.deepEqual((await fs.readdir(input.directory)).sort(), inventory)
      assert.deepEqual((await fs.readdir(join(input.directory, "generations"))).sort(), generationInventory)
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL")
        await bounded(closed)
      }
    }
  }
  const state = async () =>
    Schema.decodeUnknownSync(Schema.fromJsonString(RetiredCommitState))(await fs.readFile(input.stateFile, "utf8"))
      .writes
  assert.equal(await state(), 0)
  await recover()
  process.stderr.write("Crashed commit: release delayed remote write\n")
  await Effect.runPromise(input.remote.commit)
  await Effect.runPromise(input.remote.committed.pipe(Effect.timeout(RESPONSE_BOUND)))
  assert.equal(await state(), 1)
  await recover()
  await bounded(input.remote.settle())
  assert.deepEqual(input.remote.dispatches, { writes: 1, reads: 0 })
  assert.deepEqual(input.remote.failures, [])
  return Schema.decodeUnknownSync(CrashedCommitObservation)({
    protocol: input.protocol,
    generation: input.generation,
    backendPid: input.original.child.pid,
    backendExitSignal: "SIGKILL",
    originalAdapterExit: 1,
    originalOutcomeUnknown: true,
    negotiationStdoutBytes: input.negotiationStdoutBytes,
    originalStdoutBytes: 0,
    recoveringExitCodes: [1, 1],
    ownershipBytesRetained: true,
    writeDispatches: 1,
    readDispatches: 0,
    remoteWritesBeforeCommit: 0,
    remoteWritesAfterCommit: 1
  })
}
