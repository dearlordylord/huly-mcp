import * as fs from "node:fs/promises"
import { createServer, type Socket } from "node:net"
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
import { runNativeSession } from "./native-session.js"

const CONNECTIONS_PER_ATTACHMENT = 2

export const withNativeResidentSocket = <A, E, R>(
  attachment: ResidentAttachment,
  admissions: Effect.Success<ReturnType<typeof makeResidentAdmissions>>,
  authority: Effect.Success<ReturnType<typeof makeCompatibilityAuthority>>,
  capacity: AdmissionPolicy["capacity"],
  use: (path: NativeSocketPath) => Effect.Effect<A, E, R>
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const scope = yield* Effect.scope
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
      const server = createServer({ allowHalfOpen: false }, (socket) => {
        sockets.add(socket)
        socket.on("error", () => {})
        const session = runNativeSession(socket, attachment, admissions, authority, claimed).pipe(
          Effect.catch(() => Effect.void),
          Effect.ensuring(
            Effect.sync(() => {
              sockets.delete(socket)
              socket.destroy()
            })
          )
        )
        Effect.runFork(Effect.forkIn(session, scope).pipe(Effect.flatMap(Fiber.await)))
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
