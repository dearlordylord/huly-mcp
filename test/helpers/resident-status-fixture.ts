import { Effect } from "effect"

import { withPublishedResidentAttachment, type ResidentAttachment } from "../../src/resident/attachment-file.js"
import { openGenerationRegistry } from "../../src/resident/generation-registry.js"
import type { ResidentDirectory, ResidentFilePath } from "../../src/resident/protected-path.js"
import { registryAttachment, withRegistryDirectory } from "./resident-registry-fixture.js"

export const withPublishedResidentState = (
  use: (directory: ResidentDirectory, record: ResidentFilePath, attachment: ResidentAttachment) => Promise<void>
) =>
  withRegistryDirectory((directory) => {
    const attachment = registryAttachment()
    return Effect.runPromise(
      withPublishedResidentAttachment(directory, attachment, () =>
        Effect.gen(function* () {
          const registry = yield* openGenerationRegistry(directory)
          yield* Effect.acquireUseRelease(
            registry.publish(attachment),
            (record) => Effect.promise(() => use(directory, record.file, attachment)),
            (record) => record.retire
          )
        })
      )
    )
  })
