import { describe, expect, it } from "vitest"

import {
  classifyMcpClient,
  type ClientKind,
  DEFAULT_MODE_BY_CLIENT_KIND,
  type McpClientInfoLike,
  parseToolExposureConfig,
  resolveToolExposureMode,
  type ResolveToolExposureModeInput,
  type ToolExposureMode,
  type ToolModeConfig
} from "../../src/mcp/tool-mode.js"

describe("classifyMcpClient", () => {
  it("classifies known client names after trimming and case normalization", () => {
    const cases: ReadonlyArray<{
      readonly clientInfo: McpClientInfoLike
      readonly expected: ClientKind
    }> = [
      { clientInfo: { name: " claude-code " }, expected: "claude-code" },
      { clientInfo: { name: "Claude-AI" }, expected: "claude-ai" },
      { clientInfo: { name: "cursor-vscode" }, expected: "cursor" },
      { clientInfo: { name: "Cursor Desktop" }, expected: "cursor" },
      { clientInfo: { name: "windsurf-ide" }, expected: "windsurf" },
      { clientInfo: { name: "cascade" }, expected: "windsurf" },
      { clientInfo: { name: "github-copilot-chat" }, expected: "github-copilot" },
      { clientInfo: { name: "copilot" }, expected: "github-copilot" },
      { clientInfo: { name: "vscode" }, expected: "github-copilot" },
      { clientInfo: { name: "codex-cli" }, expected: "codex" },
      { clientInfo: { name: "openai-codex" }, expected: "codex" },
      { clientInfo: { name: "opencode" }, expected: "opencode" }
    ]

    for (const testCase of cases) {
      expect(classifyMcpClient(testCase.clientInfo)).toBe(testCase.expected)
    }
  })

  it("classifies remote-wrapper names by their base client", () => {
    expect(classifyMcpClient({ name: "claude-ai (via mcp-remote)" })).toBe("claude-ai")
    expect(classifyMcpClient({ name: " Cursor-vscode (via mcp-remote) " })).toBe("cursor")
  })

  it("keeps wrapped claude-code out of the exact native-only classification", () => {
    expect(classifyMcpClient({ name: "claude-code (via mcp-remote)" })).toBe("unknown")
    expect(resolveToolExposureMode({ configuredMode: "auto", clientInfo: { name: "claude-code (via mcp-remote)" } }))
      .toBe("proxy")
  })

  it("defaults missing and unknown client names to unknown", () => {
    expect(classifyMcpClient(undefined)).toBe("unknown")
    expect(classifyMcpClient({})).toBe("unknown")
    expect(classifyMcpClient({ name: "  " })).toBe("unknown")
    expect(classifyMcpClient({ name: "some-new-client" })).toBe("unknown")
  })
})

describe("resolveToolExposureMode", () => {
  it("uses explicit configured modes without client classification", () => {
    const nativeMode: ToolModeConfig = "native"
    const proxyMode: ToolModeConfig = "proxy"

    expect(resolveToolExposureMode({ configuredMode: nativeMode })).toBe("native")
    expect(resolveToolExposureMode({ configuredMode: proxyMode })).toBe("proxy")
  })

  it("maps auto mode through the default client-kind table", () => {
    const defaults: Record<ClientKind, ToolExposureMode> = DEFAULT_MODE_BY_CLIENT_KIND
    const input: ResolveToolExposureModeInput = {
      configuredMode: "auto",
      clientInfo: { name: "claude-code" }
    }

    expect(defaults["claude-code"]).toBe("native")
    expect(defaults.unknown).toBe("proxy")
    expect(resolveToolExposureMode(input)).toBe("native")
    expect(resolveToolExposureMode({ configuredMode: "auto", clientInfo: { name: "claude-ai" } })).toBe("proxy")
    expect(resolveToolExposureMode({ configuredMode: "auto" })).toBe("proxy")
  })
})

describe("parseToolExposureConfig", () => {
  it("defaults to auto mode and non-strict proxy output", () => {
    expect(parseToolExposureConfig({})).toEqual({
      _tag: "Success",
      value: { configuredMode: "auto", proxyOutputStrict: false }
    })
  })

  it("parses supported mode and strict values after trimming and case normalization", () => {
    expect(parseToolExposureConfig({ hulyToolMode: " PROXY ", proxyOutputStrict: " TRUE " })).toEqual({
      _tag: "Success",
      value: { configuredMode: "proxy", proxyOutputStrict: true }
    })
    expect(parseToolExposureConfig({ hulyToolMode: "native", proxyOutputStrict: "false" })).toEqual({
      _tag: "Success",
      value: { configuredMode: "native", proxyOutputStrict: false }
    })
  })

  it("rejects invalid exposure env values with field-specific messages", () => {
    expect(parseToolExposureConfig({ hulyToolMode: "dynamic" })).toMatchObject({
      _tag: "Failure",
      field: "HULY_TOOL_MODE",
      message: expect.stringContaining("auto, native, or proxy")
    })
    expect(parseToolExposureConfig({ proxyOutputStrict: "yes" })).toMatchObject({
      _tag: "Failure",
      field: "PROXY_OUTPUT_STRICT",
      message: expect.stringContaining("true or false")
    })
    expect(parseToolExposureConfig({ hulyToolMode: " " })).toMatchObject({
      _tag: "Failure",
      field: "HULY_TOOL_MODE"
    })
  })
})
