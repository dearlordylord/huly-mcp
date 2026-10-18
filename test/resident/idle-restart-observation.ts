import { Schema } from "effect"

import { ResidentRegistryEnvelope } from "../../src/resident/managed-contract.js"
import { KernelOwnedExit } from "../helpers/kernel-reaped-events.js"
import { ManagedNativeHostObservation } from "./native-host-observation.js"

export const REPLACEMENT_PARENT_COUNT = 10

export const IdleGenerationObservation = Schema.Struct({
  generation: ResidentRegistryEnvelope.fields.generation,
  backendExit: KernelOwnedExit,
  parents: Schema.Array(ManagedNativeHostObservation)
})
export const IdleRestartObservation = Schema.Struct({
  cycles: Schema.Tuple([IdleGenerationObservation, IdleGenerationObservation]),
  privateStateRemoved: Schema.Literal(true)
})
