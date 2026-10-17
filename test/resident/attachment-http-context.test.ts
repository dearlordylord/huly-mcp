import { Context, Deferred, Effect, Exit, Fiber, Ref } from "effect"
import { McpSchema, McpServer } from "effect/ai"
import { HttpServerRequest } from "effect/http"
import { expect, it } from "vitest"

import { ConfigValidationError } from "../../src/config/config.js"
import { withRequestScopedResolver } from "../../src/mcp/effect-ai-request.js"
import { requestContextMiddleware } from "../../src/mcp/http-request-context.js"
import { attachmentRequestOwner } from "../../src/resident/attachment-http-context.js"
import { makeAttachmentOwner } from "../../src/resident/attachment-owner.js"
import { HostMessage } from "../../src/resident/request-headers.js"
import { RequestWorkOwner } from "../../src/runtime/request-work.js"
import {
  exchange,
  initialize,
  ping,
  withNativeServer,
  type Owner,
  type OwnerName
} from "../helpers/resident-native-fixture.js"

const RESPONSE_ALLOWANCE = "5 seconds"
const HTTP_OK = 200
const HTTP_CONFLICT = 409
const HTTP_NOT_FOUND = 404

it("fences real HTTP work and retains its native session through target and client cleanup", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const first = yield* makeAttachmentOwner(Effect.succeed(true))
      const second = yield* makeAttachmentOwner(Effect.succeed(true))
      const owners = new Map([
        ["first", attachmentRequestOwner(first)],
        ["second", attachmentRequestOwner(second)]
      ])
      const started = yield* Deferred.make<void>()
      const targetCleaning = yield* Deferred.make<void>()
      const finishTarget = yield* Deferred.make<void>()
      const clientCleaning = yield* Deferred.make<void>()
      const finishClient = yield* Deferred.make<void>()
      const acquisitions = yield* Ref.make(0)
      const unavailable = new ConfigValidationError({ message: "Fixture client has no Huly connection" })
      const resolveClients = async () => Exit.fail(unavailable)
      const context = requestContextMiddleware({
        resolveClients,
        resolveClientLeaseForHttpRequest: async () => {
          await Effect.runPromise(Ref.update(acquisitions, (count) => count + 1))
          return {
            bundle: Exit.fail(unavailable),
            close: () =>
              Effect.runPromise(
                Deferred.succeed(clientCleaning, undefined).pipe(Effect.andThen(Deferred.await(finishClient)))
              )
          }
        }
      })
      const registration = Effect.gen(function* () {
        const server = yield* McpServer.McpServer
        yield* server.addTool({
          tool: new McpSchema.Tool({ name: "held", inputSchema: McpSchema.ToolJson.make({ type: "object" }) }),
          annotations: Context.empty(),
          handle: () =>
            withRequestScopedResolver(resolveClients, (resolver) =>
              Effect.promise(resolver).pipe(
                Effect.andThen(Deferred.succeed(started, undefined)),
                Effect.andThen(Effect.never),
                Effect.ensuring(
                  Deferred.succeed(targetCleaning, undefined).pipe(Effect.andThen(Deferred.await(finishTarget)))
                )
              )
            )
        })
      })
      yield* withNativeServer(
        new Map<OwnerName, Owner>(),
        (endpoint, identity) =>
          Effect.gen(function* () {
            const initialized = yield* exchange(endpoint, identity, "first", initialize("first"))
            const survivor = yield* exchange(endpoint, identity, "second", initialize("second"))
            const request = yield* exchange(
              endpoint,
              identity,
              "first",
              HostMessage.make({
                jsonrpc: "2.0",
                id: 2,
                method: "tools/call",
                params: { name: "held", arguments: {} }
              }),
              initialized.session
            ).pipe(Effect.exit, Effect.forkScoped)
            yield* Deferred.await(started)
            const completed = yield* Deferred.make<void>()
            const closing = yield* first.close.pipe(
              Effect.andThen(Deferred.succeed(completed, undefined)),
              Effect.forkScoped
            )
            yield* Deferred.await(targetCleaning)
            try {
              expect(yield* Deferred.isDone(completed)).toBe(false)
              expect(yield* Deferred.isDone(clientCleaning)).toBe(false)
              expect((yield* exchange(endpoint, identity, "none", ping, initialized.session)).status).toBe(HTTP_OK)
              expect((yield* exchange(endpoint, identity, "second", ping, survivor.session)).status).toBe(HTTP_OK)
              expect((yield* exchange(endpoint, identity, "first", ping, initialized.session)).status).toBe(
                HTTP_CONFLICT
              )
              expect(yield* Ref.get(acquisitions)).toBe(1)
            } finally {
              yield* Deferred.succeed(finishTarget, undefined)
              yield* Deferred.await(clientCleaning)
              try {
                expect(yield* Deferred.isDone(completed)).toBe(false)
                expect((yield* exchange(endpoint, identity, "none", ping, initialized.session)).status).toBe(HTTP_OK)
              } finally {
                yield* Deferred.succeed(finishClient, undefined)
              }
            }
            yield* Fiber.join(closing)
            yield* Fiber.join(request)
            expect((yield* exchange(endpoint, identity, "none", ping, initialized.session)).status).toBe(HTTP_NOT_FOUND)
            expect((yield* exchange(endpoint, identity, "second", ping, survivor.session)).status).toBe(HTTP_OK)
            yield* second.close
          }),
        {
          registration,
          middleware: (httpEffect) =>
            Effect.gen(function* () {
              const request = yield* HttpServerRequest.HttpServerRequest
              const owner = owners.get(request.headers["x-fixture-owner"] ?? "none")
              const owned = context(httpEffect)
              return yield* owner === undefined ? owned : Effect.provideService(owned, RequestWorkOwner, owner)
            })
        }
      )
    }).pipe(Effect.scoped, Effect.timeout(RESPONSE_ALLOWANCE))
  )
})
