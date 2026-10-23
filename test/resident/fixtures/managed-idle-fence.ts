import { assertStartupFallback, fallbackRequests } from "./startup-fallback.js"
import { strict as assert } from "node:assert"
import { execFile, spawn } from "node:child_process"
import { once } from "node:events"
import * as fs from "node:fs/promises"
import { join } from "node:path"
import { createInterface } from "node:readline"
import { promisify } from "node:util"
import { Effect, Schema } from "effect"

import { ResidentPackagePath, ResidentRegistryEnvelope } from "../../../src/resident/managed-contract.js"
import { ResidentDirectory } from "../../../src/resident/protected-path.js"
import { openKernelReapedEvents, ReapedEventsFd } from "../../helpers/kernel-reaped-events.js"
import { spawnManagedNativeParent } from "../../helpers/managed-native-parent.js"
import { residentSelectionEnvironment } from "../../helpers/resident-selection-environment.js"
import { IdleFenceCommand, IdleFenceEvent, IdleFenceObservation } from "../idle-fence-observation.js"

const RESPONSE_BOUND = 5_000
const RETIREMENT_BOUND = 7_000
const runFile = promisify(execFile)
const Input = Schema.Struct({
  bundle: ResidentPackagePath,
  fixture: ResidentPackagePath,
  backend: ResidentPackagePath,
  directory: ResidentDirectory,
  reapedFd: ReapedEventsFd
})
const bounded = <A>(pending: Promise<A>, allowance = RESPONSE_BOUND) =>
  Effect.runPromise(Effect.promise(() => pending).pipe(Effect.timeout(allowance)))
const readGeneration = async (directory: ResidentDirectory) => {
  const files = await fs.readdir(join(directory, "generations"))
  assert.equal(files.length, 1)
  const [file] = files
  if (file === undefined) throw new Error("No idle fence generation")
  const path = join(directory, "generations", file)
  const bytes = await fs.readFile(path, "utf8")
  return { path, bytes, envelope: Schema.decodeUnknownSync(Schema.fromJsonString(ResidentRegistryEnvelope))(bytes) }
}
const main = async () => {
  const input = Schema.decodeUnknownSync(Input)({
    bundle: process.argv[2],
    fixture: process.argv[3],
    backend: process.argv[4],
    directory: process.argv[5],
    reapedFd: process.env.HULY_TEST_REAPED_FD
  })
  const kernel = openKernelReapedEvents(input.reapedFd)
  const backend = spawn(process.execPath, [input.backend, input.directory], {
    env: residentSelectionEnvironment(),
    stdio: ["ignore", "pipe", "pipe", "ipc"]
  })
  const closed = once(backend, "close")
  void closed.catch(() => {})
  if (backend.stdout === null || backend.stderr === null) {
    backend.kill("SIGKILL")
    await bounded(closed, RETIREMENT_BOUND)
    kernel.close()
    throw new Error("Idle fence observation pipes are absent")
  }
  backend.stderr.on("data", (bytes: Buffer) => process.stderr.write(bytes))
  const lines = createInterface({ input: backend.stdout })
  const incoming = lines[Symbol.asyncIterator]()
  const next = async () => {
    const line = await bounded(incoming.next())
    if (line.done) throw new Error("Idle fence backend ended before observation")
    return Schema.decodeUnknownSync(Schema.fromJsonString(IdleFenceEvent))(line.value)
  }
  let parent: ReturnType<typeof spawnManagedNativeParent> | undefined
  let primary: { readonly error: unknown } | undefined
  try {
    const ready = await next()
    if (ready.kind !== "ready") throw new Error("Idle fence backend did not publish readiness")
    const original = await readGeneration(input.directory)
    assert.equal(original.envelope.generation, ready.generation)
    assert.equal(original.envelope.diagnostics.processId, backend.pid)
    const inventory = (await fs.readdir(input.directory)).sort()
    backend.send(Schema.encodeSync(IdleFenceCommand)("retire"))
    assert.deepEqual(await next(), { kind: "closing" })
    process.stderr.write("Idle fence: cleanup held after automatic idle fence\n")
    const environment = {
      ...residentSelectionEnvironment(),
      MCP_TRANSPORT: "stdio-resident",
      MCP_RESIDENT_STATE_DIRECTORY: input.directory
    }
    const retry = runFile(process.execPath, [input.bundle], { timeout: RESPONSE_BOUND, env: environment })
    retry.child.stdin?.on("error", () => {})
    retry.child.stdin?.end(`${fallbackRequests}\n`)
    const fallback = await retry
    assertStartupFallback(fallback.stdout, fallback.stderr)
    assert.equal(fallback.stderr.includes(environment.HULY_TOKEN), false)
    assert.equal(backend.exitCode, null)
    assert.equal(await fs.readFile(original.path, "utf8"), original.bytes)
    assert.deepEqual((await fs.readdir(input.directory)).sort(), inventory)
    assert.deepEqual(await fs.readdir(join(input.directory, "generations")), [`${ready.generation}.json`])
    backend.send(Schema.encodeSync(IdleFenceCommand)("release"))
    assert.deepEqual(await bounded(closed, RETIREMENT_BOUND), [0, null])
    assert.deepEqual(await fs.readdir(input.directory), [])
    process.stderr.write("Idle fence: original cleanup and exit confirmed before fresh parent\n")
    parent = spawnManagedNativeParent({ ...input, host: "claude-code", workspace: "fixture" })
    await parent.connected()
    const replacement = await parent.read()
    assert.equal(replacement.contextIsError, false)
    const fresh = await readGeneration(input.directory)
    assert.notEqual(fresh.envelope.generation, ready.generation)
    assert.deepEqual(await parent.close(), [0, null])
    const replacementExit = await kernel.wait(fresh.envelope.diagnostics.processId)
    assert.equal(replacementExit.exitCode, 0)
    assert.deepEqual(await fs.readdir(input.directory), [])
    process.stdout.write(
      Schema.encodeSync(Schema.fromJsonString(IdleFenceObservation))({
        retiredGeneration: ready.generation,
        fallbackExitCode: 0,
        originalBackendExitCode: 0,
        replacementGeneration: fresh.envelope.generation,
        replacement,
        replacementExit,
        privateStateRemoved: true
      })
    )
  } catch (error) {
    primary = { error }
  }
  const cleanup = await Promise.allSettled([
    parent?.close(),
    (async () => {
      if (backend.exitCode === null && backend.signalCode === null) backend.kill("SIGKILL")
      await bounded(closed, RETIREMENT_BOUND)
    })()
  ])
  lines.close()
  kernel.close()
  if (primary !== undefined) throw primary.error
  for (const outcome of cleanup) if (outcome.status === "rejected") throw outcome.reason
}
void main().catch(() => {
  process.stderr.write("Managed idle fence fixture failed\n")
  process.exitCode = 1
})
