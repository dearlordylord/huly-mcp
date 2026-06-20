import type { Schema } from "effect"
import { JSONSchema } from "effect"

import { getHulyContextResultJsonSchema } from "../domain/schemas/index.js"
import { ToolWarningCodeSchema } from "../domain/schemas/tool-warnings.js"
import { collectJsonSchemaDefinitions, omitJsonSchemaDocumentMetadata } from "./json-schema-refs.js"

export interface McpOutputSchema {
  readonly type: "object"
  readonly properties?: Record<string, unknown>
  readonly required?: Array<string>
  readonly [key: string]: unknown
}

type JsonSchemaDocument = JSONSchema.JsonSchema7Root

const toolWarningCodeEnum = [...ToolWarningCodeSchema.literals]

const warningOutputSchema = {
  type: "array",
  description:
    "Optional agent-visible warnings about degraded result fidelity. Omitted when the server returned the documented happy-path payload.",
  items: {
    type: "object",
    properties: {
      code: {
        type: "string",
        enum: toolWarningCodeEnum
      },
      message: {
        type: "string",
        minLength: 1
      }
    },
    required: ["code", "message"],
    additionalProperties: false
  }
} as const

const wrapResultOutputSchema = (resultSchema: JsonSchemaDocument): McpOutputSchema => {
  const resultDefs = collectJsonSchemaDefinitions(resultSchema)
  const embeddedResultSchema = omitJsonSchemaDocumentMetadata(resultSchema)

  return {
    $schema: resultSchema.$schema,
    ...(resultDefs === undefined ? {} : { $defs: resultDefs }),
    type: "object",
    properties: {
      result: embeddedResultSchema,
      warnings: warningOutputSchema
    },
    required: ["result"]
  }
}

export const createToolOutputSchema = (resultSchema: Schema.Schema.AnyNoContext): McpOutputSchema =>
  wrapResultOutputSchema(JSONSchema.make(resultSchema))

// Effect JSONSchema emits refs rooted at its own schema document. The MCP output
// wrapper becomes that document, so shared definitions must live on the wrapper root.
export const hulyContextToolOutputSchema: McpOutputSchema = wrapResultOutputSchema(getHulyContextResultJsonSchema)
