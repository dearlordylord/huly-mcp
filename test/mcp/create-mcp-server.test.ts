import { describe, it } from "@effect/vitest"
import { CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import { expect } from "vitest"

import { createMcpServer } from "../../src/mcp/create-mcp-server.js"
import { GET_HULY_CONTEXT_TOOL_NAME } from "../../src/mcp/huly-context-tool.js"
import { toolRegistry } from "../../src/mcp/tools/index.js"
import type { TelemetryOperations } from "../../src/telemetry/telemetry.js"

type HandlerMap = Map<unknown, (...args: Array<unknown>) => unknown>

const telemetry: TelemetryOperations = {
  sessionStart: () => {},
  firstListTools: () => {},
  toolCalled: () => {},
  shutdown: async () => {}
}

const createCapturingServer = (handlers: HandlerMap) =>
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- structural MCP server test double
  ({
    setRequestHandler(schema: unknown, handler: (...args: Array<unknown>) => unknown) {
      handlers.set(schema, handler)
    }
  }) as never

describe("createMcpServer", () => {
  it("validates get_huly_context output before returning a success response", async () => {
    const handlers: HandlerMap = new Map()
    createMcpServer(
      async () => {
        throw new Error("client resolution should not run")
      },
      telemetry,
      toolRegistry,
      () =>
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- intentionally invalid boundary value
        ({
          package: { name: "@firfi/huly-mcp", version: "" },
          transport: { type: "stdio" },
          huly: {
            url: { configured: false },
            workspace: { configured: false },
            connectionTimeout: {
              configured: false,
              valid: true,
              valueMs: 30000,
              defaultMs: 30000,
              source: "default"
            }
          },
          auth: {
            method: "unknown",
            source: "none",
            tokenConfigured: false,
            emailConfigured: false,
            passwordConfigured: false
          },
          configSources: {
            env: {
              hulyUrl: false,
              hulyWorkspace: false,
              hulyToken: false,
              hulyEmail: false,
              hulyPassword: false,
              hulyConnectionTimeout: false,
              lazyEnvs: false
            }
          },
          toolsets: {
            filteringActive: false,
            requestedCategories: [],
            enabledCategories: [],
            ignoredCategories: [],
            availableCategories: ["issues"],
            visibleRegisteredToolCount: 1,
            totalRegisteredToolCount: 1,
            builtinTools: ["get_version", "get_huly_context"]
          },
          toolScope: {
            active: false,
            requestedToolsets: [],
            enabledToolsets: [],
            ignoredToolsets: [],
            requestedTools: [],
            enabledTools: [],
            ignoredTools: [],
            availableCategories: ["issues"],
            visibleRegisteredToolCount: 1,
            totalRegisteredToolCount: 1,
            builtinTools: ["get_version", "get_huly_context"]
          }
        }) as never,
      () => createCapturingServer(handlers)
    )

    const handler = handlers.get(CallToolRequestSchema) as
      | ((request: { params: { name: string; arguments: Record<string, never> } }) => Promise<{
        readonly isError?: boolean
        readonly content: ReadonlyArray<{ readonly text: string }>
      }>)
      | undefined

    expect(handler).toBeDefined()
    if (handler === undefined) {
      throw new Error("CallTool handler was not registered")
    }
    const result = await handler({
      params: { name: GET_HULY_CONTEXT_TOOL_NAME, arguments: {} }
    })

    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toBe("Failed to build Huly context")
  })
})
