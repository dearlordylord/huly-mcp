import { Effect, Exit, Result, Schema } from "effect"
import type { ToolAnnotations } from "@modelcontextprotocol/server"
import type { ToolWarning } from "../../domain/schemas/tool-warnings.js"
import { HulyClient } from "../../huly/client.js"
import { Diagnostics, makeDiagnosticsScope } from "../../huly/diagnostics.js"
import { type HulyDomainError, HulyError } from "../../huly/errors.js"
import { HulyStorageClient } from "../../huly/storage.js"
import { WorkspaceClient, type WorkspaceClientOperations } from "../../huly/workspace-client.js"
import {
  createImageSuccessResponse,
  createInvalidParamsError,
  createSuccessResponse,
  mapDomainCauseToMcp,
  mapDomainErrorToMcp,
  mapParseCauseToMcp,
  type McpImageContent,
  type McpToolResponse
} from "../error-mapping.js"
import { createToolOutputSchema, type McpOutputSchema } from "../tool-output-schema.js"
import {
  ToolDomainFailure,
  ToolOutputFailure,
  type ToolOperationFailure,
  ToolParseFailure,
  ToolProvisionFailure
} from "./operation-failure.js"
export type { OperationFailureDescription, OperationFailureKind, ToolOperationFailure } from "./operation-failure.js"
export { describeOperationFailure, formatOperationFailure } from "./operation-failure.js"
export { resolveAnnotations } from "./tool-annotations.js"

const ToolMetadataText = Schema.Trimmed.pipe(Schema.check(Schema.isNonEmpty()))

export const ToolName = ToolMetadataText.pipe(
  Schema.brand("ToolName"),
  Schema.annotate({
    identifier: "ToolName",
    title: "ToolName",
    description: "Exact MCP tool name registered by this server."
  })
)
export type ToolName = Schema.Schema.Type<typeof ToolName>

export const ToolDescription = ToolMetadataText.pipe(
  Schema.brand("ToolDescription"),
  Schema.annotate({
    identifier: "ToolDescription",
    title: "ToolDescription",
    description: "Human-readable MCP tool description."
  })
)
export type ToolDescription = Schema.Schema.Type<typeof ToolDescription>

export const ToolCategory = ToolMetadataText.pipe(
  Schema.brand("ToolCategory"),
  Schema.annotate({
    identifier: "ToolCategory",
    title: "ToolCategory",
    description: "MCP tool category used for toolset filtering and proxy discovery."
  })
)
export type ToolCategory = Schema.Schema.Type<typeof ToolCategory>

export const makeToolName = (value: string): ToolName => ToolName.make(value)
export const makeToolDescription = (value: string): ToolDescription => ToolDescription.make(value)
export const makeToolCategory = (value: string): ToolCategory => ToolCategory.make(value)

export const parseToolName = (input: unknown): ToolName | undefined => {
  const decoded = Schema.decodeUnknownResult(ToolName)(input)
  return Result.isSuccess(decoded) ? decoded.success : undefined
}

export interface ToolDefinition<Name extends string = string> {
  readonly name: Name
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
  name: spec.name,
  description: makeToolDescription(spec.description),
  inputSchema: spec.inputSchema,
  outputSchema: spec.outputSchema,
  category: makeToolCategory(spec.category),
  ...(spec.annotations === undefined ? {} : { annotations: spec.annotations })
})

export type RegisteredTool<Name extends string = string> = ToolDefinition<Name> & {
  readonly operation: RegisteredOperation<Name>
  readonly handler: (
    args: unknown,
    hulyClient: HulyClient["Service"],
    storageClient: HulyStorageClient["Service"],
    workspaceClient?: WorkspaceClientOperations
  ) => Promise<McpToolResponse>
}

interface ToolOperationSuccessBase {
  readonly result: unknown
  readonly warnings: ReadonlyArray<ToolWarning>
}
export type ToolOperationSuccess = ToolOperationSuccessBase &
  ({ readonly image?: never } | { readonly image: McpImageContent })

interface RegisteredOperation<Name extends string = string> extends ToolDefinition<Name> {
  readonly execute: (
    args: unknown,
    hulyClient: HulyClient["Service"],
    storageClient: HulyStorageClient["Service"],
    workspaceClient?: WorkspaceClientOperations
  ) => Effect.Effect<ToolOperationSuccess, ToolOperationFailure>
}

export const createMissingArgumentsError = (toolName: string): McpToolResponse =>
  createInvalidParamsError(
    `Invalid parameters for ${toolName}: missing arguments object. Pass an arguments object; use {} when you want defaults for optional parameters.`,
    "MissingArguments"
  )

export const createUnexpectedArgumentsError = (toolName: string): McpToolResponse =>
  createInvalidParamsError(
    `Invalid parameters for ${toolName}: this tool does not accept arguments. Pass {} or omit arguments.`,
    "UnexpectedArguments"
  )

export const isEmptyArgumentsObject = (args: unknown): boolean =>
  args === undefined ||
  (typeof args === "object" && args !== null && !Array.isArray(args) && Object.keys(args).length === 0)

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

  return (
    variants.length === EMPTY_EFFECT_STRUCT_VARIANT_COUNT &&
    isEmptySchemaVariant(schema) &&
    variants.every(isEmptySchemaVariant) &&
    types.has("object") &&
    types.has("array")
  )
}

export const requiresArgumentsObject = (tool: ToolDefinition): boolean =>
  isToolInputSchema(tool.inputSchema) &&
  (hasRequiredFields(tool.inputSchema) || unionVariants(tool.inputSchema).some(hasRequiredFields))

export const isNoArgumentTool = (tool: ToolDefinition): boolean =>
  isToolInputSchema(tool.inputSchema) &&
  !requiresArgumentsObject(tool) &&
  ((!hasDeclaredProperties(tool.inputSchema) && tool.inputSchema.additionalProperties === false) ||
    isEmptyStructUnionSchema(tool.inputSchema))

const encodeOutput = (schema: Schema.ConstraintEncoder<unknown>, result: unknown): unknown =>
  Schema.encodeUnknownSync(schema)(result)

type ResultSchema = Schema.ConstraintEncoder<unknown>

type SchemaResult<S extends ResultSchema> = Schema.Schema.Type<S>

interface ToolSpec<Name extends string, S extends ResultSchema> {
  readonly name: Name
  readonly description: string
  readonly inputSchema: object
  readonly resultSchema: S
  readonly category: string
  readonly annotations?: ToolAnnotations
}

const stripResultSchema = <Name extends string, S extends ResultSchema>(
  spec: ToolSpec<Name, S>
): ToolDefinition<Name> => ({
  name: spec.name,
  description: makeToolDescription(spec.description),
  inputSchema: spec.inputSchema,
  outputSchema: createToolOutputSchema(spec.resultSchema),
  category: makeToolCategory(spec.category),
  ...(spec.annotations === undefined ? {} : { annotations: spec.annotations })
})

interface HandlerArgs {
  readonly hulyClient: HulyClient["Service"]
  readonly storageClient: HulyStorageClient["Service"]
  readonly workspaceClient: WorkspaceClientOperations | undefined
}

type ProvideServices<R> = (
  args: HandlerArgs
) => <A, E, Remainder>(
  effect: Effect.Effect<A, E, R | Remainder>
) => Result.Result<Effect.Effect<A, E, Remainder>, HulyDomainError>

const provideHulyClient: ProvideServices<HulyClient> = (args) => (effect) =>
  Result.succeed(effect.pipe(Effect.provideService(HulyClient, args.hulyClient)))

const provideStorageClient: ProvideServices<HulyStorageClient> = (args) => (effect) =>
  Result.succeed(effect.pipe(Effect.provideService(HulyStorageClient, args.storageClient)))

const provideCombinedClient: ProvideServices<HulyClient | HulyStorageClient> = (args) => (effect) =>
  Result.succeed(
    effect.pipe(
      Effect.provideService(HulyClient, args.hulyClient),
      Effect.provideService(HulyStorageClient, args.storageClient)
    )
  )

const provideHulyWorkspaceClient: ProvideServices<HulyClient | WorkspaceClient> = (args) => (effect) =>
  args.workspaceClient === undefined
    ? Result.fail(new HulyError({ message: "WorkspaceClient not available" }))
    : Result.succeed(
        effect.pipe(
          Effect.provideService(HulyClient, args.hulyClient),
          Effect.provideService(WorkspaceClient, args.workspaceClient)
        )
      )

const provideWorkspaceClient: ProvideServices<WorkspaceClient> = (args) => (effect) =>
  args.workspaceClient !== undefined
    ? Result.succeed(effect.pipe(Effect.provideService(WorkspaceClient, args.workspaceClient)))
    : Result.fail(new HulyError({ message: "WorkspaceClient not available" }))

const createOperationExecutor =
  <P, Svc, R>(
    toolName: string,
    provide: ProvideServices<Svc>,
    parse: (input: unknown) => Effect.Effect<P, Schema.SchemaError>,
    operation: (params: P) => Effect.Effect<R, HulyDomainError, Svc | Diagnostics>,
    encode: (result: unknown) => unknown,
    presentImage?: (result: R) => { readonly result: unknown; readonly image: McpImageContent }
  ): RegisteredOperation["execute"] =>
  (args, hulyClient, storageClient, workspaceClient) =>
    Effect.gen(function* () {
      const parseResult = yield* Effect.exit(parse(args))

      if (Exit.isFailure(parseResult)) {
        return yield* new ToolParseFailure({ cause: parseResult.cause, toolName })
      }

      const diagnosticsScope = yield* makeDiagnosticsScope
      const provided = provide({ hulyClient, storageClient, workspaceClient })(operation(parseResult.value))

      if (Result.isFailure(provided)) {
        return yield* new ToolProvisionFailure({ error: provided.failure })
      }

      const operationResult = yield* Effect.exit(
        provided.success.pipe(Effect.provideService(Diagnostics, diagnosticsScope.service))
      )
      const warnings = yield* diagnosticsScope.drainWarnings

      if (Exit.isFailure(operationResult)) {
        return yield* new ToolDomainFailure({ cause: operationResult.cause, warnings })
      }

      const presentation = presentImage?.(operationResult.value)
      const output = yield* Effect.try({
        try: () => encode(presentation === undefined ? operationResult.value : presentation.result),
        catch: () => new ToolOutputFailure({ toolName, warnings })
      })

      return presentation === undefined
        ? { result: output, warnings }
        : { result: output, warnings, image: presentation.image }
    })

const operationFailureToMcp = (failure: ToolOperationFailure): McpToolResponse => {
  switch (failure._tag) {
    case "ToolDomainFailure":
      return mapDomainCauseToMcp(failure.cause, failure.warnings)
    case "ToolOutputFailure":
      return mapDomainErrorToMcp(
        new HulyError({ message: `Tool ${failure.toolName} produced invalid output` }),
        failure.warnings
      )
    case "ToolParseFailure":
      return mapParseCauseToMcp(failure.cause, failure.toolName)
    case "ToolProvisionFailure":
      return mapDomainErrorToMcp(failure.error)
  }
}

const operationSuccessToMcp = (success: ToolOperationSuccess): McpToolResponse =>
  success.image === undefined
    ? createSuccessResponse(success.result, success.warnings)
    : createImageSuccessResponse(success.result, success.image, success.warnings)

const createHandler =
  (operation: RegisteredOperation): RegisteredTool["handler"] =>
  async (args, hulyClient, storageClient, workspaceClient) => {
    return await Effect.runPromise(
      operation
        .execute(args, hulyClient, storageClient, workspaceClient)
        .pipe(Effect.match({ onFailure: operationFailureToMcp, onSuccess: operationSuccessToMcp }))
    )
  }

const defineProvidedTool = <const Name extends string, P, Svc, S extends ResultSchema>(
  spec: ToolSpec<Name, S>,
  provide: ProvideServices<Svc>,
  parse: (input: unknown) => Effect.Effect<P, Schema.SchemaError>,
  operation: (params: P) => Effect.Effect<SchemaResult<S>, HulyDomainError, Svc | Diagnostics>
): RegisteredTool<Name> => {
  const definition = stripResultSchema(spec)
  const registeredOperation: RegisteredOperation<Name> = {
    ...definition,
    execute: createOperationExecutor(spec.name, provide, parse, operation, (result) =>
      encodeOutput(spec.resultSchema, result)
    )
  }

  return { ...definition, operation: registeredOperation, handler: createHandler(registeredOperation) }
}

interface ImageToolPresentation<Output> {
  readonly result: Output
  readonly image: McpImageContent
}

const defineProvidedImageTool = <const Name extends string, P, Svc, S extends ResultSchema, R>(
  spec: ToolSpec<Name, S>,
  provide: ProvideServices<Svc>,
  parse: (input: unknown) => Effect.Effect<P, Schema.SchemaError>,
  operation: (params: P) => Effect.Effect<R, HulyDomainError, Svc | Diagnostics>,
  present: (result: R) => ImageToolPresentation<SchemaResult<S>>
): RegisteredTool<Name> => {
  const definition = stripResultSchema(spec)
  const registeredOperation: RegisteredOperation<Name> = {
    ...definition,
    execute: createOperationExecutor(
      spec.name,
      provide,
      parse,
      operation,
      (result) => encodeOutput(spec.resultSchema, result),
      present
    )
  }

  return { ...definition, operation: registeredOperation, handler: createHandler(registeredOperation) }
}

export const defineTool = <const Name extends string, P, S extends ResultSchema>(
  spec: ToolSpec<Name, S>,
  parse: (input: unknown) => Effect.Effect<P, Schema.SchemaError>,
  operation: (params: P) => Effect.Effect<SchemaResult<S>, HulyDomainError, HulyClient | Diagnostics>
): RegisteredTool<Name> => defineProvidedTool(spec, provideHulyClient, parse, operation)

export const defineStorageTool = <const Name extends string, P, S extends ResultSchema>(
  spec: ToolSpec<Name, S>,
  parse: (input: unknown) => Effect.Effect<P, Schema.SchemaError>,
  operation: (params: P) => Effect.Effect<SchemaResult<S>, HulyDomainError, HulyStorageClient | Diagnostics>
): RegisteredTool<Name> => defineProvidedTool(spec, provideStorageClient, parse, operation)

export const defineCombinedTool = <const Name extends string, P, S extends ResultSchema>(
  spec: ToolSpec<Name, S>,
  parse: (input: unknown) => Effect.Effect<P, Schema.SchemaError>,
  operation: (
    params: P
  ) => Effect.Effect<SchemaResult<S>, HulyDomainError, HulyClient | HulyStorageClient | Diagnostics>
): RegisteredTool<Name> => defineProvidedTool(spec, provideCombinedClient, parse, operation)

export const defineHulyWorkspaceTool = <const Name extends string, P, S extends ResultSchema>(
  spec: ToolSpec<Name, S>,
  parse: (input: unknown) => Effect.Effect<P, Schema.SchemaError>,
  operation: (params: P) => Effect.Effect<SchemaResult<S>, HulyDomainError, HulyClient | WorkspaceClient | Diagnostics>
): RegisteredTool<Name> => defineProvidedTool(spec, provideHulyWorkspaceClient, parse, operation)

export const defineCombinedImageTool = <const Name extends string, P, S extends ResultSchema, R>(
  spec: ToolSpec<Name, S>,
  parse: (input: unknown) => Effect.Effect<P, Schema.SchemaError>,
  operation: (params: P) => Effect.Effect<R, HulyDomainError, HulyClient | HulyStorageClient | Diagnostics>,
  present: (result: R) => ImageToolPresentation<SchemaResult<S>>
): RegisteredTool<Name> => defineProvidedImageTool(spec, provideCombinedClient, parse, operation, present)

export const defineWorkspaceTool = <const Name extends string, P, S extends ResultSchema>(
  spec: ToolSpec<Name, S>,
  parse: (input: unknown) => Effect.Effect<P, Schema.SchemaError>,
  operation: (params: P) => Effect.Effect<SchemaResult<S>, HulyDomainError, WorkspaceClient | Diagnostics>
): RegisteredTool<Name> => defineProvidedTool(spec, provideWorkspaceClient, parse, operation)

export const defineNoParamsWorkspaceTool = <const Name extends string, S extends ResultSchema>(
  spec: Omit<ToolSpec<Name, S>, "inputSchema"> & { readonly inputSchema: object },
  operation: () => Effect.Effect<SchemaResult<S>, HulyDomainError, WorkspaceClient | Diagnostics>
): RegisteredTool<Name> => defineProvidedTool(spec, provideWorkspaceClient, () => Effect.succeed(undefined), operation)
