import { Schema } from "effect"

export const ManagedRequestLossPoint = Schema.Literals(["model", "query"])
const Common = Schema.Struct({
  modelRequests: Schema.Literal(1),
  backendClosed: Schema.Literal(true),
  adapterClosed: Schema.Literal(true),
  unknownOutcome: Schema.Boolean,
  registryRetained: Schema.Boolean,
  replacementExitCode: Schema.Literal(1),
  replacementStdoutBytes: Schema.Literal(0)
})
export const ManagedRequestLossObservation = Schema.Union([
  Schema.Struct({ ...Common.fields, point: Schema.Literal("model"), queryDispatches: Schema.Literal(0) }),
  Schema.Struct({ ...Common.fields, point: Schema.Literal("query"), queryDispatches: Schema.Literal(1) })
])
