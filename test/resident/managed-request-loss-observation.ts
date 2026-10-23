import { Schema } from "effect"

export const ManagedRequestLossPoint = Schema.Literals(["model", "query", "write", "drain"])
export const RequestLossProjectName = "Initial request-loss project"
export const RequestLossUpdatedName = "Committed request-loss project"
const Digest = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u))
const Common = Schema.Struct({
  mcpSha256: Digest,
  backendSha256: Digest,
  driverSha256: Digest,
  modelRequests: Schema.Literal(1),
  backendClosed: Schema.Literal(true),
  adapterClosed: Schema.Literal(true),
  unknownOutcome: Schema.Boolean,
  registryRetained: Schema.Boolean,
  replacementExitCode: Schema.Literal(0),
  replacementStdoutBytes: Schema.Int.check(Schema.isGreaterThan(0))
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
    drainPausedBeforeKill: Schema.Literal(false),
    locatorAfterLoss: Schema.Literal("retained"),
    publicationAfterLoss: Schema.Literal("retained")
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
    drainPausedBeforeKill: Schema.Literal(false),
    locatorAfterLoss: Schema.Literal("retained"),
    publicationAfterLoss: Schema.Literal("retained")
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
    drainPausedBeforeKill: Schema.Literal(false),
    locatorAfterLoss: Schema.Literal("retained"),
    publicationAfterLoss: Schema.Literal("retained")
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
    drainPausedBeforeKill: Schema.Literal(true),
    locatorAfterLoss: Schema.Literals(["retained", "removed-during-drain"]),
    publicationAfterLoss: Schema.Literals(["retained", "removed-during-drain"])
  })
])
