import { Schema } from "effect"

export const PROJECT_READS = 2
export const RestrictionMode = Schema.Literals(["restricted", "unrestricted"])
const RestrictedPermissions = Schema.Struct({
  child: Schema.Boolean,
  worker: Schema.Boolean,
  addon: Schema.Boolean,
  wasi: Schema.Boolean,
  inspector: Schema.Boolean
})
export const RestrictedProbeAttempt = Schema.Struct({
  nodeVersion: Schema.NonEmptyString,
  processId: Schema.Int.check(Schema.isGreaterThan(0)),
  denied: RestrictedPermissions
})
export const RestrictedProbe = RestrictedProbeAttempt.check(
  Schema.makeFilter((probe) => Object.values(probe.denied).every((value) => value))
).pipe(Schema.brand("QualifiedRestrictedProbe"))
export const RestrictedObservation = Schema.Struct({
  probe: RestrictedProbe,
  modelRequests: Schema.Literal(1),
  projectReads: Schema.Literal(PROJECT_READS),
  fullModelRequested: Schema.Literal(true),
  backendChildren: Schema.Literal(0),
  backendJoined: Schema.Literal(true),
  backendPortClosed: Schema.Literal(true),
  staleRecordRetained: Schema.Literal(true)
})
