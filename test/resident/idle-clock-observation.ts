import { Schema } from "effect"

import { ResidentTlsIdentity } from "../../src/resident/tls-channel.js"
import { ManagedNativeHostObservation } from "./native-host-observation.js"

export const IdleClockPhase = Schema.Literals(["near", "protected", "released", "retire"])
export const IdleClockCommand = Schema.Struct({ phase: IdleClockPhase })
export const IdleClockEvent = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("ready"), generation: ResidentTlsIdentity.fields.generation }),
  Schema.Struct({ kind: Schema.Literal("advanced"), phase: IdleClockPhase })
])
export const IdleClockObservation = Schema.Struct({
  generation: ResidentTlsIdentity.fields.generation,
  initial: ManagedNativeHostObservation,
  continued: ManagedNativeHostObservation,
  backendExitCode: Schema.Literal(0),
  parentExitCode: Schema.Literal(0),
  privateStateRemoved: Schema.Literal(true)
})
