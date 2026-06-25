import { Either, Schema } from "effect"

const ToolExposureModeSchema = Schema.Literal("native", "proxy")
export type ToolExposureMode = Schema.Schema.Type<typeof ToolExposureModeSchema>

const ToolModeConfigSchema = Schema.Literal("auto", "native", "proxy")
export type ToolModeConfig = Schema.Schema.Type<typeof ToolModeConfigSchema>

const ProxyOutputStrictEnvSchema = Schema.Literal("true", "false")
const decodeToolExposureMode = Schema.decodeUnknownSync(ToolExposureModeSchema)
const NATIVE_TOOL_EXPOSURE_MODE = decodeToolExposureMode("native")
const PROXY_TOOL_EXPOSURE_MODE = decodeToolExposureMode("proxy")

const ToolExposureConfigSchema = Schema.Struct({
  configuredMode: ToolModeConfigSchema,
  proxyOutputStrict: Schema.Boolean
})
export type ToolExposureConfig = Schema.Schema.Type<typeof ToolExposureConfigSchema>

const ToolExposureEnvSchema = Schema.Struct({
  hulyToolMode: Schema.optionalWith(Schema.String, { exact: true }),
  proxyOutputStrict: Schema.optionalWith(Schema.String, { exact: true })
})

type ToolExposureConfigField = "HULY_TOOL_MODE" | "PROXY_OUTPUT_STRICT"

type ToolExposureConfigParseResult =
  | { readonly _tag: "Success"; readonly value: ToolExposureConfig }
  | { readonly _tag: "Failure"; readonly message: string; readonly field: ToolExposureConfigField }

type EnvValueParseResult<T> =
  | { readonly _tag: "Success"; readonly value: T }
  | { readonly _tag: "Failure"; readonly message: string; readonly field: ToolExposureConfigField }

const DEFAULT_TOOL_EXPOSURE_CONFIG: ToolExposureConfig = ToolExposureConfigSchema.make({
  configuredMode: "auto",
  proxyOutputStrict: false
})

const isUnknownRecord = (input: unknown): input is Readonly<Record<string, unknown>> =>
  typeof input === "object" && input !== null && !Array.isArray(input)

const envShapeFailure = (input: unknown): ToolExposureConfigParseResult => {
  if (isUnknownRecord(input)) {
    if (
      "hulyToolMode" in input
      && input.hulyToolMode !== undefined
      && typeof input.hulyToolMode !== "string"
    ) {
      return {
        _tag: "Failure",
        field: "HULY_TOOL_MODE",
        message: "Configuration error: HULY_TOOL_MODE must be a string when set."
      }
    }
    if (
      "proxyOutputStrict" in input
      && input.proxyOutputStrict !== undefined
      && typeof input.proxyOutputStrict !== "string"
    ) {
      return {
        _tag: "Failure",
        field: "PROXY_OUTPUT_STRICT",
        message: "Configuration error: PROXY_OUTPUT_STRICT must be a string when set."
      }
    }
  }

  return {
    _tag: "Failure",
    field: "HULY_TOOL_MODE",
    message: "Configuration error: HULY_TOOL_MODE and PROXY_OUTPUT_STRICT must be string environment values."
  }
}

const ClientKindSchema = Schema.Literal(
  "claude-code",
  "claude-ai",
  "cursor",
  "windsurf",
  "github-copilot",
  "codex",
  "opencode",
  "unknown"
)
export type ClientKind = Schema.Schema.Type<typeof ClientKindSchema>

export const DEFAULT_MODE_BY_CLIENT_KIND = {
  "claude-code": NATIVE_TOOL_EXPOSURE_MODE,
  "claude-ai": PROXY_TOOL_EXPOSURE_MODE,
  cursor: PROXY_TOOL_EXPOSURE_MODE,
  windsurf: PROXY_TOOL_EXPOSURE_MODE,
  "github-copilot": PROXY_TOOL_EXPOSURE_MODE,
  codex: PROXY_TOOL_EXPOSURE_MODE,
  opencode: PROXY_TOOL_EXPOSURE_MODE,
  unknown: PROXY_TOOL_EXPOSURE_MODE
} satisfies Record<ClientKind, ToolExposureMode>

const McpClientName = Schema.Trim.pipe(Schema.nonEmptyString(), Schema.brand("McpClientName")).annotations({
  identifier: "McpClientName",
  title: "McpClientName",
  description: "Trimmed MCP client name from initialize or request metadata."
})

const McpClientInfoLikeSchema = Schema.Struct({
  name: Schema.optionalWith(McpClientName, { exact: true })
})
export type McpClientInfoLike = Schema.Schema.Type<typeof McpClientInfoLikeSchema>

export interface ResolveToolExposureModeInput {
  readonly configuredMode: ToolModeConfig
  readonly clientInfo?: McpClientInfoLike
}

const trimmedLower = (value: string): string => value.trim().toLowerCase()

const parseConfiguredMode = (
  raw: string | undefined
): EnvValueParseResult<ToolModeConfig> => {
  if (raw === undefined) {
    return { _tag: "Success", value: DEFAULT_TOOL_EXPOSURE_CONFIG.configuredMode }
  }

  const normalized = trimmedLower(raw)
  const decoded = Schema.decodeUnknownEither(ToolModeConfigSchema)(normalized)
  if (Either.isRight(decoded)) return { _tag: "Success", value: decoded.right }
  return {
    _tag: "Failure",
    field: "HULY_TOOL_MODE",
    message: `Configuration error: HULY_TOOL_MODE must be one of auto, native, or proxy; received "${raw}".`
  }
}

const parseProxyOutputStrict = (
  raw: string | undefined
): EnvValueParseResult<boolean> => {
  if (raw === undefined) return { _tag: "Success", value: false }

  const normalized = trimmedLower(raw)
  const decoded = Schema.decodeUnknownEither(ProxyOutputStrictEnvSchema)(normalized)
  if (Either.isRight(decoded)) return { _tag: "Success", value: decoded.right === "true" }
  return {
    _tag: "Failure",
    field: "PROXY_OUTPUT_STRICT",
    message: `Configuration error: PROXY_OUTPUT_STRICT must be true or false; received "${raw}".`
  }
}

export const parseToolExposureConfig = (input: unknown): ToolExposureConfigParseResult => {
  const decodedEnv = Schema.decodeUnknownEither(ToolExposureEnvSchema)(input)
  if (Either.isLeft(decodedEnv)) return envShapeFailure(input)

  const env = decodedEnv.right
  const configuredMode = parseConfiguredMode(env.hulyToolMode)
  if (configuredMode._tag === "Failure") return configuredMode

  const proxyOutputStrict = parseProxyOutputStrict(env.proxyOutputStrict)
  if (proxyOutputStrict._tag === "Failure") return proxyOutputStrict

  return {
    _tag: "Success",
    value: ToolExposureConfigSchema.make({
      configuredMode: configuredMode.value,
      proxyOutputStrict: proxyOutputStrict.value
    })
  }
}

export const parseMcpClientInfo = (input: unknown): McpClientInfoLike | undefined => {
  const decoded = Schema.decodeUnknownEither(McpClientInfoLikeSchema)(input)
  return Either.isRight(decoded) ? decoded.right : undefined
}

const rawClientName = (clientInfo: McpClientInfoLike | undefined): string => {
  const name = clientInfo?.name?.toLowerCase()
  if (name === undefined || name === "") return ""

  return name
}

const withoutRemoteSuffix = (name: string): string => name.replace(/\s*\([^)]*\)\s*$/, "").trim()
const makeClientKind = Schema.decodeUnknownSync(ClientKindSchema)

export const classifyMcpClient = (
  clientInfo: McpClientInfoLike | undefined
): ClientKind => {
  const rawName = rawClientName(clientInfo)

  if (rawName === "claude-code") return makeClientKind("claude-code")

  const name = withoutRemoteSuffix(rawName)

  if (name === "claude-code") return makeClientKind("unknown")
  if (name === "claude-ai") return makeClientKind("claude-ai")
  if (name === "cursor-vscode" || name.startsWith("cursor")) return makeClientKind("cursor")
  if (name.startsWith("windsurf") || name.startsWith("cascade")) return makeClientKind("windsurf")
  if (
    name.startsWith("github-copilot")
    || name.startsWith("copilot")
    || name.startsWith("visual studio code")
    || name.startsWith("visual-studio-code")
  ) {
    return makeClientKind("github-copilot")
  }
  if (name.startsWith("codex") || name.startsWith("openai-codex")) return makeClientKind("codex")
  if (name.startsWith("opencode")) return makeClientKind("opencode")

  return makeClientKind("unknown")
}

export const resolveToolExposureMode = (
  input: ResolveToolExposureModeInput
): ToolExposureMode => {
  if (input.configuredMode !== "auto") return input.configuredMode

  return DEFAULT_MODE_BY_CLIENT_KIND[classifyMcpClient(input.clientInfo)]
}
