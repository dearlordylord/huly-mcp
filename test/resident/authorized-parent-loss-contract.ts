import { Schema } from "effect"

import { ResidentRegistryEnvelope } from "../../src/resident/managed-contract.js"
import { KernelOwnedExit } from "../helpers/kernel-reaped-events.js"

const Identity = {
  childPid: ResidentRegistryEnvelope.fields.diagnostics.fields.processId,
  parentPid: ResidentRegistryEnvelope.fields.diagnostics.fields.processId,
  privateFrames: Schema.Literal(1)
}
export const AuthorizedOwnerMarker = Schema.Union([
  Schema.Struct({ phase: Schema.Literal("authorized"), ...Identity }),
  Schema.Struct({
    phase: Schema.Literal("published"),
    ...Identity,
    generation: ResidentRegistryEnvelope.fields.generation
  })
])
export const AuthorizedParentLossObservation = Schema.Struct({
  childPid: Identity.childPid,
  parentPid: Identity.parentPid,
  parentExitSignal: Schema.Literal("SIGKILL"),
  privateFrames: Schema.Literal(1),
  generation: ResidentRegistryEnvelope.fields.generation,
  childExit: KernelOwnedExit,
  privateStateRemoved: Schema.Literal(true)
})
