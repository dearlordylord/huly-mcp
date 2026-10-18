import * as fs from "node:fs/promises"
import { join } from "node:path"
import { Effect, Result, Schema } from "effect"

import {
  currentPosixOwner,
  inspectPrivateDirectory,
  PRIVATE_DIRECTORY_MODE,
  ResidentDirectory
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

export const SelectionClaimTransfer = Schema.Struct({
  device: Schema.BigIntFromString.check(Schema.isGreaterThanOrEqualToBigInt(0n)),
  inode: Schema.BigIntFromString.check(Schema.isGreaterThanOrEqualToBigInt(0n))
})
export type SelectionClaimTransfer = Schema.Schema.Type<typeof SelectionClaimTransfer>

// Internal resource capability; only transferProof crosses the private IPC boundary.
export interface AcquiredSelectionClaim {
  readonly directory: ResidentDirectory
  readonly transferProof: SelectionClaimTransfer
  readonly release: Effect.Effect<void, SelectionClaimError>
  readonly transferTo: (send: () => void) => Result.Result<void, SelectionClaimError>
}

const makeClaim = (directory: ResidentDirectory, transferProof: SelectionClaimTransfer): AcquiredSelectionClaim => {
  let state: "held" | "released" | "transferred" = "held"
  const release = Effect.uninterruptible(
    Effect.suspend(() => {
      if (state !== "held") return Effect.void
      state = "released"
      return Effect.gen(function* () {
        const claimPath = join(directory, "selection.claim")
        const current = yield* Effect.tryPromise({ try: () => fs.lstat(claimPath, { bigint: true }), catch: ioFailure })
        if (!current.isDirectory() || current.dev !== transferProof.device || current.ino !== transferProof.inode)
          return yield* ownershipFailure()
        yield* Effect.tryPromise({ try: () => fs.rmdir(claimPath), catch: ioFailure })
      })
    })
  )
  return {
    directory,
    transferProof,
    release,
    transferTo: (send) => {
      if (state !== "held") return Result.fail(ownershipFailure())
      state = "transferred"
      send()
      return Result.succeed(undefined)
    }
  }
}

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
      return makeClaim(directory, { device: created.dev, inode: created.ino })
    })
  )
})

export const adoptSelectionClaim = Effect.fn("adoptSelectionClaim")(function* (
  requested: ResidentDirectory,
  proof: SelectionClaimTransfer
) {
  const owner = yield* currentPosixOwner
  const directory = yield* inspectPrivateDirectory(requested, owner)
  const claimPath = join(directory, "selection.claim")
  yield* inspectPrivateDirectory(ResidentDirectory.make(claimPath), owner)
  const current = yield* Effect.tryPromise({ try: () => fs.lstat(claimPath, { bigint: true }), catch: ioFailure })
  if (!current.isDirectory() || current.dev !== proof.device || current.ino !== proof.inode)
    return yield* ownershipFailure()
  return { release: makeClaim(directory, proof).release }
})

export const withSelectionClaim = <A, E, R>(directory: ResidentDirectory, use: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    acquireSelectionClaim(directory),
    () => use,
    (claim) => claim.release
  )
