import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { expect, test } from "vitest"

const PROCESS_BOUND_MILLISECONDS = 10_000
const TOKEN = "certification-environment-regression-secret"

for (const token of [TOKEN, undefined]) {
  test(
    `harness parses ${token === undefined ? "missing" : "raw"} token before opening a connection`,
    () => {
      const directory = mkdtempSync(join(tmpdir(), "huly-certification-environment-"))
      const environment = {
        ...process.env,
        HULY_URL: "https://certification.example.test",
        HULY_WORKSPACE: "certification-workspace",
        HULY_TOKEN: token
      }
      try {
        const result = spawnSync(
          process.execPath,
          [resolve("scripts/run-bundled.mjs"), resolve("scripts/api-token-certification.ts"), "--phase", "active"],
          {
            cwd: directory,
            env: environment,
            encoding: "utf8",
            timeout: PROCESS_BOUND_MILLISECONDS,
            killSignal: "SIGKILL"
          }
        )
        expect(result.error).toBeUndefined()
        expect(result.signal).toBeNull()
        expect(result.status).toBe(1)
        expect(result.stdout).toBe("")
        expect(result.stderr).toContain("API-token certification harness failed.")
        expect(result.stderr).not.toContain(TOKEN)
        if (token === undefined) {
          expect(result.stderr).toContain("token")
          expect(result.stderr).not.toContain("ENOENT")
        } else {
          expect(result.stderr).toContain("ENOENT")
          expect(result.stderr).toContain("dist/index.cjs")
        }
      } finally {
        rmSync(directory, { force: true, recursive: true })
      }
    },
    PROCESS_BOUND_MILLISECONDS
  )
}
