import { Either, Schema } from "effect"

export type ToolExposureMode = "native" | "proxy"
export type ToolModeConfig = "auto" | "native" | "proxy"

const ToolModeConfigSchema = Schema.Literal("auto", "native", "proxy")
const ProxyOutputStrictEnvSchema = Schema.Literal("true", "false")

export interface ToolExposureConfig {
  readonly configuredMode: ToolModeConfig
  readonly proxyOutputStrict: boolean
}

interface ToolExposureEnv {
  readonly hulyToolMode?: string
  readonly proxyOutputStrict?: string
}

type ToolExposureConfigParseResult =
  | { readonly _tag: "Success"; readonly value: ToolExposureConfig }
  | { readonly _tag: "Failure"; readonly message: string; readonly field: "HULY_TOOL_MODE" | "PROXY_OUTPUT_STRICT" }

type EnvValueParseResult<T> =
  | { readonly _tag: "Success"; readonly value: T }
  | { readonly _tag: "Failure"; readonly message: string; readonly field: "HULY_TOOL_MODE" | "PROXY_OUTPUT_STRICT" }

const DEFAULT_TOOL_EXPOSURE_CONFIG: ToolExposureConfig = {
  configuredMode: "auto",
  proxyOutputStrict: false
}

export type ClientKind =
  | "claude-code"
  | "claude-ai"
  | "cursor"
  | "windsurf"
  | "github-copilot"
  | "codex"
  | "opencode"
  | "unknown"

export const DEFAULT_MODE_BY_CLIENT_KIND = {
  "claude-code": "native",
  "claude-ai": "proxy",
  cursor: "proxy",
  windsurf: "proxy",
  "github-copilot": "proxy",
  codex: "proxy",
  opencode: "proxy",
  unknown: "proxy"
} satisfies Record<ClientKind, ToolExposureMode>

export interface McpClientInfoLike {
  readonly name?: string
}

export interface ResolveToolExposureModeInput {
  readonly configuredMode: ToolModeConfig
  readonly clientInfo?: McpClientInfoLike
}

const trimmedLower = (value: string): string => value.trim().toLowerCase()

const parseConfiguredMode = (
  raw: string | undefined
): EnvValueParseResult<ToolModeConfig> => {
  const normalized = raw === undefined ? DEFAULT_TOOL_EXPOSURE_CONFIG.configuredMode : trimmedLower(raw)
  const decoded = Schema.decodeUnknownEither(ToolModeConfigSchema)(normalized)
  if (Either.isRight(decoded)) return { _tag: "Success", value: decoded.right }
  return {
    _tag: "Failure",
    field: "HULY_TOOL_MODE",
    message: `Configuration error: HULY_TOOL_MODE must be one of auto, native, or proxy; received "${raw ?? ""}".`
  }
}

const parseProxyOutputStrict = (
  raw: string | undefined
): EnvValueParseResult<boolean> => {
  const normalized = raw === undefined ? "false" : trimmedLower(raw)
  const decoded = Schema.decodeUnknownEither(ProxyOutputStrictEnvSchema)(normalized)
  if (Either.isRight(decoded)) return { _tag: "Success", value: decoded.right === "true" }
  return {
    _tag: "Failure",
    field: "PROXY_OUTPUT_STRICT",
    message: `Configuration error: PROXY_OUTPUT_STRICT must be true or false; received "${raw ?? ""}".`
  }
}

export const parseToolExposureConfig = (env: ToolExposureEnv): ToolExposureConfigParseResult => {
  const configuredMode = parseConfiguredMode(env.hulyToolMode)
  if (configuredMode._tag === "Failure") return configuredMode

  const proxyOutputStrict = parseProxyOutputStrict(env.proxyOutputStrict)
  if (proxyOutputStrict._tag === "Failure") return proxyOutputStrict

  return {
    _tag: "Success",
    value: {
      configuredMode: configuredMode.value,
      proxyOutputStrict: proxyOutputStrict.value
    }
  }
}

const rawClientName = (clientInfo: McpClientInfoLike | undefined): string => {
  const name = clientInfo?.name?.trim().toLowerCase()
  if (name === undefined || name === "") return ""

  return name
}

const withoutRemoteSuffix = (name: string): string => name.replace(/\s*\([^)]*\)\s*$/, "").trim()

export const classifyMcpClient = (
  clientInfo: McpClientInfoLike | undefined
): ClientKind => {
  const rawName = rawClientName(clientInfo)

  if (rawName === "claude-code") return "claude-code"

  const name = withoutRemoteSuffix(rawName)

  if (name === "claude-code") return "unknown"
  if (name === "claude-ai") return "claude-ai"
  if (name === "cursor-vscode" || name.startsWith("cursor")) return "cursor"
  if (name.startsWith("windsurf") || name.startsWith("cascade")) return "windsurf"
  if (name.startsWith("github-copilot") || name.startsWith("copilot") || name.startsWith("vscode")) {
    return "github-copilot"
  }
  if (name.startsWith("codex") || name.startsWith("openai-codex")) return "codex"
  if (name.startsWith("opencode")) return "opencode"

  return "unknown"
}

export const resolveToolExposureMode = (
  input: ResolveToolExposureModeInput
): ToolExposureMode => {
  if (input.configuredMode !== "auto") return input.configuredMode

  return DEFAULT_MODE_BY_CLIENT_KIND[classifyMcpClient(input.clientInfo)]
}
