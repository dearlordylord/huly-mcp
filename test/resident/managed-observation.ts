import { Schema } from "effect"

import { ResidentTlsIdentity } from "../../src/resident/tls-channel.js"
import { KernelOwnedExit } from "../helpers/kernel-reaped-events.js"
import { NativeHostObservation } from "./native-host-observation.js"

export const ManagedParentObservation = Schema.Struct({
  parents: Schema.Array(NativeHostObservation),
  survivor: NativeHostObservation,
  generation: ResidentTlsIdentity.fields.generation,
  ownerProcessId: Schema.Int.check(Schema.isGreaterThan(0)),
  creatorAdapterPid: Schema.Int.check(Schema.isGreaterThan(0)),
  creatorExited: Schema.Literal(true),
  creatorKind: Schema.Literals(["probe", "session"]),
  stoppedAdapterPid: Schema.Int.check(Schema.isGreaterThan(0)),
  stoppedAdapterExited: Schema.Literal(true),
  backendExited: Schema.Literal(true),
  backendExit: KernelOwnedExit,
  privateStateRemoved: Schema.Literal(true)
})

export const ManagedParentConnected = Schema.Struct({
  kind: Schema.Literal("connected"),
  parentPid: NativeHostObservation.fields.parentPid,
  adapterPid: NativeHostObservation.fields.adapterPid
})

export const ManagedParentStarting = Schema.Struct({
  kind: Schema.Literal("starting"),
  parentPid: NativeHostObservation.fields.parentPid
})
