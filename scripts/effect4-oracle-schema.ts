import { Schema } from "effect"

import { CliExitStatusSchema, CliFailureCodeSchema, CliFailureSchema } from "../packages/huly-cli/src/failures.js"
import { Count } from "../src/domain/schemas/shared.js"
import { ToolCategory, ToolName } from "../src/mcp/tools/registry.js"
import { CapturedProcessResultSchema } from "./captured-process-schema.js"
import { isJsonValue } from "./effect4-oracle-canonical.js"

export type { JsonValue } from "./effect4-oracle-canonical.js"

export const JsonValueSchema = Schema.declare(isJsonValue)
export const JsonRecordSchema = Schema.Record(Schema.String, JsonValueSchema)

export const OracleMethodSchema = Schema.Literals([
  "server/discover",
  "tools/list",
  "resources/list",
  "resources/templates/list",
  "tools/call"
])
export type OracleMethod = Schema.Schema.Type<typeof OracleMethodSchema>

export const OracleJsonRpcResponseSchema = Schema.Struct({
  id: Schema.Union([Schema.String, Schema.Number]),
  jsonrpc: Schema.Literal("2.0"),
  result: JsonValueSchema
})
export type OracleJsonRpcResponse = Schema.Schema.Type<typeof OracleJsonRpcResponseSchema>

export const OracleJsonRpcRequestSchema = Schema.Struct({
  id: Schema.Number,
  jsonrpc: Schema.Literal("2.0"),
  method: OracleMethodSchema,
  params: JsonRecordSchema
})
export type OracleJsonRpcRequest = Schema.Schema.Type<typeof OracleJsonRpcRequestSchema>

const ArtifactVersionCheckSchema = Schema.Struct({ embeddedManifestVersion: Schema.Boolean })
const CliProcessFixturesSchema = Schema.Struct({
  rootHelp: CapturedProcessResultSchema,
  groupHelp: CapturedProcessResultSchema,
  leafHelp: CapturedProcessResultSchema,
  humanError: CapturedProcessResultSchema,
  jsonErrorAfterDeepCommand: CapturedProcessResultSchema,
  jsonErrorBeforeDeepCommand: CapturedProcessResultSchema
})
export const BundledProcessesSchema = Schema.Struct({
  artifacts: Schema.Struct({ cli: ArtifactVersionCheckSchema, mcp: ArtifactVersionCheckSchema }),
  cli: CliProcessFixturesSchema,
  stdio: Schema.Struct({
    legacy: Schema.Array(OracleJsonRpcResponseSchema),
    native: Schema.Array(OracleJsonRpcResponseSchema),
    proxy: Schema.Array(OracleJsonRpcResponseSchema)
  })
})
export type BundledProcesses = Schema.Schema.Type<typeof BundledProcessesSchema>

const RegistryToolInventorySchema = Schema.Struct({ category: ToolCategory, name: ToolName })
const AuthoredConstraintSchema = Schema.Struct({
  path: Schema.Array(Schema.Union([Schema.String, Schema.Int])),
  value: JsonValueSchema
})
const AuthoredToolConstraintsSchema = Schema.Struct({
  constraints: Schema.Array(AuthoredConstraintSchema).pipe(Schema.check(Schema.isMinLength(1))),
  toolName: ToolName
})
const RegistryInventorySchema = Schema.Struct({
  authoredConstraints: Schema.Array(AuthoredToolConstraintsSchema),
  builtinNames: Schema.Array(ToolName),
  operationOrder: Schema.Array(ToolName),
  proxyNames: Schema.Array(ToolName),
  rawOrder: Schema.Array(ToolName),
  tools: Schema.Array(RegistryToolInventorySchema)
})

const CliLiveParitySchema = Schema.Struct({
  cliRoutes: Count,
  ignoredOperations: Count,
  registryOperations: Count,
  routesWithoutOperations: Count
})
const CliHistoricalParitySchema = Schema.Struct({
  registryOperations: Count,
  cliRoutes: Count,
  ignoredOperations: Count,
  directLiveCases: Count,
  deferredLiveCases: Count
})
const CliParityTargetSchema = Schema.Struct({ ignoredOperations: Count, routesPerRegistryOperation: Count })

const CliFileInputPolicySchema = Schema.Struct({ fields: Schema.Array(Schema.String) })
const CliFileOutputPolicySchema = Schema.Union([
  Schema.Struct({ attachmentIdField: Schema.String, type: Schema.Literal("attachment-download") }),
  Schema.Struct({ type: Schema.Literal("image-content") })
])
const CliCommandBehaviorSchema = Schema.Struct({
  base64FileInput: Schema.optionalKey(CliFileInputPolicySchema),
  confirmation: Schema.optionalKey(Schema.Struct({ message: Schema.String, type: Schema.Literal("requires-yes") })),
  fileInput: Schema.optionalKey(CliFileInputPolicySchema),
  fileOutput: Schema.optionalKey(CliFileOutputPolicySchema)
})
const CliHumanColumnSchema = Schema.Struct({
  field: Schema.String,
  label: Schema.optionalKey(Schema.String),
  priority: Schema.Number,
  reusable: Schema.optionalKey(Schema.Boolean)
})
const CliRouteSchema = Schema.Struct({
  toolName: ToolName,
  path: Schema.Array(Schema.String).pipe(Schema.check(Schema.isMinLength(1))),
  positional: Schema.Array(Schema.String),
  description: Schema.String,
  behavior: Schema.optionalKey(CliCommandBehaviorSchema),
  human: Schema.optionalKey(
    Schema.Struct({ columns: Schema.Array(CliHumanColumnSchema).pipe(Schema.check(Schema.isMinLength(1))) })
  )
})

const CliGlobalsFixtureSchema = Schema.Struct({ json: Schema.Boolean, yes: Schema.Boolean })
const CliInputFixtureSchema = Schema.Struct({
  globals: CliGlobalsFixtureSchema,
  input: Schema.Struct({ limit: Schema.Int, query: Schema.String })
})
const CliInputFixturesSchema = Schema.Struct({
  explicitLast: CliInputFixtureSchema,
  fileLast: CliInputFixtureSchema,
  jsonLast: CliInputFixtureSchema
})

const CliFailurePresentationSchema = Schema.Struct({ exitStatus: CliExitStatusSchema, stderr: Schema.String })
const CliDecodedFailurePresentationSchema = Schema.Struct({
  exitStatus: CliExitStatusSchema,
  stderr: Schema.String,
  decoded: CliFailureSchema
})
const CliErrorFixturesSchema = Schema.Struct({
  defect: CliDecodedFailurePresentationSchema,
  human: CliFailurePresentationSchema,
  json: CliDecodedFailurePresentationSchema
})
const CliFailureContractEntrySchema = Schema.Struct({
  code: CliFailureCodeSchema,
  exitStatus: CliExitStatusSchema,
  hint: Schema.optionalKey(Schema.String)
})
const CliFailureContractSchema = Schema.Struct({
  input: CliFailureContractEntrySchema,
  authentication: CliFailureContractEntrySchema,
  authorization: CliFailureContractEntrySchema,
  lookup: CliFailureContractEntrySchema,
  ambiguity: CliFailureContractEntrySchema,
  conflict: CliFailureContractEntrySchema,
  integration: CliFailureContractEntrySchema,
  internal: CliFailureContractEntrySchema
})

export const BehavioralOracleSchema = Schema.Struct({
  formatVersion: Schema.Literal(1),
  bundledProcesses: BundledProcessesSchema,
  registry: RegistryInventorySchema,
  resources: Schema.Struct({
    dynamicResourceInventory: Schema.Literal(true),
    invalidUri: Schema.Struct({ message: Schema.String, name: Schema.String })
  }),
  cli: Schema.Struct({
    routes: Schema.Array(CliRouteSchema),
    parity: Schema.Struct({
      historicalBaseline: CliHistoricalParitySchema,
      live: CliLiveParitySchema,
      target: CliParityTargetSchema
    }),
    help: Schema.Struct({ group: Schema.String, leaf: Schema.String, root: Schema.String }),
    input: CliInputFixturesSchema,
    errors: CliErrorFixturesSchema,
    failureContract: CliFailureContractSchema
  })
})
export type BehavioralOracle = Schema.Schema.Type<typeof BehavioralOracleSchema>
