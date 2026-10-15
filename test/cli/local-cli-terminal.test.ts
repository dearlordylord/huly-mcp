import { Effect, Result, Schema } from "effect"
import { expect, it } from "vitest"

import { LocalCliService } from "../../packages/huly-cli/src/local-cli-ports.js"
import { ResolvedCliConfigurationSchema } from "../../src/profiles/model.js"

it.skipIf(Boolean(process.stdin.isTTY || process.stdout.isTTY))(
  "refuses implicit terminal prompts in a noninteractive process",
  async () => {
    const results = await Effect.runPromise(
      Effect.gen(function* () {
        const ports = yield* LocalCliService
        return [
          yield* ports.prompt("Huly email").pipe(Effect.result),
          yield* ports.promptSecret("Huly token").pipe(Effect.result)
        ]
      }).pipe(Effect.provide(LocalCliService.defaultLayer))
    )
    for (const result of results) expect(result._tag).toBe("Failure")
    expect(JSON.stringify(results)).toContain("privately from a terminal")
  }
)

it("reports missing live-check configuration through the typed adapter failure", async () => {
  const configuration = Schema.decodeUnknownSync(ResolvedCliConfigurationSchema)({
    auth: { method: "none" },
    sources: { authentication: "none" }
  })
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const ports = yield* LocalCliService
      return yield* ports.checkConnection(configuration).pipe(Effect.result)
    }).pipe(Effect.provide(LocalCliService.defaultLayer))
  )
  expect(Result.isFailure(result)).toBe(true)
  expect(JSON.stringify(result)).toContain("Huly connection check failed")
})
