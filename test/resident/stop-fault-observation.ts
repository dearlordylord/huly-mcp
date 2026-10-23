import { Schema } from "effect"

import { ResidentRegistryEnvelope } from "../../src/resident/managed-contract.js"

export const StopFaultMode = Schema.Literals(["normal-cleanup", "failed-cleanup"])
export const StopFaultState = Schema.Struct({ writes: Schema.Literal(1) })
export const StopFaultCommand = Schema.Struct({ kind: Schema.Literal("release-cleanup") })
export const StopFaultEvent = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("ready"), generation: ResidentRegistryEnvelope.fields.generation }),
  Schema.Struct({ kind: Schema.Literal("committed") }),
  Schema.Struct({ kind: Schema.Literal("cleaning") }),
  Schema.Struct({ kind: Schema.Literals(["retired", "retained"]), dispatches: Schema.Natural })
])
export type StopFaultEvent = Schema.Schema.Type<typeof StopFaultEvent>
const ArtifactHash = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u))
const EvidenceFields = {
  artifacts: Schema.Struct({ mcpSha256: ArtifactHash, cliSha256: ArtifactHash, backendFixtureSha256: ArtifactHash }),
  generation: ResidentRegistryEnvelope.fields.generation,
  writes: Schema.Literal(1),
  dispatches: Schema.Literal(1),
  hostCancelledAfterCommit: Schema.Literal(true),
  heldCleanupRetainedRecord: Schema.Literal(true),
  privateCauseRedacted: Schema.Literal(true)
}
export const StopFaultObservation = Schema.Union([
  Schema.Struct({
    ...EvidenceFields,
    mode: Schema.Literal("normal-cleanup"),
    backendExitCode: Schema.Literal(0),
    registry: Schema.Literal("retired"),
    replacement: Schema.Literal("started")
  }),
  Schema.Struct({
    ...EvidenceFields,
    mode: Schema.Literal("failed-cleanup"),
    backendExitCode: Schema.Literal(1),
    registry: Schema.Literal("retained"),
    replacement: Schema.Literal("stdio")
  })
])
