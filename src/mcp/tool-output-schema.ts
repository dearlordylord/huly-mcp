import { getHulyContextResultJsonSchema } from "../domain/schemas/index.js"
import { ToolWarningCodeSchema } from "../domain/schemas/tool-warnings.js"

// eslint-disable-next-line import-x/no-unused-modules -- exported to give output schema constants a stable declaration name
export interface McpOutputSchema {
  readonly type: "object"
  readonly properties?: Record<string, unknown>
  readonly required?: Array<string>
  readonly [key: string]: unknown
}

const toolWarningCodeEnum = [...ToolWarningCodeSchema.literals]

export const defaultToolOutputSchema: McpOutputSchema = {
  type: "object",
  properties: {
    result: {
      description:
        "The successful tool result. The same value is also serialized as JSON in the text content for clients that do not read structuredContent."
    },
    warnings: {
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
    }
  },
  required: ["result"]
}

export const versionToolOutputSchema: McpOutputSchema = {
  type: "object",
  properties: {
    result: {
      type: "object",
      properties: {
        current: { type: "string", minLength: 1 },
        latest: { type: "string", minLength: 1 }
      },
      required: ["current", "latest"]
    }
  },
  required: ["result"]
}

export const hulyContextToolOutputSchema: McpOutputSchema = {
  type: "object",
  properties: {
    result: getHulyContextResultJsonSchema
  },
  required: ["result"]
}
