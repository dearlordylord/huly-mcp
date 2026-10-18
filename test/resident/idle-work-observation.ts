import { Schema } from "effect"

import { ResidentTlsIdentity } from "../../src/resident/tls-channel.js"

export const IDLE_WORK_TOOL = "fixture_idle_work"
export const IdleWorkCommand = Schema.Literals(["expire", "release", "almost-idle", "retire"])
export const IdleWorkEvent = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("ready"), generation: ResidentTlsIdentity.fields.generation }),
  Schema.Struct({ kind: Schema.Literals(["started", "cleaning", "cleaned"]) }),
  Schema.Struct({ kind: Schema.Literal("advanced"), phase: Schema.Literals(["expire", "almost-idle"]) }),
  Schema.Struct({ kind: Schema.Literal("retired"), dispatches: Schema.Literal(1) })
])
export const IdleWorkObservation = Schema.Struct({
  generation: ResidentTlsIdentity.fields.generation,
  adapterExitSignal: Schema.Literal("SIGKILL"),
  dispatches: Schema.Literal(1),
  backendExitCode: Schema.Literal(0),
  privateStateRemoved: Schema.Literal(true)
})
