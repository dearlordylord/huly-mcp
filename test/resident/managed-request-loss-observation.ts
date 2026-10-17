import { Schema } from "effect"

export const ManagedRequestLossObservation = Schema.Struct({
  queryDispatches: Schema.Natural,
  backendClosed: Schema.Literal(true),
  adapterClosed: Schema.Literal(true),
  unknownOutcome: Schema.Boolean,
  registryRetained: Schema.Boolean
})
