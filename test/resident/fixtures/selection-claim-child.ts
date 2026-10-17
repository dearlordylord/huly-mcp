import { NodeRuntime } from "@effect/platform-node"
import { Effect, Schema } from "effect"

import { ResidentDirectory } from "../../../src/resident/protected-path.js"
import { acquireSelectionClaim } from "../../../src/resident/selection-claim.js"

const requested = Schema.decodeUnknownSync(ResidentDirectory)(process.argv[2])
const report = (result: "claimed" | "refused") =>
  Effect.sync(() => {
    process.stdout.write(`${result}\n`)
  })

NodeRuntime.runMain(
  Effect.acquireUseRelease(
    acquireSelectionClaim(requested),
    () => Effect.andThen(report("claimed"), Effect.never),
    (claim) => claim.release
  ).pipe(Effect.catchTag("SelectionClaimError", () => report("refused")))
)
