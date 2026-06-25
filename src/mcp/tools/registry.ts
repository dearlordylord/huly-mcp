import type { ParseResult } from "effect"
import { Effect, Either, Exit, Schema } from "effect"

import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js"

import { HulyClient } from "../../huly/client.js"
import { Diagnostics, makeDiagnosticsScope } from "../../huly/diagnostics.js"
import { type HulyDomainError, HulyError } from "../../huly/errors.js"
import { HulyStorageClient } from "../../huly/storage.js"
import { WorkspaceClient, type WorkspaceClientOperations } from "../../huly/workspace-client.js"
import {
  createInvalidParamsError,
  createSuccessResponse,
  mapDomainCauseToMcp,
  mapDomainErrorToMcp,
  mapParseCauseToMcp,
  type McpToolResponse
} from "../error-mapping.js"
import { createToolOutputSchema, type McpOutputSchema } from "../tool-output-schema.js"

export const ToolName = Schema.NonEmptyTrimmedString.pipe(Schema.brand("ToolName")).annotations({
  identifier: "ToolName",
  title: "ToolName",
  description: "Exact MCP tool name registered by this server."
})
export type ToolName = Schema.Schema.Type<typeof ToolName>

export const ToolDescription = Schema.NonEmptyTrimmedString.pipe(Schema.brand("ToolDescription")).annotations({
  identifier: "ToolDescription",
  title: "ToolDescription",
  description: "Human-readable MCP tool description."
})
export type ToolDescription = Schema.Schema.Type<typeof ToolDescription>

export const ToolCategory = Schema.NonEmptyTrimmedString.pipe(Schema.brand("ToolCategory")).annotations({
  identifier: "ToolCategory",
  title: "ToolCategory",
  description: "MCP tool category used for toolset filtering and proxy discovery."
})
export type ToolCategory = Schema.Schema.Type<typeof ToolCategory>

export const makeToolName = (value: string): ToolName => ToolName.make(value)
export const makeToolDescription = (value: string): ToolDescription => ToolDescription.make(value)
export const makeToolCategory = (value: string): ToolCategory => ToolCategory.make(value)

export const parseToolName = (input: unknown): ToolName | undefined => {
  const decoded = Schema.decodeUnknownEither(ToolName)(input)
  return Either.isRight(decoded) ? decoded.right : undefined
}

export interface ToolDefinition {
  readonly name: ToolName
  readonly description: ToolDescription
  readonly inputSchema: object
  readonly outputSchema: McpOutputSchema
  readonly category: ToolCategory
  readonly annotations?: ToolAnnotations
}

// Raw static declaration input. createToolDefinition parses these literals into
// branded ToolDefinition metadata before any registry/listing/call path sees them.
interface ToolDefinitionSpec {
  readonly name: string
  readonly description: string
  readonly inputSchema: object
  readonly outputSchema: McpOutputSchema
  readonly category: string
  readonly annotations?: ToolAnnotations
}

export const createToolDefinition = (spec: ToolDefinitionSpec): ToolDefinition => ({
  name: makeToolName(spec.name),
  description: makeToolDescription(spec.description),
  inputSchema: spec.inputSchema,
  outputSchema: spec.outputSchema,
  category: makeToolCategory(spec.category),
  ...(spec.annotations === undefined ? {} : { annotations: spec.annotations })
})

const deriveTitle = (name: ToolName): string =>
  name.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")

const READ_PREFIXES = ["list_", "get_", "describe_", "search_", "fulltext_", "download_", "preview_"]
const CREATE_PREFIXES = ["create_", "add_", "upload_", "send_", "log_"]
const UPDATE_PREFIXES = [
  "update_",
  "edit_",
  "set_",
  "approve_",
  "reject_",
  "cancel_",
  "pin_",
  "unpin_",
  "mark_",
  "archive_",
  "start_",
  "stop_",
  "save_",
  "unsave_",
  "remove_",
  "move_"
]
const DELETE_PREFIXES = ["delete_"]

const matchesPrefix = (name: ToolName, prefixes: ReadonlyArray<string>): boolean =>
  prefixes.some((p) => name.startsWith(p))

const deriveAnnotations = (name: ToolName): ToolAnnotations => {
  const title = deriveTitle(name)

  if (matchesPrefix(name, READ_PREFIXES)) {
    return { title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }
  if (matchesPrefix(name, CREATE_PREFIXES)) {
    return { title, readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  }
  if (matchesPrefix(name, UPDATE_PREFIXES)) {
    return { title, readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }
  if (matchesPrefix(name, DELETE_PREFIXES)) {
    return { title, readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }
  }
  return { title, readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }
}

export const resolveAnnotations = (tool: ToolDefinition): ToolAnnotations => ({
  ...deriveAnnotations(tool.name),
  ...tool.annotations
})

export interface RegisteredTool extends ToolDefinition {
  readonly handler: (
    args: unknown,
    hulyClient: HulyClient["Type"],
    storageClient: HulyStorageClient["Type"],
    workspaceClient?: WorkspaceClientOperations
  ) => Promise<McpToolResponse>
}

export const createMissingArgumentsError = (toolName: ToolName): McpToolResponse =>
  createInvalidParamsError(
    `Invalid parameters for ${toolName}: missing arguments object. Pass an arguments object; use {} when you want defaults for optional parameters.`,
    "MissingArguments"
  )

export const createUnexpectedArgumentsError = (toolName: ToolName): McpToolResponse =>
  createInvalidParamsError(
    `Invalid parameters for ${toolName}: this tool does not accept arguments. Pass {} or omit arguments.`,
    "UnexpectedArguments"
  )

export const isEmptyArgumentsObject = (args: unknown): boolean =>
  args === undefined
  || (typeof args === "object" && args !== null && !Array.isArray(args) && Object.keys(args).length === 0)

interface ToolInputSchema {
  readonly properties?: Record<string, unknown>
  readonly required?: ReadonlyArray<string>
  readonly anyOf?: ReadonlyArray<ToolInputSchemaVariant>
  readonly oneOf?: ReadonlyArray<ToolInputSchemaVariant>
  readonly additionalProperties?: unknown
}

interface ToolInputSchemaVariant {
  readonly properties?: Record<string, unknown>
  readonly required?: ReadonlyArray<string>
  readonly type?: unknown
}

const isToolInputSchema = (schema: object): schema is ToolInputSchema => typeof schema === "object"

const hasRequiredFields = (schema: ToolInputSchemaVariant): boolean => (schema.required?.length ?? 0) > 0

const hasDeclaredProperties = (schema: ToolInputSchemaVariant): boolean =>
  Object.keys(schema.properties ?? {}).length > 0

const unionVariants = (schema: ToolInputSchema): ReadonlyArray<ToolInputSchemaVariant> => [
  ...(schema.anyOf ?? []),
  ...(schema.oneOf ?? [])
]

const EMPTY_EFFECT_STRUCT_VARIANT_COUNT = 2

const isEmptySchemaVariant = (schema: ToolInputSchemaVariant): boolean =>
  !hasRequiredFields(schema) && !hasDeclaredProperties(schema)

/**
 * Effect encodes a no-argument tool's empty `Schema.Struct({})` as a two-variant
 * union — an empty `object` and an empty `array`, neither carrying properties or
 * required fields. We detect that exact shape so such tools count as no-argument
 * (callable with no input) instead of demanding an arguments object.
 *
 * This is coupled to Effect's JSON Schema output: if a future Effect version
 * changes how it encodes empty structs, the "classifies empty Effect Struct union
 * schemas" property in `test/mcp/registry.property.test.ts` fails loudly rather
 * than this silently misclassifying tools.
 */
const isEmptyStructUnionSchema = (schema: ToolInputSchema): boolean => {
  const variants = unionVariants(schema)
  const types = new Set(variants.map((variant) => variant.type))

  return variants.length === EMPTY_EFFECT_STRUCT_VARIANT_COUNT
    && isEmptySchemaVariant(schema)
    && variants.every(isEmptySchemaVariant)
    && types.has("object")
    && types.has("array")
}

export const requiresArgumentsObject = (tool: ToolDefinition): boolean =>
  isToolInputSchema(tool.inputSchema)
  && (
    hasRequiredFields(tool.inputSchema)
    || unionVariants(tool.inputSchema).some(hasRequiredFields)
  )

export const isNoArgumentTool = (tool: ToolDefinition): boolean =>
  isToolInputSchema(tool.inputSchema) && !requiresArgumentsObject(tool)
  && (
    (!hasDeclaredProperties(tool.inputSchema) && tool.inputSchema.additionalProperties === false)
    || isEmptyStructUnionSchema(tool.inputSchema)
  )

const encodeOutput = (schema: Schema.Schema.AnyNoContext, result: unknown): unknown =>
  Schema.encodeUnknownSync(schema)(result)

type ResultSchema = Schema.Schema.AnyNoContext

type SchemaResult<S extends ResultSchema> = Schema.Schema.Type<S>

// Authoring shape for static tool declarations. The registry parses this into
// branded ToolDefinition metadata once, before tools can be listed or invoked.
interface ToolSpec<S extends ResultSchema> {
  readonly name: string
  readonly description: string
  readonly inputSchema: object
  readonly resultSchema: S
  readonly category: string
  readonly annotations?: ToolAnnotations
}

const stripResultSchema = <S extends ResultSchema>(
  spec: ToolSpec<S>
): ToolDefinition =>
  createToolDefinition({
    name: spec.name,
    description: spec.description,
    inputSchema: spec.inputSchema,
    outputSchema: createToolOutputSchema(spec.resultSchema),
    category: spec.category,
    ...(spec.annotations === undefined ? {} : { annotations: spec.annotations })
  })

interface HandlerArgs {
  readonly hulyClient: HulyClient["Type"]
  readonly storageClient: HulyStorageClient["Type"]
  readonly workspaceClient: WorkspaceClientOperations | undefined
}

type ProvideServices<R> = (
  args: HandlerArgs
) => <A, E, Remainder>(
  effect: Effect.Effect<A, E, R | Remainder>
) => Either.Either<Effect.Effect<A, E, Remainder>, McpToolResponse>

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
  operation: (params: P) => Effect.Effect<R, HulyDomainError, Svc | Diagnostics>,
  encode: (result: R) => unknown
): RegisteredTool["handler"] =>
async (args, hulyClient, storageClient, workspaceClient) => {
  const parseResult = await Effect.runPromiseExit(parse(args))

  if (Exit.isFailure(parseResult)) {
    return mapParseCauseToMcp(parseResult.cause, toolName)
  }

  const diagnosticsScope = await Effect.runPromise(makeDiagnosticsScope)
  const provided = provide({
    hulyClient,
    storageClient,
    workspaceClient
  })(operation(parseResult.value))

  if (Either.isLeft(provided)) {
    return provided.left
  }

  const operationResult = await Effect.runPromiseExit(
    provided.right.pipe(Effect.provideService(Diagnostics, diagnosticsScope.service))
  )
  const warnings = await Effect.runPromise(diagnosticsScope.drainWarnings)

  if (Exit.isFailure(operationResult)) {
    return mapDomainCauseToMcp(operationResult.cause, warnings)
  }

  try {
    const output = encode(operationResult.value)
    return createSuccessResponse(output, warnings)
  } catch {
    return mapDomainErrorToMcp(new HulyError({ message: `Tool ${toolName} produced invalid output` }), warnings)
  }
}

const defineProvidedTool = <P, Svc, S extends ResultSchema>(
  spec: ToolSpec<S>,
  provide: ProvideServices<Svc>,
  parse: (input: unknown) => Effect.Effect<P, ParseResult.ParseError>,
  operation: (params: P) => Effect.Effect<SchemaResult<S>, HulyDomainError, Svc | Diagnostics>
): RegisteredTool => ({
  ...stripResultSchema(spec),
  handler: createHandler(
    spec.name,
    provide,
    parse,
    operation,
    (result) => encodeOutput(spec.resultSchema, result)
  )
})

export const defineTool = <P, S extends ResultSchema>(
  spec: ToolSpec<S>,
  parse: (input: unknown) => Effect.Effect<P, ParseResult.ParseError>,
  operation: (params: P) => Effect.Effect<SchemaResult<S>, HulyDomainError, HulyClient | Diagnostics>
): RegisteredTool => defineProvidedTool(spec, provideHulyClient, parse, operation)

export const defineStorageTool = <P, S extends ResultSchema>(
  spec: ToolSpec<S>,
  parse: (input: unknown) => Effect.Effect<P, ParseResult.ParseError>,
  operation: (params: P) => Effect.Effect<SchemaResult<S>, HulyDomainError, HulyStorageClient | Diagnostics>
): RegisteredTool => defineProvidedTool(spec, provideStorageClient, parse, operation)

export const defineCombinedTool = <P, S extends ResultSchema>(
  spec: ToolSpec<S>,
  parse: (input: unknown) => Effect.Effect<P, ParseResult.ParseError>,
  operation: (
    params: P
  ) => Effect.Effect<SchemaResult<S>, HulyDomainError, HulyClient | HulyStorageClient | Diagnostics>
): RegisteredTool => defineProvidedTool(spec, provideCombinedClient, parse, operation)

export const defineWorkspaceTool = <P, S extends ResultSchema>(
  spec: ToolSpec<S>,
  parse: (input: unknown) => Effect.Effect<P, ParseResult.ParseError>,
  operation: (params: P) => Effect.Effect<SchemaResult<S>, HulyDomainError, WorkspaceClient | Diagnostics>
): RegisteredTool => defineProvidedTool(spec, provideWorkspaceClient, parse, operation)

export const defineNoParamsWorkspaceTool = <S extends ResultSchema>(
  spec: Omit<ToolSpec<S>, "inputSchema"> & { readonly inputSchema: object },
  operation: () => Effect.Effect<SchemaResult<S>, HulyDomainError, WorkspaceClient | Diagnostics>
): RegisteredTool =>
  defineProvidedTool(
    spec,
    provideWorkspaceClient,
    () => Effect.succeed(undefined),
    operation
  )
