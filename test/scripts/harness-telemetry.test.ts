import { execFileSync, spawnSync } from "node:child_process"
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { testStdioEnvironment } from "../helpers/stdio-environment.js"

const printTelemetryFlags =
  "process.stdout.write(`${process.env.HULY_MCP_TELEMETRY}:${process.env.HULY_CLI_TELEMETRY}`)"
const shellSetup = 'source "$(dirname "${BASH_SOURCE[0]}")/test-telemetry-env.sh" || exit 1'
const shellHarnesses = readdirSync("scripts").filter(
  (name) => /^integration_test_.*\.sh$/u.test(name) || name === "packed-cli-test-helpers.sh"
)

describe("test harness telemetry isolation", () => {
  it("disables both telemetry surfaces in Vitest workers and inherited child environments", () => {
    expect(process.env.HULY_MCP_TELEMETRY).toBe("0")
    expect(process.env.HULY_CLI_TELEMETRY).toBe("0")
    expect(execFileSync(process.execPath, ["-e", printTelemetryFlags], { encoding: "utf8" })).toBe("0:0")
  })

  it("disables both surfaces in the SDK's filtered stdio environment", () => {
    const environment = testStdioEnvironment()
    expect(environment.LAZY_ENVS).toBe("true")
    expect(execFileSync(process.execPath, ["-e", printTelemetryFlags], { encoding: "utf8", env: environment })).toBe(
      "0:0"
    )
  })

  it("requires every built stdio transport test launch to use the protected environment", () => {
    const source = readFileSync("test/mcp/stdio-transport.test.ts", "utf8")
    const launches = source.match(/(?:new StdioClientTransport|\bspawn)\(/gu) ?? []
    expect(launches.length).toBeGreaterThan(0)
    expect(source.match(/env: testStdioEnvironment\(\)/gu)).toHaveLength(launches.length)
    expect(source).not.toContain("getDefaultEnvironment")
  })

  it.each(shellHarnesses)("%s overrides caller opt-in before executing harness commands", (name) => {
    const source = readFileSync(`scripts/${name}`, "utf8")
    const setupIndex = source.indexOf(shellSetup)
    expect(setupIndex, `${name} must load telemetry opt-outs at startup`).toBeGreaterThanOrEqual(0)
    const prefix = source.slice(0, setupIndex + shellSetup.length)
    const directory = mkdtempSync(join(tmpdir(), "huly-harness-telemetry-"))
    try {
      const fixture = join(directory, name)
      copyFileSync("scripts/test-telemetry-env.sh", join(directory, "test-telemetry-env.sh"))
      writeFileSync(fixture, `${prefix}\nexec "$1" -e "$2"`)
      const output = execFileSync("bash", [fixture, process.execPath, printTelemetryFlags], {
        encoding: "utf8",
        env: { ...process.env, HULY_CLI_TELEMETRY: "1", HULY_MCP_TELEMETRY: "1", LC_ALL: "C" }
      })
      expect(output).toBe("0:0")
      rmSync(join(directory, "test-telemetry-env.sh"))
      const missingProtection = spawnSync("bash", [fixture, process.execPath, printTelemetryFlags], {
        encoding: "utf8",
        env: { ...process.env, HULY_CLI_TELEMETRY: "1", HULY_MCP_TELEMETRY: "1", LC_ALL: "C" }
      })
      expect(missingProtection.status).toBe(1)
      expect(missingProtection.stdout).toBe("")
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
