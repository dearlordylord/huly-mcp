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
import { withResidentHeaderRedaction } from "./private-http.js"

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

export const makeManualResidentBackend = Effect.gen(function* () {
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
  const claimed = yield* Ref.make(false)
  const bound = yield* Deferred.make<ResidentEndpoint>()
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
  const run = (server: McpServerOperations, report: (file: ResidentFilePath) => void) =>
    Effect.gen(function* () {
      if (yield* Ref.getAndSet(claimed, true))
        return yield* new ProtectedFileError({
          kind: "conflict",
          message: "Resident generation already started; create a fresh generation"
        })
      const serving = yield* server
        .run()
        .pipe(withResidentHeaderRedaction, Effect.provideService(HttpServerFactoryService, factory), Effect.forkScoped)
      const publish = Effect.gen(function* () {
        const endpoint = yield* Effect.gen(function* () {
          const endpoint = yield* Deferred.await(bound)
          yield* server.awaitReady()
          return endpoint
        }).pipe(
          Effect.timeoutOrElse({
            duration: STARTUP_ALLOWANCE,
            orElse: () =>
              Effect.fail(
                new ProtectedFileError({
                  kind: "io",
                  message: "Resident application readiness timed out after five seconds; no attachment was published"
                })
              )
          })
        )
        const descriptor = ResidentAttachment.make({
          version: 1,
          transport: "tls13-external-psk-v1",
          implementation: { name: "@firfi/huly-mcp", version: VERSION },
          endpoint,
          identity,
          authorization
        })
        return yield* withPublishedResidentAttachment(directory, descriptor, (file) =>
          Effect.sync(() => report(file)).pipe(Effect.andThen(Fiber.join(serving)))
        )
      })
      yield* Effect.raceFirst(publish, Fiber.join(serving))
    }).pipe(Effect.ensuring(admissions.fence), Effect.scoped)

  return {
    authorization,
    httpPolicy: { httpMiddleware: residentAdmissionMiddleware(admissions), beforeHttpShutdown: admissions.fence },
    run
  }
})
