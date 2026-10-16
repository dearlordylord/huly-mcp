import { Result, Schema } from "effect"
import { handleStartupDiagnosticRequest } from "./startup-diagnostic-mcp.js"

const minimumRequirementPrefix = ">="
const nodeVersionPattern = /^\d{1,9}\.\d{1,9}\.\d{1,9}$/u
const nodeRequirementPattern = new RegExp(`^${minimumRequirementPrefix}\\d{1,9}\\.\\d{1,9}\\.\\d{1,9}$`, "u")
const NodeVersionTextSchema = Schema.String.check(Schema.isPattern(nodeVersionPattern)).pipe(
  Schema.brand("NodeVersionText")
)
const NodeRequirementTextSchema = Schema.String.check(Schema.isPattern(nodeRequirementPattern)).pipe(
  Schema.brand("NodeRequirementText")
)
const SemanticVersionSchema = Schema.Struct({ major: Schema.Number, minor: Schema.Number, patch: Schema.Number })

type NodeVersionText = Schema.Schema.Type<typeof NodeVersionTextSchema>
type SemanticVersion = Schema.Schema.Type<typeof SemanticVersionSchema>

const UnsupportedNodeMcpConfigSchema = Schema.Struct({
  detectedNodeVersion: NodeVersionTextSchema,
  executable: Schema.NonEmptyString,
  requiredNodeVersion: NodeRequirementTextSchema,
  serverVersion: Schema.NonEmptyString
})

export type UnsupportedNodeMcpConfig = Schema.Schema.Type<typeof UnsupportedNodeMcpConfigSchema>

const parseUnsupportedNodeMcpConfigBoundary = Schema.decodeUnknownSync(UnsupportedNodeMcpConfigSchema)

export const renderUnsupportedNodeDiagnostic = (config: UnsupportedNodeMcpConfig): string => {
  const minimumVersion = config.requiredNodeVersion.slice(minimumRequirementPrefix.length)
  return (
    `Huly MCP startup failed: unsupported Node.js runtime. Detected ${config.detectedNodeVersion} at ${config.executable}; ` +
    `required ${config.requiredNodeVersion}. MCP hosts use the Node.js executable resolved by their configured ` +
    `command and PATH. Install Node.js ${minimumVersion} or later, or configure this MCP server's command ` +
    `to a compatible Node.js executable, then restart the MCP server.`
  )
}

const parseNodeVersionText = Schema.decodeUnknownResult(NodeVersionTextSchema)
const parseNodeRequirementText = Schema.decodeUnknownResult(NodeRequirementTextSchema)
const parseMinimumNodeVersionText = Schema.decodeUnknownSync(NodeVersionTextSchema)

const parseSemanticVersion = (value: NodeVersionText): SemanticVersion => {
  const [major, minor, patch] = value.split(".")
  return Schema.decodeUnknownSync(SemanticVersionSchema)({
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch)
  })
}

export const isUnsupportedNodeRuntime = (actual: unknown, requirement: unknown): boolean => {
  const actualText = parseNodeVersionText(actual)
  const requirementText = parseNodeRequirementText(requirement)
  if (Result.isFailure(actualText) || Result.isFailure(requirementText)) return true
  const minimumText = parseMinimumNodeVersionText(requirementText.success.slice(minimumRequirementPrefix.length))
  const actualVersion = parseSemanticVersion(actualText.success)
  const minimumVersion = parseSemanticVersion(minimumText)
  if (actualVersion.major !== minimumVersion.major) return actualVersion.major < minimumVersion.major
  if (actualVersion.minor !== minimumVersion.minor) return actualVersion.minor < minimumVersion.minor
  return actualVersion.patch < minimumVersion.patch
}

export const parseUnsupportedNodeMcpConfig = (input: unknown): UnsupportedNodeMcpConfig => {
  const config = parseUnsupportedNodeMcpConfigBoundary(input)
  if (!isUnsupportedNodeRuntime(config.detectedNodeVersion, config.requiredNodeVersion)) {
    throw new Error("Unsupported Node MCP configuration requires an unsupported detected runtime")
  }
  return config
}

export const handleUnsupportedNodeRequest = (line: string, config: UnsupportedNodeMcpConfig): string | undefined =>
  handleStartupDiagnosticRequest(line, {
    serverVersion: config.serverVersion,
    message: renderUnsupportedNodeDiagnostic(config),
    error: {
      code: "UNSUPPORTED_NODE_RUNTIME",
      detectedNodeVersion: config.detectedNodeVersion,
      executable: config.executable,
      requiredNodeVersion: config.requiredNodeVersion
    }
  })
