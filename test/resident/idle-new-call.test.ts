import { it } from "@effect/vitest"
import { Context, Deferred, Effect, Fiber, Option, Redacted, Ref, Schema, Stream } from "effect"
import { McpSchema, McpServer } from "effect/ai"
import { TestClock } from "effect/testing"
import { expect } from "vitest"

import { requestContextMiddleware } from "../../src/mcp/http-request-context.js"
import { MAX_ADAPTER_RESPONSE_BYTES } from "../../src/resident/adapter-limits.js"
import { AdmissionPolicy, DEFAULT_LEASE_POLICY } from "../../src/resident/admission-contract.js"
import { residentAdmissionMiddleware } from "../../src/resident/admission-http.js"
import { makeResidentAdmissions } from "../../src/resident/admissions.js"
import { MANAGED_IDLE_MILLIS } from "../../src/resident/managed-contract.js"
import { HostMessage } from "../../src/resident/request-headers.js"
import { decodeBackendMessages } from "../../src/resident/response-stream.js"
import {
  exchange,
  initialize,
  type Owner,
  type OwnerName,
  withNativeServer
} from "../helpers/resident-native-fixture.js"

const TEST_BOUND = 5_000
const HTTP_OK = 200
const HTTP_FORBIDDEN = 403
const policy = Schema.decodeUnknownSync(AdmissionPolicy)({
  capacity: 1,
  closeAllowanceMillis: 1_000,
  lease: DEFAULT_LEASE_POLICY
})
const call = (id: NonNullable<HostMessage["id"]>) =>
  HostMessage.make({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "count", arguments: {} } })

it.effect(
  "rejects an expired caller at the idle boundary while a fresh admitted caller protects new calls and completions",
  () =>
    Effect.gen(function* () {
      const admissions = yield* makeResidentAdmissions(policy)
      const dispatches = yield* Ref.make(0)
      const fenced = yield* Deferred.make<void>()
      const idle = yield* admissions.awaitIdleAndFence.pipe(
        Effect.tap(() => Deferred.succeed(fenced, undefined)),
        Effect.forkScoped
      )
      const native = requestContextMiddleware({
        resolveClients: () => Promise.reject(new Error("Counter must not acquire Huly"))
      })
      const registration = Effect.gen(function* () {
        const server = yield* McpServer.McpServer
        yield* server.addTool({
          tool: new McpSchema.Tool({ name: "count", inputSchema: McpSchema.ToolJson.make({ type: "object" }) }),
          annotations: Context.empty(),
          handle: () =>
            Ref.updateAndGet(dispatches, (count) => count + 1).pipe(
              Effect.map((count) => ({ content: [{ type: "text", text: String(count) }] }))
            )
        })
      })
      yield* withNativeServer(
        new Map<OwnerName, Owner>(),
        (endpoint, identity) =>
          Effect.gen(function* () {
            const old = yield* admissions.admit
            const oldOwner = yield* admissions.find(old.token)
            const initial = yield* exchange(endpoint, identity, "first", initialize("first"), Option.none(), old.token)
            expect(initial.status).toBe(HTTP_OK)
            if (Option.isNone(initial.session)) return yield* Effect.die("Expected original native session")
            yield* TestClock.adjust(DEFAULT_LEASE_POLICY.durationMillis)
            yield* oldOwner.closed
            expect(yield* oldOwner.ownsSession(Redacted.value(initial.session.value.id))).toBe(false)
            yield* TestClock.adjust(MANAGED_IDLE_MILLIS - 1)
            expect(yield* Deferred.isDone(fenced)).toBe(false)
            expect((yield* exchange(endpoint, identity, "first", call(2), initial.session, old.token)).status).toBe(
              HTTP_FORBIDDEN
            )
            expect(
              (yield* Effect.flip(
                oldOwner.withWork({
                  use: () => Ref.update(dispatches, (count) => count + 1),
                  cleanup: () => Effect.void
                })
              ))._tag
            ).toBe("RequestWorkRejected")
            expect(yield* Ref.get(dispatches)).toBe(0)
            const fresh = yield* admissions.admit
            const initialized = yield* exchange(
              endpoint,
              identity,
              "second",
              initialize("second"),
              Option.none(),
              fresh.token
            )
            expect(initialized.status).toBe(HTTP_OK)
            const successful = (id: NonNullable<HostMessage["id"]>, count: number) =>
              Effect.gen(function* () {
                const reply = yield* exchange(endpoint, identity, "second", call(id), initialized.session, fresh.token)
                expect(reply.status).toBe(HTTP_OK)
                const messages = yield* decodeBackendMessages({
                  body: Stream.make(new TextEncoder().encode(reply.body)),
                  contentType: reply.contentType,
                  maxBytes: MAX_ADAPTER_RESPONSE_BYTES
                }).pipe(Stream.runCollect)
                expect(messages).toEqual([
                  { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: String(count) }] } }
                ])
              })
            yield* successful(2, 1)
            yield* TestClock.adjust(MANAGED_IDLE_MILLIS)
            expect(yield* Deferred.isDone(fenced)).toBe(false)
            yield* successful(3, 2)
            yield* admissions.release(fresh.token)
            yield* TestClock.adjust(MANAGED_IDLE_MILLIS - 1)
            expect(yield* Deferred.isDone(fenced)).toBe(false)
            yield* TestClock.adjust(1)
            yield* Fiber.join(idle)
            expect(
              (yield* exchange(endpoint, identity, "second", call(4), initialized.session, fresh.token)).status
            ).toBe(HTTP_FORBIDDEN)
            expect(yield* Ref.get(dispatches)).toBe(2)
          }),
        { registration, middleware: (app) => residentAdmissionMiddleware(admissions)(native(app)) }
      )
    }).pipe(Effect.scoped),
  TEST_BOUND
)
