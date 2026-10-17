import { strict as assert } from "node:assert"
import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import * as fs from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"
import { Schema } from "effect"

import { CLI_FAILURE_CONTRACT, CliFailureSchema } from "../../../packages/huly-cli/src/failures.js"
import { ResidentPackagePath, ResidentRegistryEnvelope } from "../../../src/resident/managed-contract.js"
import { ResidentStopReport } from "../../../src/resident/operator-stop.js"
import { ResidentDirectory } from "../../../src/resident/protected-path.js"
import { openKernelReapedEvents, ReapedEventsFd } from "../../helpers/kernel-reaped-events.js"
import { spawnManagedNativeParent } from "../../helpers/managed-native-parent.js"
import { testStdioEnvironment } from "../../helpers/stdio-environment.js"
import { ManagedStopObservation } from "../managed-stop-observation.js"

const RESPONSE_BOUND = 5_000
const CONFIGURATION_COUNT = 2
const runFile = promisify(execFile)
const Input = Schema.Struct({
  bundle: ResidentPackagePath,
  cli: ResidentPackagePath,
  fixture: ResidentPackagePath,
  directory: ResidentDirectory,
  reapedFd: ReapedEventsFd
})
const UnknownStop = Schema.Struct({
  code: Schema.Literal(CLI_FAILURE_CONTRACT.conflict.exitStatus),
  stdout: Schema.Literal(""),
  stderr: Schema.NonEmptyString
})
const main = async () => {
  const input = Schema.decodeUnknownSync(Input)({
    bundle: process.argv[2],
    cli: process.argv[3],
    fixture: process.argv[4],
    directory: process.argv[5],
    reapedFd: process.env.HULY_TEST_REAPED_FD
  })
  const kernel = openKernelReapedEvents(input.reapedFd)
  const parents: Array<ReturnType<typeof spawnManagedNativeParent>> = []
  const start = async (workspace: "fixture" | "other-fixture", host: "claude-code" | "codex-mcp-client") => {
    const parent = spawnManagedNativeParent({ ...input, workspace, host })
    parents.push(parent)
    await parent.connected()
    const observation = await parent.read()
    assert.equal(observation.contextIsError, false)
    assert.equal(observation.observedWorkspace, workspace)
    return { parent, observation }
  }
  const records = async () => {
    const directory = join(input.directory, "generations")
    return Promise.all(
      (await fs.readdir(directory)).map(async (name) =>
        Schema.decodeUnknownSync(Schema.fromJsonString(ResidentRegistryEnvelope))(
          await fs.readFile(join(directory, name), "utf8")
        )
      )
    )
  }
  try {
    process.stderr.write("Managed operator stop: connect creator and attached caller\n")
    const creator = await start("fixture", "claude-code")
    const [original] = await records()
    assert.ok(original !== undefined)
    const attached = await start("fixture", "codex-mcp-client")
    assert.equal(attached.observation.observedPort, creator.observation.observedPort)
    assert.equal((await records()).length, 1)
    process.stderr.write("Managed operator stop: connect unrelated configuration\n")
    const unrelated = await start("other-fixture", "claude-code")
    assert.notEqual(unrelated.observation.observedPort, creator.observation.observedPort)
    const inventory = await records()
    assert.equal(inventory.length, CONFIGURATION_COUNT)
    const other = inventory.find((record) => record.generation !== original.generation)
    assert.ok(other !== undefined)
    const otherFile = join(input.directory, "generations", `${other.generation}.json`)
    const otherText = await fs.readFile(otherFile, "utf8")
    // Reparent the original backend to the kernel subreaper while its attached caller remains live.
    assert.deepEqual(await creator.parent.close(), [0, null])
    attached.parent.child.stdin.write("read\n")
    assert.equal((await attached.parent.read()).adapterPid, attached.observation.adapterPid)
    process.stderr.write("Managed operator stop: submit through packaged CLI\n")
    const stop = await runFile(
      process.execPath,
      [
        input.cli,
        "resident",
        "stop",
        "--generation",
        original.generation,
        "--state-directory",
        input.directory,
        "--json"
      ],
      { env: testStdioEnvironment(), timeout: RESPONSE_BOUND }
    ).then(
      (result) => {
        const report = Schema.decodeUnknownSync(Schema.fromJsonString(ResidentStopReport))(result.stdout)
        assert.equal(report.kind, "accepted")
        assert.equal(report.generation, original.generation)
        assert.equal(report.retirement, "unconfirmed")
        assert.equal(result.stderr, "")
        return { exitCode: 0, outcome: "accepted" } as const
      },
      (error: unknown) => {
        const result = Schema.decodeUnknownSync(UnknownStop)(error)
        const failure = Schema.decodeUnknownSync(Schema.fromJsonString(CliFailureSchema))(result.stderr)
        assert.equal(failure.code, "CONFLICT")
        assert.equal(failure.retryable, false)
        assert.ok(failure.message.includes("submission and retirement are unconfirmed"))
        return { exitCode: CLI_FAILURE_CONTRACT.conflict.exitStatus, outcome: "unconfirmed" } as const
      }
    )
    const originalExit = await kernel.wait(original.diagnostics.processId)
    assert.equal(originalExit.exitCode, 0)
    assert.deepEqual(
      (await records()).map((record) => record.generation),
      [other.generation]
    )
    assert.equal(await fs.readFile(otherFile, "utf8"), otherText)
    assert.deepEqual(await attached.parent.close(), [0, null])
    process.stderr.write("Managed operator stop: replace only after independently observed owned exit\n")
    const [replacement, replacementPeer] = await Promise.all([
      start("fixture", "codex-mcp-client"),
      start("fixture", "claude-code")
    ])
    const replacementInventory = await records()
    assert.equal(replacementInventory.length, CONFIGURATION_COUNT)
    const replaced = replacementInventory.find((record) => record.generation !== other.generation)
    assert.ok(replaced !== undefined)
    assert.notEqual(replaced.generation, original.generation)
    assert.equal(replacement.observation.observedPort, replacementPeer.observation.observedPort)
    assert.notEqual(replacement.observation.observedPort, unrelated.observation.observedPort)
    unrelated.parent.child.stdin.write("read\n")
    const survivor = await unrelated.parent.read()
    assert.equal(survivor.adapterPid, unrelated.observation.adapterPid)
    assert.equal(survivor.contextIsError, false)
    assert.equal(await fs.readFile(otherFile, "utf8"), otherText)
    process.stderr.write("Managed operator stop: close remaining owners and join kernel exits\n")
    assert.deepEqual(await replacement.parent.close(), [0, null])
    assert.deepEqual(await replacementPeer.parent.close(), [0, null])
    assert.deepEqual(await unrelated.parent.close(), [0, null])
    const replacementExit = await kernel.wait(replaced.diagnostics.processId)
    const unrelatedExit = await kernel.wait(other.diagnostics.processId)
    assert.equal(replacementExit.exitCode, 0)
    assert.equal(unrelatedExit.exitCode, 0)
    assert.deepEqual(await fs.readdir(input.directory), [])
    process.stdout.write(
      Schema.encodeSync(Schema.fromJsonString(ManagedStopObservation))({
        artifacts: {
          mcpSha256: createHash("sha256")
            .update(await fs.readFile(input.bundle))
            .digest("hex"),
          cliSha256: createHash("sha256")
            .update(await fs.readFile(input.cli))
            .digest("hex")
        },
        stop,
        originalGeneration: original.generation,
        replacementGeneration: replaced.generation,
        replacementCallers: [replacement.observation, replacementPeer.observation],
        unrelatedGeneration: other.generation,
        originalExit,
        replacementExit,
        unrelatedExit,
        survivor,
        unrelatedRecordUnchanged: true,
        privateStateRemoved: true
      })
    )
  } finally {
    try {
      await Promise.all(parents.map((parent) => parent.close()))
    } finally {
      kernel.close()
    }
  }
}

void main().catch(() => {
  process.stderr.write("Managed operator stop fixture failed\n")
  process.exitCode = 1
})
