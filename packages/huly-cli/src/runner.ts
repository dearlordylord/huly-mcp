import * as fs from "node:fs/promises"
import * as path from "node:path"

import { Clock, ConfigProvider, type Duration, Effect, Ref } from "effect"

import { AttachmentId } from "../../../src/domain/schemas/shared.js"
import { attachment } from "../../../src/huly/huly-plugins.js"
import { findAttachmentForScope } from "../../../src/huly/operations/attachments-shared.js"
import type { ClientBundle } from "../../../src/mcp/server.js"
import { operationRegistry, resolveAnnotations } from "../../../src/mcp/tools/index.js"
import { describeOperationFailure, type ToolOperationSuccess } from "../../../src/mcp/tools/registry.js"
import { buildCombinedClientLayer, buildScopedClientBundle } from "../../../src/runtime/huly-clients.js"
import { TelemetryService } from "../../../src/telemetry/telemetry.js"
import type { CliCommandSpec } from "./catalog-types.js"
import { cliCommandCatalog, type CliToolName } from "./catalog.js"
import { resolvedConfigProvider } from "../../../src/profiles/config-provider.js"

import type { CliGlobalOptions, ParsedCliCommandLine } from "./cli-options.js"
import { buildCliInvocation, type CliInputError, type CliInvocation } from "./input.js"
import { LocalCliService } from "./local-commands.js"
import { type CliConnectionAuthMethod, resolveCliConfiguration } from "./profile-store.js"
import { CliRuntimeError, renderOperationSuccess } from "./render.js"
import { explicitCliConfirmationMessage } from "./safety-policies.js"
import { collectFieldSpecs } from "./schema-fields.js"

type CliOperation = ReturnType<typeof operationRegistry.getOperation>

const DEFAULT_CLI_CLIENT_CLOSE_GRACE_PERIOD = "5 seconds"

export const closeCliClientBundle = (
  close: () => Promise<void>,
  gracePeriod: Duration.Input = DEFAULT_CLI_CLIENT_CLOSE_GRACE_PERIOD
): Effect.Effect<void> =>
  Effect.tryPromise((_signal) => close()).pipe(
    Effect.interruptible,
    Effect.timeoutOrElse({
      duration: gracePeriod,
      orElse: () => Effect.logWarning("CLI Huly client cleanup timed out")
    }),
    Effect.catch(() => Effect.logWarning("CLI Huly client cleanup failed"))
  )

export interface CliRunnerPorts {
  readonly downloadAttachment: (
    bundle: ClientBundle,
    success: ToolOperationSuccess,
    attachmentIdField: string,
    output: string
  ) => Effect.Effect<void, CliRuntimeError>
  readonly getOperation: (toolName: CliToolName) => CliOperation
  readonly renderSuccess: (
    success: ToolOperationSuccess,
    globals: CliGlobalOptions,
    spec: CliCommandSpec
  ) => Effect.Effect<void, CliRuntimeError>
  readonly writeImage: (success: ToolOperationSuccess, output: string) => Effect.Effect<void, CliRuntimeError>
  readonly useClientBundle: <A, E>(
    use: (bundle: ClientBundle) => Effect.Effect<A, E>
  ) => Effect.Effect<A, E | CliRuntimeError>
}

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error))

const jsonBytes = (value: unknown): number | undefined => {
  try {
    return JSON.stringify(value).length
  } catch {
    return undefined
  }
}

const cliTelemetryErrorTag = (error: CliInputError | CliRuntimeError): string => error._tag

/* c8 ignore start -- production Huly storage adapter is covered by integration tests; unit tests exercise it through CliRunnerPorts. */
const resultField = (success: ToolOperationSuccess, fieldName: string): unknown =>
  typeof success.result === "object" && success.result !== null && !Array.isArray(success.result)
    ? Object.entries(success.result).find(([key]) => key === fieldName)?.[1]
    : undefined

const downloadAttachmentToFile = (
  bundle: ClientBundle,
  success: ToolOperationSuccess,
  attachmentIdField: string,
  output: string
): Effect.Effect<void, CliRuntimeError> =>
  Effect.gen(function* () {
    const attachmentIdValue = resultField(success, attachmentIdField)
    const attachmentId = typeof attachmentIdValue === "string" ? attachmentIdValue : undefined
    if (attachmentId === undefined) {
      return yield* new CliRuntimeError({ message: `Attachment download result is missing ${attachmentIdField}.` })
    }

    const attachmentDoc = yield* findAttachmentForScope(bundle.hulyClient, AttachmentId.make(attachmentId), {
      classRef: attachment.class.Attachment
    }).pipe(Effect.mapError((error) => new CliRuntimeError({ message: errorMessage(error) })))
    const downloadFile = bundle.storageClient.downloadFile
    if (downloadFile === undefined) {
      return yield* new CliRuntimeError({ message: "Storage client does not support attachment downloads." })
    }

    const bytes = yield* downloadFile(attachmentDoc.file).pipe(
      Effect.mapError((error) => new CliRuntimeError({ message: errorMessage(error) }))
    )

    yield* Effect.tryPromise({
      try: async () => {
        await fs.mkdir(path.dirname(output), { recursive: true })
        await fs.writeFile(output, bytes)
      },
      catch: (error) =>
        new CliRuntimeError({ message: `Failed to write attachment to ${output}: ${errorMessage(error)}` })
    })
  })

const writeImageToFile = (success: ToolOperationSuccess, output: string): Effect.Effect<void, CliRuntimeError> =>
  Effect.gen(function* () {
    const image = success.image
    if (image === undefined) {
      return yield* new CliRuntimeError({ message: "Image result is missing image content." })
    }
    const bytes = Buffer.from(image.data, "base64")
    yield* Effect.tryPromise({
      try: async () => {
        await fs.mkdir(path.dirname(output), { recursive: true })
        await fs.writeFile(output, bytes)
      },
      catch: (error) => new CliRuntimeError({ message: `Failed to write image to ${output}: ${errorMessage(error)}` })
    })
  })

const defaultRunnerPorts: CliRunnerPorts = {
  downloadAttachment: downloadAttachmentToFile,
  getOperation: operationRegistry.getOperation,
  renderSuccess: (success, globals, spec) => renderOperationSuccess(success, globals, spec.human),
  writeImage: writeImageToFile,
  useClientBundle: (use) =>
    Effect.acquireUseRelease(
      buildScopedClientBundle(buildCombinedClientLayer()).pipe(
        Effect.mapError((error) => new CliRuntimeError({ message: errorMessage(error) }))
      ),
      ({ bundle }) => use(bundle),
      ({ close }) => closeCliClientBundle(close)
    )
}
/* c8 ignore stop */

const confirmationMessage = (
  toolName: CliToolName,
  spec: CliCommandSpec,
  operation: CliOperation
): string | undefined =>
  explicitCliConfirmationMessage(toolName, spec) ??
  (resolveAnnotations(operation).destructiveHint === true ? `${spec.path.join(" ")} requires --yes.` : undefined)

const inputWithDefaultProject = (
  operation: CliOperation,
  input: Readonly<Record<string, unknown>>,
  defaultProject: string | undefined
): Readonly<Record<string, unknown>> => {
  const acceptsProject = [...collectFieldSpecs(operation.inputSchema).values()].some(
    (field) => field.fieldName === "project"
  )
  return defaultProject !== undefined && acceptsProject && input["project"] === undefined
    ? { ...input, project: defaultProject }
    : input
}

const validateInvocation = (
  toolName: CliToolName,
  spec: CliCommandSpec,
  operation: CliOperation,
  invocation: CliInvocation
): Effect.Effect<void, CliRuntimeError> => {
  const requiredConfirmationMessage = confirmationMessage(toolName, spec, operation)
  if (requiredConfirmationMessage !== undefined && !invocation.globals.yes) {
    return Effect.fail(new CliRuntimeError({ kind: "input", message: requiredConfirmationMessage, retryable: false }))
  }
  if (invocation.globals.output !== undefined && spec.behavior?.fileOutput === undefined) {
    return Effect.fail(
      new CliRuntimeError({
        kind: "input",
        message: `${spec.path.join(" ")} does not support --output.`,
        retryable: false
      })
    )
  }
  return Effect.void
}

const recordInputBytes = (
  measurements: Ref.Ref<{ readonly inputBytes?: number; readonly outputBytes?: number }>,
  input: unknown
): Effect.Effect<void> => {
  const inputBytes = jsonBytes(input)
  return inputBytes === undefined ? Effect.void : Ref.update(measurements, (current) => ({ ...current, inputBytes }))
}

const recordOutputBytes = (
  measurements: Ref.Ref<{ readonly inputBytes?: number; readonly outputBytes?: number }>,
  output: unknown
): Effect.Effect<void> => {
  const outputBytes = jsonBytes(output)
  return outputBytes === undefined ? Effect.void : Ref.update(measurements, (current) => ({ ...current, outputBytes }))
}

const executeOperation = (
  ports: CliRunnerPorts,
  bundle: ClientBundle,
  operation: CliOperation,
  input: Readonly<Record<string, unknown>>,
  spec: CliCommandSpec,
  invocation: CliInvocation
): Effect.Effect<ToolOperationSuccess, CliRuntimeError> =>
  Effect.gen(function* () {
    const result = yield* operation
      .execute(input, bundle.hulyClient, bundle.storageClient, bundle.workspaceClient)
      .pipe(Effect.mapError((failure) => new CliRuntimeError(describeOperationFailure(failure))))
    const fileOutput = spec.behavior?.fileOutput
    if (fileOutput?.type === "attachment-download" && invocation.globals.output !== undefined) {
      yield* ports.downloadAttachment(bundle, result, fileOutput.attachmentIdField, invocation.globals.output)
    }
    if (fileOutput?.type === "image-content" && invocation.globals.output !== undefined) {
      yield* ports.writeImage(result, invocation.globals.output)
    }
    return result
  })

export const runCliToolWithPorts = (
  ports: CliRunnerPorts,
  toolName: CliToolName,
  parsed: ParsedCliCommandLine,
  defaultProject: string | undefined,
  authMethod: CliConnectionAuthMethod
): Effect.Effect<void, CliInputError | CliRuntimeError, TelemetryService> =>
  Effect.gen(function* () {
    const spec: CliCommandSpec = cliCommandCatalog[toolName]
    const operation = ports.getOperation(toolName)
    const telemetry = yield* TelemetryService
    const startedAt = yield* Clock.currentTimeMillis
    const measurements = yield* Ref.make<{ readonly inputBytes?: number; readonly outputBytes?: number }>({})

    telemetry.sessionStart({
      authMethod,
      toolCount: Object.keys(cliCommandCatalog).length,
      toolsets: null,
      transport: "cli"
    })

    const captureToolCalled = (status: "success" | "error", errorTag?: string): Effect.Effect<void> =>
      Effect.gen(function* () {
        const finishedAt = yield* Clock.currentTimeMillis
        const { inputBytes, outputBytes } = yield* Ref.get(measurements)
        telemetry.toolCalled({
          toolName,
          status,
          durationMs: finishedAt - startedAt,
          ...(errorTag === undefined ? {} : { errorTag }),
          ...(inputBytes === undefined ? {} : { inputBytes }),
          ...(outputBytes === undefined ? {} : { outputBytes })
        })
      })

    const command = Effect.gen(function* () {
      const invocation = yield* buildCliInvocation(operation, spec, parsed)
      const input = inputWithDefaultProject(operation, invocation.input, defaultProject)
      yield* recordInputBytes(measurements, input)
      yield* validateInvocation(toolName, spec, operation, invocation)
      const response = yield* ports.useClientBundle((bundle) =>
        executeOperation(ports, bundle, operation, input, spec, invocation)
      )
      yield* recordOutputBytes(measurements, response.result)
      yield* ports.renderSuccess(response, invocation.globals, spec)
    })

    yield* command.pipe(
      Effect.tap(() => captureToolCalled("success")),
      Effect.tapError((error) => captureToolCalled("error", cliTelemetryErrorTag(error))),
      Effect.ensuring(Effect.ignore(Effect.tryPromise(() => telemetry.shutdown())))
    )
  })

export const runCliTool = (
  toolName: CliToolName,
  parsed: ParsedCliCommandLine
): Effect.Effect<void, CliInputError | CliRuntimeError, LocalCliService | TelemetryService> =>
  Effect.gen(function* () {
    const local = yield* LocalCliService
    const resolved = yield* resolveCliConfiguration(
      local.store,
      local.environment,
      parsed.options
        .flatMap((option) => (option._tag === "GlobalOption" && option.name === "profile" ? [option.value] : []))
        .pop()
    ).pipe(
      Effect.mapError((error) => new CliRuntimeError({ kind: error.kind, message: error.message, retryable: false }))
    )
    const provider = resolvedConfigProvider(resolved)
    yield* runCliToolWithPorts(
      defaultRunnerPorts,
      toolName,
      parsed,
      resolved.defaultProject,
      resolved.auth.method === "token" ? "token" : "password"
    ).pipe(Effect.provide(ConfigProvider.layer(provider)))
  })
