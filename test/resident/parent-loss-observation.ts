import { Schema } from "effect"

const ProcessId = Schema.Int.check(Schema.isGreaterThan(0))
export const ChildGateMarker = Schema.Struct({
  phase: Schema.Literals(["held", "parent-disconnected"]),
  childPid: ProcessId,
  parentPid: ProcessId,
  privateFrames: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
})

export const ParentLossObservation = Schema.Struct({
  parentPid: ProcessId,
  childPid: ProcessId,
  parentExitSignal: Schema.Literal("SIGKILL"),
  privateFrames: Schema.Literal(0),
  childExited: Schema.Literal(true),
  retainedClaim: Schema.Literal(true),
  publishedRecords: Schema.Literal(0)
})
