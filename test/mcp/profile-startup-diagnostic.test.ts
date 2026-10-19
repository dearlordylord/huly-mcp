import { PassThrough } from "node:stream"
import { Deferred, Effect, Fiber, Schema } from "effect"
import { it as effectIt } from "@effect/vitest"
import { expect, it } from "vitest"
import { profileProbeEnvironment } from "../../scripts/probe-profile-startup.js"
import { runProfileStartupDiagnostic } from "../../src/profiles/startup-diagnostic.js"
import { CliProfileStoreError } from "../../src/profiles/model.js"

const ResponseSchema = Schema.fromJsonString(Schema.Struct({ id: Schema.Number, result: Schema.Json }))
it("removes credential overrides so native failure probes cannot bypass the selected profile", () => {
  const environment = profileProbeEnvironment({
    HULY_PROFILE: "work",
    SAFE: "value",
    HULY_TOKEN: "private-sentinel",
    HULY_URL: "https://override.invalid",
    OPTIONAL: undefined
  })
  expect(environment).toEqual({ HULY_PROFILE: "work", SAFE: "value" })
  expect(JSON.stringify(environment)).not.toContain("private-sentinel")
})
effectIt.effect("keeps profile failures available through MCP discovery and a diagnostic tool until EOF", () =>
  Effect.gen(function* () {
    const input = new PassThrough()
    const output: string[] = []
    const errors: string[] = []
    const ready = yield* Deferred.make<void>()
    const failure = new CliProfileStoreError({
      kind: "integration",
      message: "Keychain access failed. Unlock the original Keychain."
    })
    const fiber = yield* runProfileStartupDiagnostic(failure, "1.0.0", {
      input,
      writeOutput: (line) => output.push(line),
      writeError: (line) => {
        errors.push(line)
        Effect.runSync(Deferred.succeed(ready, undefined))
      }
    }).pipe(Effect.forkChild)
    yield* Deferred.await(ready)
    for (const [id, method, params] of [
      [1, "initialize", { protocolVersion: "2025-06-18" }],
      [2, "server/discover", {}],
      [3, "tools/list", {}],
      [4, "tools/call", { name: "get_huly_startup_diagnostic" }]
    ])
      input.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`)
    input.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`)
    input.end()
    yield* Fiber.join(fiber)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain("Unlock the original Keychain")
    const replies = output.map((line) => Schema.decodeUnknownSync(ResponseSchema)(line))
    expect(replies).toHaveLength(4)
    expect(replies[0]?.result).toMatchObject({ instructions: expect.stringContaining("Keychain access failed") })
    expect(replies[1]?.result).toMatchObject({ supportedVersions: ["2026-07-28"] })
    expect(replies[2]?.result).toMatchObject({
      tools: [{ name: "get_huly_startup_diagnostic", description: expect.stringContaining("Keychain") }]
    })
    expect(replies[3]?.result).toMatchObject({
      isError: true,
      structuredContent: { error: { code: "PROFILE_CREDENTIALS_UNAVAILABLE" } }
    })
  })
)

effectIt.effect("releases its stdin reader when the host interrupts startup diagnostics", () =>
  Effect.gen(function* () {
    const input = new PassThrough()
    const ready = yield* Deferred.make<void>()
    const fiber = yield* runProfileStartupDiagnostic(
      new CliProfileStoreError({ kind: "integration", message: "Keychain unavailable" }),
      "1.0.0",
      {
        input,
        writeOutput: () => {
          Effect.runSync(Deferred.succeed(ready, undefined))
        },
        writeError: () => {}
      }
    ).pipe(Effect.forkChild)
    input.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" })}\n`)
    yield* Deferred.await(ready)
    expect(input.listenerCount("data")).toBeGreaterThan(0)
    yield* Fiber.interrupt(fiber)
    expect(input.listenerCount("data")).toBe(0)
    input.destroy()
  })
)
