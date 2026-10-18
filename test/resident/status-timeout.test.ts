import { it } from "@effect/vitest"
import { Deferred, Effect, Fiber } from "effect"
import { TestClock } from "effect/testing"
import { HttpServerResponse } from "effect/http"
import { expect } from "vitest"

import { ResidentAttachment } from "../../src/resident/attachment-file.js"
import { readResidentLiveStatus } from "../../src/resident/status-client.js"
import { VERSION } from "../../src/version.js"
import { AUTHORIZATION, withNativeServer, type Owner, type OwnerName } from "../helpers/resident-native-fixture.js"

it.effect("bounds an authenticated endpoint that never returns without retry or retirement inference", () =>
  Effect.gen(function* () {
    const arrived = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    yield* withNativeServer(
      new Map<OwnerName, Owner>(),
      (endpoint, identity) =>
        Effect.gen(function* () {
          const attachment = ResidentAttachment.make({
            version: 1,
            transport: "tls13-external-psk-v1",
            endpoint,
            identity,
            authorization: AUTHORIZATION,
            implementation: { name: "@firfi/huly-mcp", version: VERSION }
          })
          const reading = yield* readResidentLiveStatus(attachment).pipe(Effect.forkScoped)
          yield* Deferred.await(arrived)
          yield* TestClock.adjust("5 seconds")
          expect(yield* Fiber.join(reading)).toEqual({ kind: "unavailable", recovery: "unverified" })
          yield* Deferred.succeed(release, undefined)
        }),
      {
        middleware: () =>
          Deferred.succeed(arrived, undefined).pipe(
            Effect.andThen(Deferred.await(release)),
            Effect.as(HttpServerResponse.empty())
          )
      }
    )
  }).pipe(Effect.scoped)
)
