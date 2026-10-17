import { it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Ref, Result, Schema } from "effect"
import { HttpServerRequest, HttpServerResponse } from "effect/http"
import { TestClock } from "effect/testing"
import { expect } from "vitest"

import { requestContextMiddleware } from "../../src/mcp/http-request-context.js"
import { withAdapterAttachment } from "../../src/resident/adapter-attachment.js"
import {
  AdmissionPolicy,
  type AttachmentToken,
  DEFAULT_LEASE_POLICY,
  RESIDENT_ATTACHMENTS_PATH
} from "../../src/resident/admission-contract.js"
import { residentAdmissionMiddleware } from "../../src/resident/admission-http.js"
import { makeResidentAdmissions } from "../../src/resident/admissions.js"
import { ResidentAttachment } from "../../src/resident/attachment-file.js"
import { VERSION } from "../../src/version.js"
import { AUTHORIZATION, withNativeServer, type Owner, type OwnerName } from "../helpers/resident-native-fixture.js"

const CLOSE_MILLIS = 5_000
const policy = Schema.decodeUnknownSync(AdmissionPolicy)({
  capacity: 1,
  closeAllowanceMillis: CLOSE_MILLIS,
  lease: DEFAULT_LEASE_POLICY
})

it.effect("recovers a real TLS admission whose successful reply never reaches its adapter", () =>
  Effect.gen(function* () {
    const registry = yield* makeResidentAdmissions(policy)
    const admitted = yield* Deferred.make<AttachmentToken>()
    const drop = yield* Ref.make(true)
    const droppedResponseDone = yield* Deferred.make<void>()
    const releases = yield* Ref.make(0)
    const port = {
      ...registry,
      admit: registry.admit.pipe(Effect.tap((receipt) => Deferred.succeed(admitted, receipt.token)))
    }
    const context = requestContextMiddleware({
      resolveClients: () => Promise.reject(new Error("No Huly work should dispatch"))
    })
    yield* withNativeServer(
      new Map<OwnerName, Owner>(),
      (endpoint, identity) =>
        Effect.gen(function* () {
          const descriptor = ResidentAttachment.make({
            version: 1,
            transport: "tls13-external-psk-v1",
            implementation: { name: "@firfi/huly-mcp", version: VERSION },
            endpoint,
            identity,
            authorization: AUTHORIZATION
          })
          const lost = yield* withAdapterAttachment(descriptor, () =>
            Effect.die("An unreceived receipt cannot start a bridge")
          ).pipe(Effect.exit, Effect.forkScoped)
          const oldToken = yield* Deferred.await(admitted)
          yield* Fiber.interrupt(lost)
          yield* Deferred.succeed(droppedResponseDone, undefined)
          expect(yield* Ref.get(releases)).toBe(0)
          const capacity = yield* Effect.result(registry.admit)
          expect(Result.isFailure(capacity) && capacity.failure.kind).toBe("capacity")
          yield* TestClock.adjust("30 seconds")
          expect((yield* Effect.result(registry.renew(oldToken)))._tag).toBe("Failure")
          yield* withAdapterAttachment(descriptor, () => Effect.void)
          expect(yield* Ref.get(releases)).toBe(1)
        }),
      {
        middleware: (app) =>
          Effect.gen(function* () {
            const request = yield* HttpServerRequest.HttpServerRequest
            if (request.url === RESIDENT_ATTACHMENTS_PATH && request.method === "DELETE")
              yield* Ref.update(releases, (count) => count + 1)
            const response = yield* residentAdmissionMiddleware(port)(context(app))
            if (
              request.url === RESIDENT_ATTACHMENTS_PATH &&
              request.method === "POST" &&
              (yield* Ref.getAndSet(drop, false))
            ) {
              yield* Deferred.await(droppedResponseDone)
              return HttpServerResponse.empty({ status: 204 })
            }
            return response
          })
      }
    )
  }).pipe(Effect.scoped)
)
