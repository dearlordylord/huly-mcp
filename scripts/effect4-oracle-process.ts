import { Schema } from "effect"

import type { CapturedProcessResult } from "./captured-process-schema.js"
import {
  type OracleJsonRpcRequest,
  type OracleJsonRpcResponse,
  OracleJsonRpcRequestSchema,
  OracleJsonRpcResponseSchema,
  type OracleMethod
} from "./effect4-oracle-schema.js"

const FINAL_PROTOCOL_VERSION = "2026-07-28"
const LEGACY_PROTOCOL_VERSION = "2025-06-18"
export const LIST_TOOLS_REQUEST_ID = 2
const LIST_RESOURCE_TEMPLATES_REQUEST_ID = 3
const MISSING_ARGUMENTS_REQUEST_ID = 4
const EXTRA_ARGUMENTS_REQUEST_ID = 5
const UNKNOWN_TOOL_REQUEST_ID = 6
const LIST_RESOURCES_REQUEST_ID = 7
const PACKAGE_VERSION_PLACEHOLDER = "<package-version>"
const SERVER_INFO_META_KEY = "io.modelcontextprotocol/serverInfo"

const meta = {
  "io.modelcontextprotocol/protocolVersion": FINAL_PROTOCOL_VERSION,
  "io.modelcontextprotocol/clientCapabilities": {},
  "io.modelcontextprotocol/clientInfo": { name: "effect-migration-oracle", version: "1.0.0" }
}

const request = (id: number, method: OracleMethod, params: Readonly<Record<string, unknown>>): OracleJsonRpcRequest =>
  Schema.decodeUnknownSync(OracleJsonRpcRequestSchema)({
    id,
    jsonrpc: "2.0",
    method,
    params: { ...params, _meta: meta }
  })

const stdioRequests = (): ReadonlyArray<OracleJsonRpcRequest> => [
  request(1, "server/discover", {}),
  request(LIST_TOOLS_REQUEST_ID, "tools/list", {}),
  request(LIST_RESOURCE_TEMPLATES_REQUEST_ID, "resources/templates/list", {}),
  request(MISSING_ARGUMENTS_REQUEST_ID, "tools/call", { name: "get_issue" }),
  request(EXTRA_ARGUMENTS_REQUEST_ID, "tools/call", { name: "get_version", arguments: { extra: true } }),
  request(UNKNOWN_TOOL_REQUEST_ID, "tools/call", { name: "not_a_huly_tool", arguments: {} }),
  request(LIST_RESOURCES_REQUEST_ID, "resources/list", {})
]

export const oracleStdioInput = (): string =>
  `${stdioRequests()
    .map((entry) => JSON.stringify(Schema.encodeSync(OracleJsonRpcRequestSchema)(entry)))
    .join("\n")}\n`

export const oracleLegacyStdioInput = (): string =>
  `${[
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: LEGACY_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "effect-migration-oracle", version: "1.0.0" }
      }
    },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: LIST_TOOLS_REQUEST_ID, method: "tools/list", params: {} }
  ]
    .map((message) => JSON.stringify(message))
    .join("\n")}\n`

const isJsonRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const normalizeServerVersion = (response: OracleJsonRpcResponse): OracleJsonRpcResponse => {
  if (!isJsonRecord(response.result)) return response
  const directServerInfo = response.result.serverInfo
  if (isJsonRecord(directServerInfo) && typeof directServerInfo.version === "string") {
    return Schema.decodeUnknownSync(OracleJsonRpcResponseSchema)({
      ...response,
      result: { ...response.result, serverInfo: { ...directServerInfo, version: PACKAGE_VERSION_PLACEHOLDER } }
    })
  }
  const metadata = response.result._meta
  if (!isJsonRecord(metadata)) return response
  const serverInfo = metadata[SERVER_INFO_META_KEY]
  if (!isJsonRecord(serverInfo) || typeof serverInfo.version !== "string") return response
  return Schema.decodeUnknownSync(OracleJsonRpcResponseSchema)({
    ...response,
    result: {
      ...response.result,
      _meta: { ...metadata, [SERVER_INFO_META_KEY]: { ...serverInfo, version: PACKAGE_VERSION_PLACEHOLDER } }
    }
  })
}

export const decodeOracleStdioResponses = (stdout: string): ReadonlyArray<OracleJsonRpcResponse> =>
  stdout
    .trim()
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => Schema.decodeUnknownSync(Schema.fromJsonString(OracleJsonRpcResponseSchema))(line))
    .map(normalizeServerVersion)

export const requireSuccessfulOracleProcess = (label: string, result: CapturedProcessResult): CapturedProcessResult => {
  if (result.exitCode !== 0 || result.stderr !== "") {
    throw new Error(`${label} failed with exit ${result.exitCode}: ${result.stderr}`)
  }
  return result
}

export const normalizeOracleCliVersion = (result: CapturedProcessResult): CapturedProcessResult => ({
  exitCode: result.exitCode,
  stderr: result.stderr,
  stdout: result.stdout.replace(/^Huly CLI [^\n]+/u, `Huly CLI ${PACKAGE_VERSION_PLACEHOLDER}`)
})
