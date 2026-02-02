/**
 * MCP Server infrastructure for Huly MCP server.

 * @module
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import type { ParseResult } from "effect"
import { Context, Effect, Exit, Layer, Ref, Schema } from "effect"

import { HttpServerFactoryService, HttpTransportError, startHttpTransport } from "./http-transport.js"

import {
  addLabelParamsJsonSchema,
  createDocumentParamsJsonSchema,
  createIssueParamsJsonSchema,
  deleteDocumentParamsJsonSchema,
  deleteIssueParamsJsonSchema,
  getDocumentParamsJsonSchema,
  getIssueParamsJsonSchema,
  listDocumentsParamsJsonSchema,
  listIssuesParamsJsonSchema,
  listProjectsParamsJsonSchema,
  listTeamspacesParamsJsonSchema,
  parseAddLabelParams,
  parseCreateDocumentParams,
  parseCreateIssueParams,
  parseDeleteDocumentParams,
  parseDeleteIssueParams,
  parseGetDocumentParams,
  parseGetIssueParams,
  parseListDocumentsParams,
  parseListIssuesParams,
  parseListProjectsParams,
  parseListTeamspacesParams,
  parseUpdateDocumentParams,
  parseUpdateIssueParams,
  parseUploadFileParams,
  updateDocumentParamsJsonSchema,
  updateIssueParamsJsonSchema,
  uploadFileParamsJsonSchema
} from "../domain/schemas.js"
import { HulyClient } from "../huly/client.js"
import type { HulyDomainError } from "../huly/errors.js"
import {
  createDocument,
  deleteDocument,
  getDocument,
  listDocuments,
  listTeamspaces,
  updateDocument
} from "../huly/operations/documents.js"
import { addLabel, createIssue, deleteIssue, getIssue, listIssues, updateIssue } from "../huly/operations/issues.js"
import { listProjects } from "../huly/operations/projects.js"
import { uploadFile } from "../huly/operations/storage.js"
import { HulyStorageClient } from "../huly/storage.js"
import {
  createSuccessResponse,
  createUnknownToolError,
  mapDomainCauseToMcp,
  mapParseCauseToMcp,
  type McpToolResponse,
  toMcpResponse
} from "./error-mapping.js"

export type McpTransportType = "stdio" | "http"

export interface McpServerConfig {
  readonly transport: McpTransportType
  readonly httpPort?: number
  readonly httpHost?: string
}

export class McpServerError extends Schema.TaggedError<McpServerError>()(
  "McpServerError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Defect)
  }
) {}

export const TOOL_DEFINITIONS = {
  list_projects: {
    name: "list_projects",
    description: "List all Huly projects. Returns projects sorted by name. Supports filtering by archived status.",
    inputSchema: listProjectsParamsJsonSchema
  },
  list_issues: {
    name: "list_issues",
    description:
      "Query Huly issues with optional filters. Returns issues sorted by modification date (newest first). Supports filtering by project, status, assignee, and milestone.",
    inputSchema: listIssuesParamsJsonSchema
  },
  get_issue: {
    name: "get_issue",
    description:
      "Retrieve full details for a Huly issue including markdown description. Use this to view issue content, comments, or full metadata.",
    inputSchema: getIssueParamsJsonSchema
  },
  create_issue: {
    name: "create_issue",
    description:
      "Create a new issue in a Huly project. Description supports markdown formatting. Returns the created issue identifier.",
    inputSchema: createIssueParamsJsonSchema
  },
  update_issue: {
    name: "update_issue",
    description:
      "Update fields on an existing Huly issue. Only provided fields are modified. Description updates support markdown.",
    inputSchema: updateIssueParamsJsonSchema
  },
  add_issue_label: {
    name: "add_issue_label",
    description: "Add a tag/label to a Huly issue. Creates the tag if it doesn't exist in the project.",
    inputSchema: addLabelParamsJsonSchema
  },
  delete_issue: {
    name: "delete_issue",
    description: "Permanently delete a Huly issue. This action cannot be undone.",
    inputSchema: deleteIssueParamsJsonSchema
  },
  list_teamspaces: {
    name: "list_teamspaces",
    description:
      "List all Huly document teamspaces. Returns teamspaces sorted by name. Supports filtering by archived status.",
    inputSchema: listTeamspacesParamsJsonSchema
  },
  list_documents: {
    name: "list_documents",
    description: "List documents in a Huly teamspace. Returns documents sorted by modification date (newest first).",
    inputSchema: listDocumentsParamsJsonSchema
  },
  get_document: {
    name: "get_document",
    description:
      "Retrieve full details for a Huly document including markdown content. Use this to view document content and metadata.",
    inputSchema: getDocumentParamsJsonSchema
  },
  create_document: {
    name: "create_document",
    description:
      "Create a new document in a Huly teamspace. Content supports markdown formatting. Returns the created document id.",
    inputSchema: createDocumentParamsJsonSchema
  },
  update_document: {
    name: "update_document",
    description:
      "Update fields on an existing Huly document. Only provided fields are modified. Content updates support markdown.",
    inputSchema: updateDocumentParamsJsonSchema
  },
  delete_document: {
    name: "delete_document",
    description: "Permanently delete a Huly document. This action cannot be undone.",
    inputSchema: deleteDocumentParamsJsonSchema
  },
  upload_file: {
    name: "upload_file",
    description:
      "Upload a file to Huly storage. Provide ONE of: filePath (local file - preferred), fileUrl (fetch from URL), or data (base64 - for small files only). Returns blob ID and URL for referencing the file.",
    inputSchema: uploadFileParamsJsonSchema
  }
} as const

type ToolName = keyof typeof TOOL_DEFINITIONS

const ToolNameSchema = Schema.Literal(
  ...Object.keys(TOOL_DEFINITIONS) as [ToolName, ...Array<ToolName>]
)

export interface McpServerOperations {
  /**
   * Start the MCP server and connect to transport.
   * Returns an Effect that completes when the server is stopped.
   */
  readonly run: () => Effect.Effect<void, McpServerError, HttpServerFactoryService>

  /**
   * Stop the MCP server gracefully.
   */
  readonly stop: () => Effect.Effect<void, McpServerError>
}

/**
 * Create a configured MCP Server instance with tool handlers.
 * Used for both stdio and HTTP transports.
 */
export const createMcpServer = (
  hulyClient: HulyClient["Type"],
  storageClient: HulyStorageClient["Type"]
): Server => {
  const server = new Server(
    {
      name: "huly-mcp",
      version: "1.0.0"
    },
    {
      capabilities: {
        tools: {}
      }
    }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: Object.values(TOOL_DEFINITIONS).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as {
        type: "object"
        properties?: Record<string, unknown>
        required?: Array<string>
      }
    }))
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { arguments: args, name } = request.params

    const toolNameResult = Schema.decodeUnknownEither(ToolNameSchema)(name)
    if (toolNameResult._tag === "Left") {
      return toMcpResponse(createUnknownToolError(name))
    }

    const result = await handleToolCall(
      toolNameResult.right,
      args ?? {},
      hulyClient,
      storageClient
    )
    return toMcpResponse(result)
  })

  return server
}

export class McpServerService extends Context.Tag("@hulymcp/McpServer")<
  McpServerService,
  McpServerOperations
>() {
  /**
   * Create the MCP server layer.
   * Requires HulyClient and HulyStorageClient.
   */
  static layer(
    config: McpServerConfig
  ): Layer.Layer<McpServerService, never, HulyClient | HulyStorageClient> {
    return Layer.effect(
      McpServerService,
      Effect.gen(function*() {
        const hulyClient = yield* HulyClient
        const storageClient = yield* HulyStorageClient

        // For stdio, we create a single server instance
        // For HTTP, we create a new server per request (stateless mode)
        const server = config.transport === "stdio" ? createMcpServer(hulyClient, storageClient) : null

        const isRunning = yield* Ref.make(false)

        const operations: McpServerOperations = {
          run: () =>
            Effect.gen(function*() {
              if (yield* Ref.get(isRunning)) {
                return yield* new McpServerError({
                  message: "MCP server is already running"
                })
              }

              yield* Ref.set(isRunning, true)

              if (config.transport === "stdio") {
                const transport = new StdioServerTransport()

                yield* Effect.tryPromise({
                  try: () => server!.connect(transport),
                  catch: (e) =>
                    new McpServerError({
                      message: `Failed to connect stdio transport: ${String(e)}`,
                      cause: e as Error
                    })
                })

                // Keep running until stopped
                yield* Effect.async<void, McpServerError>((resume) => {
                  // Set up signal handlers for graceful shutdown
                  const cleanup = () => {
                    Effect.runSync(Ref.set(isRunning, false))
                    resume(Effect.void)
                  }

                  process.on("SIGINT", cleanup)
                  process.on("SIGTERM", cleanup)

                  // Return cleanup function for when Effect is interrupted
                  return Effect.sync(() => {
                    process.off("SIGINT", cleanup)
                    process.off("SIGTERM", cleanup)
                  })
                })

                yield* Effect.tryPromise({
                  try: () => server!.close(),
                  catch: (e) =>
                    new McpServerError({
                      message: `Failed to close server: ${String(e)}`,
                      cause: e as Error
                    })
                })
              } else if (config.transport === "http") {
                // HTTP transport using Streamable HTTP protocol
                const port = config.httpPort ?? 3000
                const host = config.httpHost ?? "127.0.0.1"

                yield* startHttpTransport(
                  { port, host },
                  () => createMcpServer(hulyClient, storageClient)
                ).pipe(
                  Effect.scoped,
                  Effect.mapError(
                    (e: HttpTransportError) =>
                      new McpServerError({
                        message: e.message,
                        cause: e.cause
                      })
                  )
                )

                yield* Ref.set(isRunning, false)
              }
            }),

          stop: () =>
            Effect.gen(function*() {
              if (!(yield* Ref.get(isRunning))) {
                return
              }

              yield* Ref.set(isRunning, false)

              if (server) {
                yield* Effect.tryPromise({
                  try: () => server.close(),
                  catch: (e) =>
                    new McpServerError({
                      message: `Failed to stop server: ${String(e)}`,
                      cause: e as Error
                    })
                })
              }
            })
        }

        return operations
      })
    )
  }

  /**
   * Create a test layer for unit testing.
   */
  static testLayer(
    mockOperations: Partial<McpServerOperations>
  ): Layer.Layer<McpServerService> {
    const defaultOps: McpServerOperations = {
      run: () => Effect.void,
      stop: () => Effect.void
    }

    return Layer.succeed(McpServerService, { ...defaultOps, ...mockOperations })
  }
}

// --- Tool Handler ---

/**
 * Handle a tool call by routing to the appropriate domain operation.
 * Returns MCP protocol response with proper error codes.
 */
async function handleToolCall(
  toolName: ToolName,
  args: Record<string, unknown>,
  hulyClient: HulyClient["Type"],
  storageClient: HulyStorageClient["Type"]
): Promise<McpToolResponse> {
  switch (toolName) {
    case "list_projects":
      return runToolHandler(
        toolName,
        args,
        parseListProjectsParams,
        (params) => listProjects(params),
        hulyClient
      )

    case "list_issues":
      return runToolHandler(
        toolName,
        args,
        parseListIssuesParams,
        (params) => listIssues(params),
        hulyClient
      )

    case "get_issue":
      return runToolHandler(
        toolName,
        args,
        parseGetIssueParams,
        (params) => getIssue(params),
        hulyClient
      )

    case "create_issue":
      return runToolHandler(
        toolName,
        args,
        parseCreateIssueParams,
        (params) => createIssue(params),
        hulyClient
      )

    case "update_issue":
      return runToolHandler(
        toolName,
        args,
        parseUpdateIssueParams,
        (params) => updateIssue(params),
        hulyClient
      )

    case "add_issue_label":
      return runToolHandler(
        toolName,
        args,
        parseAddLabelParams,
        (params) => addLabel(params),
        hulyClient
      )

    case "delete_issue":
      return runToolHandler(
        toolName,
        args,
        parseDeleteIssueParams,
        (params) => deleteIssue(params),
        hulyClient
      )

    case "list_teamspaces":
      return runToolHandler(
        toolName,
        args,
        parseListTeamspacesParams,
        (params) => listTeamspaces(params),
        hulyClient
      )

    case "list_documents":
      return runToolHandler(
        toolName,
        args,
        parseListDocumentsParams,
        (params) => listDocuments(params),
        hulyClient
      )

    case "get_document":
      return runToolHandler(
        toolName,
        args,
        parseGetDocumentParams,
        (params) => getDocument(params),
        hulyClient
      )

    case "create_document":
      return runToolHandler(
        toolName,
        args,
        parseCreateDocumentParams,
        (params) => createDocument(params),
        hulyClient
      )

    case "update_document":
      return runToolHandler(
        toolName,
        args,
        parseUpdateDocumentParams,
        (params) => updateDocument(params),
        hulyClient
      )

    case "delete_document":
      return runToolHandler(
        toolName,
        args,
        parseDeleteDocumentParams,
        (params) => deleteDocument(params),
        hulyClient
      )

    case "upload_file":
      return runStorageToolHandler(
        toolName,
        args,
        parseUploadFileParams,
        (params) => uploadFile(params),
        storageClient
      )

    default:
      return createUnknownToolError(toolName)
  }
}

// --- Tool Handler Execution ---

/**
 * Execute a tool handler with proper error mapping to MCP protocol.
 * Uses the error-mapping module for consistent error transformation.
 */
async function runToolHandler<A, P>(
  toolName: string,
  args: unknown,
  parse: (input: unknown) => Effect.Effect<P, ParseResult.ParseError>,
  operation: (params: P) => Effect.Effect<A, HulyDomainError, HulyClient>,
  hulyClient: HulyClient["Type"]
): Promise<McpToolResponse> {
  const parseResult = await Effect.runPromiseExit(parse(args))

  if (Exit.isFailure(parseResult)) {
    return mapParseCauseToMcp(parseResult.cause, toolName)
  }

  const params = parseResult.value

  const operationResult = await Effect.runPromiseExit(
    operation(params).pipe(Effect.provideService(HulyClient, hulyClient))
  )

  if (Exit.isFailure(operationResult)) {
    return mapDomainCauseToMcp(operationResult.cause)
  }

  return createSuccessResponse(operationResult.value)
}

/**
 * Execute a storage tool handler with proper error mapping to MCP protocol.
 */
async function runStorageToolHandler<A, P>(
  toolName: string,
  args: unknown,
  parse: (input: unknown) => Effect.Effect<P, ParseResult.ParseError>,
  operation: (params: P) => Effect.Effect<A, HulyDomainError, HulyStorageClient>,
  storageClient: HulyStorageClient["Type"]
): Promise<McpToolResponse> {
  const parseResult = await Effect.runPromiseExit(parse(args))

  if (Exit.isFailure(parseResult)) {
    return mapParseCauseToMcp(parseResult.cause, toolName)
  }

  const params = parseResult.value

  const operationResult = await Effect.runPromiseExit(
    operation(params).pipe(Effect.provideService(HulyStorageClient, storageClient))
  )

  if (Exit.isFailure(operationResult)) {
    return mapDomainCauseToMcp(operationResult.cause)
  }

  return createSuccessResponse(operationResult.value)
}
