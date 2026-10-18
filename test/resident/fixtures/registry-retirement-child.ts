import { NodeRuntime } from "@effect/platform-node"
import * as fs from "node:fs/promises"
import { Deferred, Effect, Exit, Schema } from "effect"

import { ResidentAttachment } from "../../../src/resident/attachment-file.js"
import { openGenerationRegistry } from "../../../src/resident/generation-registry.js"
import { ResidentDirectory, ResidentFilePath } from "../../../src/resident/protected-path.js"
import { RegistryRetirementReport as Report } from "../registry-retirement-contract.js"

const Input = Schema.Struct({ directory: ResidentDirectory, descriptor: ResidentFilePath })
const report = (value: Schema.Schema.Type<typeof Report>) =>
  Effect.sync(() => process.stdout.write(`${Schema.encodeSync(Report)(value)}\n`))
const main = Effect.gen(function* () {
  const input = yield* Schema.decodeUnknownEffect(Input)({ directory: process.argv[2], descriptor: process.argv[3] })
  const descriptor = yield* Effect.promise(() => fs.readFile(input.descriptor, "utf8")).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(ResidentAttachment)))
  )
  const release = yield* Deferred.make<void>()
  yield* Effect.acquireRelease(
    Effect.sync(() => {
      const listener = (raw: unknown) => {
        if (Schema.is(Schema.Literal("retire"))(raw)) Effect.runSync(Deferred.succeed(release, undefined))
      }
      process.on("message", listener)
      return listener
    }),
    (listener) => Effect.sync(() => process.off("message", listener))
  )
  const registry = yield* openGenerationRegistry(input.directory)
  const owned = yield* registry.publish(descriptor)
  yield* report("published")
  yield* Deferred.await(release)
  const retired = yield* Effect.exit(owned.retire)
  yield* owned.retire
  yield* report(Exit.isSuccess(retired) ? "retired" : "refused")
  yield* Effect.sync(() => process.disconnect?.())
}).pipe(Effect.scoped)
NodeRuntime.runMain(main, { disableErrorReporting: true })
