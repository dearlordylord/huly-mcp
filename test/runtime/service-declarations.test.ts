import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer } from "effect"

import { Diagnostics, makeDiagnosticsScope } from "../../src/huly/diagnostics.js"
import { HulySdk, type HulySdkDependencies } from "../../src/huly/sdk-deps.js"
import { TelemetryService, type TelemetryOperations } from "../../src/telemetry/telemetry.js"

describe("service declarations", () => {
  it("preserves the independently collectible service identifiers", () => {
    assert.deepStrictEqual(
      [Diagnostics.key, HulySdk.key, TelemetryService.key],
      ["@hulymcp/Diagnostics", "@hulymcp/HulySdk", "@hulymcp/Telemetry"]
    )
  })

  it.effect("reaches a Diagnostics service provided directly", () =>
    Effect.gen(function* () {
      const scope = yield* makeDiagnosticsScope
      const diagnostics = yield* Diagnostics.pipe(Effect.provideService(Diagnostics, scope.service))

      assert.strictEqual(diagnostics, scope.service)
      assert.deepStrictEqual(yield* scope.drainWarnings, [])
    })
  )

  it.effect("provides the default Huly SDK and permits explicit layer substitution", () =>
    Effect.gen(function* () {
      const defaultSdk = yield* HulySdk.pipe(Effect.provide(HulySdk.defaultLayer))
      const loadServerConfig: HulySdkDependencies["loadServerConfig"] = (url) => defaultSdk.loadServerConfig(url)
      const replacement: HulySdkDependencies = { ...defaultSdk, loadServerConfig }
      const sdk = yield* HulySdk.pipe(Effect.provide(Layer.succeed(HulySdk, replacement)))

      assert.strictEqual(sdk, replacement)
      assert.strictEqual(sdk.loadServerConfig, loadServerConfig)
    })
  )

  it.effect("reaches a substituted Telemetry service operation", () => {
    let started = false
    const sessionStart: TelemetryOperations["sessionStart"] = () => {
      started = true
    }

    return Effect.gen(function* () {
      const telemetry = yield* TelemetryService
      telemetry.sessionStart({ transport: "stdio", authMethod: "token", toolCount: 0, toolsets: null })

      assert.strictEqual(telemetry.sessionStart, sessionStart)
      assert.isTrue(started)
    }).pipe(Effect.provide(TelemetryService.testLayer({ sessionStart })))
  })
})
