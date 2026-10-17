import * as fs from "node:fs/promises"
import { Deferred, Effect, Fiber } from "effect"
import { expect, it } from "vitest"

import { readResidentAttachment } from "../../src/resident/attachment-file.js"
import { runOwnedGeneration, withResidentSelection } from "../../src/resident/managed-selection.js"
import type { ResidentFilePath } from "../../src/resident/protected-path.js"
import { acquireSelectionClaim } from "../../src/resident/selection-claim.js"
import { captureResidentSelection } from "../../src/resident/selection-config.js"
import { makeStartupBudget } from "../../src/resident/startup-budget.js"
import { runConfiguredResidentServer } from "../../src/runtime/server-startup.js"
import { withRegistryDirectory } from "../helpers/resident-registry-fixture.js"

it("refuses two live compatible owners without selecting or replacing either", async () =>
  withRegistryDirectory((first) =>
    withRegistryDirectory((second) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const capture = yield* captureResidentSelection({
            HULY_URL: "https://duplicate-owner.invalid",
            HULY_WORKSPACE: "duplicate-owner",
            HULY_TOKEN: "duplicate-owner-fixture"
          })
          const start = (directory: typeof first, ready: Deferred.Deferred<ResidentFilePath>) =>
            Effect.gen(function* () {
              const startup = yield* makeStartupBudget
              yield* withResidentSelection({
                directory,
                capture,
                startup,
                existing: () => Effect.die("Unexpected existing owner"),
                absent: (ownership) =>
                  runOwnedGeneration(ownership, (publish) =>
                    runConfiguredResidentServer({
                      capture,
                      directory,
                      environment: {},
                      lifetime: "foreground",
                      startup,
                      report: (file) => publish(file).pipe(Effect.andThen(Deferred.succeed(ready, file)))
                    })
                  )
              })
            })
          const readyFirst = yield* Deferred.make<ResidentFilePath>()
          const readySecond = yield* Deferred.make<ResidentFilePath>()
          const ownerFirst = yield* start(first, readyFirst).pipe(Effect.forkChild)
          const ownerSecond = yield* start(second, readySecond).pipe(Effect.forkChild)
          try {
            yield* Deferred.await(readyFirst)
            const descriptor = yield* readResidentAttachment(yield* Deferred.await(readySecond))
            const copied = yield* withResidentSelection({
              directory: first,
              capture: { ...capture, selection: { ...capture.selection, lazyEnvs: true } },
              startup: yield* makeStartupBudget,
              existing: () => Effect.die("Different policy unexpectedly attached"),
              absent: (ownership) => ownership.registry.publish(descriptor)
            })
            try {
              const error = yield* withResidentSelection({
                directory: first,
                capture,
                startup: yield* makeStartupBudget,
                existing: () => Effect.die("Ambiguous owners were selected"),
                absent: () => Effect.die("Ambiguous owners were replaced")
              }).pipe(Effect.flip)
              expect(error._tag).toBe("ManagedLaunchError")
              expect("reason" in error ? error.reason : undefined).toBe("ownership")
              expect(ownerFirst.pollUnsafe()).toBeUndefined()
              expect(ownerSecond.pollUnsafe()).toBeUndefined()
            } finally {
              yield* Effect.acquireUseRelease(
                acquireSelectionClaim(first),
                () => copied.retire,
                (claim) => claim.release
              )
            }
          } finally {
            yield* Fiber.interrupt(ownerSecond)
            yield* Fiber.interrupt(ownerFirst)
          }
          expect(yield* Effect.promise(() => fs.readdir(first))).toEqual([])
          expect(yield* Effect.promise(() => fs.readdir(second))).toEqual([])
        })
      )
    )
  ))
