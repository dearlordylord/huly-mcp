import type { Server } from "node:http"
import { ConfigProvider, Effect, Layer } from "effect"
import type { HttpServer } from "effect/http"
import { NetAddress } from "effect/net"
import { expect, it } from "vitest"

import { type HttpServerFactory, HttpServerFactoryService } from "../../src/mcp/http-transport.js"
import { McpServerService } from "../../src/mcp/server.js"
import { TelemetryService } from "../../src/telemetry/telemetry.js"
import { makeTestHttpServerFactory } from "./http-test-support.js"

it.each(["unix", "zero"])(
  "refuses a %s listener address before application readiness and closes its listener",
  async (mode) => {
    let owned: Server | undefined
    const native = makeTestHttpServerFactory((server) => {
      owned = server
    })
    const factory: HttpServerFactory = {
      make: (port, host, grace) =>
        native
          .make(port, host, grace)
          .pipe(
            Effect.map(
              (listener) =>
                ({
                  ...listener,
                  address:
                    mode === "unix"
                      ? NetAddress.unixPathAddress("/fixture")
                      : NetAddress.socketAddressFromInputUnsafe({ address: "127.0.0.1", port: 0 })
                }) satisfies HttpServer.HttpServer["Service"]
            )
          )
    }
    await Effect.runPromise(
      Effect.gen(function* () {
        const server = yield* McpServerService
        const failure = yield* server.run().pipe(Effect.flip)
        expect(failure.message).toContain(mode === "unix" ? "requires a TCP listener" : "invalid bound port")
        expect(owned?.listening).toBe(false)
        expect((yield* server.awaitReady().pipe(Effect.exit))._tag).toBe("Failure")
      }).pipe(
        Effect.scoped,
        Effect.provide(
          McpServerService.layer({
            transport: "http",
            httpHost: "127.0.0.1",
            httpPort: 0,
            resolveClients: () => Promise.reject(new Error("Must not acquire Huly before readiness")),
            writeError: () => {}
          }).pipe(Layer.provide(TelemetryService.testLayer()))
        ),
        Effect.provideService(HttpServerFactoryService, factory),
        Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({}))),
        Effect.timeout("5 seconds")
      )
    )
  }
)
