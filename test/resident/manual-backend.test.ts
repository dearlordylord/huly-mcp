import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import * as path from "node:path"
import { createConnection } from "node:net"
import { ConfigProvider, Deferred, Effect, Fiber, Layer, Option, Redacted, Result, Schema } from "effect"
import { TestClock } from "effect/testing"
import { expect, it } from "vitest"

import { McpServerError, McpServerService } from "../../src/mcp/server.js"
import { withAdapterAttachment } from "../../src/resident/adapter-attachment.js"
import { HostMessage } from "../../src/resident/request-headers.js"
import { readResidentAttachment } from "../../src/resident/attachment-file.js"
import { makeManualResidentBackend } from "../../src/resident/manual-backend.js"
import { readResidentLiveStatus } from "../../src/resident/status-client.js"
import type { ResidentFilePath } from "../../src/resident/protected-path.js"
import { ResidentEndpoint, withResidentHttpsAgent } from "../../src/resident/tls-channel.js"
import { NodeHttpClient } from "@effect/platform-node"
import { HttpClientRequest } from "effect/http"
import { RESIDENT_ATTACHMENTS_PATH } from "../../src/resident/admission-contract.js"
import { TelemetryService } from "../../src/telemetry/telemetry.js"

const RESPONSE_BOUND = 5_000
const NON_PRIVATE_DIRECTORY = 0o755
const READY_PREFIX = "MCP HTTP server listening on "

it("fences attachment admission before held native client cleanup during normal stop", async () => {
  const directory = await fs.mkdtemp(path.join(await fs.realpath(tmpdir()), "resident-stop-fence-"))
  try {
    await Effect.runPromise(
      Effect.gen(function* () {
        const backend = yield* makeManualResidentBackend()
        const cleaning = yield* Deferred.make<void>()
        const finish = yield* Deferred.make<void>()
        yield* Effect.gen(function* () {
          const server = yield* McpServerService
          const published = yield* Deferred.make<ResidentFilePath>()
          const owner = yield* backend
            .run(server, (file) => Deferred.succeed(published, file).pipe(Effect.asVoid))
            .pipe(Effect.forkScoped)
          const file = yield* Deferred.await(published)
          const descriptor = yield* readResidentAttachment(file)
          const stopping = yield* server.stop().pipe(Effect.forkScoped)
          yield* Deferred.await(cleaning)
          try {
            const status = yield* withResidentHttpsAgent(descriptor.endpoint, descriptor.identity, (agent) =>
              Effect.gen(function* () {
                const client = yield* NodeHttpClient.makeNodeHttp.pipe(
                  Effect.provideService(NodeHttpClient.HttpAgent, { http: agent, https: agent })
                )
                const response = yield* client.execute(
                  HttpClientRequest.post(new URL(RESIDENT_ATTACHMENTS_PATH, descriptor.endpoint).href).pipe(
                    HttpClientRequest.setHeader("authorization", `Bearer ${Redacted.value(descriptor.authorization)}`)
                  )
                )
                yield* response.text
                return response.status
              })
            )
            expect(status).toBe(409)
            expect((yield* readResidentAttachment(file)).identity.generation).toBe(descriptor.identity.generation)
          } finally {
            yield* Deferred.succeed(finish, undefined)
          }
          yield* Fiber.join(stopping)
          yield* Fiber.join(owner)
          expect(yield* Effect.promise(() => fs.readdir(directory))).toEqual([])
        }).pipe(
          Effect.provide(
            McpServerService.layer({
              transport: "http",
              httpHost: "127.0.0.1",
              httpPort: 0,
              mcpAuthToken: backend.authorization,
              ...backend.httpPolicy,
              resolveClients: () => Promise.reject(new Error("Shutdown fixture must not acquire Huly")),
              closeClients: () =>
                Effect.runPromise(Deferred.succeed(cleaning, undefined).pipe(Effect.andThen(Deferred.await(finish))))
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
        const backend = yield* makeManualResidentBackend()
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
              (file) => Deferred.succeed(published, file).pipe(Effect.asVoid)
            )
            .pipe(Effect.forkScoped)
          yield* Deferred.await(reachedReady)
          expect(yield* Effect.promise(() => fs.readdir(directory))).toEqual([])
          yield* Deferred.succeed(releaseReady, undefined)
          const descriptor = yield* readResidentAttachment(yield* Deferred.await(published))
          expect(yield* readResidentLiveStatus(descriptor)).toMatchObject({
            kind: "authenticated",
            status: { readiness: "ready", work: { attachments: 0, retainedRequests: 0 } }
          })
          const status = yield* withAdapterAttachment(descriptor, (exchange) =>
            exchange(HostMessage.make({ jsonrpc: "2.0", id: 1, method: "ping" }), Option.none(), (response) =>
              response.text.pipe(Effect.as(response.status))
            )
          )
          expect(status).toBe(200)
          expect(Number(descriptor.endpoint.port)).toBeGreaterThan(0)
          expect(descriptor.endpoint.hostname).toBe("127.0.0.1")
          expect(Redacted.value(descriptor.authorization) === Redacted.value(backend.authorization)).toBe(true)
          if (release === "stop") {
            yield* server.stop()
            yield* Fiber.join(owner)
            const repeated = yield* Effect.result(backend.run(server, () => Effect.void))
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
              ...backend.httpPolicy,
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
        const backend = yield* makeManualResidentBackend()
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
              () => Effect.die(new Error("Failed startup must not announce an attachment"))
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
              ...backend.httpPolicy,
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
