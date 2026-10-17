import { Schema } from "effect"

export const PeerMode = Schema.Literals([
  "exit-before-prepared",
  "refuse-after-start",
  "ready",
  "wrong-version",
  "wrong-nonce",
  "premature-ready",
  "malformed",
  "refused",
  "exit-before-ready"
])
export const PeerObservation = Schema.Struct({
  pid: Schema.Int.check(Schema.isGreaterThan(0)),
  rawHulyEnvironmentPresent: Schema.Boolean,
  workspace: Schema.optionalKey(Schema.String)
})
export type PeerObservation = Schema.Schema.Type<typeof PeerObservation>
