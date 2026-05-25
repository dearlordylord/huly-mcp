interface McpOutputSchema {
  readonly type: "object"
  readonly properties?: Record<string, unknown>
  readonly required?: Array<string>
  readonly [key: string]: unknown
}

export const defaultToolOutputSchema: McpOutputSchema = {
  type: "object",
  properties: {
    result: {
      description:
        "The successful tool result. The same value is also serialized as JSON in the text content for clients that do not read structuredContent."
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
        current: { type: "string" },
        latest: { type: "string" }
      },
      required: ["current", "latest"]
    }
  },
  required: ["result"]
}
