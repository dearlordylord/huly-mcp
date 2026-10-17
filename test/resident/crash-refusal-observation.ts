import { Schema } from "effect"

export const CrashRefusalObservation = Schema.Struct({
  backendPid: Schema.Int.check(Schema.isGreaterThan(0)),
  backendChildrenBeforeKill: Schema.Literal(0),
  backendExitSignal: Schema.Literal("SIGKILL"),
  recoveringExitCodes: Schema.Tuple([Schema.Literal(1), Schema.Literal(1)]),
  originalRecordRetained: Schema.Literal(true),
  foreignListenerSurvived: Schema.Literal(true),
  credentialDisclosure: Schema.Literal(false),
  stdoutBytes: Schema.Literal(0)
})
