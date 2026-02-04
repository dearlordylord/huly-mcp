import type { ParseResult } from "effect"
import { Effect, Exit } from "effect"

import { HulyClient } from "../../huly/client.js"
import type { HulyDomainError } from "../../huly/errors.js"
import { HulyStorageClient } from "../../huly/storage.js"
import { WorkspaceClient, type WorkspaceClientError } from "../../huly/workspace-client.js"
import {
  createSuccessResponse,
  mapDomainCauseToMcp,
  mapParseCauseToMcp,
  type McpToolResponse
} from "../error-mapping.js"

export interface ToolDefinition {
  readonly name: string
  readonly description: string
  readonly inputSchema: object
}

export interface RegisteredTool extends ToolDefinition {
  readonly handler: (
    args: unknown,
    hulyClient: HulyClient["Type"],
    storageClient: HulyStorageClient["Type"],
    workspaceClient?: WorkspaceClient["Type"]
  ) => Promise<McpToolResponse>
}

export const createToolHandler = <P, R>(
  toolName: string,
  parse: (input: unknown) => Effect.Effect<P, ParseResult.ParseError>,
  operation: (params: P) => Effect.Effect<R, HulyDomainError, HulyClient>
): RegisteredTool["handler"] => {
  return async (args, hulyClient, _storageClient) => {
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
}

export const createStorageToolHandler = <P, R>(
  toolName: string,
  parse: (input: unknown) => Effect.Effect<P, ParseResult.ParseError>,
  operation: (params: P) => Effect.Effect<R, HulyDomainError, HulyStorageClient>
): RegisteredTool["handler"] => {
  return async (args, _hulyClient, storageClient) => {
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
}

export const createCombinedToolHandler = <P, R>(
  toolName: string,
  parse: (input: unknown) => Effect.Effect<P, ParseResult.ParseError>,
  operation: (params: P) => Effect.Effect<R, HulyDomainError, HulyClient | HulyStorageClient>
): RegisteredTool["handler"] => {
  return async (args, hulyClient, storageClient) => {
    const parseResult = await Effect.runPromiseExit(parse(args))

    if (Exit.isFailure(parseResult)) {
      return mapParseCauseToMcp(parseResult.cause, toolName)
    }

    const params = parseResult.value

    const operationResult = await Effect.runPromiseExit(
      operation(params).pipe(
        Effect.provideService(HulyClient, hulyClient),
        Effect.provideService(HulyStorageClient, storageClient)
      )
    )

    if (Exit.isFailure(operationResult)) {
      return mapDomainCauseToMcp(operationResult.cause)
    }

    return createSuccessResponse(operationResult.value)
  }
}

export const createWorkspaceToolHandler = <P, R>(
  toolName: string,
  parse: (input: unknown) => Effect.Effect<P, ParseResult.ParseError>,
  operation: (params: P) => Effect.Effect<R, WorkspaceClientError, WorkspaceClient>
): RegisteredTool["handler"] => {
  return async (args, _hulyClient, _storageClient, workspaceClient) => {
    const parseResult = await Effect.runPromiseExit(parse(args))

    if (Exit.isFailure(parseResult)) {
      return mapParseCauseToMcp(parseResult.cause, toolName)
    }

    const params = parseResult.value

    if (!workspaceClient) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: "WorkspaceClient not available" }]
      }
    }

    const operationResult = await Effect.runPromiseExit(
      operation(params).pipe(Effect.provideService(WorkspaceClient, workspaceClient))
    )

    if (Exit.isFailure(operationResult)) {
      return mapDomainCauseToMcp(operationResult.cause)
    }

    return createSuccessResponse(operationResult.value)
  }
}

export const createNoParamsWorkspaceToolHandler = <R>(
  _toolName: string,
  operation: () => Effect.Effect<R, WorkspaceClientError, WorkspaceClient>
): RegisteredTool["handler"] => {
  return async (_args, _hulyClient, _storageClient, workspaceClient) => {
    if (!workspaceClient) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: "WorkspaceClient not available" }]
      }
    }

    const operationResult = await Effect.runPromiseExit(
      operation().pipe(Effect.provideService(WorkspaceClient, workspaceClient))
    )

    if (Exit.isFailure(operationResult)) {
      return mapDomainCauseToMcp(operationResult.cause)
    }

    return createSuccessResponse(operationResult.value)
  }
}
