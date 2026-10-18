import * as fs from "node:fs/promises"
import { dirname, join } from "node:path"
import { Effect, Result, Schema } from "effect"
import { expect, it } from "vitest"

import { ManagedLaunchError } from "../../src/resident/managed-contract.js"
import { withResidentSelection } from "../../src/resident/managed-selection.js"
import { captureResidentSelection } from "../../src/resident/selection-config.js"
import { makeStartupBudget } from "../../src/resident/startup-budget.js"
import { withPublishedResidentState } from "../helpers/resident-status-fixture.js"

for (const missing of ["record", "registry", "descriptor", "indexes"]) {
  it(`refuses a missing ${missing} before attaching or authorizing a new owner`, async () =>
    withPublishedResidentState(async (directory, record, attachment) => {
      const target =
        missing === "record"
          ? record
          : missing === "registry"
            ? dirname(record)
            : join(directory, `${attachment.identity.generation}.json`)
      const preserved = await fs.mkdtemp(join(directory, "..", "resident-selection-preserved-"))
      const targets =
        missing === "indexes" ? [record, join(directory, `${attachment.identity.generation}.json`)] : [target]
      const held = targets.map((target, index) => ({ target, moved: join(preserved, `owned-state-${index}`) }))
      for (const { moved, target } of held) await fs.rename(target, moved)
      let used = false
      try {
        const outcome = await Effect.runPromise(
          Effect.gen(function* () {
            const capture = yield* captureResidentSelection({
              HULY_URL: "https://state-loss.invalid",
              HULY_WORKSPACE: "fixture",
              HULY_TOKEN: "state-loss-fixture"
            })
            yield* withResidentSelection({
              directory,
              capture,
              startup: yield* makeStartupBudget,
              existing: () =>
                Effect.sync(() => {
                  used = true
                }),
              absent: () =>
                Effect.sync(() => {
                  used = true
                })
            })
          }).pipe(Effect.timeout("1 second"), Effect.result)
        )
        expect(Result.isFailure(outcome)).toBe(true)
        if (Result.isFailure(outcome)) expect(outcome.failure).toBeInstanceOf(ManagedLaunchError)
        expect(used).toBe(false)
        for (const { target } of held) await expect(fs.lstat(target)).rejects.toMatchObject({ code: "ENOENT" })
      } finally {
        if (missing === "registry")
          await fs.rmdir(target).catch((error: unknown) => {
            if (!Schema.is(Schema.Struct({ code: Schema.Literal("ENOENT") }))(error)) throw error
          })
        for (const { moved, target } of held) await fs.rename(moved, target)
        await fs.rmdir(preserved)
      }
    }))
}
