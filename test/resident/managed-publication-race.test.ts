import * as fs from "node:fs/promises"
import { Cause, Deferred, Effect, Exit, Fiber } from "effect"
import { expect, it } from "vitest"

import { withPublishedResidentAttachment } from "../../src/resident/attachment-file.js"
import { openGenerationRegistry } from "../../src/resident/generation-registry.js"
import { runOwnedGeneration } from "../../src/resident/managed-selection.js"
import { acquireSelectionClaim } from "../../src/resident/selection-claim.js"
import { registryAttachment, withRegistryDirectory } from "../helpers/resident-registry-fixture.js"

it("joins publication completing during interruption before retiring its exact registry receipt", async () =>
  withRegistryDirectory(async (directory) => {
    await Effect.runPromise(
      Effect.acquireUseRelease(
        acquireSelectionClaim(directory),
        (claim) =>
          withPublishedResidentAttachment(directory, registryAttachment(), (file) =>
            Effect.gen(function* () {
              const registry = yield* openGenerationRegistry(directory)
              const entered = yield* Deferred.make<void>()
              const release = yield* Deferred.make<void>()
              const exiting = yield* Deferred.make<void>()
              const publish = Effect.fnUntraced(function* (descriptor: Parameters<typeof registry.publish>[0]) {
                yield* Deferred.succeed(entered, undefined)
                yield* Deferred.await(release)
                return yield* registry.publish(descriptor)
              }, Effect.uninterruptible)
              yield* Effect.gen(function* () {
                const owner = yield* runOwnedGeneration(
                  { directory, release: claim.release, registry: { ...registry, publish } },
                  (ready) =>
                    Effect.gen(function* () {
                      yield* ready(file).pipe(Effect.forkChild)
                      yield* Deferred.await(entered)
                      return yield* Effect.never.pipe(Effect.onInterrupt(() => Deferred.succeed(exiting, undefined)))
                    })
                ).pipe(Effect.forkChild)
                yield* Deferred.await(entered)
                const interrupted = yield* Fiber.interrupt(owner).pipe(Effect.forkChild)
                yield* Deferred.await(exiting)
                yield* Deferred.succeed(release, undefined)
                yield* Fiber.join(interrupted)
                const exit = yield* Fiber.await(owner)
                expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(true)
                expect(yield* Effect.promise(() => fs.readdir(directory))).not.toContain("generations")
              }).pipe(Effect.ensuring(Deferred.succeed(release, undefined)), Effect.scoped)
            })
          ),
        (claim) => claim.release
      )
    )
  }))
