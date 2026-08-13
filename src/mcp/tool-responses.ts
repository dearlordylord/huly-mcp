import { Schema } from "effect"

import { type McpImageContent, McpImageContentSchema } from "../domain/schemas/attachments.js"
import type { ToolWarning } from "../domain/schemas/tool-warnings.js"

export const McpErrorCode = { InvalidParams: -32602, InternalError: -32603 } as const
export type McpErrorCode = (typeof McpErrorCode)[keyof typeof McpErrorCode]

interface ErrorMetadata {
  errorCode: McpErrorCode
  errorTag?: string | undefined
}

type McpTextContent = { readonly type: "text"; readonly text: string }
export type { McpImageContent } from "../domain/schemas/attachments.js"
type McpTextContentList = [McpTextContent, ...Array<McpTextContent>]

interface McpToolResponseBase {
  readonly content: McpTextContentList
  readonly _meta?: ErrorMetadata
}

interface McpToolSuccessResponse extends McpToolResponseBase {
  structuredContent?: { readonly result: unknown; readonly warnings?: ReadonlyArray<ToolWarning> }
  readonly imageContent?: McpImageContent
  readonly isError?: false
}

interface McpToolErrorResponse extends McpToolResponseBase {
  readonly structuredContent?: never
  readonly isError: true
}

export type McpToolResponse = McpToolSuccessResponse | McpToolErrorResponse

type McpWireImageContent = Schema.Schema.Encoded<typeof McpImageContentSchema>
type McpWireSuccessResponse = {
  readonly content: [McpTextContent, ...Array<McpTextContent | McpWireImageContent>]
  readonly structuredContent?: { readonly result: unknown; readonly warnings?: ReadonlyArray<ToolWarning> }
  readonly isError?: false
}
type McpWireErrorResponse = Omit<McpToolErrorResponse, "_meta">
export type McpWireResponse = McpWireSuccessResponse | McpWireErrorResponse

export interface McpErrorResponseWithMeta extends McpToolErrorResponse {
  isError: true
  _meta: ErrorMetadata
}

const encodeJsonText = (value: unknown): string => {
  const text = JSON.stringify(value)
  return typeof text === "string" ? text : "null"
}

export const createErrorResponse = (
  text: string,
  errorCode: McpErrorCode,
  errorTag?: string,
  warnings: ReadonlyArray<ToolWarning> = []
): McpErrorResponseWithMeta => ({
  content: [
    { type: "text", text },
    ...(warnings.length > 0 ? [{ type: "text" as const, text: encodeJsonText({ warnings }) }] : [])
  ],
  isError: true,
  _meta: { errorCode, errorTag }
})

const createSuccessResponseBase = <T>(
  result: T,
  warnings: ReadonlyArray<ToolWarning> = []
): McpToolSuccessResponse => ({
  content: [
    { type: "text", text: encodeJsonText(result) },
    ...(warnings.length > 0 ? [{ type: "text" as const, text: encodeJsonText({ warnings }) }] : [])
  ],
  structuredContent: warnings.length > 0 ? { result, warnings } : { result }
})

export const createSuccessResponse = <T>(result: T, warnings: ReadonlyArray<ToolWarning> = []): McpToolResponse =>
  createSuccessResponseBase(result, warnings)

export const createImageSuccessResponse = <T>(
  result: T,
  imageContent: McpImageContent,
  warnings: ReadonlyArray<ToolWarning> = []
): McpToolResponse => ({ ...createSuccessResponseBase(result, warnings), imageContent })

const appendWarningContent = (
  content: McpTextContentList,
  warnings: ReadonlyArray<ToolWarning>,
  replaceExistingWarningBlock: boolean
): McpTextContentList => {
  const [first, ...remaining] = content
  const preserved = replaceExistingWarningBlock ? remaining.slice(0, remaining.length - 1) : remaining
  return [first, ...preserved, { type: "text", text: encodeJsonText({ warnings }) }]
}

export const appendToolWarnings = (
  response: McpToolResponse,
  warnings: ReadonlyArray<ToolWarning>
): McpToolResponse => {
  if (warnings.length === 0) return response
  if (response.isError === true || response.structuredContent === undefined) {
    return { ...response, content: appendWarningContent(response.content, warnings, false) }
  }
  const existingWarnings = response.structuredContent.warnings ?? []
  const combinedWarnings = [...existingWarnings, ...warnings]
  return {
    ...response,
    content: appendWarningContent(response.content, combinedWarnings, existingWarnings.length > 0),
    structuredContent: { result: response.structuredContent.result, warnings: combinedWarnings }
  }
}

export const createUnknownToolError = (toolName: string): McpErrorResponseWithMeta =>
  createErrorResponse(`Unknown tool: ${toolName}`, McpErrorCode.InvalidParams, "UnknownTool")

export const SERVER_SHUTTING_DOWN_MESSAGE = "Huly MCP is shutting down; start a new connection before retrying"

export const createServerShuttingDownError = (): McpErrorResponseWithMeta =>
  createErrorResponse(SERVER_SHUTTING_DOWN_MESSAGE, McpErrorCode.InternalError, "ServerShuttingDown")

export const createInvalidParamsError = (message: string, errorTag?: string): McpErrorResponseWithMeta =>
  createErrorResponse(message, McpErrorCode.InvalidParams, errorTag)

export function toMcpResponse(response: McpToolErrorResponse): McpWireErrorResponse
export function toMcpResponse(response: McpToolSuccessResponse): McpWireSuccessResponse
export function toMcpResponse(response: McpToolResponse): McpWireResponse
export function toMcpResponse(response: McpToolResponse): McpWireResponse {
  return response.isError === true
    ? { content: response.content, isError: true }
    : {
        content:
          response.imageContent === undefined
            ? response.content
            : [...response.content, Schema.encodeSync(McpImageContentSchema)(response.imageContent)],
        ...(response.structuredContent === undefined ? {} : { structuredContent: response.structuredContent }),
        ...(response.isError === undefined ? {} : { isError: response.isError })
      }
}
