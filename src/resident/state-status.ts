import * as fs from "node:fs/promises"
import { Effect, Schema } from "effect"

import { ResidentRegistryEnvelope } from "./managed-contract.js"
import type { ResidentDirectory } from "./protected-path.js"
import { registryFailure } from "./registry-inventory.js"
import { readResidentNamespace } from "./namespace-inventory.js"

const ABSENT_GUIDANCE = "No state directory was observed. Absence does not prove previous resources retired."
const OBSERVED_GUIDANCE =
  "This snapshot proves neither readiness nor retirement. Preserve unresolved state and verify owned resources before recovery."
const Absent = Schema.Struct({ state: Schema.Literal("absent"), guidance: Schema.Literal(ABSENT_GUIDANCE) })
const Observed = Schema.Struct({
  state: Schema.Literal("observed"),
  claim: Schema.Literals(["absent", "present-unverified"]),
  generations: Schema.Array(
    Schema.Struct({
      implementation: ResidentRegistryEnvelope.fields.implementation,
      generation: ResidentRegistryEnvelope.fields.generation,
      diagnostics: ResidentRegistryEnvelope.fields.diagnostics,
      liveness: Schema.Literal("unverified")
    })
  ),
  guidance: Schema.Literal(OBSERVED_GUIDANCE)
})
export const ResidentStateStatus = Schema.Union([Absent, Observed])
export type ResidentStateStatus = Schema.Schema.Type<typeof ResidentStateStatus>

const exists = (directory: ResidentDirectory) =>
  Effect.tryPromise({
    try: async () => {
      try {
        await fs.lstat(directory)
        return true
      } catch (error) {
        if (Schema.is(Schema.Struct({ code: Schema.Literal("ENOENT") }))(error)) return false
        throw error
      }
    },
    catch: registryFailure
  })

export const inspectResidentState = Effect.fn("inspectResidentState")(function* (requested: ResidentDirectory) {
  if (!(yield* exists(requested))) return Absent.make({ state: "absent", guidance: ABSENT_GUIDANCE })
  const { claimPresent, records } = yield* readResidentNamespace(requested)
  return Observed.make({
    state: "observed",
    claim: claimPresent ? "present-unverified" : "absent",
    generations: records.map(({ envelope }) => ({
      implementation: envelope.implementation,
      generation: envelope.generation,
      diagnostics: envelope.diagnostics,
      liveness: "unverified"
    })),
    guidance: OBSERVED_GUIDANCE
  })
})
