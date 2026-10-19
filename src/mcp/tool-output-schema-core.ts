import type { JsonSchema, Schema } from "effect"

import { toDraft07JsonSchema } from "../domain/schemas/json-schema.js"
import { ToolWarningCodeSchema } from "../domain/schemas/tool-warnings.js"
import { collectJsonSchemaDefinitions, omitJsonSchemaDocumentMetadata } from "./json-schema-refs.js"

export interface McpOutputSchema {
  readonly type: "object"
  readonly properties?: Record<string, unknown>
  readonly required?: ReadonlyArray<string>
  readonly [key: string]: unknown
}

const toolWarningCodeEnum = [...ToolWarningCodeSchema.literals]

const warningOutputSchema = {
  type: "array",
  description:
    "Optional agent-visible warnings about degraded result fidelity or important operational conditions. Omitted when there is nothing the agent needs to surface.",
  items: {
    type: "object",
    properties: { code: { type: "string", enum: toolWarningCodeEnum }, message: { type: "string", minLength: 1 } },
    required: ["code", "message"],
    additionalProperties: false
  }
} as const

export const wrapResultOutputSchema = (resultSchema: JsonSchema.JsonSchema): McpOutputSchema => {
  const resultDefs = collectJsonSchemaDefinitions(resultSchema)
  const embeddedResultSchema = omitJsonSchemaDocumentMetadata(resultSchema)

  return {
    $schema: resultSchema.$schema,
    ...(resultDefs === undefined ? {} : { $defs: resultDefs }),
    type: "object",
    properties: { result: embeddedResultSchema, warnings: warningOutputSchema },
    required: ["result"]
  }
}

export const createToolOutputSchema = (resultSchema: Schema.Constraint): McpOutputSchema =>
  wrapResultOutputSchema(toDraft07JsonSchema(resultSchema))
