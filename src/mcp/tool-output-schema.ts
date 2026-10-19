import { getHulyContextResultJsonSchema } from "../domain/schemas/huly-context.js"
import { type McpOutputSchema, wrapResultOutputSchema } from "./tool-output-schema-core.js"

export { createToolOutputSchema, type McpOutputSchema } from "./tool-output-schema-core.js"

// Effect JSONSchema emits refs rooted at its own schema document. The MCP output
// wrapper becomes that document, so shared definitions must live on the wrapper root.
export const hulyContextToolOutputSchema: McpOutputSchema = wrapResultOutputSchema(getHulyContextResultJsonSchema)
