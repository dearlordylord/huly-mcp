import { strict as assert } from "node:assert"
import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { once } from "node:events"
import * as fs from "node:fs/promises"
import { dirname, join } from "node:path"
import { createInterface } from "node:readline"
import { Effect, Schema } from "effect"

import { ResidentPackagePath, ResidentRegistryEnvelope } from "../../../src/resident/managed-contract.js"
import { ResidentDirectory } from "../../../src/resident/protected-path.js"
import { openKernelReapedEvents, ReapedEventsFd } from "../../helpers/kernel-reaped-events.js"
import { residentSelectionEnvironment } from "../../helpers/resident-selection-environment.js"
import { ManagedParentConnected } from "../managed-observation.js"
import { type HostName, NativeHostObservation } from "../native-host-observation.js"
import { VersionCoexistenceObservation } from "../version-coexistence-observation.js"

const RESPONSE_BOUND = 5_000
const Input = Schema.Struct({
  first: ResidentPackagePath,
  second: ResidentPackagePath,
  fixture: ResidentPackagePath,
  directory: ResidentDirectory,
  reapedFd: ReapedEventsFd
})
const bounded = <A>(promise: Promise<A>) =>
  Effect.runPromise(Effect.promise(() => promise).pipe(Effect.timeout(RESPONSE_BOUND)))

const parent = (
  input: Schema.Schema.Type<typeof Input>,
  bundle: Schema.Schema.Type<typeof ResidentPackagePath>,
  host: Schema.Schema.Type<typeof HostName>
) => {
  const child = spawn(process.execPath, [input.fixture, bundle, input.directory, host], {
    env: residentSelectionEnvironment()
  })
  const exited = once(child, "close")
  void exited.catch(() => {})
  child.stderr.on("data", (chunk: Buffer) => process.stderr.write(chunk))
  child.stdin.on("error", () => process.stderr.write("Version coexistence: command pipe closed\n"))
  const lines = createInterface({ input: child.stdout })
  const output = lines[Symbol.asyncIterator]()
  const nextLine = async () => {
    const next = await bounded(output.next())
    if (next.done) throw new Error("Version parent exited without an observation")
    return next.value
  }
  return {
    child,
    lines,
    exited,
    connected: async () => Schema.decodeUnknownSync(Schema.fromJsonString(ManagedParentConnected))(await nextLine()),
    read: async () => Schema.decodeUnknownSync(Schema.fromJsonString(NativeHostObservation))(await nextLine())
  }
}

const run = async (input: Schema.Schema.Type<typeof Input>, kernel: ReturnType<typeof openKernelReapedEvents>) => {
  const installed = await Promise.all(
    [input.first, input.second].map(async (bundle) =>
      Schema.decodeUnknownSync(Schema.fromJsonString(ResidentRegistryEnvelope.fields.implementation))(
        await fs.readFile(join(dirname(bundle), "..", "package.json"), "utf8")
      )
    )
  )
  const first = parent(input, input.first, "claude-code")
  const second = parent(input, input.second, "codex-mcp-client")
  const parents = [first, second]
  let records: Array<ResidentRegistryEnvelope> = []
  let observations: Array<Schema.Schema.Type<typeof NativeHostObservation>> = []
  let survivor: Schema.Schema.Type<typeof NativeHostObservation> | undefined
  let primary: { readonly error: unknown } | undefined
  try {
    process.stderr.write("Version coexistence: connecting independent parents\n")
    const connections = await Promise.all(parents.map((item) => item.connected()))
    assert.equal(new Set(connections.map((item) => item.parentPid)).size, parents.length)
    observations = await Promise.all(parents.map((item) => item.read()))
    for (const observation of observations) assert.equal(observation.contextIsError, false)
    const registry = join(input.directory, "generations")
    const names = await fs.readdir(registry)
    records = await Promise.all(
      names.map(async (name) =>
        Schema.decodeUnknownSync(Schema.fromJsonString(ResidentRegistryEnvelope))(
          await fs.readFile(join(registry, name), "utf8")
        )
      )
    )
    assert.equal(records.length, parents.length)
    assert.equal(new Set(records.map((record) => record.generation)).size, parents.length)
    assert.equal(new Set(records.map((record) => record.implementation.version)).size, parents.length)
    assert.deepEqual(
      records.map((record) => record.implementation.version).sort(),
      installed.map((item) => item.version).sort()
    )
    const initial = observations[0]
    const other = observations[1]
    assert.ok(initial !== undefined && other !== undefined)
    assert.ok(initial.tools.includes("list_projects"))
    assert.ok(other.tools.includes("invoke_tool"))
    const retired = records.find((record) => record.implementation.version === installed[0]?.version)
    const retained = records.find((record) => record.implementation.version === installed[1]?.version)
    assert.ok(retired !== undefined && retained !== undefined)
    const retainedFile = join(registry, `${retained.generation}.json`)
    const original = await fs.readFile(retainedFile)
    process.stderr.write("Version coexistence: retiring only the first implementation\n")
    first.child.stdin.end("close\n")
    assert.deepEqual(await bounded(first.exited), [0, null])
    const retiredExit = await kernel.wait(retired.diagnostics.processId)
    assert.equal(retiredExit.exitCode, 0)
    assert.equal((await fs.readFile(retainedFile)).equals(original), true)
    assert.deepEqual(await fs.readdir(registry), [`${retained.generation}.json`])
    second.child.stdin.write("read\n")
    survivor = await second.read()
    assert.equal(survivor.adapterPid, other.adapterPid)
    assert.equal(survivor.contextIsError, false)
    assert.equal((await fs.readFile(retainedFile)).equals(original), true)
  } catch (error) {
    primary = { error }
  }
  for (const item of parents)
    if (item.child.exitCode === null && item.child.signalCode === null) item.child.stdin.end("close\n")
  const closed = await Promise.allSettled(parents.map((item) => bounded(item.exited)))
  for (const item of parents) item.lines.close()
  if (primary !== undefined) throw primary.error
  for (const outcome of closed) {
    if (outcome.status === "rejected") throw outcome.reason
    assert.deepEqual(outcome.value, [0, null])
  }
  if (survivor === undefined) throw new Error("Missing independent version survivor")
  const backendExits = []
  for (const record of records) {
    const exited = await kernel.wait(record.diagnostics.processId)
    assert.equal(exited.exitCode, 0)
    backendExits.push(exited)
  }
  assert.deepEqual(await fs.readdir(input.directory), [])
  const artifacts = await Promise.all(
    [input.first, input.second].map(async (bundle, index) => {
      const implementation = installed[index]
      if (implementation === undefined) throw new Error("Missing installed artifact identity")
      return {
        implementation,
        sha256: createHash("sha256")
          .update(await fs.readFile(bundle))
          .digest("hex")
      }
    })
  )
  process.stdout.write(
    Schema.encodeSync(Schema.fromJsonString(VersionCoexistenceObservation))({
      implementations: records.map((record) => record.implementation),
      artifacts,
      generations: records.map((record) => record.generation),
      parents: observations,
      survivor,
      survivorRecordUnchanged: true,
      backendExits,
      privateStateRemoved: true
    })
  )
}

const main = async () => {
  const input = Schema.decodeUnknownSync(Input)({
    first: process.argv[2],
    second: process.argv[3],
    fixture: process.argv[4],
    directory: process.argv[5],
    reapedFd: process.env.HULY_TEST_REAPED_FD
  })
  const kernel = openKernelReapedEvents(input.reapedFd)
  try {
    await run(input, kernel)
  } finally {
    kernel.close()
  }
}

void main().catch(() => {
  process.stderr.write("Version coexistence fixture failed\n")
  process.exitCode = 1
})
