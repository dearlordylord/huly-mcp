import * as fs from "node:fs/promises"
import { dirname, join } from "node:path"
import { Effect, Result, Schema } from "effect"
import { expect, it } from "vitest"

import { BootstrapNonce, MANAGED_BOOTSTRAP_VERSION, ManagedLaunchError } from "../../src/resident/managed-contract.js"
import { withTransferredSelection } from "../../src/resident/managed-selection.js"
import { readResidentNamespace } from "../../src/resident/namespace-inventory.js"
import { acquireSelectionClaim } from "../../src/resident/selection-claim.js"
import { captureResidentSelection } from "../../src/resident/selection-config.js"
import { makeStartupBudget } from "../../src/resident/startup-budget.js"
import { withPublishedResidentState } from "../helpers/resident-status-fixture.js"

it("refuses missing ownership records after transfer without recreating the registry or publishing", async () =>
  withPublishedResidentState(async (directory, record, attachment) => {
    const claim = await Effect.runPromise(acquireSelectionClaim(directory))
    expect((await Effect.runPromise(readResidentNamespace(directory))).records).toHaveLength(1)
    expect(Result.isSuccess(claim.transferTo(() => {}))).toBe(true)
    await Effect.runPromise(claim.release)
    const descriptor = join(directory, `${attachment.identity.generation}.json`)
    const original = await fs.readFile(descriptor)
    const registry = dirname(record)
    const preserved = await fs.mkdtemp(join(directory, "..", "resident-transferred-preserved-"))
    const moved = join(preserved, "registry")
    await fs.rename(registry, moved)
    let published = false
    try {
      const error = await Effect.runPromise(
        Effect.gen(function* () {
          const capture = yield* captureResidentSelection({
            HULY_URL: "https://transferred-state.invalid",
            HULY_WORKSPACE: "fixture",
            HULY_TOKEN: "transferred-state-fixture"
          })
          return yield* withTransferredSelection(
            {
              kind: "start",
              version: MANAGED_BOOTSTRAP_VERSION,
              nonce: Schema.decodeUnknownSync(BootstrapNonce)("a".repeat(64)),
              directory,
              capture,
              claim: claim.transferProof
            },
            yield* makeStartupBudget,
            () =>
              Effect.sync(() => {
                published = true
              })
          )
        }).pipe(Effect.flip)
      )
      expect(error).toBeInstanceOf(ManagedLaunchError)
      expect(published).toBe(false)
      await expect(fs.lstat(registry)).rejects.toMatchObject({ code: "ENOENT" })
      expect((await fs.readFile(descriptor)).equals(original)).toBe(true)
    } finally {
      await fs.rename(moved, registry)
      await fs.rmdir(preserved)
    }
  }))
