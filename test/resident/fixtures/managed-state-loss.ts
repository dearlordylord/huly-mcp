import { strict as assert } from "node:assert"
import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { once } from "node:events"
import * as fs from "node:fs/promises"
import { join } from "node:path"
import { Effect, Redacted, Schema } from "effect"

import { ResidentAttachment } from "../../../src/resident/attachment-file.js"
import { ResidentPackagePath, ResidentRegistryEnvelope } from "../../../src/resident/managed-contract.js"
import { ResidentDirectory } from "../../../src/resident/protected-path.js"
import { HostMessage } from "../../../src/resident/request-headers.js"
import { openKernelReapedEvents, ReapedEventsFd } from "../../helpers/kernel-reaped-events.js"
import { spawnManagedNativeParent } from "../../helpers/managed-native-parent.js"
import { residentSelectionEnvironment } from "../../helpers/resident-selection-environment.js"
import { StateFault, StateLossObservation } from "../state-loss-observation.js"

const RESPONSE_BOUND = 5_000
const Input = Schema.Struct({
  bundle: ResidentPackagePath,
  fixture: ResidentPackagePath,
  coordinator: ResidentPackagePath,
  root: ResidentDirectory,
  reapedFd: ReapedEventsFd
})
const bounded = <A>(value: Promise<A>) =>
  Effect.runPromise(Effect.promise(() => value).pipe(Effect.timeout(RESPONSE_BOUND)))
const discovery = Schema.encodeSync(Schema.fromJsonString(HostMessage))({ jsonrpc: "2.0", id: 1, method: "ping" })

const refuse = async (
  input: Schema.Schema.Type<typeof Input>,
  directory: ResidentDirectory,
  secrets: ReadonlyArray<string>
) => {
  const environment = {
    ...residentSelectionEnvironment(),
    MCP_TRANSPORT: "stdio-resident",
    MCP_RESIDENT_STATE_DIRECTORY: directory
  }
  const adapter = spawn(process.execPath, [input.bundle], { env: environment })
  const closed = once(adapter, "close")
  void closed.catch(() => {})
  const output: Array<Buffer> = []
  const errors: Array<Buffer> = []
  adapter.stdout.on("data", (bytes: Buffer) => output.push(bytes))
  adapter.stderr.on("data", (bytes: Buffer) => errors.push(bytes))
  adapter.stdin.on("error", () => {})
  try {
    adapter.stdin.end(`${discovery}\n`)
    assert.deepEqual(await bounded(closed), [1, null])
    assert.equal(Buffer.concat(output).length, 0)
    const diagnostic = Buffer.concat(errors).toString("utf8")
    assert.ok(diagnostic.includes("Resident registry is unresolved"))
    for (const secret of [...secrets, environment.HULY_TOKEN]) assert.equal(diagnostic.includes(secret), false)
  } finally {
    if (adapter.exitCode === null && adapter.signalCode === null) {
      adapter.kill("SIGKILL")
      await bounded(closed)
    }
  }
}

const main = async () => {
  const input = Schema.decodeUnknownSync(Input)({
    bundle: process.argv[2],
    fixture: process.argv[3],
    root: process.argv[4],
    coordinator: process.argv[1],
    reapedFd: process.env.HULY_TEST_REAPED_FD
  })
  const directory = ResidentDirectory.make(join(input.root, "resident"))
  await fs.mkdir(directory, { mode: 0o700 })
  const kernel = openKernelReapedEvents(input.reapedFd)
  const parent = spawnManagedNativeParent({ ...input, directory, host: "claude-code", workspace: "fixture" })
  try {
    await parent.connected()
    const initial = await parent.read()
    const registry = join(directory, "generations")
    const names = await fs.readdir(registry)
    assert.equal(names.length, 1)
    const [name] = names
    if (name === undefined) throw new Error("Expected owned generation")
    const record = join(registry, name)
    const original = await fs.readFile(record, "utf8")
    const envelope = Schema.decodeUnknownSync(Schema.fromJsonString(ResidentRegistryEnvelope))(original)
    const descriptor = Schema.decodeUnknownSync(ResidentAttachment)(Redacted.value(envelope.descriptor))
    const locator = join(directory, `${envelope.generation}.json`)
    const originalLocator = await fs.readFile(locator, "utf8")
    const mismatched = { ...descriptor, authorization: Redacted.make("different-fixture-authorization") }
    const inventory = (await fs.readdir(directory)).sort()
    const completed: Array<Schema.Schema.Type<typeof StateFault>> = []
    for (const fault of StateFault.literals) {
      process.stderr.write(`Managed state loss: ${fault}\n`)
      const descriptorFault = fault === "corrupt-descriptor" || fault === "mismatched-descriptor"
      const rewritten = fault === "corrupt-record" || descriptorFault
      const target =
        fault === "missing-registry" ? registry : fault === "missing-descriptor" || descriptorFault ? locator : record
      const changed =
        fault === "mismatched-descriptor"
          ? Schema.encodeSync(Schema.fromJsonString(ResidentAttachment))(mismatched)
          : "corrupt fixture metadata"
      const targets = fault === "missing-indexes" ? [record, locator] : [target]
      const held = targets.map((target, index) => ({ target, moved: join(input.root, `held-state-${index}`) }))
      if (rewritten) await fs.writeFile(target, changed)
      else for (const { moved, target } of held) await fs.rename(target, moved)
      try {
        await refuse(input, directory, [
          Redacted.value(descriptor.authorization),
          Redacted.value(descriptor.identity.key),
          Redacted.value(mismatched.authorization)
        ])
        if (rewritten) assert.equal((await fs.readFile(target, "utf8")) === changed, true)
        else for (const { target } of held) await assert.rejects(fs.lstat(target), { code: "ENOENT" })
        parent.child.stdin.write("read\n")
        const current = await parent.read()
        assert.equal(current.adapterPid, initial.adapterPid)
        assert.equal(current.observedPort, initial.observedPort)
        assert.equal(current.observedWorkspace, "fixture")
        assert.equal(current.contextIsError, false)
        completed.push(fault)
      } finally {
        if (rewritten) await fs.writeFile(target, descriptorFault ? originalLocator : original)
        else for (const { moved, target } of held) await fs.rename(moved, target)
      }
      assert.equal((await fs.readFile(record, "utf8")) === original, true)
      assert.equal((await fs.readFile(locator, "utf8")) === originalLocator, true)
      assert.deepEqual((await fs.readdir(directory)).sort(), inventory)
      assert.deepEqual(await fs.readdir(registry), names)
    }
    assert.deepEqual(await parent.close(), [0, null])
    const backendExit = await kernel.wait(envelope.diagnostics.processId)
    assert.equal(backendExit.exitCode, 0)
    assert.deepEqual(await fs.readdir(directory), [])
    await fs.rmdir(directory)
    assert.deepEqual(await fs.readdir(input.root), [])
    const hash = async (file: Schema.Schema.Type<typeof ResidentPackagePath>) =>
      createHash("sha256")
        .update(await fs.readFile(file))
        .digest("hex")
    const receipt = Schema.decodeUnknownSync(StateLossObservation)({
      artifacts: {
        mcpSha256: await hash(input.bundle),
        coordinatorSha256: await hash(input.coordinator),
        hostSha256: await hash(input.fixture)
      },
      generation: envelope.generation,
      faults: completed,
      backendExit,
      existingCallerRetained: true,
      privateStateRestored: true,
      credentialDisclosure: false,
      privateStateRemoved: true
    })
    process.stdout.write(Schema.encodeSync(Schema.fromJsonString(StateLossObservation))(receipt))
  } finally {
    try {
      await parent.close()
    } finally {
      kernel.close()
    }
  }
}
void main().catch(() => {
  process.stderr.write("Managed state-loss fixture failed\n")
  process.exitCode = 1
})
