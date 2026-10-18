import { Schema } from "effect"

export const ManagedRequestLossPoint = Schema.Literals(["model", "query", "write", "drain"])
export const RequestLossProjectName = "Initial request-loss project"
export const RequestLossUpdatedName = "Committed request-loss project"
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
  Schema.Struct({
    ...Common.fields,
    point: Schema.Literal("model"),
    queryDispatches: Schema.Literal(0),
    writeDispatches: Schema.Literal(0),
    committedWrites: Schema.Literal(0),
    projectName: Schema.Literal(RequestLossProjectName),
    stopAcknowledgment: Schema.Literal("not-requested"),
    drainEntry: Schema.Literal("not-requested"),
    locatorAfterLoss: Schema.Literal("retained")
  }),
  Schema.Struct({
    ...Common.fields,
    point: Schema.Literal("query"),
    queryDispatches: Schema.Literal(1),
    writeDispatches: Schema.Literal(0),
    committedWrites: Schema.Literal(0),
    projectName: Schema.Literal(RequestLossProjectName),
    stopAcknowledgment: Schema.Literal("not-requested"),
    drainEntry: Schema.Literal("not-requested"),
    locatorAfterLoss: Schema.Literal("retained")
  }),
  Schema.Struct({
    ...Common.fields,
    point: Schema.Literal("write"),
    queryDispatches: Schema.Literal(1),
    writeDispatches: Schema.Literal(1),
    committedWrites: Schema.Literal(1),
    projectName: Schema.Literal(RequestLossUpdatedName),
    stopAcknowledgment: Schema.Literal("not-requested"),
    drainEntry: Schema.Literal("not-requested"),
    locatorAfterLoss: Schema.Literal("retained")
  }),
  Schema.Struct({
    ...Common.fields,
    point: Schema.Literal("drain"),
    queryDispatches: Schema.Literal(1),
    writeDispatches: Schema.Literal(1),
    committedWrites: Schema.Literal(1),
    projectName: Schema.Literal(RequestLossUpdatedName),
    stopAcknowledgment: Schema.Literal("admission-fenced"),
    drainEntry: Schema.Literal("observed-with-attachment"),
    locatorAfterLoss: Schema.Literals(["retained", "removed-during-drain"])
  })
])
