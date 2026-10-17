import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import * as path from "node:path"
import { createConnection } from "node:net"
import { ConfigProvider, Deferred, Effect, Fiber, Layer, Redacted, Result, Schema } from "effect"
import { TestClock } from "effect/testing"
import { expect, it } from "vitest"

import { McpServerError, McpServerService } from "../../src/mcp/server.js"
import { readResidentAttachment } from "../../src/resident/attachment-file.js"
import { makeManualResidentBackend } from "../../src/resident/manual-backend.js"
import type { ResidentFilePath } from "../../src/resident/protected-path.js"
import { ResidentEndpoint } from "../../src/resident/tls-channel.js"
import { TelemetryService } from "../../src/telemetry/telemetry.js"

const RESPONSE_BOUND = 5_000
const NON_PRIVATE_DIRECTORY = 0o755
const READY_PREFIX = "MCP HTTP server listening on "

const isListening = (endpoint: ResidentEndpoint) =>
  new Promise<boolean>((resolve, reject) => {
    const socket = createConnection({ host: endpoint.hostname, port: Number(endpoint.port) })
    socket.once("connect", () => {
      socket.destroy()
      resolve(true)
    })
    socket.once("error", (error) => {
      if (Schema.is(Schema.Struct({ code: Schema.Literal("ECONNREFUSED") }))(error)) resolve(false)
      else reject(error)
    })
  })

it.each(["stop", "interrupt"])("publishes after native application readiness and cleans up on %s", async (release) => {
  const directory = await fs.mkdtemp(path.join(await fs.realpath(tmpdir()), "resident-backend-"))
  try {
    await Effect.runPromise(
      Effect.gen(function* () {
        const backend = yield* makeManualResidentBackend
        yield* Effect.gen(function* () {
          const server = yield* McpServerService
          const reachedReady = yield* Deferred.make<void>()
          const releaseReady = yield* Deferred.make<void>()
          const published = yield* Deferred.make<ResidentFilePath>()
          const owner = yield* backend
            .run(
              {
                ...server,
                awaitReady: () =>
                  server
                    .awaitReady()
                    .pipe(
                      Effect.andThen(Deferred.succeed(reachedReady, undefined)),
                      Effect.andThen(Deferred.await(releaseReady))
                    )
              },
              (file) => Effect.runSync(Deferred.succeed(published, file))
            )
            .pipe(Effect.forkScoped)
          yield* Deferred.await(reachedReady)
          expect(yield* Effect.promise(() => fs.readdir(directory))).toEqual([])
          yield* Deferred.succeed(releaseReady, undefined)
          const descriptor = yield* readResidentAttachment(yield* Deferred.await(published))
          expect(Number(descriptor.endpoint.port)).toBeGreaterThan(0)
          expect(descriptor.endpoint.hostname).toBe("127.0.0.1")
          expect(Redacted.value(descriptor.authorization) === Redacted.value(backend.authorization)).toBe(true)
          if (release === "stop") {
            yield* server.stop()
            yield* Fiber.join(owner)
            const repeated = yield* Effect.result(backend.run(server, () => {}))
            expect(Result.isFailure(repeated)).toBe(true)
            if (Result.isFailure(repeated)) expect(repeated.failure._tag).toBe("ProtectedFileError")
          } else yield* Fiber.interrupt(owner)
          expect(yield* Effect.promise(() => fs.readdir(directory))).toEqual([])
        }).pipe(
          Effect.provide(
            McpServerService.layer({
              transport: "http",
              httpHost: "127.0.0.1",
              httpPort: 0,
              mcpAuthToken: backend.authorization,
              resolveClients: () => Promise.reject(new Error("Application readiness must not acquire Huly"))
            }).pipe(Layer.provide(TelemetryService.testLayer({})))
          )
        )
      }).pipe(
        Effect.scoped,
        Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ MCP_RESIDENT_STATE_DIRECTORY: directory }))),
        Effect.timeout(RESPONSE_BOUND)
      )
    )
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

it.each(["publication", "readiness", "timeout"])("closes the bound listener after %s failure", async (failure) => {
  const directory = await fs.mkdtemp(path.join(await fs.realpath(tmpdir()), "resident-startup-failure-"))
  try {
    if (failure === "publication") await fs.chmod(directory, NON_PRIVATE_DIRECTORY)
    await Effect.runPromise(
      Effect.gen(function* () {
        const backend = yield* makeManualResidentBackend
        const bound = yield* Deferred.make<ResidentEndpoint>()
        yield* Effect.gen(function* () {
          const server = yield* McpServerService
          const running = yield* Effect.result(
            backend.run(
              {
                ...server,
                awaitReady: () =>
                  server
                    .awaitReady()
                    .pipe(
                      Effect.andThen(Deferred.await(bound)),
                      Effect.andThen(
                        failure === "readiness"
                          ? Effect.fail(new McpServerError({ message: "Fixture startup failure" }))
                          : failure === "timeout"
                            ? Effect.never
                            : Effect.void
                      )
                    )
              },
              () => {
                throw new Error("Failed startup must not announce an attachment")
              }
            )
          ).pipe(Effect.forkScoped)
          const endpoint = yield* Deferred.await(bound)
          if (failure === "timeout") yield* TestClock.adjust("5 seconds")
          const result = yield* Fiber.join(running)
          expect(Result.isFailure(result)).toBe(true)
          if (Result.isFailure(result))
            expect(result.failure._tag).toBe(failure === "readiness" ? "McpServerError" : "ProtectedFileError")
          if (failure === "timeout" && Result.isFailure(result))
            expect(result.failure.message).toContain("readiness timed out after five seconds")
          expect(yield* Effect.promise(() => isListening(endpoint))).toBe(false)
          expect(yield* Effect.promise(() => fs.readdir(directory))).toEqual([])
        }).pipe(
          Effect.provide(
            McpServerService.layer({
              transport: "http",
              httpHost: "127.0.0.1",
              httpPort: 0,
              mcpAuthToken: backend.authorization,
              resolveClients: () => Promise.reject(new Error("Failed startup must not acquire Huly")),
              writeError: (line) => {
                if (line.startsWith(READY_PREFIX))
                  Effect.runSync(
                    Deferred.succeed(
                      bound,
                      Schema.decodeUnknownSync(ResidentEndpoint)(line.slice(READY_PREFIX.length).trim())
                    )
                  )
              }
            }).pipe(Layer.provide(TelemetryService.testLayer({})))
          )
        )
      }).pipe(
        Effect.scoped,
        Effect.provide(
          Layer.merge(
            ConfigProvider.layer(ConfigProvider.fromUnknown({ MCP_RESIDENT_STATE_DIRECTORY: directory })),
            TestClock.layer()
          )
        ),
        Effect.timeout(RESPONSE_BOUND)
      )
    )
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})
