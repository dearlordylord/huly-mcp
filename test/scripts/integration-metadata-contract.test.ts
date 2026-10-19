import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

const script = readFileSync("scripts/integration_test_full.sh", "utf8")
const predicate = script.match(/for METADATA_TOOL[\s\S]*?jq -e '([\s\S]*?)'/u)?.[1]
if (predicate === undefined) throw new Error("Missing live notification metadata assertion")

const textResult = (payload: unknown) => ({ content: [{ type: "text", text: JSON.stringify(payload) }] })
const providers = [{ id: "provider", label: "Provider" }]
const warnings = [{ code: "notification_metadata_degraded", message: "Model unavailable" }]
const check = (result: unknown) =>
  spawnSync("jq", ["-e", predicate], { encoding: "utf8", input: JSON.stringify(result), timeout: 5000 })

describe("live notification metadata qualification", () => {
  it("accepts a nonempty array without degradation warnings", () => {
    const result = check(textResult(providers))
    expect(result.status).toBe(0)
    expect(result.stderr).toBe("")
  })

  it.each([
    { name: "empty arrays", result: textResult([]) },
    { name: "non-array metadata", result: textResult({ providers }) },
    { name: "structured warnings", result: { ...textResult(providers), structuredContent: { warnings } } },
    {
      name: "separate textual warnings",
      result: { content: [...textResult(providers).content, ...textResult({ warnings }).content] }
    },
    { name: "warning envelopes instead of metadata", result: textResult({ warnings }) }
  ])("rejects $name without a jq type error", ({ result }) => {
    const execution = check(result)
    expect(execution.status).toBe(1)
    expect(execution.stderr).toBe("")
  })

  it("does not qualify malformed JSON", () => {
    expect(check({ content: [{ type: "text", text: "{" }] }).status).not.toBe(0)
  })
})
