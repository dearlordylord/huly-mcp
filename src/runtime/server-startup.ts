#!/usr/bin/env node
/**
 * Main entry point for Huly MCP server.
 *
 * @module
 */

import { MovementObserverError, type MovementStageObserver } from "../mcp/movement-stage-observer.js"
import {
  MovementReportDirectorySchema,
  MovementObserverProcessSchema,
  makeFileMovementStageObserver
} from "../mcp/movement-stage-report.js"

import { Config, ConfigProvider, type Duration, Effect, Exit, Layer, Option, type Redacted, Schema } from "effect"

import {
  type ConfigValidationError,
  sanitizeHulyRuntimeConfigFromEnv,
  sanitizeHulyRuntimeConfigFromHeaders
} from "../config/config.js"
import type { CliProfileStoreError } from "../profiles/model.js"
import type { HulyClientError } from "../huly/client.js"
import type { StorageClientError } from "../huly/storage.js"
import {
  DEFAULT_HTTP_HOST,
  DEFAULT_HTTP_PORT,
  HttpHost,
  HttpPort,
  HttpServerFactoryService
} from "../mcp/http-transport.js"
import type { RequestClientLease } from "../mcp/request-client-lifecycle.js"
import { type McpServerError, McpServerService, type McpTransportType } from "../mcp/server.js"
import { type ConsoleRedirectHandle, redirectConsoleToStderr } from "../mcp/stdio-output.js"
import { buildCombinedClientLayer, createClientResolver, isRecoverableClientUnavailableCause } from "./huly-clients.js"
import type { ClientBundle, ClientResolver, HulyClientBundleError } from "./client-resolver.js"
import { createHttpClientLeaseResolver } from "./http-client-leases.js"
import { TelemetryService } from "../telemetry/telemetry.js"
import { writeStderrLine } from "../utils/stderr.js"
import { makeManualResidentBackend } from "../resident/manual-backend.js"
import { type ProtectedFileError, type ResidentDirectory, type ResidentFilePath } from "../resident/protected-path.js"
import type { HttpMiddleware } from "effect/http/HttpMiddleware"
import { captureManualResidentSelection } from "../resident/selection-config.js"
import type { CompatibilityError } from "../resident/compatibility-contract.js"
import type { McpProcessPolicy, McpProcessPolicyError } from "../mcp/process-policy.js"
import { resolveProcessConfiguration } from "./process-configuration.js"

import { type AdmissionError } from "../resident/admission-contract.js"
import {
  ManagedLaunchError,
  type ResidentStartupCapture,
  MANAGED_FAILURE_CLEANUP_MILLIS
} from "../resident/managed-contract.js"
import { prepareManagedDirectory, runOwnedGeneration, withResidentSelection } from "../resident/managed-selection.js"
import type { BackendResponseError } from "../resident/response-stream.js"
import type { SelectionClaimError } from "../resident/selection-claim.js"
import { makeStartupBudget, type StartupBudget } from "../resident/startup-budget.js"

export { getLazyEnvs } from "../config/startup.js"

type AppError =
  | BackendResponseError
  | AdmissionError
  | ManagedLaunchError
  | SelectionClaimError
  | CompatibilityError
  | McpProcessPolicyError
  | MovementObserverError
  | CliProfileStoreError
  | ConfigValidationError
  | HulyClientError
  | StorageClientError
  | McpServerError
  | Config.ConfigError
  | ProtectedFileError

const getTransportType = Config.String("MCP_TRANSPORT").pipe(
  Config.withDefault("stdio"),
  Effect.map((t): McpTransportType | "resident-http" => {
    if (t === "resident-http") return "resident-http"
    if (t === "http") return "http"
    return "stdio"
  })
)

type HttpPortConfigName = "MCP_HTTP_PORT" | "PORT"

const httpPortConfig = (name: HttpPortConfigName) => Config.schema(HttpPort, name)

export const getHttpPort: Effect.Effect<HttpPort, Config.ConfigError> = Config.all({
  mcpHttpPort: httpPortConfig("MCP_HTTP_PORT").pipe(Config.option),
  cloudRunPort: httpPortConfig("PORT").pipe(Config.option)
}).pipe(
  Effect.map(({ cloudRunPort, mcpHttpPort }) =>
    Option.getOrElse(mcpHttpPort, () => Option.getOrElse(cloudRunPort, () => DEFAULT_HTTP_PORT))
  )
)

const getHttpHost: Effect.Effect<HttpHost, Config.ConfigError> = Config.schema(HttpHost, "MCP_HTTP_HOST").pipe(
  Config.withDefault(DEFAULT_HTTP_HOST)
)

const McpAuthToken = Schema.RedactedFromValue(
  Schema.String.check(
    Schema.makeFilter((token) => token.trim().length > 0, { message: "must not be empty or whitespace-only" })
  )
)

// A blank token is a startup error rather than "auth disabled": setting MCP_AUTH_TOKEN must never open the endpoint.
export const getMcpAuthToken = Config.schema(McpAuthToken, "MCP_AUTH_TOKEN").pipe(Config.option)

const DEFAULT_PROCESS_CLOSE_GRACE_PERIOD = "5 seconds"

export const closeProcessClients = (
  closeClients: () => Promise<void>,
  gracePeriod: Duration.Input = DEFAULT_PROCESS_CLOSE_GRACE_PERIOD,
  writeError: (message: string) => void = writeStderrLine
): Effect.Effect<void> =>
  Effect.tryPromise(closeClients).pipe(
    Effect.interruptible,
    Effect.timeoutOrElse({
      duration: gracePeriod,
      orElse: () => Effect.sync(() => writeError("Process-scoped Huly client cleanup timed out"))
    }),
    Effect.catch(() => Effect.sync(() => writeError("Process-scoped Huly client cleanup failed")))
  )

const restoreConsoleRedirect = (redirect: ConsoleRedirectHandle | undefined): Effect.Effect<void> =>
  Effect.sync(() => {
    redirect?.restore()
  })

const webHeadersRecord = (headers: Headers): Record<string, string> => Object.fromEntries(headers.entries())

export const buildAppLayer = (
  transport: McpTransportType,
  httpPort: HttpPort,
  httpHost: HttpHost,
  mcpAuthToken: Redacted.Redacted<string> | undefined,
  authMethod: "token" | "password",
  resolveClients: ClientResolver,
  resolveClientLeaseForHttpRequest: (
    req: Request,
    signal: AbortSignal
  ) => Promise<RequestClientLease<Exit.Exit<ClientBundle, HulyClientBundleError>>>,
  httpServerFactoryLayer: Layer.Layer<HttpServerFactoryService> = HttpServerFactoryService.defaultLayer,
  closeClients?: () => Promise<void>,
  runtimeConfigContext = () => sanitizeHulyRuntimeConfigFromEnv(process.env),
  observeMovement?: MovementStageObserver,
  httpPolicy?: {
    readonly httpMiddleware: HttpMiddleware
    readonly beforeHttpShutdown: Effect.Effect<void>
    readonly processPolicy?: McpProcessPolicy
  }
): Layer.Layer<McpServerService | HttpServerFactoryService, McpServerError, never> => {
  const mcpServerConfig = {
    transport,
    httpPort,
    httpHost,
    ...(mcpAuthToken === undefined ? {} : { mcpAuthToken }),
    authMethod,
    resolveClients,
    ...(observeMovement === undefined ? {} : { observeMovement }),
    ...httpPolicy,
    ...(closeClients === undefined ? {} : { closeClients }),
    resolveClientLeaseForHttpRequest,
    getRuntimeConfigContext: runtimeConfigContext,
    getRuntimeConfigContextForHttpRequest: (req: Request) =>
      httpPolicy?.processPolicy === undefined
        ? sanitizeHulyRuntimeConfigFromHeaders(webHeadersRecord(req.headers), process.env)
        : runtimeConfigContext()
  }
  const mcpServerLayer = McpServerService.layer(mcpServerConfig).pipe(Layer.provide(TelemetryService.layer))

  return Layer.merge(mcpServerLayer, httpServerFactoryLayer)
}

const configureMovementObserver = Effect.fn("configureMovementObserver")(function* () {
  const reportDirectory = yield* Config.schema(
    MovementReportDirectorySchema,
    "HULY_MOVEMENT_STAGE_REPORT_DIRECTORY"
  ).pipe(Config.option)
  return Option.isSome(reportDirectory)
    ? yield* makeFileMovementStageObserver(
        reportDirectory.value,
        yield* Schema.decodeUnknownEffect(MovementObserverProcessSchema)({
          processId: process.pid,
          userId: process.getuid?.()
        }).pipe(Effect.mapError(() => new MovementObserverError({ phase: "configuration" }))),
        writeStderrLine
      )
    : undefined
})

const configureListener = (
  transport: McpTransportType,
  resident: Effect.Success<ReturnType<typeof makeManualResidentBackend>> | undefined
) =>
  Effect.gen(function* () {
    const httpPort = resident === undefined ? yield* getHttpPort : HttpPort.make(0)
    const httpHost = resident === undefined ? yield* getHttpHost : HttpHost.make("127.0.0.1")
    const mcpAuthToken =
      resident?.authorization ?? (transport === "http" ? Option.getOrUndefined(yield* getMcpAuthToken) : undefined)
    return { httpPort, httpHost, mcpAuthToken }
  })

const runConfiguredServer = (
  transport: McpTransportType,
  resident: Effect.Success<ReturnType<typeof makeManualResidentBackend>> | undefined,
  environment: NodeJS.ProcessEnv,
  captured: Effect.Success<ReturnType<typeof captureManualResidentSelection>>,
  httpServerFactoryLayer: Layer.Layer<HttpServerFactoryService>,
  report: (file: ResidentFilePath) => Effect.Effect<void, AppError> = announceAttachment
): Effect.Effect<void, AppError> =>
  Effect.gen(function* () {
    const { httpHost, httpPort, mcpAuthToken } = yield* configureListener(transport, resident)
    const { authMethod, configLayer, lazyEnvs, runtimeConfigContext } = yield* resolveProcessConfiguration(
      transport,
      environment,
      captured
    )
    const observeMovement = yield* configureMovementObserver()
    const combinedClientLayer = buildCombinedClientLayer(configLayer)
    yield* Effect.acquireUseRelease(
      Effect.sync(() => createClientResolver(combinedClientLayer)),
      ({ close: closeClients, resolve: resolveClients }) => {
        const resolveHttpClientLease = createHttpClientLeaseResolver(combinedClientLayer, resolveClients)
        return Effect.gen(function* () {
          const context = yield* Effect.context<never>()
          const guardedClose =
            resident === undefined
              ? closeClients
              : () =>
                  Effect.runPromiseWith(context)(
                    resident.beforeClientsClose.pipe(Effect.andThen(closeResidentClients(closeClients)))
                  )
          if (!lazyEnvs && transport === "stdio") {
            // Eager init uses the same process-owned resolver as subsequent tool calls.
            yield* Effect.gen(function* () {
              const clientExit = yield* Effect.promise(resolveClients)
              if (Exit.isSuccess(clientExit) || isRecoverableClientUnavailableCause(clientExit.cause)) return
              return yield* Effect.failCause(clientExit.cause)
            })
          }

          // stdout reserved for MCP protocol in stdio mode - no console output here
          const appLayer = buildAppLayer(
            transport,
            httpPort,
            httpHost,
            mcpAuthToken,
            authMethod,
            resolveClients,
            resolveHttpClientLease,
            httpServerFactoryLayer,
            guardedClose,
            runtimeConfigContext,
            observeMovement,
            resident?.httpPolicy
          )

          yield* Effect.gen(function* () {
            const server = yield* McpServerService
            if (resident === undefined) yield* server.run()
            else yield* resident.run(server, report)
          }).pipe(Effect.provide(appLayer), Effect.scoped)
        })
      },
      ({ close }) =>
        resident === undefined
          ? closeProcessClients(close)
          : resident.beforeClientsClose.pipe(Effect.andThen(closeResidentClients(close)))
    )
  })

const announceAttachment = (file: ResidentFilePath) =>
  Effect.sync(() => writeStderrLine(`Resident attachment: ${file}`))

export const closeResidentClients = (close: () => Promise<void>) =>
  Effect.tryPromise({
    try: close,
    catch: () =>
      new ManagedLaunchError({
        reason: "retirement",
        message: "Resident Huly client cleanup failed; replacement remains blocked"
      })
  }).pipe(
    Effect.interruptible,
    Effect.timeoutOrElse({
      duration: MANAGED_FAILURE_CLEANUP_MILLIS,
      orElse: () =>
        Effect.fail(
          new ManagedLaunchError({
            reason: "retirement",
            message: "Resident Huly client cleanup timed out; replacement remains blocked"
          })
        )
    })
  )

export const runConfiguredResidentServer = (options: {
  readonly capture: ResidentStartupCapture
  readonly directory: ResidentDirectory
  readonly environment: NodeJS.ProcessEnv
  readonly lifetime: "foreground" | "managed"
  readonly startup: StartupBudget
  readonly report: (file: ResidentFilePath) => Effect.Effect<void, AppError>
}): Effect.Effect<void, AppError> =>
  Effect.scoped(
    Effect.gen(function* () {
      const backend = yield* makeManualResidentBackend({
        mode: "configured",
        selection: options.capture.selection,
        lifetime: options.lifetime,
        startup: options.startup
      })
      yield* runConfiguredServer(
        "http",
        backend,
        options.environment,
        options.capture,
        HttpServerFactoryService.defaultLayer,
        options.report
      )
    })
  ).pipe(
    Effect.provide(
      ConfigProvider.layer(
        ConfigProvider.fromUnknown({ ...options.environment, MCP_RESIDENT_STATE_DIRECTORY: options.directory })
      )
    )
  )

export const makeServerStartup = (
  httpServerFactoryLayer: Layer.Layer<HttpServerFactoryService>
): Effect.Effect<void, AppError> =>
  Effect.gen(function* () {
    const environment = { ...process.env }
    const launchMode = yield* getTransportType
    const startup = yield* makeStartupBudget
    const captured =
      launchMode === "resident-http" ? yield* startup.within(captureManualResidentSelection(environment)) : undefined
    if (launchMode === "resident-http" && captured !== undefined) {
      const directory = yield* startup.within(prepareManagedDirectory)
      yield* withResidentSelection({
        directory,
        capture: captured,
        startup,
        existing: (file) => announceAttachment(file),
        absent: (ownership) =>
          runOwnedGeneration(ownership, (ready) =>
            runConfiguredResidentServer({
              capture: captured,
              directory,
              environment,
              lifetime: "foreground",
              startup,
              report: (file) => ready(file).pipe(Effect.andThen(announceAttachment(file)))
            })
          )
      })
      return
    }
    const resident = launchMode === "resident-http" ? yield* makeManualResidentBackend() : undefined
    const transport = launchMode === "resident-http" ? "http" : launchMode
    const consoleRedirect = yield* Effect.sync(() => (transport === "stdio" ? redirectConsoleToStderr() : undefined))
    yield* runConfiguredServer(transport, resident, environment, captured, httpServerFactoryLayer).pipe(
      Effect.ensuring(restoreConsoleRedirect(consoleRedirect))
    )
  }).pipe(Effect.scoped)

export const main = makeServerStartup(HttpServerFactoryService.defaultLayer)
