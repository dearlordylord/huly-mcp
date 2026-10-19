import { strict as assert } from "node:assert"
import { createHash } from "node:crypto"
import * as fs from "node:fs/promises"
import { join } from "node:path"
import { Schema } from "effect"

import { ResidentPackagePath, ResidentRegistryEnvelope } from "../../../src/resident/managed-contract.js"
import { ResidentDirectory } from "../../../src/resident/protected-path.js"
import { openKernelReapedEvents, ReapedEventsFd } from "../../helpers/kernel-reaped-events.js"
import { spawnManagedNativeParent } from "../../helpers/managed-native-parent.js"
import {
  IdleGenerationObservation,
  IdleRestartObservation,
  REPLACEMENT_PARENT_COUNT
} from "../idle-restart-observation.js"
import type { ManagedNativeHostObservation } from "../native-host-observation.js"

const hash = async (file: Schema.Schema.Type<typeof ResidentPackagePath>) =>
  createHash("sha256")
    .update(await fs.readFile(file))
    .digest("hex")
const Input = Schema.Struct({
  driver: ResidentPackagePath,
  bundle: ResidentPackagePath,
  fixture: ResidentPackagePath,
  directory: ResidentDirectory,
  reapedFd: ReapedEventsFd
})

const cycle = async (
  input: Schema.Schema.Type<typeof Input>,
  kernel: ReturnType<typeof openKernelReapedEvents>,
  count: 1 | typeof REPLACEMENT_PARENT_COUNT
) => {
  const parents = Array.from({ length: count }, () =>
    spawnManagedNativeParent({ ...input, host: "claude-code", workspace: "fixture" })
  )
  let observed:
    | {
        readonly record: ResidentRegistryEnvelope
        readonly parents: ReadonlyArray<Schema.Schema.Type<typeof ManagedNativeHostObservation>>
      }
    | undefined
  let primary: { readonly error: unknown } | undefined
  try {
    await Promise.all(parents.map((parent) => parent.connected()))
    const initial = await Promise.all(parents.map((parent) => parent.read()))
    assert.equal(new Set(initial.map((item) => item.parentPid)).size, count)
    assert.equal(new Set(initial.map((item) => item.adapterPid)).size, count)
    assert.equal(new Set(initial.map((item) => item.observedPort)).size, 1)
    for (const item of initial) {
      assert.equal(item.contextIsError, false)
      assert.equal(item.observedWorkspace, "fixture")
      assert.ok(item.tools.includes("list_projects"))
    }
    const registry = join(input.directory, "generations")
    const names = await fs.readdir(registry)
    assert.equal(names.length, 1)
    const [name] = names
    if (name === undefined) throw new Error("No managed idle generation was published")
    const record = Schema.decodeUnknownSync(Schema.fromJsonString(ResidentRegistryEnvelope))(
      await fs.readFile(join(registry, name), "utf8")
    )
    observed = { record, parents: initial }
  } catch (error) {
    primary = { error }
  }
  const closed = await Promise.allSettled(parents.map((parent) => parent.close()))
  if (primary !== undefined) throw primary.error
  for (const outcome of closed) {
    if (outcome.status === "rejected") throw outcome.reason
    assert.deepEqual(outcome.value, [0, null])
  }
  if (observed === undefined) throw new Error("Missing managed idle generation observation")
  process.stderr.write("Managed idle restart: parent exited; awaiting owned backend retirement\n")
  const backendExit = await kernel.wait(observed.record.diagnostics.processId)
  assert.equal(backendExit.exitCode, 0)
  assert.deepEqual(await fs.readdir(input.directory), [])
  return IdleGenerationObservation.make({
    generation: observed.record.generation,
    backendExit,
    parents: observed.parents
  })
}

const main = async () => {
  const input = Schema.decodeUnknownSync(Input)({
    driver: process.argv[1],
    bundle: process.argv[2],
    fixture: process.argv[3],
    directory: process.argv[4],
    reapedFd: process.env.HULY_TEST_REAPED_FD
  })
  const kernel = openKernelReapedEvents(input.reapedFd)
  try {
    const first = await cycle(input, kernel, 1)
    process.stderr.write("Managed idle restart: starting independent parents after confirmed retirement\n")
    const second = await cycle(input, kernel, REPLACEMENT_PARENT_COUNT)
    assert.notEqual(second.generation, first.generation)
    const original = first.parents[0]
    if (original === undefined) throw new Error("Missing original parent")
    for (const parent of second.parents) {
      assert.notEqual(parent.parentPid, original.parentPid)
      assert.notEqual(parent.adapterPid, original.adapterPid)
    }
    process.stdout.write(
      Schema.encodeSync(Schema.fromJsonString(IdleRestartObservation))({
        mcpSha256: await hash(input.bundle),
        hostSha256: await hash(input.fixture),
        driverSha256: await hash(input.driver),
        cycles: [first, second],
        privateStateRemoved: true
      })
    )
  } finally {
    kernel.close()
  }
}

void main().catch(() => {
  process.stderr.write("Managed idle restart fixture failed\n")
  process.exitCode = 1
})
