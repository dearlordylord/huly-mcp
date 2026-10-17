import { ConfigProvider, Effect, Schema } from "effect"
import { expect, it } from "vitest"

import { loadMcpProcessPolicy, McpProcessPolicy } from "../../src/mcp/process-policy.js"

const load = (values: Readonly<Record<string, string>>) =>
  Effect.runPromise(loadMcpProcessPolicy.pipe(Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(values)))))

it.each([[" Issues "], ["issues", "issues"], ["issues,projects"], [""]])(
  "rejects noncanonical scope arrays at the serialized policy boundary: %j",
  (...toolsets) => {
    expect(
      Schema.is(McpProcessPolicy)({
        toolsets,
        tools: [],
        exposure: { configuredMode: "auto", proxyOutputStrict: false }
      })
    ).toBe(false)
  }
)

it("preserves default unfiltered automatic exposure", async () => {
  expect(await load({})).toEqual({
    toolsets: [],
    tools: [],
    exposure: { configuredMode: "auto", proxyOutputStrict: false }
  })
})

it("captures normalized requested policy without losing unknown entries or order", async () => {
  const selected = await load({
    TOOLSETS: " Issues, Projects,issues, Unknown , ,",
    TOOLS: " GET_ISSUE, missing_tool,get_issue",
    HULY_TOOL_MODE: " NATIVE ",
    PROXY_OUTPUT_STRICT: " TRUE "
  })
  expect(selected).toEqual({
    toolsets: ["issues", "projects", "unknown"],
    tools: ["get_issue", "missing_tool"],
    exposure: { configuredMode: "native", proxyOutputStrict: true }
  })
  await load({ TOOLSETS: "documents", HULY_TOOL_MODE: "proxy" })
  expect(selected.toolsets).toEqual(["issues", "projects", "unknown"])
  expect(selected.exposure.configuredMode).toBe("native")
})

it.each([{ HULY_TOOL_MODE: "invalid" }, { PROXY_OUTPUT_STRICT: "sometimes" }])(
  "keeps invalid exposure policy as a typed startup failure: %j",
  async (values) => {
    const result = await Effect.runPromise(
      loadMcpProcessPolicy.pipe(Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(values))), Effect.result)
    )
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") expect(result.failure._tag).toBe("McpProcessPolicyError")
  }
)
