import type {
  ListResourcesResult,
  ReadResourceRequestParams,
  ReadResourceResult
} from "@modelcontextprotocol/sdk/types.js"
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js"
import { Cause, Chunk, Effect, Exit, Runtime } from "effect"

import { ConfigValidationError } from "../config/config.js"
import type { ToolWarning } from "../domain/schemas/tool-warnings.js"
import { HulyClient } from "../huly/client.js"
import { Diagnostics, makeDiagnosticsScope } from "../huly/diagnostics.js"
import type { HulyStorageClient } from "../huly/storage.js"
import type { WorkspaceClientOperations } from "../huly/workspace-client.js"
import { listResources, readHulyResource } from "./resources.js"

interface ClientBundle {
  readonly hulyClient: HulyClient["Type"]
  readonly storageClient: HulyStorageClient["Type"]
  readonly workspaceClient?: WorkspaceClientOperations
}

interface ResourceReadRequest {
  readonly params: ReadResourceRequestParams
}

interface ResourceHandlerInput {
  readonly resolveClients: () => Promise<ClientBundle>
  readonly enter: () => void
  readonly leave: () => void
}

const withResourceWarnings = (
  result: ReadResourceResult,
  warnings: ReadonlyArray<ToolWarning>
): ReadResourceResult =>
  warnings.length === 0
    ? result
    : {
      ...result,
      _meta: {
        ...result._meta,
        warnings
      }
    }

const createResourceClientResolutionError = (uri: string, _error: unknown): McpError =>
  new McpError(
    ErrorCode.InternalError,
    `Failed to initialize Huly clients while reading resource "${uri}". Verify Huly URL, workspace, and authentication configuration.`
  )

const createResourceListClientResolutionError = (_error: unknown): McpError =>
  new McpError(
    ErrorCode.InternalError,
    "Failed to initialize Huly clients while listing resources. Verify Huly URL, workspace, and authentication configuration."
  )

const isConfigValidationFailure = (error: unknown): boolean => {
  if (error instanceof ConfigValidationError) return true
  if (!Runtime.isFiberFailure(error)) return false

  return Chunk.toArray(Cause.failures(error[Runtime.FiberFailureCauseId])).some(
    (failure) => failure instanceof ConfigValidationError
  )
}

const resolveResourceClientsOrThrow = async (
  resolveClients: () => Promise<ClientBundle>,
  mapError: (error: unknown) => McpError
): Promise<ClientBundle> => {
  try {
    return await resolveClients()
  } catch (e) {
    throw mapError(e)
  }
}

const throwResourceReadError = (uri: string, cause: Cause.Cause<McpError>): never => {
  const failures = Chunk.toArray(Cause.failures(cause))
  const failure = failures[0]
  if (failure instanceof McpError) throw failure
  throw new McpError(ErrorCode.InternalError, `Failed to read Huly resource "${uri}"`)
}

const throwResourceListError = (cause: Cause.Cause<McpError>): never => {
  const failures = Chunk.toArray(Cause.failures(cause))
  const failure = failures[0]
  if (failure instanceof McpError) throw failure
  throw new McpError(ErrorCode.InternalError, "Failed to list Huly resources")
}

export const createResourceProtocolHandlers = (input: ResourceHandlerInput): {
  readonly listResources: () => Promise<ListResourcesResult>
  readonly readResource: (request: ResourceReadRequest) => Promise<ReadResourceResult>
} => {
  const listResourcesHandler = async (): Promise<ListResourcesResult> => {
    input.enter()
    try {
      let clients: ClientBundle
      try {
        clients = await input.resolveClients()
      } catch (e) {
        if (isConfigValidationFailure(e)) return { resources: [] }
        throw createResourceListClientResolutionError(e)
      }

      const resourceList = await Effect.runPromiseExit(
        listResources().pipe(
          Effect.provideService(HulyClient, clients.hulyClient)
        )
      )
      if (Exit.isSuccess(resourceList)) return resourceList.value
      return throwResourceListError(resourceList.cause)
    } finally {
      input.leave()
    }
  }

  const readResource = async (request: ResourceReadRequest): Promise<ReadResourceResult> => {
    input.enter()
    try {
      const { uri } = request.params
      const clients = await resolveResourceClientsOrThrow(
        input.resolveClients,
        error => createResourceClientResolutionError(uri, error)
      )
      const diagnosticsScope = await Effect.runPromise(makeDiagnosticsScope)
      const resourceRead = await Effect.runPromiseExit(
        readHulyResource(uri).pipe(
          Effect.provideService(HulyClient, clients.hulyClient),
          Effect.provideService(Diagnostics, diagnosticsScope.service)
        )
      )
      const warnings = await Effect.runPromise(diagnosticsScope.drainWarnings)
      if (Exit.isSuccess(resourceRead)) return withResourceWarnings(resourceRead.value, warnings)
      return throwResourceReadError(uri, resourceRead.cause)
    } finally {
      input.leave()
    }
  }

  return {
    listResources: listResourcesHandler,
    readResource
  }
}
