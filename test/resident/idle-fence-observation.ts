import { Schema } from "effect"

import { ResidentTlsIdentity } from "../../src/resident/tls-channel.js"
import { KernelOwnedExit } from "../helpers/kernel-reaped-events.js"
import { ManagedNativeHostObservation } from "./native-host-observation.js"

export const IdleFenceCommand = Schema.Literals(["retire", "release"])
export const IdleFenceEvent = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("ready"), generation: ResidentTlsIdentity.fields.generation }),
  Schema.Struct({ kind: Schema.Literal("closing") })
])
export const IdleFenceObservation = Schema.Struct({
  retiredGeneration: ResidentTlsIdentity.fields.generation,
  fallbackExitCode: Schema.Literal(0),
  originalBackendExitCode: Schema.Literal(0),
  replacementGeneration: ResidentTlsIdentity.fields.generation,
  replacement: ManagedNativeHostObservation,
  replacementExit: KernelOwnedExit,
  privateStateRemoved: Schema.Literal(true)
})
