import { Deferred, Effect, Exit, Fiber, Option, Ref, Schedule, Schema } from "effect"
import { expect, it } from "vitest"

import { createRequestClientLifecycle } from "../../src/mcp/request-client-lifecycle.js"
import { makeAttachmentOwner } from "../../src/resident/attachment-owner.js"
import { LegacyHttpSession } from "../../src/resident/protocol-session.js"
import { HostMessage } from "../../src/resident/request-headers.js"
import {
  exchange,
  initialize,
  ping,
  withNativeServer,
  type Owner,
  type OwnerName,
  type SessionResource
} from "../helpers/resident-native-fixture.js"

const RESPONSE_BOUND = 5_000
const HTTP_OK = 200
const HTTP_NOT_FOUND = 404

it("retains the native session until owned request client cleanup completes", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const attachment = yield* makeAttachmentOwner(Effect.succeed(true))
      const adopted = yield* Deferred.make<SessionResource>()
      const owner: Owner = {
        adopt: (resource) =>
          attachment
            .withWork({
              use: (nativeOwner) =>
                nativeOwner.adopt(resource).pipe(Effect.tap(() => Deferred.succeed(adopted, resource))),
              cleanup: () => Effect.void
            })
            .pipe(Effect.orDie)
      }
      yield* withNativeServer(new Map<OwnerName, Owner>([["first", owner]]), (endpoint, identity) =>
        Effect.gen(function* () {
          const initialized = yield* exchange(endpoint, identity, "first", initialize("first"))
          const survivor = yield* exchange(endpoint, identity, "second", initialize("second"))
          const resource = yield* Deferred.await(adopted)
          const started = yield* Deferred.make<void>()
          const cleaning = yield* Deferred.make<void>()
          const draining = yield* Deferred.make<void>()
          const finishCleanup = yield* Deferred.make<void>()
          const cleanup = Deferred.succeed(cleaning, undefined).pipe(Effect.andThen(Deferred.await(finishCleanup)))
          const lifecycle = createRequestClientLifecycle(async () => ({
            bundle: "fixture-client",
            close: () => Effect.runPromise(cleanup)
          }))
          const releaseTarget = lifecycle.retain()
          const request = yield* attachment
            .withWork({
              use: () =>
                Effect.promise(lifecycle.resolve).pipe(
                  Effect.andThen(Deferred.succeed(started, undefined)),
                  Effect.andThen(Effect.never)
                ),
              cleanup: () => Deferred.succeed(draining, undefined).pipe(Effect.andThen(Effect.promise(lifecycle.close)))
            })
            .pipe(Effect.exit, Effect.forkScoped)
          yield* Deferred.await(started)
          const closed = yield* Deferred.make<void>()
          const closing = yield* attachment.close.pipe(
            Effect.andThen(Deferred.succeed(closed, undefined)),
            Effect.forkScoped
          )
          yield* Deferred.await(draining)
          try {
            expect(yield* Deferred.isDone(closed)).toBe(false)
            expect(yield* attachment.ownsSession(resource.id)).toBe(true)
            expect(
              Exit.isFailure(
                yield* Effect.exit(attachment.withWork({ use: () => Effect.void, cleanup: () => Effect.void }))
              )
            ).toBe(true)
            expect((yield* exchange(endpoint, identity, "none", ping, initialized.session)).status).toBe(HTTP_OK)
            expect(yield* Deferred.isDone(cleaning)).toBe(false)
            expect((yield* exchange(endpoint, identity, "second", ping, survivor.session)).status).toBe(HTTP_OK)
          } finally {
            releaseTarget()
            yield* Deferred.await(cleaning)
            try {
              expect(yield* attachment.ownsSession(resource.id)).toBe(true)
              expect(yield* Deferred.isDone(closed)).toBe(false)
            } finally {
              yield* Deferred.succeed(finishCleanup, undefined)
            }
          }
          yield* Fiber.join(closing)
          expect(Exit.isFailure(yield* Fiber.join(request))).toBe(true)
          expect(yield* attachment.ownsSession(resource.id)).toBe(false)
          expect((yield* exchange(endpoint, identity, "none", ping, initialized.session)).status).toBe(HTTP_NOT_FOUND)
          expect((yield* exchange(endpoint, identity, "second", ping, survivor.session)).status).toBe(HTTP_OK)
          yield* attachment.close
          expect(yield* resource.release).toBe(false)
        })
      )
    }).pipe(Effect.scoped, Effect.timeout(RESPONSE_BOUND))
  )
})

it("adopts actual native UUIDs and releases only the captured session", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const first = yield* Deferred.make<SessionResource>()
      const second = yield* Deferred.make<SessionResource>()
      const adopted = yield* Ref.make(0)
      const own = (target: Deferred.Deferred<SessionResource>): Owner => ({
        adopt: (resource) =>
          Deferred.succeed(target, resource).pipe(
            Effect.andThen(Ref.update(adopted, (count) => count + 1)),
            Effect.as(true)
          )
      })
      yield* withNativeServer(
        new Map<OwnerName, Owner>([
          ["first", own(first)],
          ["second", own(second)]
        ]),
        (endpoint, identity) =>
          Effect.gen(function* () {
            const firstReply = yield* exchange(endpoint, identity, "first", initialize("first"))
            const secondReply = yield* exchange(endpoint, identity, "second", initialize("second"))
            const ordinary = yield* exchange(endpoint, identity, "none", initialize("none"))
            expect(firstReply.status).toBe(HTTP_OK)
            expect(
              Option.isSome(firstReply.session) && Option.isSome(secondReply.session) && Option.isSome(ordinary.session)
            ).toBe(true)
            expect((yield* exchange(endpoint, identity, "first", ping, firstReply.session)).status).toBe(HTTP_OK)
            const resource = yield* Deferred.await(first)
            expect(yield* resource.release).toBe(true)
            expect((yield* exchange(endpoint, identity, "first", ping, firstReply.session)).status).toBe(HTTP_NOT_FOUND)
            expect(yield* resource.release).toBe(false)
            expect((yield* exchange(endpoint, identity, "second", ping, secondReply.session)).status).toBe(HTTP_OK)
            expect((yield* exchange(endpoint, identity, "none", ping, ordinary.session)).status).toBe(HTTP_OK)
            const modern = yield* exchange(
              endpoint,
              identity,
              "first",
              HostMessage.make({
                jsonrpc: "2.0",
                id: 1,
                method: "server/discover",
                params: {
                  _meta: {
                    "io.modelcontextprotocol/protocolVersion": "2026-07-28",
                    "io.modelcontextprotocol/clientInfo": { name: "first", version: "1.0" },
                    "io.modelcontextprotocol/clientCapabilities": {}
                  }
                }
              })
            )
            expect(modern.status).toBe(HTTP_OK)
            expect(Option.isNone(modern.session)).toBe(true)
            const compatibility = yield* exchange(endpoint, identity, "first", ping)
            expect(compatibility.status).toBe(HTTP_OK)
            expect(Option.isNone(compatibility.session)).toBe(true)
            expect(yield* Ref.get(adopted)).toBe(2)
            expect(yield* (yield* Deferred.await(second)).release).toBe(true)
            expect((yield* exchange(endpoint, identity, "second", ping, secondReply.session)).status).toBe(
              HTTP_NOT_FOUND
            )
          })
      )
    }).pipe(Effect.timeout(RESPONSE_BOUND))
  )
})

it.each(["decline", "defect", "interruption"])("rolls back native registration after adoption %s", async (mode) => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const started = yield* Deferred.make<SessionResource>()
      const owner: Owner = {
        adopt: (resource) =>
          Deferred.succeed(started, resource).pipe(
            Effect.andThen(
              mode === "decline"
                ? Effect.succeed(false)
                : mode === "defect"
                  ? Effect.die(new Error("Fixture adoption defect"))
                  : Effect.never
            )
          )
      }
      yield* withNativeServer(new Map<OwnerName, Owner>([["first", owner]]), (endpoint, identity) =>
        Effect.gen(function* () {
          const pending = yield* Effect.exit(exchange(endpoint, identity, "first", initialize("first"))).pipe(
            Effect.forkScoped
          )
          const resource = yield* Deferred.await(started)
          if (mode === "interruption") yield* Fiber.interrupt(pending)
          else {
            const attempt = yield* Fiber.join(pending)
            if (Exit.isSuccess(attempt)) expect(Option.isNone(attempt.value.session)).toBe(true)
          }
          const session = Option.some(
            Schema.decodeUnknownSync(LegacyHttpSession)({ id: resource.id, protocolVersion: "2025-06-18" })
          )
          const removed = yield* exchange(endpoint, identity, "none", ping, session).pipe(
            Effect.repeat({ until: (reply) => reply.status === HTTP_NOT_FOUND, schedule: Schedule.spaced("10 millis") })
          )
          expect(removed.status).toBe(HTTP_NOT_FOUND)
          expect(yield* resource.release).toBe(false)
        })
      )
    }).pipe(Effect.timeout(RESPONSE_BOUND))
  )
})
