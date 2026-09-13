import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"

import { Result, Schema, SchemaTransformation } from "effect"

import { McpImageContentSchema } from "../src/domain/schemas/attachments.js"
import { cliCommandCatalog, isCliToolName } from "../packages/huly-cli/src/catalog.js"
import type { CliCommandSpec } from "../packages/huly-cli/src/catalog-types.js"
import { CliJsonWrappedResultSchema } from "../packages/huly-cli/src/render.js"
import { CliFailureSchema } from "../packages/huly-cli/src/failures.js"
import { createImageSuccessResponse, createSuccessResponse, toMcpResponse } from "../src/mcp/tool-responses.js"
import {
  type FullIntegrationAdapterResponse,
  FullIntegrationAdapterResultSchema,
  FullIntegrationAdapterResponseSchema
} from "./full-integration-adapter-contract.js"

const NonEmptyTrimmedString = Schema.Trimmed.pipe(Schema.check(Schema.isNonEmpty()))
const AdapterArgumentsSchema = Schema.Tuple([
  NonEmptyTrimmedString.pipe(Schema.annotate({ description: "Installed packed huly executable." })),
  NonEmptyTrimmedString.pipe(Schema.annotate({ description: "MCP tools/call JSON payload." })),
  NonEmptyTrimmedString.pipe(Schema.annotate({ description: "Temporary image output path." }))
])
const ToolArgumentsSchema = Schema.Record(Schema.String, Schema.Unknown)
const ToolCallRequestSchema = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  method: Schema.Literal("tools/call"),
  params: Schema.Struct({ name: NonEmptyTrimmedString, arguments: ToolArgumentsSchema }),
  id: Schema.Number
})
const UnknownFromJsonSchema = Schema.String.pipe(Schema.decodeTo(Schema.Unknown, SchemaTransformation.fromJsonString()))
const CliFailureFromJsonSchema = Schema.fromJsonString(CliFailureSchema)

const NODE_ARGUMENT_OFFSET = 2
const [executable, payload, imagePath] = Schema.decodeUnknownSync(AdapterArgumentsSchema)(
  process.argv.slice(NODE_ARGUMENT_OFFSET)
)
const request = Schema.decodeUnknownSync(ToolCallRequestSchema)(
  Schema.decodeUnknownSync(UnknownFromJsonSchema)(payload)
)

if (!isCliToolName(request.params.name)) {
  throw new Error(`MCP integration requested unknown CLI tool ${request.params.name}.`)
}

const spec: CliCommandSpec = cliCommandCatalog[request.params.name]
const cliValue = (value: unknown): string => {
  if (typeof value === "string") return value
  const encoded = JSON.stringify(value)
  return encoded === undefined ? "" : encoded
}
const positionalArguments = spec.positional.flatMap((fieldName) => {
  const value = request.params.arguments[fieldName]
  return value === undefined ? [] : [cliValue(value)]
})
const imageOutputArguments = spec.behavior?.fileOutput?.type === "image-content" ? ["--output", imagePath] : []
const commandArguments = [
  ...spec.path,
  ...positionalArguments,
  "--input-json",
  JSON.stringify(request.params.arguments),
  "--yes",
  "--json",
  ...imageOutputArguments
]
const execution = spawnSync(executable, commandArguments, { encoding: "utf8" })

const errorText = (): string => {
  if (execution.error !== undefined) return execution.error.message
  const stderr = Schema.decodeUnknownSync(Schema.String)(execution.stderr).trim()
  for (const line of stderr.split("\n").reverse()) {
    const failure = Schema.decodeUnknownResult(CliFailureFromJsonSchema)(line)
    if (Result.isSuccess(failure)) return failure.success.message
  }
  return stderr.length === 0 ? `CLI exited with status ${String(execution.status)}.` : stderr
}

const errorResponse = (): FullIntegrationAdapterResponse => ({
  jsonrpc: "2.0",
  id: request.id,
  result: { content: [{ type: "text", text: errorText() }], isError: true }
})

const successResponse = (): FullIntegrationAdapterResponse => {
  const stdout = Schema.decodeUnknownSync(Schema.String)(execution.stdout)
  const cliOutput = Schema.decodeUnknownSync(UnknownFromJsonSchema)(stdout)
  const wrapped = Schema.decodeUnknownResult(CliJsonWrappedResultSchema)(cliOutput)
  const result = Result.isSuccess(wrapped) ? wrapped.success.result : cliOutput
  const warnings = Result.isSuccess(wrapped) && "warnings" in wrapped.success ? wrapped.success.warnings : []
  const image = Result.isSuccess(wrapped) && "image" in wrapped.success ? wrapped.success.image : undefined
  const toolResponse =
    image === undefined
      ? createSuccessResponse(result, warnings)
      : createImageSuccessResponse(
          result,
          Schema.decodeUnknownSync(McpImageContentSchema)({
            type: "image",
            data: readFileSync(imagePath).toString("base64"),
            mimeType: image.mimeType
          }),
          warnings
        )
  return {
    jsonrpc: "2.0",
    id: request.id,
    result: Schema.decodeUnknownSync(FullIntegrationAdapterResultSchema)(toMcpResponse(toolResponse))
  }
}

const response = execution.status === 0 ? successResponse() : errorResponse()
console.log(JSON.stringify(Schema.encodeSync(FullIntegrationAdapterResponseSchema)(response)))
