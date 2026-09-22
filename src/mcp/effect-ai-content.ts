/** Mapping between Huly's rich tool response and Effect AI MCP content. */
import * as McpSchema from "effect/unstable/ai/McpSchema"

import type { McpImageContent } from "./tool-responses.js"
import type { McpToolResponse } from "./error-mapping.js"

type EffectCallToolResult = typeof McpSchema.CallToolResult.Type
const INTERNAL_ERROR_CODE = -32603

const textContent = (text: string) => ({ type: "text" as const, text })

const imageContent = (content: McpImageContent) => ({
  type: "image" as const,
  data: Uint8Array.from(Buffer.from(content.data, "base64")),
  mimeType: content.mimeType
})

const errorMetadata = (response: Extract<McpToolResponse, { readonly isError: true }>): Record<string, unknown> => ({
  errorCode: response._meta?.errorCode ?? INTERNAL_ERROR_CODE,
  ...(response._meta?.errorTag === undefined ? {} : { errorTag: response._meta.errorTag })
})

/** Convert Huly text, warning, image, and error metadata to Effect MCP. */
export const toEffectCallToolResult = (response: McpToolResponse): EffectCallToolResult => {
  const image = response.isError === true || !("imageContent" in response) ? undefined : response.imageContent
  const content: Array<
    | { readonly type: "text"; readonly text: string }
    | { readonly type: "image"; readonly data: Uint8Array; readonly mimeType: string }
  > = response.content.map((entry) => textContent(entry.text))
  if (image !== undefined) content.push(imageContent(image))

  return response.isError === true
    ? new McpSchema.CallToolResult({ content, isError: true, _meta: errorMetadata(response) })
    : new McpSchema.CallToolResult({
        content,
        ...(response.structuredContent === undefined ? {} : { structuredContent: response.structuredContent })
      })
}
