import type { Server } from "node:http"
import { ConfigProvider, Deferred, Effect, Fiber, Layer, Schedule } from "effect"
import { expect, it } from "vitest"

import { makeServerStartup } from "../../src/runtime/server-startup.js"
import { HttpServerFactoryService } from "../../src/mcp/http-transport.js"
import { makeTestHttpServerFactory } from "../mcp/http-test-support.js"

it("keeps standalone direct HTTP discovery available and closes its listener on interruption", async () => {
  const environment = {
    MCP_TRANSPORT: "http",
    MCP_HTTP_HOST: "127.0.0.1",
    MCP_HTTP_PORT: "0",
    LAZY_ENVS: "true",
    HULY_MCP_TELEMETRY: "0"
  }
  await Effect.runPromise(
    Effect.gen(function* () {
      const listening = yield* Deferred.make<Server>()
      const startup = makeServerStartup(
        Layer.succeed(
          HttpServerFactoryService,
          makeTestHttpServerFactory((server) => {
            Deferred.doneUnsafe(listening, Effect.succeed(server))
          })
        )
      )
      const target = yield* Effect.acquireUseRelease(
        startup.pipe(Effect.forkChild),
        () =>
          Effect.gen(function* () {
            const listener = yield* Deferred.await(listening).pipe(Effect.timeout("2 seconds"))
            const address = listener.address()
            if (address === null || typeof address === "string")
              return yield* Effect.die("Expected an owned TCP listener")
            const target = `http://127.0.0.1:${address.port}/mcp`
            const response = yield* Effect.tryPromise((signal) =>
              fetch(target, {
                signal,
                method: "POST",
                headers: {
                  "content-type": "application/json",
                  accept: "application/json, text/event-stream",
                  "mcp-protocol-version": "2026-07-28",
                  "mcp-method": "server/discover"
                },
                body: JSON.stringify({
                  jsonrpc: "2.0",
                  id: 1,
                  method: "server/discover",
                  params: {
                    _meta: {
                      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
                      "io.modelcontextprotocol/clientCapabilities": {},
                      "io.modelcontextprotocol/clientInfo": { name: "standalone-startup-fixture", version: "1.0" }
                    }
                  }
                })
              })
            ).pipe(
              Effect.timeout("100 millis"),
              Effect.retry(Schedule.spaced("10 millis")),
              Effect.timeout("2 seconds")
            )
            expect(response.status).toBe(200)
            expect(yield* Effect.promise(() => response.text())).toContain("serverInfo")
            return target
          }),
        Fiber.interrupt
      )
      const closed = yield* Effect.tryPromise((signal) => fetch(target, { signal })).pipe(
        Effect.timeout("2 seconds"),
        Effect.result
      )
      expect(closed._tag).toBe("Failure")
    }).pipe(Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(environment))))
  )
})
