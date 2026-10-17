import { Schema } from "effect"

export const PROJECT_READS = 2
export const RestrictionMode = Schema.Literals(["restricted", "unrestricted"])
const RestrictedPermissions = Schema.Struct({
  child: Schema.Boolean,
  worker: Schema.Boolean,
  addon: Schema.Boolean,
  wasi: Schema.Boolean,
  inspector: Schema.Boolean,
  ownershipWrite: Schema.Boolean,
  ownershipRename: Schema.Boolean,
  ownershipRemove: Schema.Boolean
})
export const RestrictedProbeAttempt = Schema.Struct({
  nodeVersion: Schema.NonEmptyString,
  processId: Schema.Int.check(Schema.isGreaterThan(0)),
  ipcAcknowledged: Schema.Literal(true),
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

export const RestrictedIpcChallenge = Schema.Struct({ kind: Schema.Literal("challenge"), nonce: Schema.NonEmptyString })
export const RestrictedIpcReply = Schema.Struct({ kind: Schema.Literal("acknowledged"), nonce: Schema.NonEmptyString })
