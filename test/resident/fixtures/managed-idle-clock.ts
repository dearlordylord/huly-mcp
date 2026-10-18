import { strict as assert } from "node:assert"
import * as fs from "node:fs/promises"
import { join } from "node:path"
import { Schema } from "effect"

import { LiveProbeEnvironment } from "../../../scripts/resident-live-read-contract.js"

import { ResidentPackagePath, ResidentRegistryEnvelope } from "../../../src/resident/managed-contract.js"
import { ResidentDirectory } from "../../../src/resident/protected-path.js"
import { spawnIdleClockBackend } from "../../helpers/idle-clock-backend.js"
import { spawnManagedNativeParent } from "../../helpers/managed-native-parent.js"
import { residentSelectionEnvironment } from "../../helpers/resident-selection-environment.js"
import { IdleClockObservation } from "../idle-clock-observation.js"

const Input = Schema.Struct({
  bundle: ResidentPackagePath,
  fixture: ResidentPackagePath,
  backend: ResidentPackagePath,
  directory: ResidentDirectory
})
const main = async () => {
  const input = Schema.decodeUnknownSync(Input)({
    bundle: process.argv[2],
    fixture: process.argv[3],
    backend: process.argv[4],
    directory: process.argv[5]
  })
  const clock = await spawnIdleClockBackend({
    ...input,
    environment: Schema.decodeUnknownSync(LiveProbeEnvironment)({
      ...residentSelectionEnvironment(),
      LAZY_ENVS: "true",
      HULY_MCP_TELEMETRY: "0"
    })
  })
  const backend = clock.child
  let parent: ReturnType<typeof spawnManagedNativeParent> | undefined
  let primary: { readonly error: unknown } | undefined
  try {
    const ready = await clock.ready()
    await clock.advance("near")
    parent = spawnManagedNativeParent({ ...input, host: "claude-code", workspace: "fixture" })
    await parent.connected()
    const initial = await parent.read()
    assert.equal(initial.contextIsError, false)
    const record = join(input.directory, "generations", `${ready.generation}.json`)
    const original = await fs.readFile(record, "utf8")
    const envelope = Schema.decodeUnknownSync(Schema.fromJsonString(ResidentRegistryEnvelope))(original)
    assert.equal(envelope.diagnostics.processId, backend.pid)
    assert.deepEqual(await fs.readdir(join(input.directory, "generations")), [`${ready.generation}.json`])
    await clock.advance("protected")
    parent.child.stdin.write("read\n")
    const continued = await parent.read()
    assert.equal(continued.contextIsError, false)
    assert.equal(continued.adapterPid, initial.adapterPid)
    assert.equal(continued.observedPort, initial.observedPort)
    assert.equal(await fs.readFile(record, "utf8"), original)
    assert.deepEqual(await parent.close(), [0, null])
    await clock.advance("released")
    assert.equal(backend.exitCode, null)
    assert.equal(backend.signalCode, null)
    assert.equal(await fs.readFile(record, "utf8"), original)
    assert.deepEqual(await clock.retire(), [0, null])
    assert.deepEqual(await fs.readdir(input.directory), [])
    process.stderr.write("Managed idle clock: confirmed retired backend and empty state\n")
    process.stdout.write(
      Schema.encodeSync(Schema.fromJsonString(IdleClockObservation))({
        generation: ready.generation,
        initial,
        continued,
        backendExitCode: 0,
        parentExitCode: 0,
        privateStateRemoved: true
      })
    )
  } catch (error) {
    primary = { error }
  }
  const cleanup = await Promise.allSettled([parent?.close(), clock.cleanup()])
  if (primary !== undefined) throw primary.error
  for (const outcome of cleanup) if (outcome.status === "rejected") throw outcome.reason
}

void main().catch(() => {
  process.stderr.write("Managed idle clock coordinator failed\n")
  process.exitCode = 1
})
