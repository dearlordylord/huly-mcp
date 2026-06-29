import * as fs from "node:fs/promises"
import * as path from "node:path"

import { Effect } from "effect"

import { AttachmentId } from "../../../src/domain/schemas/shared.js"
import { attachment } from "../../../src/huly/huly-plugins.js"
import { findAttachmentForScope } from "../../../src/huly/operations/attachments-shared.js"
import type { ClientBundle } from "../../../src/mcp/server.js"
import { operationRegistry } from "../../../src/mcp/tools/index.js"
import { formatOperationFailure, type ToolOperationSuccess } from "../../../src/mcp/tools/registry.js"
import { buildCombinedClientLayer, buildScopedClientBundle } from "../../../src/runtime/huly-clients.js"
import { cliCommandCatalog, type CliCommandSpec, type CliToolName } from "./catalog.js"
import type { CliGlobalOptions, ParsedCliCommandLine } from "./cli-options.js"
import { buildCliInvocation, type CliInputError } from "./input.js"
import { CliRuntimeError, renderOperationSuccess } from "./render.js"

type CliOperation = ReturnType<typeof operationRegistry.getOperation>

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
    globals: CliGlobalOptions
  ) => Effect.Effect<void, CliRuntimeError>
  readonly useClientBundle: <A, E>(
    use: (bundle: ClientBundle) => Effect.Effect<A, E>
  ) => Effect.Effect<A, E | CliRuntimeError>
}

const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error)

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
  Effect.gen(function*() {
    const attachmentIdValue = resultField(success, attachmentIdField)
    const attachmentId = typeof attachmentIdValue === "string" ? attachmentIdValue : undefined
    if (attachmentId === undefined) {
      return yield* new CliRuntimeError({
        message: `Attachment download result is missing ${attachmentIdField}.`
      })
    }

    const attachmentDoc = yield* findAttachmentForScope(bundle.hulyClient, AttachmentId.make(attachmentId), {
      classRef: attachment.class.Attachment
    }).pipe(
      Effect.mapError((error) => new CliRuntimeError({ message: errorMessage(error) }))
    )
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

const defaultRunnerPorts: CliRunnerPorts = {
  downloadAttachment: downloadAttachmentToFile,
  getOperation: operationRegistry.getOperation,
  renderSuccess: renderOperationSuccess,
  useClientBundle: (use) =>
    Effect.acquireUseRelease(
      buildScopedClientBundle(buildCombinedClientLayer()).pipe(
        Effect.mapError((error) => new CliRuntimeError({ message: errorMessage(error) }))
      ),
      ({ bundle }) => use(bundle),
      ({ close }) => Effect.sync(close)
    )
}
/* c8 ignore stop */

export const runCliToolWithPorts = (
  ports: CliRunnerPorts,
  toolName: CliToolName,
  parsed: ParsedCliCommandLine
): Effect.Effect<void, CliInputError | CliRuntimeError, never> =>
  Effect.gen(function*() {
    const spec: CliCommandSpec = cliCommandCatalog[toolName]
    const operation = ports.getOperation(toolName)

    const invocation = yield* buildCliInvocation(operation, spec, parsed)
    if (spec.behavior?.confirmation?.type === "requires-yes" && !invocation.globals.yes) {
      return yield* new CliRuntimeError({ message: spec.behavior.confirmation.message })
    }
    if (invocation.globals.output !== undefined && spec.behavior?.fileOutput === undefined) {
      return yield* new CliRuntimeError({ message: `${spec.path.join(" ")} does not support --output.` })
    }

    const response = yield* ports.useClientBundle((bundle) =>
      Effect.gen(function*() {
        const result = yield* operation.execute(
          invocation.input,
          bundle.hulyClient,
          bundle.storageClient,
          bundle.workspaceClient
        ).pipe(
          Effect.mapError((failure) => new CliRuntimeError({ message: formatOperationFailure(failure) }))
        )

        const fileOutput = spec.behavior?.fileOutput
        if (fileOutput?.type === "attachment-download" && invocation.globals.output !== undefined) {
          yield* ports.downloadAttachment(bundle, result, fileOutput.attachmentIdField, invocation.globals.output)
        }

        return result
      })
    )

    yield* ports.renderSuccess(response, invocation.globals)
  })

export const runCliTool = (
  toolName: CliToolName,
  parsed: ParsedCliCommandLine
): Effect.Effect<void, CliInputError | CliRuntimeError, never> =>
  runCliToolWithPorts(defaultRunnerPorts, toolName, parsed)
