import { execFile } from "node:child_process"
import { promisify } from "node:util"
import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { Schema } from "effect"
import { afterAll, beforeAll, expect, it } from "vitest"

import { buildIsolatedStdioServer } from "../helpers/stdio-build.js"
import { testStdioEnvironment } from "../helpers/stdio-environment.js"
import { LiveReadProtocol } from "../../scripts/resident-live-read-contract.js"
import { CrashedCommitObservation } from "./crashed-commit-observation.js"
import { RetiredCommitObservation } from "./retired-commit-observation.js"

const PROCESS_BOUND = 30_000
const runFile = promisify(execFile)
let bundle: Awaited<ReturnType<typeof buildIsolatedStdioServer>>
let fixture: string
let backend: string
let cli: string
let passedCases = 0
beforeAll(async () => {
  if (process.platform !== "linux") return
  bundle = await buildIsolatedStdioServer(PROCESS_BOUND)
  const workspace = dirname(bundle.path)
  fixture = join(workspace, "retired-commit.cjs")
  backend = join(workspace, "retired-commit-backend.cjs")
  cli = join(workspace, "huly-cli.cjs")
  const pkg = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Struct({ version: Schema.NonEmptyString })))(
    await fs.readFile("package.json", "utf8")
  )
  await runFile("pnpm", ["--filter", "@firfi/huly-cli", "build", `--outfile=${cli}`], { timeout: PROCESS_BOUND })
  for (const [name, output] of [
    ["retired-commit", fixture],
    ["retired-commit-backend", backend]
  ]) {
    await runFile(
      "pnpm",
      [
        "exec",
        "esbuild",
        `test/resident/fixtures/${name}.ts`,
        "--bundle",
        "--platform=node",
        "--format=cjs",
        "--external:ws",
        `--define:PKG_VERSION=${JSON.stringify(pkg.version)}`,
        `--outfile=${output}`
      ],
      { timeout: PROCESS_BOUND }
    )
  }
}, PROCESS_BOUND)
afterAll(async () => {
  if (passedCases === LiveReadProtocol.literals.length * 2) await bundle.cleanup()
})
it.skipIf(process.platform !== "linux").each(LiveReadProtocol.literals)(
  "keeps an old remote write uncertain through confirmed backend retirement and replacement under %s",
  { timeout: PROCESS_BOUND },
  async (protocol) => {
    const root = await fs.mkdtemp(join(await fs.realpath(tmpdir()), "resident-retired-commit-"))
    const result = await runFile(
      "python3",
      [
        "test/resident/fixtures/reap-descendants.py",
        process.execPath,
        fixture,
        bundle.path,
        cli,
        backend,
        root,
        protocol,
        "drain"
      ],
      { env: testStdioEnvironment(), timeout: PROCESS_BOUND }
    )
    await fs.writeFile(`${root}.phases.log`, result.stderr, { mode: 0o600, flag: "wx" })
    const receipt = Schema.decodeUnknownSync(Schema.fromJsonString(RetiredCommitObservation))(result.stdout)
    expect(receipt.protocol).toBe(protocol)
    expect(receipt.originalBackendExit.exitCode).toBe(0)
    expect(receipt.replacementBackendExit.exitCode).toBe(0)
    expect(receipt.originalGeneration === receipt.replacementGeneration).toBe(false)
    expect(receipt.writeDispatches).toBe(1)
    expect(receipt.readDispatches).toBe(2)
    expect(await fs.readdir(join(root, "resident"))).toEqual([])
    await fs.writeFile(
      `${root}.receipt.json`,
      Schema.encodeSync(Schema.fromJsonString(RetiredCommitObservation))(receipt),
      { mode: 0o600, flag: "wx" }
    )
    await fs.rm(root, { recursive: true })
    passedCases++
  }
)

it.skipIf(process.platform !== "linux").each(LiveReadProtocol.literals)(
  "retains uncertainty and refuses replacement after backend crash during a write under %s",
  { timeout: PROCESS_BOUND },
  async (protocol) => {
    const root = await fs.mkdtemp(join(await fs.realpath(tmpdir()), "resident-crashed-commit-"))
    const result = await runFile(
      "python3",
      [
        "test/resident/fixtures/reap-descendants.py",
        process.execPath,
        fixture,
        bundle.path,
        cli,
        backend,
        root,
        protocol,
        "crash"
      ],
      { env: testStdioEnvironment(), timeout: PROCESS_BOUND }
    )
    await fs.writeFile(`${root}.phases.log`, result.stderr, { mode: 0o600, flag: "wx" })
    const receipt = Schema.decodeUnknownSync(Schema.fromJsonString(CrashedCommitObservation))(result.stdout)
    expect(receipt.protocol).toBe(protocol)
    expect(receipt.backendExitSignal).toBe("SIGKILL")
    expect(receipt.originalOutcomeUnknown).toBe(true)
    expect(receipt.ownershipBytesRetained).toBe(true)
    expect(receipt.writeDispatches).toBe(1)
    await fs.writeFile(
      `${root}.receipt.json`,
      Schema.encodeSync(Schema.fromJsonString(CrashedCommitObservation))(receipt),
      { mode: 0o600, flag: "wx" }
    )
    await fs.rm(root, { recursive: true })
    passedCases++
  }
)
