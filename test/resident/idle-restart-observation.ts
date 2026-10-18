import { Schema } from "effect"

import { ResidentRegistryEnvelope } from "../../src/resident/managed-contract.js"
import { KernelOwnedExit } from "../helpers/kernel-reaped-events.js"
import { ManagedNativeHostObservation } from "./native-host-observation.js"

export const IdleGenerationObservation = Schema.Struct({
  generation: ResidentRegistryEnvelope.fields.generation,
  backendExit: KernelOwnedExit,
  parent: ManagedNativeHostObservation
})
export const IdleRestartObservation = Schema.Struct({
  cycles: Schema.Tuple([IdleGenerationObservation, IdleGenerationObservation]),
  privateStateRemoved: Schema.Literal(true)
})
