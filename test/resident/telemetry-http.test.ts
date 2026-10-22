import { Deferred, Effect, Exit, Fiber } from "effect"
import { HttpServerRequest } from "effect/http"
import { expect, it } from "vitest"

import { Count } from "../../src/domain/schemas/shared.js"

import { ConfigValidationError } from "../../src/config/config.js"
import { makeEffectMcpRegistry } from "../../src/mcp/effect-ai-registry.js"
import { requestContextMiddleware } from "../../src/mcp/http-request-context.js"
import { toolRegistry } from "../../src/mcp/tools/index.js"
import { attachmentRequestOwner } from "../../src/resident/attachment-http-context.js"
import { makeAttachmentObservation } from "../../src/resident/attachment-observation.js"
import { makeAttachmentOwner } from "../../src/resident/attachment-owner.js"
import { HostMessage } from "../../src/resident/request-headers.js"
import { RequestWorkOwner } from "../../src/runtime/request-work.js"
import { createNoopTelemetry } from "../../src/telemetry/noop.js"
import type { ToolCalledProps } from "../../src/telemetry/telemetry.js"
import {
  exchange,
  initialize,
  withNativeServer,
  type Owner,
  type OwnerName
} from "../helpers/resident-native-fixture.js"

it("preserves attachment correlation through real HTTP handlers, including cancellation", async () => {
  const calls: Array<ToolCalledProps> = []
  const id = "00000000-0000-4000-8000-000000000001"
  const telemetry = {
    ...createNoopTelemetry(),
    toolCalled: (event: ToolCalledProps) => {
      calls.push(event)
    }
  }
  await Effect.runPromise(
    Effect.gen(function* () {
      const observation = makeAttachmentObservation(telemetry, id, 0n)
      observation.admitted(Count.make(1))
      const owner = yield* makeAttachmentOwner(Effect.succeed(true), observation)
      const entered = yield* Deferred.make<void>()
      const resolveClients = async () => Exit.fail(new ConfigValidationError({ message: "No Huly needed" }))
      const adapter = makeEffectMcpRegistry({
        registry: toolRegistry,
        resolveClients,
        telemetry,
        fetchLatestVersion: async () => "1.0.0",
        getHulyContext: () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never))
      })
      const context = requestContextMiddleware({ resolveClients })
      yield* withNativeServer(
        new Map<OwnerName, Owner>(),
        (endpoint, identity) =>
          Effect.gen(function* () {
            const initialized = yield* exchange(endpoint, identity, "first", initialize("first"))
            const request = (name: string) =>
              exchange(
                endpoint,
                identity,
                "first",
                HostMessage.make({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: {} } }),
                initialized.session
              )
            expect((yield* request("get_version")).status).toBe(200)
            const held = yield* request("get_huly_context").pipe(Effect.exit, Effect.forkScoped)
            yield* Deferred.await(entered)
            yield* owner.close
            yield* Fiber.join(held)
          }),
        {
          registration: adapter.registration,
          middleware: (httpEffect) =>
            Effect.gen(function* () {
              const request = yield* HttpServerRequest.HttpServerRequest
              const owned = context(httpEffect)
              return yield* request.headers["x-fixture-owner"] === "first"
                ? Effect.provideService(owned, RequestWorkOwner, attachmentRequestOwner(owner))
                : owned
            })
        }
      )
    }).pipe(Effect.scoped, Effect.timeout("5 seconds"))
  )
  expect(calls).toHaveLength(2)
  expect(calls).toContainEqual(
    expect.objectContaining({ toolName: "get_version", attachmentId: id, status: "success" })
  )
  expect(calls).toContainEqual(
    expect.objectContaining({ toolName: "get_huly_context", attachmentId: id, status: "cancelled" })
  )
})
