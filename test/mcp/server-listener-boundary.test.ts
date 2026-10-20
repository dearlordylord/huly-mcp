import type { Server } from "node:http"
import { ConfigProvider, Effect, Layer } from "effect"
import type { HttpServer } from "effect/http"
import { NetAddress } from "effect/net"
import { expect, it } from "vitest"

import { DEFAULT_HTTP_PORT, type HttpServerFactory, HttpServerFactoryService } from "../../src/mcp/http-transport.js"
import { McpServerService } from "../../src/mcp/server.js"
import { TelemetryService } from "../../src/telemetry/telemetry.js"
import { makeTestHttpServerFactory } from "./http-test-support.js"

it.each(["unix", "zero", "default-port"])(
  "refuses a %s listener address before application readiness and closes its listener",
  async (mode) => {
    let owned: Server | undefined
    let requestedPort: number | undefined
    let discoveries = 0
    const native = makeTestHttpServerFactory((server) => {
      owned = server
    })
    const factory: HttpServerFactory = {
      make: (port, host, grace) => {
        requestedPort = port
        return native
          .make(0, host, grace)
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
    }
    await Effect.runPromise(
      Effect.gen(function* () {
        const server = yield* McpServerService
        const failure = yield* server.run().pipe(Effect.flip)
        expect(failure.message).toContain(mode === "unix" ? "requires a TCP listener" : "invalid bound port")
        expect(owned?.listening).toBe(false)
        expect(requestedPort).toBe(mode === "default-port" ? DEFAULT_HTTP_PORT : 0)
        expect(discoveries).toBe(0)
        expect((yield* server.awaitReady().pipe(Effect.exit))._tag).toBe("Failure")
      }).pipe(
        Effect.scoped,
        Effect.provide(
          McpServerService.layer({
            transport: "http",
            httpHost: "127.0.0.1",
            ...(mode === "default-port" ? {} : { httpPort: 0 }),
            onDiscovery: () => {
              discoveries++
            },
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
