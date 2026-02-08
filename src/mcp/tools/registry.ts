import type { ParseResult } from "effect"
import { Effect, Either, Exit } from "effect"

import { HulyClient } from "../../huly/client.js"
import { type HulyDomainError, HulyError } from "../../huly/errors.js"
import { HulyStorageClient } from "../../huly/storage.js"
import { WorkspaceClient, type WorkspaceClientOperations } from "../../huly/workspace-client.js"
import {
  createSuccessResponse,
  mapDomainCauseToMcp,
  mapDomainErrorToMcp,
  mapParseCauseToMcp,
  type McpToolResponse
} from "../error-mapping.js"

export interface ToolDefinition {
  readonly name: string
  readonly description: string
  readonly inputSchema: object
  readonly category: string
}

export interface RegisteredTool extends ToolDefinition {
  readonly handler: (
    args: unknown,
    hulyClient: HulyClient["Type"],
    storageClient: HulyStorageClient["Type"],
    workspaceClient?: WorkspaceClientOperations
  ) => Promise<McpToolResponse>
}

interface HandlerArgs {
  readonly hulyClient: HulyClient["Type"]
  readonly storageClient: HulyStorageClient["Type"]
  readonly workspaceClient: WorkspaceClientOperations | undefined
}

type ProvideServices<R> = (
  args: HandlerArgs
) => <A, E>(effect: Effect.Effect<A, E, R>) => Either.Either<Effect.Effect<A, E>, McpToolResponse>

const provideHulyClient: ProvideServices<HulyClient> = (args) => (effect) =>
  Either.right(effect.pipe(Effect.provideService(HulyClient, args.hulyClient)))

const provideStorageClient: ProvideServices<HulyStorageClient> = (args) => (effect) =>
  Either.right(effect.pipe(Effect.provideService(HulyStorageClient, args.storageClient)))

const provideCombinedClient: ProvideServices<HulyClient | HulyStorageClient> = (args) => (effect) =>
  Either.right(
    effect.pipe(
      Effect.provideService(HulyClient, args.hulyClient),
      Effect.provideService(HulyStorageClient, args.storageClient)
    )
  )

const provideWorkspaceClient: ProvideServices<WorkspaceClient> = (args) => (effect) =>
  args.workspaceClient !== undefined
    ? Either.right(effect.pipe(Effect.provideService(WorkspaceClient, args.workspaceClient)))
    : Either.left(mapDomainErrorToMcp(new HulyError({ message: "WorkspaceClient not available" })))

const createHandler = <P, Svc, R>(
  toolName: string,
  provide: ProvideServices<Svc>,
  parse: (input: unknown) => Effect.Effect<P, ParseResult.ParseError>,
  operation: (params: P) => Effect.Effect<R, HulyDomainError, Svc>
): RegisteredTool["handler"] =>
async (args, hulyClient, storageClient, workspaceClient) => {
  const parseResult = await Effect.runPromiseExit(parse(args))

  if (Exit.isFailure(parseResult)) {
    return mapParseCauseToMcp(parseResult.cause, toolName)
  }

  const provided = provide({ hulyClient, storageClient, workspaceClient })(operation(parseResult.value))

  if (Either.isLeft(provided)) {
    return provided.left
  }

  const operationResult = await Effect.runPromiseExit(provided.right)

  if (Exit.isFailure(operationResult)) {
    return mapDomainCauseToMcp(operationResult.cause)
  }

  return createSuccessResponse(operationResult.value)
}

export const createToolHandler = <P, R>(
  toolName: string,
  parse: (input: unknown) => Effect.Effect<P, ParseResult.ParseError>,
  operation: (params: P) => Effect.Effect<R, HulyDomainError, HulyClient>
): RegisteredTool["handler"] => createHandler(toolName, provideHulyClient, parse, operation)

export const createStorageToolHandler = <P, R>(
  toolName: string,
  parse: (input: unknown) => Effect.Effect<P, ParseResult.ParseError>,
  operation: (params: P) => Effect.Effect<R, HulyDomainError, HulyStorageClient>
): RegisteredTool["handler"] => createHandler(toolName, provideStorageClient, parse, operation)

export const createCombinedToolHandler = <P, R>(
  toolName: string,
  parse: (input: unknown) => Effect.Effect<P, ParseResult.ParseError>,
  operation: (params: P) => Effect.Effect<R, HulyDomainError, HulyClient | HulyStorageClient>
): RegisteredTool["handler"] => createHandler(toolName, provideCombinedClient, parse, operation)

export const createWorkspaceToolHandler = <P, R>(
  toolName: string,
  parse: (input: unknown) => Effect.Effect<P, ParseResult.ParseError>,
  operation: (params: P) => Effect.Effect<R, HulyDomainError, WorkspaceClient>
): RegisteredTool["handler"] => createHandler(toolName, provideWorkspaceClient, parse, operation)

export const createNoParamsWorkspaceToolHandler = <R>(
  operation: () => Effect.Effect<R, HulyDomainError, WorkspaceClient>
): RegisteredTool["handler"] => createHandler("", provideWorkspaceClient, () => Effect.succeed(undefined), operation)
