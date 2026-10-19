import * as fs from "node:fs/promises"
import { ConfigProvider, Deferred, Effect, Exit, Fiber, Layer, Redacted, Result, Schema } from "effect"
import { expect, it } from "vitest"

import { ResidentAttachment, withPublishedResidentAttachment } from "../../src/resident/attachment-file.js"
import {
  prepareManagedDirectory,
  runOwnedGeneration,
  withResidentSelection
} from "../../src/resident/managed-selection.js"
import { captureResidentSelection } from "../../src/resident/selection-config.js"
import { makeStartupBudget } from "../../src/resident/startup-budget.js"
import { runConfiguredResidentServer } from "../../src/runtime/server-startup.js"
import { acquireSelectionClaim, SelectionClaimError } from "../../src/resident/selection-claim.js"
import { ResidentFilePath } from "../../src/resident/protected-path.js"
import { MAX_REGISTRY_RECORDS, ResidentRegistryEnvelope } from "../../src/resident/managed-contract.js"
import { registryAttachment, withRegistryDirectory } from "../helpers/resident-registry-fixture.js"
import { makeManualResidentBackend } from "../../src/resident/manual-backend.js"
import { McpServerService } from "../../src/mcp/server.js"
import { TelemetryService } from "../../src/telemetry/telemetry.js"

const OWNER_PROCESS_BOUND = 30_000
const NON_PRIVATE_DIRECTORY = 0o755
const PRIVATE_DIRECTORY = 0o700

const withOwner = <A, E>(
  use: (
    ownership: Parameters<typeof runOwnedGeneration>[0],
    capture: Effect.Success<ReturnType<typeof captureResidentSelection>>
  ) => Effect.Effect<A, E>
) =>
  withRegistryDirectory(async (directory) => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const capture = yield* captureResidentSelection({
          HULY_URL: "https://owner.invalid",
          HULY_WORKSPACE: "owner",
          HULY_TOKEN: "owner-fixture"
        })
        const startup = yield* makeStartupBudget
        yield* withResidentSelection({
          directory,
          capture,
          startup,
          existing: () => Effect.die("Unexpected existing generation"),
          absent: (ownership) => use(ownership, capture)
        })
      })
    )
  })

it("retains its registry after native transport drain fails", async () =>
  withOwner((ownership, capture) =>
    Effect.gen(function* () {
      const backend = yield* makeManualResidentBackend({
        mode: "configured",
        selection: capture.selection,
        lifetime: "foreground",
        startup: yield* makeStartupBudget
      })
      const outcome = yield* Effect.gen(function* () {
        const server = yield* McpServerService
        return yield* runOwnedGeneration(ownership, (ready) =>
          backend.run(server, (file) => ready(file).pipe(Effect.andThen(server.stop())))
        )
      }).pipe(
        Effect.provide(
          McpServerService.layer({
            transport: "http",
            httpHost: "127.0.0.1",
            httpPort: 0,
            mcpAuthToken: backend.authorization,
            ...backend.httpPolicy(Effect.succeed("inactive")),
            resolveClients: () => Promise.reject(new Error("Retirement fixture must not acquire Huly")),
            closeClients: () => Promise.reject(new Error("private client close cause"))
          }).pipe(Layer.provide(TelemetryService.testLayer({})))
        ),
        Effect.result
      )
      expect(Result.isFailure(outcome)).toBe(true)
      if (Result.isFailure(outcome)) expect(outcome.failure.message).toContain("retirement remains unconfirmed")
      expect(yield* Effect.promise(() => fs.readdir(`${ownership.directory}/generations`))).toHaveLength(1)
      const refused = yield* withResidentSelection({
        directory: ownership.directory,
        capture,
        startup: yield* makeStartupBudget,
        existing: () => Effect.die("Unconfirmed transport reattached"),
        absent: () => Effect.die("Unconfirmed transport was replaced")
      }).pipe(Effect.result)
      expect(Result.isFailure(refused)).toBe(true)
    }).pipe(
      Effect.scoped,
      Effect.provide(
        ConfigProvider.layer(ConfigProvider.fromUnknown({ MCP_RESIDENT_STATE_DIRECTORY: ownership.directory }))
      ),
      Effect.timeout("5 seconds")
    )
  ))

it("bounds claim contention without removing the still-owned claim", { timeout: OWNER_PROCESS_BOUND }, async () =>
  withOwner((ownership, capture) =>
    Effect.gen(function* () {
      const error = yield* withResidentSelection({
        directory: ownership.directory,
        capture,
        startup: yield* makeStartupBudget,
        existing: () => Effect.die("Unexpected attachment during contention"),
        absent: () => Effect.die("Owned claim was stolen")
      }).pipe(Effect.flip)
      expect("reason" in error ? error.reason : undefined).toBe("deadline")
      expect(yield* Effect.promise(() => fs.readdir(ownership.directory))).toContain("selection.claim")
    })
  )
)

it("refuses invalid ownership immediately instead of retrying it as claim contention", async () =>
  withOwner((ownership, capture) =>
    Effect.gen(function* () {
      yield* Effect.promise(() => fs.chmod(ownership.directory, NON_PRIVATE_DIRECTORY))
      try {
        const error = yield* withResidentSelection({
          directory: ownership.directory,
          capture,
          startup: yield* makeStartupBudget,
          existing: () => Effect.die("Invalid private ownership attached"),
          absent: () => Effect.die("Invalid private ownership launched")
        }).pipe(Effect.flip, Effect.timeout("1 second"))
        expect(error._tag).toBe("ProtectedFileError")
      } finally {
        yield* Effect.promise(() => fs.chmod(ownership.directory, PRIVATE_DIRECTORY))
      }
    })
  ))

it(
  "retains publication when another selector prevents confirmed bounded retirement",
  { timeout: OWNER_PROCESS_BOUND },
  async () =>
    withOwner((ownership) =>
      Effect.gen(function* () {
        let held: Effect.Success<ReturnType<typeof acquireSelectionClaim>> | undefined
        try {
          const error = yield* withPublishedResidentAttachment(ownership.directory, registryAttachment(), (file) =>
            runOwnedGeneration(ownership, (ready) =>
              Effect.gen(function* () {
                yield* ready(file)
                held = yield* acquireSelectionClaim(ownership.directory)
              })
            )
          ).pipe(Effect.flip)
          expect("reason" in error ? error.reason : undefined).toBe("retirement")
          expect(yield* ownership.registry.inventory).toHaveLength(1)
        } finally {
          if (held !== undefined) yield* held.release
        }
      })
    )
)

it("never retries a started owner operation because its failure resembles acquisition contention", async () =>
  withOwner((ownership, capture) =>
    Effect.gen(function* () {
      yield* ownership.release
      let calls = 0
      const error = yield* withResidentSelection({
        directory: ownership.directory,
        capture,
        startup: yield* makeStartupBudget,
        existing: () => Effect.die("Unexpected attachment"),
        absent: () =>
          Effect.sync(() => {
            calls++
          }).pipe(
            Effect.andThen(
              Effect.fail(
                new SelectionClaimError({ reason: "busy", message: "Fixture failure after operation started" })
              )
            )
          )
      }).pipe(Effect.flip, Effect.timeout("1 second"))
      expect("reason" in error ? error.reason : undefined).toBe("busy")
      expect(calls).toBe(1)
    })
  ))

it("refuses a managed state directory below a regular file before claiming ownership", async () =>
  withRegistryDirectory(async (directory) => {
    const file = `${directory}/regular-file`
    await fs.writeFile(file, "fixture", { mode: 0o600 })
    const error = await Effect.runPromise(
      prepareManagedDirectory.pipe(
        Effect.provide(
          ConfigProvider.layer(ConfigProvider.fromUnknown({ MCP_RESIDENT_STATE_DIRECTORY: `${file}/state` }))
        ),
        Effect.flip
      )
    )
    expect("reason" in error ? error.reason : undefined).toBe("ownership")
    expect(await fs.readdir(directory)).toEqual(["regular-file"])
  }))

for (const count of [1, MAX_REGISTRY_RECORDS]) {
  it(`keeps ${count} incompatible generations opaque and refuses launch at capacity`, async () =>
    withOwner((ownership, capture) =>
      Effect.gen(function* () {
        for (let index = 0; index < count; index++) {
          const descriptor = registryAttachment()
          const receipt = yield* ownership.registry.publish(descriptor)
          yield* Effect.promise(() =>
            fs.writeFile(
              `${ownership.directory}/${descriptor.identity.generation}.json`,
              Schema.encodeSync(Schema.fromJsonString(ResidentAttachment))(descriptor),
              { mode: 0o600, flag: "wx" }
            )
          )
          const records = yield* ownership.registry.inventory
          const record = records.find((entry) => entry.file === receipt.file)
          if (record === undefined) return yield* Effect.die("Fixture publication missing")
          const old = {
            ...record.envelope,
            implementation: { ...record.envelope.implementation, version: "older-fixture-version" },
            descriptor: Redacted.make({ opaque: true })
          }
          yield* Effect.promise(() =>
            fs.writeFile(receipt.file, Schema.encodeSync(Schema.fromJsonString(ResidentRegistryEnvelope))(old))
          )
        }
        yield* ownership.release
        let launched = false
        const selected = yield* withResidentSelection({
          directory: ownership.directory,
          capture,
          startup: yield* makeStartupBudget,
          existing: () => Effect.die("Incompatible descriptor was contacted"),
          absent: () =>
            Effect.sync(() => {
              launched = true
            })
        }).pipe(Effect.exit)
        expect(Exit.isSuccess(selected)).toBe(count < MAX_REGISTRY_RECORDS)
        expect(launched).toBe(count < MAX_REGISTRY_RECORDS)
        expect(yield* ownership.registry.inventory).toHaveLength(count)
      })
    ))
}

it("admits an existing compatible owner and releases selection ownership before caller use", async () =>
  withOwner((ownership, capture) =>
    Effect.gen(function* () {
      const published = yield* Deferred.make<void>()
      const startup = yield* makeStartupBudget
      const server = yield* runOwnedGeneration(ownership, (ready) =>
        runConfiguredResidentServer({
          capture,
          directory: ownership.directory,
          environment: {},
          lifetime: "foreground",
          startup,
          report: (file) => ready(file).pipe(Effect.andThen(Deferred.succeed(published, undefined)))
        })
      ).pipe(Effect.forkChild)
      yield* Deferred.await(published)
      try {
        const different = {
          ...capture,
          selection: { ...capture.selection, huly: { ...capture.selection.huly, workspace: "another" } }
        }
        const mismatch = yield* withResidentSelection({
          directory: ownership.directory,
          capture: different,
          startup: yield* makeStartupBudget,
          existing: () => Effect.die("Different authority attached to the existing owner"),
          absent: (unmatched) => unmatched.registry.inventory.pipe(Effect.map((records) => records.length))
        })
        expect(mismatch).toBe(1)
        const result = yield* withResidentSelection({
          directory: ownership.directory,
          capture,
          startup: yield* makeStartupBudget,
          existing: () =>
            Effect.gen(function* () {
              const claim = yield* acquireSelectionClaim(ownership.directory)
              yield* claim.release
              return "admitted existing"
            }),
          absent: () => Effect.die("Compatible generation was lost")
        })
        expect(result).toBe("admitted existing")
      } finally {
        yield* Fiber.interrupt(server)
      }
    })
  ))

it("requires application readiness before a successful owner exit", async () =>
  withOwner((ownership) =>
    Effect.gen(function* () {
      const error = yield* runOwnedGeneration(ownership, () => Effect.void).pipe(Effect.flip)
      expect("reason" in error ? error.reason : undefined).toBe("protocol")
      expect(yield* ownership.registry.inventory).toEqual([])
    })
  ))

it("refuses readiness from a different directory before publishing", async () =>
  withOwner((ownership) =>
    Effect.gen(function* () {
      const error = yield* runOwnedGeneration(ownership, (ready) =>
        ready(ResidentFilePath.make("/another-owner/generation.json"))
      ).pipe(Effect.flip)
      expect("reason" in error ? error.reason : undefined).toBe("ownership")
      expect(yield* ownership.registry.inventory).toEqual([])
    })
  ))

it("fences a retained readiness callback after the owner has exited", async () =>
  withOwner((ownership) =>
    Effect.gen(function* () {
      const retained = yield* Deferred.make<Parameters<Parameters<typeof runOwnedGeneration>[1]>[0]>()
      yield* runOwnedGeneration(ownership, (ready) => Deferred.succeed(retained, ready)).pipe(Effect.exit)
      const ready = yield* Deferred.await(retained)
      expect(
        Exit.isFailure(yield* ready(ResidentFilePath.make(`${ownership.directory}/late.json`)).pipe(Effect.exit))
      ).toBe(true)
      expect(yield* ownership.registry.inventory).toEqual([])
    })
  ))

it("publishes once and removes only confirmed completed ownership", async () =>
  withOwner((ownership) =>
    withPublishedResidentAttachment(ownership.directory, registryAttachment(), (file) =>
      runOwnedGeneration(ownership, (ready) =>
        Effect.gen(function* () {
          yield* ready(file)
          expect(yield* ownership.registry.inventory).toHaveLength(1)
        })
      )
    ).pipe(
      Effect.andThen(
        Effect.promise(async () => {
          expect(await fs.readdir(ownership.directory)).toEqual([])
        })
      )
    )
  ))

it("retains published evidence when owner shutdown reports failure", async () =>
  withOwner((ownership) =>
    Effect.gen(function* () {
      const result = yield* withPublishedResidentAttachment(ownership.directory, registryAttachment(), (file) =>
        runOwnedGeneration(ownership, (ready) => ready(file).pipe(Effect.andThen(Effect.fail("cleanup not confirmed"))))
      ).pipe(Effect.exit)
      expect(Exit.isFailure(result)).toBe(true)
      expect(yield* ownership.registry.inventory).toHaveLength(1)
      const files = yield* Effect.promise(() => fs.readdir(ownership.directory))
      expect(files).toEqual(["generations"])
    })
  ))

it("consumes readiness before a repeated callback and retains the uncertain generation", async () =>
  withOwner((ownership) =>
    Effect.gen(function* () {
      const error = yield* withPublishedResidentAttachment(ownership.directory, registryAttachment(), (file) =>
        runOwnedGeneration(ownership, (ready) => ready(file).pipe(Effect.andThen(ready(file))))
      ).pipe(Effect.flip)
      expect("reason" in error ? error.reason : undefined).toBe("protocol")
      expect(yield* ownership.registry.inventory).toHaveLength(1)
    })
  ))
