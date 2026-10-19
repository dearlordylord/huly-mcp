import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { NodeHttpClient } from "@effect/platform-node"
import { ConfigProvider, Deferred, Effect, Fiber, Layer, Option, Redacted, Schema } from "effect"
import { HttpClientRequest } from "effect/http"
import { expect, it } from "vitest"

import { McpServerService } from "../../src/mcp/server.js"
import { readResidentAttachment } from "../../src/resident/attachment-file.js"
import { ResidentSelection } from "../../src/resident/compatibility-contract.js"
import { makeManualResidentBackend } from "../../src/resident/manual-backend.js"
import type { ResidentFilePath } from "../../src/resident/protected-path.js"
import { makeStartupBudget } from "../../src/resident/startup-budget.js"
import { withResidentHttpsAgent } from "../../src/resident/tls-channel.js"
import { TelemetryService } from "../../src/telemetry/telemetry.js"

const selection = Schema.decodeUnknownSync(ResidentSelection)({
  huly: {
    url: "https://huly.invalid",
    workspace: "fixture",
    auth: { _tag: "token", token: "fixture-private-token" },
    connectionTimeout: 1_000
  },
  policy: { toolsets: [], tools: [], exposure: { configuredMode: "auto", proxyOutputStrict: false } },
  lazyEnvs: false
})

it.each(["manual", "foreground", "managed"] as const)(
  "only managed lifetime accepts operator stop and waits for actual %s resource cleanup",
  async (mode) => {
    const directory = await fs.mkdtemp(join(await fs.realpath(tmpdir()), "resident-operator-stop-"))
    try {
      await Effect.runPromise(
        Effect.gen(function* () {
          const startup = yield* makeStartupBudget
          const backend = yield* makeManualResidentBackend(
            mode === "manual" ? { mode: "manual" } : { mode: "configured", lifetime: mode, selection, startup }
          )
          const cleaning = yield* Deferred.make<void>()
          const finish = yield* Deferred.make<void>()
          yield* Effect.gen(function* () {
            const server = yield* McpServerService
            const published = yield* Deferred.make<ResidentFilePath>()
            const owner = yield* backend
              .run(server, (file) => Deferred.succeed(published, file))
              .pipe(Effect.forkScoped)
            const file = yield* Deferred.await(published)
            const descriptor = yield* readResidentAttachment(file)
            try {
              const status = yield* withResidentHttpsAgent(descriptor.endpoint, descriptor.identity, (agent) =>
                Effect.gen(function* () {
                  const client = yield* NodeHttpClient.makeNodeHttp.pipe(
                    Effect.provideService(NodeHttpClient.HttpAgent, { http: agent, https: agent })
                  )
                  const response = yield* client.execute(
                    HttpClientRequest.post(new URL("/resident/control/stop-v1", descriptor.endpoint).href).pipe(
                      HttpClientRequest.setHeader(
                        "authorization",
                        `Bearer ${Redacted.value(descriptor.authorization)}`
                      ),
                      HttpClientRequest.bodyText(
                        JSON.stringify({ stopWire: 1, generation: descriptor.identity.generation }),
                        "application/json"
                      )
                    )
                  )
                  yield* response.text
                  return response.status
                })
              )
              expect(status).toBe(mode === "managed" ? 202 : 409)
              const stopping =
                mode === "managed" ? Option.none() : Option.some(yield* server.stop().pipe(Effect.forkScoped))
              yield* Deferred.await(cleaning)
              expect(owner.pollUnsafe()).toBeUndefined()
              expect((yield* readResidentAttachment(file)).identity.generation).toBe(descriptor.identity.generation)
              yield* Deferred.succeed(finish, undefined)
              if (Option.isSome(stopping)) yield* Fiber.join(stopping.value)
              yield* Fiber.join(owner)
              expect(yield* Effect.promise(() => fs.readdir(directory))).toEqual([])
            } finally {
              yield* Deferred.succeed(finish, undefined)
            }
          }).pipe(
            Effect.provide(
              McpServerService.layer({
                transport: "http",
                httpHost: "127.0.0.1",
                httpPort: 0,
                mcpAuthToken: backend.authorization,
                ...backend.httpPolicy(Effect.succeed("inactive")),
                resolveClients: () => Promise.reject(new Error("Operator stop must not acquire Huly")),
                closeClients: () =>
                  Effect.runPromise(Deferred.succeed(cleaning, undefined).pipe(Effect.andThen(Deferred.await(finish))))
              }).pipe(Layer.provide(TelemetryService.testLayer({})))
            )
          )
        }).pipe(
          Effect.scoped,
          Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ MCP_RESIDENT_STATE_DIRECTORY: directory }))),
          Effect.timeout("5 seconds")
        )
      )
    } finally {
      await fs.rm(directory, { recursive: true, force: true })
    }
  }
)
