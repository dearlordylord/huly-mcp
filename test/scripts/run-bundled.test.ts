import { spawnSync } from "node:child_process"
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

describe("run-bundled", () => {
  it("removes its generated bundle when the executed program exits with failure", () => {
    const fixtureDirectory = mkdtempSync(join(tmpdir(), "huly-run-bundled-test-"))
    const entry = join(fixtureDirectory, "failure.ts")
    writeFileSync(entry, "process.exit(23)\n")

    try {
      const execution = spawnSync(process.execPath, ["scripts/run-bundled.mjs", entry], { encoding: "utf8" })
      expect(execution.status).toBe(23)
      expect(readdirSync(fixtureDirectory)).toEqual(["failure.ts"])
    } finally {
      rmSync(fixtureDirectory, { force: true, recursive: true })
    }
  })
})
