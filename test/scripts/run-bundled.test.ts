import { spawnSync } from "node:child_process"
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

const SUBPROCESS_TIMEOUT_MILLISECONDS = 10_000
const TEST_TIMEOUT_MILLISECONDS = 15_000

describe("run-bundled", { timeout: TEST_TIMEOUT_MILLISECONDS }, () => {
  it("preserves entry-relative createRequire and forwarded arguments", () => {
    const fixtureDirectory = mkdtempSync(join(tmpdir(), "huly-run-bundled-require-test-"))
    const entry = join(fixtureDirectory, "require.ts")
    writeFileSync(join(fixtureDirectory, "value.cjs"), "module.exports = 42\n")
    writeFileSync(
      entry,
      'import { createRequire } from "node:module"\n' +
        "const require = createRequire(import.meta.url)\n" +
        'console.log(JSON.stringify({ value: require("./value.cjs"), args: process.argv.slice(2) }))\n'
    )

    try {
      const execution = spawnSync(process.execPath, ["scripts/run-bundled.mjs", entry, "--fixture", "value"], {
        encoding: "utf8",
        timeout: SUBPROCESS_TIMEOUT_MILLISECONDS,
        killSignal: "SIGKILL"
      })
      expect(execution.error).toBeUndefined()
      expect(execution.status).toBe(0)
      expect(execution.stderr).toBe("")
      expect(execution.stdout.trim()).toBe(JSON.stringify({ value: 42, args: ["--fixture", "value"] }))
      expect(readdirSync(fixtureDirectory).sort()).toEqual(["require.ts", "value.cjs"])
    } finally {
      rmSync(fixtureDirectory, { force: true, recursive: true })
    }
  })

  it("removes its generated bundle when the executed program exits with failure", () => {
    const fixtureDirectory = mkdtempSync(join(tmpdir(), "huly-run-bundled-test-"))
    const entry = join(fixtureDirectory, "failure.ts")
    writeFileSync(entry, "process.exit(23)\n")

    try {
      const execution = spawnSync(process.execPath, ["scripts/run-bundled.mjs", entry], {
        encoding: "utf8",
        timeout: SUBPROCESS_TIMEOUT_MILLISECONDS,
        killSignal: "SIGKILL"
      })
      expect(execution.error).toBeUndefined()
      expect(execution.status).toBe(23)
      expect(readdirSync(fixtureDirectory)).toEqual(["failure.ts"])
    } finally {
      rmSync(fixtureDirectory, { force: true, recursive: true })
    }
  })

  it.each(["SIGTERM", "SIGINT"])("propagates %s after removing its generated bundle", (signal) => {
    const fixtureDirectory = mkdtempSync(join(tmpdir(), "huly-run-bundled-signal-test-"))
    const entry = join(fixtureDirectory, "signal.ts")
    writeFileSync(entry, `process.kill(process.pid, ${JSON.stringify(signal)})\n`)

    try {
      const execution = spawnSync(process.execPath, ["scripts/run-bundled.mjs", entry], {
        encoding: "utf8",
        timeout: SUBPROCESS_TIMEOUT_MILLISECONDS,
        killSignal: "SIGKILL"
      })
      expect(execution.error).toBeUndefined()
      expect(execution.status).toBeNull()
      expect(execution.signal).toBe(signal)
      expect(readdirSync(fixtureDirectory)).toEqual(["signal.ts"])
    } finally {
      rmSync(fixtureDirectory, { force: true, recursive: true })
    }
  })
})
