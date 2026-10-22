import { createNoopTelemetry } from "../telemetry/noop.js"
import { reportTelemetry } from "../telemetry/events.js"
import type { TelemetryOperations } from "../telemetry/telemetry.js"
import { AdmissionError } from "./admission-contract.js"
import { CompatibilityError } from "./compatibility-contract.js"
import * as fs from "node:fs/promises"
import { createServer, type Server, type Socket } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Deferred, Effect, Fiber, Schema } from "effect"

import type { makeAttachmentOwner } from "./attachment-owner.js"
import type { ResidentAttachment } from "./attachment-file.js"
import type { makeResidentAdmissions } from "./admissions.js"
import type { makeCompatibilityAuthority } from "./compatibility-authority.js"
import { nativeBridgeFailure, NativeSocketPath } from "./native-contract.js"
import { PRIVATE_FILE_MODE } from "./protected-path.js"
import type { AdmissionPolicy } from "./admission-contract.js"
import { writeNativeFrame } from "./native-framing.js"
import { BackendResponseError } from "./response-stream.js"
import { NativeAttachmentRetired, runNativeSession } from "./native-session.js"

const CONNECTIONS_PER_ATTACHMENT = 2
// Internal resource factory; callers can supply an owned listener without patching Node modules.
type NativeSocketFactory = (accept: (socket: Socket) => void) => Server
const makeSocketServer: NativeSocketFactory = (accept) => createServer({ allowHalfOpen: false }, accept)

export const withNativeResidentSocket = <A, E, R>(
  attachment: ResidentAttachment,
  admissions: Effect.Success<ReturnType<typeof makeResidentAdmissions>>,
  authority: Effect.Success<ReturnType<typeof makeCompatibilityAuthority>>,
  capacity: AdmissionPolicy["capacity"],
  use: (path: NativeSocketPath) => Effect.Effect<A, E, R>,
  factory: NativeSocketFactory = makeSocketServer,
  telemetry: TelemetryOperations = createNoopTelemetry()
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const scope = yield* Effect.scope
      const context = yield* Effect.context<never>()
      const failure = yield* Deferred.make<never, ReturnType<typeof nativeBridgeFailure>>()
      const directory = yield* Effect.acquireRelease(
        Effect.tryPromise({ try: () => fs.mkdtemp(join(tmpdir(), "huly-native-")), catch: nativeBridgeFailure }),
        (owned) => Effect.tryPromise({ try: () => fs.rmdir(owned), catch: nativeBridgeFailure }).pipe(Effect.orDie)
      )
      const path = yield* Effect.tryPromise({ try: () => fs.realpath(directory), catch: nativeBridgeFailure }).pipe(
        Effect.flatMap((resolved) => Schema.decodeUnknownEffect(NativeSocketPath)(join(resolved, "s"))),
        Effect.mapError(nativeBridgeFailure)
      )
      const sockets = new Set<Socket>()
      const claimed = new Set<Effect.Success<ReturnType<typeof makeAttachmentOwner>>>()
      const server = factory((socket) => {
        sockets.add(socket)
        socket.on("error", () => {})
        const session = runNativeSession(socket, attachment, admissions, authority, claimed).pipe(
          Effect.tapError((error) =>
            Effect.sync(() => {
              if (
                !(error instanceof AdmissionError) &&
                !(error instanceof CompatibilityError) &&
                !(error instanceof NativeAttachmentRetired)
              )
                reportTelemetry(() => telemetry.residentFailure({ stage: "native_channel", reason: "failed" }))
            })
          ),
          Effect.catch((error) =>
            writeNativeFrame(
              socket,
              Buffer.from(error instanceof BackendResponseError ? error.message : nativeBridgeFailure().message),
              true
            ).pipe(Effect.ignore)
          ),
          Effect.ensuring(
            Effect.sync(() => {
              sockets.delete(socket)
              socket.destroy()
            })
          )
        )
        Effect.runForkWith(context)(Effect.forkIn(session, scope).pipe(Effect.flatMap(Fiber.await)))
      })
      server.maxConnections = capacity * CONNECTIONS_PER_ATTACHMENT
      const failed = () => Deferred.doneUnsafe(failure, Effect.fail(nativeBridgeFailure()))
      server.on("error", failed)
      yield* Effect.acquireRelease(
        Effect.tryPromise({
          try: () =>
            new Promise<void>((resolve, reject) => {
              server.once("error", reject)
              server.listen(path, () => {
                server.off("error", reject)
                resolve()
              })
            }),
          catch: nativeBridgeFailure
        }),
        () =>
          Effect.tryPromise({
            try: () =>
              new Promise<void>((resolve, reject) => {
                for (const socket of sockets) socket.destroy()
                server.close((error) => (error ? reject(error) : resolve()))
              }),
            catch: nativeBridgeFailure
          }).pipe(Effect.orDie)
      )
      yield* Effect.tryPromise({ try: () => fs.chmod(path, PRIVATE_FILE_MODE), catch: nativeBridgeFailure })
      // Node removes the owned Unix socket when server.close completes.
      return yield* Effect.raceFirst(use(path), Deferred.await(failure))
    })
  )
