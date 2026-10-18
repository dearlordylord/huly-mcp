import { createInterface } from "node:readline"
import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect, Redacted, Ref, Schema } from "effect"
import { afterAll, beforeAll, expect, it } from "vitest"

import { discoverLiveReadProtocol, liveReadMetadata } from "../../scripts/resident-live-protocol.js"
import {
  LiveProbeEnvironment,
  LiveReadProtocol,
  LiveReadProbeError
} from "../../scripts/resident-live-read-contract.js"
import { probeIo, withLiveProbeChild } from "../../scripts/resident-live-read-process.js"
import { MAX_ADAPTER_RESPONSE_BYTES } from "../../src/resident/adapter-limits.js"
import { ResidentAttachment } from "../../src/resident/attachment-file.js"
import { HostMessage } from "../../src/resident/request-headers.js"
import { BackendMessage } from "../../src/resident/response-stream.js"
import {
  withOutputValidationServer,
  OUTPUT_VALIDATION_TOOL,
  OutputValidationError,
  OutputValidationSuccess
} from "../helpers/output-validation-server.js"
import { fixturePackageVersion } from "../helpers/resident-fixture.js"

import { AUTHORIZATION } from "../helpers/resident-native-fixture.js"
import { buildIsolatedStdioServer } from "../helpers/stdio-build.js"
import { testStdioEnvironment } from "../helpers/stdio-environment.js"
import { ManagedPolicyScenario } from "./managed-policy-observation.js"

const PROCESS_BOUND = 30_000
const MAX_NOTIFICATIONS = 64
let bundle: Awaited<ReturnType<typeof buildIsolatedStdioServer>>
let failed = false
beforeAll(async () => {
  bundle = await buildIsolatedStdioServer(PROCESS_BOUND)
}, PROCESS_BOUND)
afterAll(async () => {
  if (!failed) await bundle.cleanup()
})

it.each(
  LiveReadProtocol.literals.flatMap((protocol) => ManagedPolicyScenario.literals.map((mode) => ({ protocol, mode })))
)(
  "preserves server output validation through the packaged adapter with $protocol / $mode",
  { timeout: PROCESS_BOUND },
  async ({ mode, protocol }) => {
    try {
      await Effect.runPromise(
        withOutputValidationServer(
          mode,
          (endpoint, identity, calls) =>
            Effect.acquireUseRelease(
              Effect.promise(async () => fs.mkdtemp(join(await fs.realpath(tmpdir()), "resident-output-contract-"))),
              (directory) =>
                Effect.gen(function* () {
                  const attachment = join(directory, `${identity.generation}.json`)
                  const implementationVersion = yield* Effect.promise(fixturePackageVersion)
                  const descriptor = Schema.decodeUnknownSync(ResidentAttachment)({
                    version: 1,
                    transport: "tls13-external-psk-v1",
                    endpoint: endpoint.href,
                    implementation: { name: "@firfi/huly-mcp", version: implementationVersion },
                    identity: { generation: identity.generation, key: Redacted.value(identity.key) },
                    authorization: Redacted.value(AUTHORIZATION)
                  })
                  yield* Effect.promise(() =>
                    fs.writeFile(attachment, Schema.encodeSync(Schema.fromJsonString(ResidentAttachment))(descriptor), {
                      mode: 0o600,
                      flag: "wx"
                    })
                  )
                  const environment = Schema.decodeUnknownSync(LiveProbeEnvironment)({
                    ...testStdioEnvironment(),
                    MCP_TRANSPORT: "stdio-http",
                    MCP_RESIDENT_ATTACHMENT_FILE: attachment
                  })
                  return yield* withLiveProbeChild([bundle.path], environment, (owned) =>
                    Effect.acquireUseRelease(
                      Effect.sync(() => createInterface({ input: owned.process.stdout })),
                      (lines) =>
                        Effect.gen(function* () {
                          const incoming = lines[Symbol.asyncIterator]()
                          const negotiation = { protocol, host: "first" } satisfies Parameters<
                            typeof liveReadMetadata
                          >[0]
                          const send = (frame: string) =>
                            probeIo(
                              "send",
                              () =>
                                new Promise<void>((resolve, reject) => {
                                  owned.process.stdin.write(`${frame}\n`, (error) =>
                                    error ? reject(error) : resolve()
                                  )
                                })
                            )
                          const request = (
                            id: NonNullable<HostMessage["id"]>,
                            method: string,
                            params: Readonly<Record<string, Schema.Json>>
                          ) =>
                            Effect.gen(function* () {
                              const frame = yield* Schema.encodeEffect(Schema.fromJsonString(HostMessage))({
                                jsonrpc: "2.0",
                                id,
                                method,
                                params: { ...params, ...liveReadMetadata(negotiation) }
                              })
                              yield* send(frame)
                              for (let count = 0; count <= MAX_NOTIFICATIONS; count++) {
                                const line = yield* probeIo("response", () => incoming.next())
                                if (line.done || Buffer.byteLength(line.value) > MAX_ADAPTER_RESPONSE_BYTES)
                                  return yield* new LiveReadProbeError({ phase: "response" })
                                const message = yield* Schema.decodeUnknownEffect(
                                  Schema.fromJsonString(BackendMessage)
                                )(line.value)
                                if (!("id" in message)) continue
                                if (message.id !== id || "error" in message)
                                  return yield* new LiveReadProbeError({ phase: "response" })
                                return message.result
                              }
                              return yield* new LiveReadProbeError({ phase: "response" })
                            }).pipe(
                              Effect.timeout("5 seconds"),
                              Effect.mapError(() => new LiveReadProbeError({ phase: "response" }))
                            )
                          yield* discoverLiveReadProtocol(negotiation, request, send)
                          const call = (valid: boolean, id: number) =>
                            request(
                              id,
                              "tools/call",
                              mode === "native"
                                ? { name: OUTPUT_VALIDATION_TOOL, arguments: { valid } }
                                : {
                                    name: "invoke_tool",
                                    arguments: { toolName: OUTPUT_VALIDATION_TOOL, arguments: { valid } }
                                  }
                            )
                          const error = yield* Schema.decodeUnknownEffect(OutputValidationError)(yield* call(false, 2))
                          expect(error.content.map((item) => item.text)).toEqual([
                            "Tool fixture_output produced invalid output"
                          ])
                          const accepted = yield* Schema.decodeUnknownEffect(OutputValidationSuccess)(
                            yield* call(true, 3)
                          )
                          expect(accepted.structuredContent.result).toEqual(
                            mode === "native"
                              ? { count: 1 }
                              : { toolName: OUTPUT_VALIDATION_TOOL, result: { count: 1 } }
                          )
                          expect(yield* Ref.get(calls)).toBe(2)
                          owned.process.stdin.end()
                          expect(yield* owned.closed).toEqual([0, null])
                        }),
                      (lines) => Effect.sync(() => lines.close())
                    )
                  )
                }),
              (directory) => Effect.promise(() => fs.rm(directory, { recursive: true, force: true }))
            ),
          true
        )
      )
    } catch (error) {
      failed = true
      throw error
    }
  }
)
