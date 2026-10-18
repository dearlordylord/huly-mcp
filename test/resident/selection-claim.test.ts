import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Deferred, Effect, Fiber, Result, Schema } from "effect"
import { expect, it } from "vitest"

import { ResidentDirectory } from "../../src/resident/protected-path.js"
import { acquireSelectionClaim, adoptSelectionClaim, withSelectionClaim } from "../../src/resident/selection-claim.js"

class OperationFailure extends Schema.TaggedError<OperationFailure>()("OperationFailure", { message: Schema.String }) {}

it("transfers continuous exclusion and makes old cleanup incapable of releasing the child or its successor", async () => {
  const directory = ResidentDirectory.make(await fs.mkdtemp(join(await fs.realpath(tmpdir()), "resident-transfer-")))
  try {
    const parent = await Effect.runPromise(acquireSelectionClaim(directory))
    const original = await fs.lstat(join(directory, "selection.claim"), { bigint: true })
    let sends = 0
    expect(
      Result.isSuccess(
        parent.transferTo(() => {
          sends++
        })
      )
    ).toBe(true)
    await Effect.runPromise(parent.release)
    const held = await fs.lstat(join(directory, "selection.claim"), { bigint: true })
    expect([held.dev, held.ino]).toEqual([original.dev, original.ino])
    expect(
      Result.isFailure(
        parent.transferTo(() => {
          sends++
        })
      )
    ).toBe(true)
    expect(sends).toBe(1)
    await expect(Effect.runPromise(acquireSelectionClaim(directory))).rejects.toThrow("takeover refused")
    const child = await Effect.runPromise(adoptSelectionClaim(directory, parent.transferProof))
    await Effect.runPromise(child.release)
    const successor = await Effect.runPromise(acquireSelectionClaim(directory))
    await Effect.runPromise(parent.release)
    await Effect.runPromise(child.release)
    await expect(Effect.runPromise(acquireSelectionClaim(directory))).rejects.toThrow("takeover refused")
    await Effect.runPromise(successor.release)
    expect(await fs.readdir(directory)).toEqual([])
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

it("refuses transferred identity mismatch without removing the actual claim", async () => {
  const directory = ResidentDirectory.make(await fs.mkdtemp(join(await fs.realpath(tmpdir()), "resident-transfer-")))
  try {
    const claim = await Effect.runPromise(acquireSelectionClaim(directory))
    await expect(
      Effect.runPromise(
        adoptSelectionClaim(directory, { ...claim.transferProof, inode: claim.transferProof.inode + 1n })
      )
    ).rejects.toThrow("release refused")
    await expect(Effect.runPromise(acquireSelectionClaim(directory))).rejects.toThrow("takeover refused")
    await Effect.runPromise(claim.release)
    let sent = false
    expect(
      Result.isFailure(
        claim.transferTo(() => {
          sent = true
        })
      )
    ).toBe(true)
    expect(sent).toBe(false)
    expect(await fs.readdir(directory)).toEqual([])
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

it.runIf(process.platform === "linux")("refuses an unusably long state path without leaving a claim", async () => {
  const root = await fs.mkdtemp(join(await fs.realpath(tmpdir()), "resident-claim-path-"))
  const linuxPathLimit = 4096
  const directoryBytes = linuxPathLimit - 6
  const componentBytes = 200
  let nested = root
  try {
    while (nested.length + componentBytes + 1 < directoryBytes) {
      nested = join(nested, "d".repeat(componentBytes))
      await fs.mkdir(nested, { mode: 0o700 })
    }
    nested = join(nested, "d".repeat(directoryBytes - nested.length - 1))
    await fs.mkdir(nested, { mode: 0o700 })
    await expect(Effect.runPromise(acquireSelectionClaim(ResidentDirectory.make(nested)))).rejects.toThrow(
      "ownership is unresolved"
    )
    expect(await fs.readdir(nested)).toEqual([])
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

it("excludes contenders and makes old release incapable of removing a later claim", async () => {
  const directory = ResidentDirectory.make(await fs.mkdtemp(join(await fs.realpath(tmpdir()), "resident-claim-")))
  try {
    const first = await Effect.runPromise(acquireSelectionClaim(directory))
    await expect(Effect.runPromise(acquireSelectionClaim(directory))).rejects.toThrow("takeover refused")
    await Effect.runPromise(first.release)
    const second = await Effect.runPromise(acquireSelectionClaim(directory))
    await Effect.runPromise(first.release)
    await expect(Effect.runPromise(acquireSelectionClaim(directory))).rejects.toThrow("takeover refused")
    await Effect.runPromise(second.release)
    expect(await fs.readdir(directory)).toEqual([])
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

it("refuses replacement ownership and never retries a consumed failed release", async () => {
  const directory = ResidentDirectory.make(await fs.mkdtemp(join(await fs.realpath(tmpdir()), "resident-claim-")))
  const claimPath = join(directory, "selection.claim")
  try {
    const first = await Effect.runPromise(acquireSelectionClaim(directory))
    await fs.rename(claimPath, join(directory, "old-claim"))
    const replacement = await Effect.runPromise(acquireSelectionClaim(directory))
    await expect(Effect.runPromise(first.release)).rejects.toThrow("release refused")
    await Effect.runPromise(first.release)
    await expect(Effect.runPromise(acquireSelectionClaim(directory))).rejects.toThrow("takeover refused")
    await Effect.runPromise(replacement.release)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

it("retains a nonempty claim after failed cleanup", async () => {
  const directory = ResidentDirectory.make(await fs.mkdtemp(join(await fs.realpath(tmpdir()), "resident-claim-")))
  try {
    const first = await Effect.runPromise(acquireSelectionClaim(directory))
    await fs.writeFile(join(directory, "selection.claim", "partial"), "incomplete")
    await expect(Effect.runPromise(first.release)).rejects.toThrow("ownership is unresolved")
    await fs.unlink(join(directory, "selection.claim", "partial"))
    await Effect.runPromise(first.release)
    await expect(Effect.runPromise(acquireSelectionClaim(directory))).rejects.toThrow("takeover refused")
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

it("releases scoped ownership after operation failure or interruption", async () => {
  const directory = ResidentDirectory.make(await fs.mkdtemp(join(await fs.realpath(tmpdir()), "resident-claim-")))
  try {
    await expect(
      Effect.runPromise(
        withSelectionClaim(directory, Effect.fail(new OperationFailure({ message: "operation failed" })))
      )
    ).rejects.toThrow("operation failed")
    expect(await fs.readdir(directory)).toEqual([])
    await Effect.runPromise(
      Effect.gen(function* () {
        const entered = yield* Deferred.make<void>()
        const running = yield* withSelectionClaim(
          directory,
          Effect.andThen(Deferred.succeed(entered, undefined), Effect.never)
        ).pipe(Effect.forkChild)
        yield* Deferred.await(entered)
        yield* Fiber.interrupt(running)
      })
    )
    expect(await fs.readdir(directory)).toEqual([])
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})
