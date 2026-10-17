import * as fs from "node:fs/promises"
import { join } from "node:path"
import { Effect, Schema } from "effect"

import {
  currentPosixOwner,
  inspectPrivateDirectory,
  PRIVATE_DIRECTORY_MODE,
  type ResidentDirectory
} from "./protected-path.js"

export class SelectionClaimError extends Schema.TaggedError<SelectionClaimError>()("SelectionClaimError", {
  reason: Schema.Literals(["busy", "ownership", "io"]),
  message: Schema.String
}) {}

const ioFailure = () =>
  new SelectionClaimError({
    reason: "io",
    message: "Resident selection claim operation failed; ownership is unresolved"
  })
const ownershipFailure = () =>
  new SelectionClaimError({ reason: "ownership", message: "Resident selection claim changed; release refused" })
const AlreadyExists = Schema.Struct({ code: Schema.Literal("EEXIST") })

export const acquireSelectionClaim = Effect.fn("acquireSelectionClaim")(function* (requested: ResidentDirectory) {
  const owner = yield* currentPosixOwner
  const directory = yield* inspectPrivateDirectory(requested, owner)
  const claimPath = join(directory, "selection.claim")
  return yield* Effect.uninterruptible(
    Effect.gen(function* () {
      yield* Effect.tryPromise({
        try: () => fs.mkdir(claimPath, { mode: PRIVATE_DIRECTORY_MODE }),
        catch: (error) =>
          Schema.is(AlreadyExists)(error)
            ? new SelectionClaimError({
                reason: "busy",
                message: "Resident selection is owned or unresolved; takeover refused"
              })
            : ioFailure()
      })
      const created = yield* Effect.tryPromise({ try: () => fs.lstat(claimPath, { bigint: true }), catch: ioFailure })
      let consumed = false
      const release = Effect.uninterruptible(
        Effect.suspend(() => {
          if (consumed) return Effect.void
          consumed = true
          return Effect.gen(function* () {
            const current = yield* Effect.tryPromise({
              try: () => fs.lstat(claimPath, { bigint: true }),
              catch: ioFailure
            })
            if (!current.isDirectory() || current.dev !== created.dev || current.ino !== created.ino)
              return yield* ownershipFailure()
            yield* Effect.tryPromise({ try: () => fs.rmdir(claimPath), catch: ioFailure })
          })
        })
      )
      return { release }
    })
  )
})

export const withSelectionClaim = <A, E, R>(directory: ResidentDirectory, use: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    acquireSelectionClaim(directory),
    () => use,
    (claim) => claim.release
  )
