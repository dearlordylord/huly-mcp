import { Schema } from "effect"

const Sha256 = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u))
export const CrashRefusalObservation = Schema.Struct({
  artifacts: Schema.Struct({ mcpSha256: Sha256, fixtureSha256: Sha256 }),
  backendPid: Schema.Int.check(Schema.isGreaterThan(0)),
  backendChildrenBeforeKill: Schema.Literal(0),
  backendExitSignal: Schema.Literal("SIGKILL"),
  recoveringExitCodes: Schema.Tuple([Schema.Literal(1), Schema.Literal(1), Schema.Literal(1), Schema.Literal(1)]),
  originalRecordRetained: Schema.Literal(true),
  foreignListenerSurvived: Schema.Literal(true),
  reusedDiagnosticPid: Schema.Int.check(Schema.isGreaterThan(0)),
  reusedPidRecordRetained: Schema.Literal(true),
  unrelatedPidSurvived: Schema.Literal(true),
  corruptRecordRetained: Schema.Literal(true),
  credentialDisclosure: Schema.Literal(false),
  stdoutBytes: Schema.Literal(0)
})
