import { execFile } from "node:child_process"
import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { Schema } from "effect"
import { afterAll, beforeAll, beforeEach, expect, it, onTestFailed } from "vitest"

import { buildIsolatedStdioServer } from "../helpers/stdio-build.js"
import { residentSelectionEnvironment } from "../helpers/resident-selection-environment.js"

const BUILD_BOUND = 30_000
const RESPONSE_BOUND = 5_000
const runFile = promisify(execFile)
const RefusedProcess = Schema.Struct({
  code: Schema.Literal(1),
  killed: Schema.Literal(false),
  signal: Schema.Null,
  stdout: Schema.String,
  stderr: Schema.String
})
let bundle: Awaited<ReturnType<typeof buildIsolatedStdioServer>>
let failed = true

beforeAll(async () => {
  bundle = await buildIsolatedStdioServer(BUILD_BOUND)
  failed = false
}, BUILD_BOUND)
beforeEach(() =>
  onTestFailed(() => {
    failed = true
  })
)
afterAll(async () => {
  if (!failed) await bundle?.cleanup()
})

it.each([
  { field: "HULY_URL", value: "" },
  { field: "HULY_CONNECTION_TIMEOUT", value: "not-a-number" },
  { field: "HULY_TOOL_MODE", value: "not-a-mode" }
])("preserves the $field startup diagnostic without publishing resident state", async ({ field, value }) => {
  const root = await fs.mkdtemp(join(await fs.realpath(tmpdir()), "resident-startup-diagnostic-"))
  const environment = residentSelectionEnvironment()
  let passed = false
  try {
    const failure: unknown = await runFile(process.execPath, [bundle.path], {
      timeout: RESPONSE_BOUND,
      env: {
        ...environment,
        MCP_TRANSPORT: "stdio-resident",
        MCP_RESIDENT_STATE_DIRECTORY: join(root, "state"),
        HULY_PASSWORD: "private-unused-password-marker",
        [field]: value
      }
    }).then(
      () => undefined,
      (error: unknown) => error
    )
    const result = Schema.decodeUnknownSync(RefusedProcess)(failure)
    const output = result.stdout + result.stderr
    expect(output.includes(environment.HULY_TOKEN)).toBe(false)
    expect(output.includes("private-unused-password-marker")).toBe(false)
    await fs.writeFile(`${root}.stderr.log`, result.stderr, { mode: 0o600, flag: "wx" })
    expect(result.stdout).toBe("")
    expect(result.stderr).toContain(field)
    expect(result.stderr).not.toContain("inspect private startup state")
    expect(await fs.readdir(root)).toEqual([])
    passed = true
  } finally {
    if (passed) await fs.rmdir(root)
  }
})
