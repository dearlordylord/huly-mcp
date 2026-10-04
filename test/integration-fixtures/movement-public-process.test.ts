import { test, expect } from "vitest"
import { Schema } from "effect"
import { spawnSync } from "node:child_process"
import { resolve } from "node:path"
import { UrlString } from "../../src/domain/schemas/shared.js"

const ProcessEnvironmentResultSchema = Schema.Struct({ priorPresent: Schema.Boolean, url: UrlString })
const processTimeoutMilliseconds = 10_000

test("proxied MCP clears the upstream prior while ordinary CLI retains its environment", async () => {
  const runner = resolve("scripts/run-bundled.mjs")
  const directory = resolve("test/integration-fixtures")
  const child = spawnSync(process.execPath, [runner, `${directory}/movement-public-process-fixture.ts`], {
    env: { ...process.env, HULY_INTEGRATION_MCP_PRIOR: "private-upstream-prior" },
    encoding: "utf8",
    timeout: processTimeoutMilliseconds,
    killSignal: "SIGKILL"
  })
  expect(child.status).toBe(0)
  expect(child.stderr).not.toContain("private-upstream-prior")
  const result = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Array(ProcessEnvironmentResultSchema)))(
    child.stdout
  )
  expect(result).toEqual([
    { priorPresent: false, url: "http://gateway.local" },
    { priorPresent: true, url: "http://gateway.local" }
  ])
})
