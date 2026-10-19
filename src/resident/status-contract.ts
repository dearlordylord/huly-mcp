import { Schema } from "effect"

import { ResidentTlsIdentity } from "./tls-channel.js"
import { HulyInitializationStatus } from "../runtime/client-initialization.js"

export const RESIDENT_STATUS_PATH = "/resident/control/status-v1"
const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
export const ResidentWorkStatus = Schema.Struct({
  admission: Schema.Literals(["accepting", "fenced"]),
  attachments: Count,
  pendingAdmissions: Count,
  retainedRequests: Count,
  blockedRequests: Count,
  drain: Schema.Literals(["idle", "draining", "blocked"])
})
export type ResidentWorkStatus = Schema.Schema.Type<typeof ResidentWorkStatus>
export const ResidentLiveStatus = Schema.Struct({
  statusWire: Schema.Literal(1),
  generation: ResidentTlsIdentity.fields.generation,
  readiness: Schema.Literals(["starting", "ready"]),
  hulyInitialization: HulyInitializationStatus,
  work: ResidentWorkStatus,
  retirement: Schema.Literal("unconfirmed")
})
export type ResidentLiveStatus = Schema.Schema.Type<typeof ResidentLiveStatus>
export const ResidentStatusObservation = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("authenticated"), status: ResidentLiveStatus }),
  Schema.Struct({ kind: Schema.Literal("unavailable"), recovery: Schema.Literal("unverified") })
])
export type ResidentStatusObservation = Schema.Schema.Type<typeof ResidentStatusObservation>
