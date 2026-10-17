import { Config, Effect, Schema } from "effect"

import { parseToolExposureConfig, ToolExposureConfigSchema } from "./tool-mode.js"
import { parseToolScopeSelection, ToolScopeSelection } from "./tool-scope.js"

export const McpProcessPolicy = Schema.Struct({ ...ToolScopeSelection.fields, exposure: ToolExposureConfigSchema })
export type McpProcessPolicy = Schema.Schema.Type<typeof McpProcessPolicy>

export class McpProcessPolicyError extends Schema.TaggedError<McpProcessPolicyError>()("McpProcessPolicyError", {
  message: Schema.String
}) {}

export const loadMcpProcessPolicy = Effect.gen(function* () {
  const toolsets = yield* Effect.orElseSucceed(Config.String("TOOLSETS"), () => "")
  const tools = yield* Effect.orElseSucceed(Config.String("TOOLS"), () => "")
  const hulyToolMode = yield* Effect.orElseSucceed(Config.String("HULY_TOOL_MODE"), (): string | undefined => undefined)
  const proxyOutputStrict = yield* Effect.orElseSucceed(
    Config.String("PROXY_OUTPUT_STRICT"),
    (): string | undefined => undefined
  )
  const parsed = parseToolExposureConfig({
    ...(hulyToolMode === undefined ? {} : { hulyToolMode }),
    ...(proxyOutputStrict === undefined ? {} : { proxyOutputStrict })
  })
  if (parsed._tag === "Failure") return yield* new McpProcessPolicyError({ message: parsed.message })
  return { ...parseToolScopeSelection({ toolsets, tools }), exposure: parsed.value } satisfies McpProcessPolicy
})
