import { randomBytes, randomUUID } from "node:crypto"
import { Config, Deferred, Effect, Fiber, Redacted, Ref, Schema } from "effect"

import { type HttpServerFactory, HttpServerFactoryService, HttpTransportError } from "../mcp/http-transport.js"
import type { McpServerOperations } from "../mcp/server.js"
import { VERSION } from "../version.js"
import { ResidentAttachment, withPublishedResidentAttachment } from "./attachment-file.js"
import { currentPosixOwner, ProtectedFileError, ResidentDirectory, type ResidentFilePath } from "./protected-path.js"
import { makeResidentHttpServerFactory, ResidentEndpoint, ResidentTlsIdentity } from "./tls-channel.js"
import { AdmissionPolicy, DEFAULT_LEASE_POLICY } from "./admission-contract.js"
import { makeResidentAdmissions } from "./admissions.js"
import { residentAdmissionMiddleware } from "./admission-http.js"
import { makeCompatibilityAuthority } from "./compatibility-authority.js"
import type { StartupBudget } from "./startup-budget.js"
import type { ResidentSelection } from "./compatibility-contract.js"
import { withResidentHeaderRedaction } from "./private-http.js"
import { ResidentLiveStatus } from "./status-contract.js"
import type { HulyInitializationStatus } from "../runtime/client-initialization.js"
import { withNativeResidentSocket } from "./native-server.js"

const SECRET_BYTES = 32
const STARTUP_ALLOWANCE = "5 seconds"
const DEFAULT_ATTACHMENT_CAPACITY = 32
const CLOSE_ALLOWANCE_MILLIS = 5_000
const defaultAdmissionPolicy = Schema.decodeUnknownSync(AdmissionPolicy)({
  capacity: DEFAULT_ATTACHMENT_CAPACITY,
  closeAllowanceMillis: CLOSE_ALLOWANCE_MILLIS,
  lease: DEFAULT_LEASE_POLICY
})
const startupFailure = () => new ProtectedFileError({ kind: "input", message: "Resident backend startup failed" })

// Internal owner configuration; IPC uses ResidentStartupCapture instead of this runtime port.
type ResidentBackendConfiguration =
  | { readonly mode: "manual" }
  | {
      readonly mode: "configured"
      readonly selection: ResidentSelection
      readonly lifetime: "foreground" | "managed"
      readonly startup: StartupBudget
    }

export const makeManualResidentBackend = Effect.fn("makeManualResidentBackend")(function* (
  configuration: ResidentBackendConfiguration = { mode: "manual" }
) {
  const selection = configuration.mode === "manual" ? undefined : configuration.selection
  yield* currentPosixOwner
  const directory = yield* Config.schema(ResidentDirectory, "MCP_RESIDENT_STATE_DIRECTORY")
  const identity = yield* Schema.decodeUnknownEffect(ResidentTlsIdentity)({
    generation: randomUUID(),
    key: randomBytes(SECRET_BYTES).toString("hex")
  }).pipe(Effect.mapError(startupFailure))
  const authorization = Redacted.make(randomBytes(SECRET_BYTES).toString("hex"))
  const capacity = yield* Config.schema(AdmissionPolicy.fields.capacity, "MCP_RESIDENT_ATTACHMENT_CAPACITY").pipe(
    Config.withDefault(defaultAdmissionPolicy.capacity)
  )
  const admissions = yield* makeResidentAdmissions({ ...defaultAdmissionPolicy, capacity })
  const authority =
    selection === undefined
      ? undefined
      : yield* makeCompatibilityAuthority(selection, identity.generation, authorization)
  const claimed = yield* Ref.make(false)
  const bound = yield* Deferred.make<ResidentEndpoint>()
  const ready = yield* Deferred.make<void>()
  const nativeFactory = makeResidentHttpServerFactory(identity)
  const factory: HttpServerFactory = {
    ...nativeFactory,
    make: (port, host, grace) =>
      nativeFactory.make(port, host, grace).pipe(
        Effect.tap((listener) => {
          if (listener.address._tag === "UnixPathAddress") return Effect.die("Resident listener requires TCP")
          return Schema.decodeUnknownEffect(ResidentEndpoint)(`https://127.0.0.1:${listener.address.port}/mcp`).pipe(
            Effect.mapError(() => new HttpTransportError({ message: "Resident listener address is invalid" })),
            Effect.flatMap((endpoint) => Deferred.succeed(bound, endpoint))
          )
        })
      )
  }

  // This runtime owns a fresh immutable generation; it never replaces another generation's path.
  const run = <E, R>(server: McpServerOperations, report: (file: ResidentFilePath) => Effect.Effect<void, E, R>) =>
    Effect.acquireUseRelease(
      Effect.void,
      () =>
        Effect.gen(function* () {
          if (yield* Ref.getAndSet(claimed, true))
            return yield* new ProtectedFileError({
              kind: "conflict",
              message: "Resident generation already started; create a fresh generation"
            })
          const serving = yield* server
            .run()
            .pipe(
              withResidentHeaderRedaction,
              Effect.provideService(HttpServerFactoryService, factory),
              Effect.forkScoped
            )
          const publish = Effect.gen(function* () {
            const readiness = Effect.gen(function* () {
              const endpoint = yield* Deferred.await(bound)
              yield* server.awaitReady()
              yield* Deferred.succeed(ready, undefined)
              return endpoint
            }).pipe(
              Effect.timeoutOrElse({
                duration: STARTUP_ALLOWANCE,
                orElse: () =>
                  Effect.fail(
                    new ProtectedFileError({
                      kind: "io",
                      message:
                        "Resident application readiness timed out after five seconds; no attachment was published"
                    })
                  )
              })
            )
            const endpoint = yield* configuration.mode === "manual"
              ? readiness
              : configuration.startup.within(readiness)
            const descriptor = ResidentAttachment.make({
              version: 1,
              transport: "tls13-external-psk-v1",
              implementation: { name: "@firfi/huly-mcp", version: VERSION },
              endpoint,
              identity,
              authorization
            })
            const publishDescriptor = (published: ResidentAttachment) =>
              withPublishedResidentAttachment(directory, published, (file) =>
                report(file).pipe(
                  Effect.andThen(
                    configuration.mode === "configured" && configuration.lifetime === "managed"
                      ? admissions.awaitIdleAndFence.pipe(
                          Effect.andThen(server.stop()),
                          Effect.andThen(Fiber.join(serving))
                        )
                      : Fiber.join(serving)
                  )
                )
              )
            return yield* configuration.mode === "configured" &&
            configuration.lifetime === "managed" &&
            authority !== undefined
              ? withNativeResidentSocket(descriptor, admissions, authority, capacity, (nativeSocket) =>
                  publishDescriptor({ ...descriptor, nativeSocket })
                )
              : publishDescriptor(descriptor)
          })
          yield* Effect.raceFirst(publish, Fiber.join(serving))
        }),
      () => admissions.drain
    ).pipe(Effect.scoped)

  return {
    authorization,
    beforeClientsClose: admissions.drain,
    httpPolicy: (initialization: Effect.Effect<HulyInitializationStatus>) => ({
      httpMiddleware: residentAdmissionMiddleware(
        admissions,
        authority,
        configuration.mode === "configured" && configuration.lifetime === "managed"
          ? { kind: "managed", generation: identity.generation, fence: admissions.fence }
          : { kind: "unsupported" },
        Effect.gen(function* () {
          return ResidentLiveStatus.make({
            statusWire: 1,
            generation: identity.generation,
            readiness: (yield* Deferred.isDone(ready)) ? "ready" : "starting",
            hulyInitialization: yield* initialization,
            work: yield* admissions.status,
            retirement: "unconfirmed"
          })
        })
      ),
      beforeHttpShutdown: admissions.fence,
      ...(selection === undefined ? {} : { processPolicy: selection.policy })
    }),
    run
  }
})
