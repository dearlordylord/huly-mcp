import { Schema } from "effect"

import { ResidentRegistryEnvelope } from "../../src/resident/managed-contract.js"
import { KernelOwnedExit } from "../helpers/kernel-reaped-events.js"

export const ManagedExpiryObservation = Schema.Struct({
  adapterPid: ResidentRegistryEnvelope.fields.diagnostics.fields.parentProcessId,
  adapterExitSignal: Schema.Literal("SIGKILL"),
  backendExit: KernelOwnedExit,
  privateStateRemoved: Schema.Literal(true)
})
