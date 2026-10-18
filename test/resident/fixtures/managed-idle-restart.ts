import { strict as assert } from "node:assert"
import * as fs from "node:fs/promises"
import { join } from "node:path"
import { Schema } from "effect"

import { ResidentPackagePath, ResidentRegistryEnvelope } from "../../../src/resident/managed-contract.js"
import { ResidentDirectory } from "../../../src/resident/protected-path.js"
import { openKernelReapedEvents, ReapedEventsFd } from "../../helpers/kernel-reaped-events.js"
import { spawnManagedNativeParent } from "../../helpers/managed-native-parent.js"
import { IdleGenerationObservation, IdleRestartObservation } from "../idle-restart-observation.js"
import type { ManagedNativeHostObservation } from "../native-host-observation.js"

const Input = Schema.Struct({
  bundle: ResidentPackagePath,
  fixture: ResidentPackagePath,
  directory: ResidentDirectory,
  reapedFd: ReapedEventsFd
})

const cycle = async (input: Schema.Schema.Type<typeof Input>, kernel: ReturnType<typeof openKernelReapedEvents>) => {
  const parent = spawnManagedNativeParent({ ...input, host: "claude-code", workspace: "fixture" })
  let observed:
    | {
        readonly record: ResidentRegistryEnvelope
        readonly parent: Schema.Schema.Type<typeof ManagedNativeHostObservation>
      }
    | undefined
  let primary: { readonly error: unknown } | undefined
  try {
    await parent.connected()
    const initial = await parent.read()
    assert.equal(initial.contextIsError, false)
    assert.equal(initial.observedWorkspace, "fixture")
    assert.ok(initial.tools.includes("list_projects"))
    const registry = join(input.directory, "generations")
    const names = await fs.readdir(registry)
    assert.equal(names.length, 1)
    const [name] = names
    if (name === undefined) throw new Error("No managed idle generation was published")
    const record = Schema.decodeUnknownSync(Schema.fromJsonString(ResidentRegistryEnvelope))(
      await fs.readFile(join(registry, name), "utf8")
    )
    observed = { record, parent: initial }
  } catch (error) {
    primary = { error }
  }
  const [closed] = await Promise.allSettled([parent.close()])
  if (primary !== undefined) throw primary.error
  if (closed === undefined) throw new Error("Missing parent exit observation")
  if (closed.status === "rejected") throw closed.reason
  assert.deepEqual(closed.value, [0, null])
  if (observed === undefined) throw new Error("Missing managed idle generation observation")
  process.stderr.write("Managed idle restart: parent exited; awaiting owned backend retirement\n")
  const backendExit = await kernel.wait(observed.record.diagnostics.processId)
  assert.equal(backendExit.exitCode, 0)
  assert.deepEqual(await fs.readdir(input.directory), [])
  return IdleGenerationObservation.make({
    generation: observed.record.generation,
    backendExit,
    parent: observed.parent
  })
}

const main = async () => {
  const input = Schema.decodeUnknownSync(Input)({
    bundle: process.argv[2],
    fixture: process.argv[3],
    directory: process.argv[4],
    reapedFd: process.env.HULY_TEST_REAPED_FD
  })
  const kernel = openKernelReapedEvents(input.reapedFd)
  try {
    const first = await cycle(input, kernel)
    process.stderr.write("Managed idle restart: starting a fresh independent parent after confirmed retirement\n")
    const second = await cycle(input, kernel)
    assert.notEqual(second.generation, first.generation)
    assert.notEqual(second.parent.parentPid, first.parent.parentPid)
    assert.notEqual(second.parent.adapterPid, first.parent.adapterPid)
    process.stdout.write(
      Schema.encodeSync(Schema.fromJsonString(IdleRestartObservation))({
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
