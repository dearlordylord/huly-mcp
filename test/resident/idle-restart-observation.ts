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
const Digest = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u))
export const IdleRestartObservation = Schema.Struct({
  mcpSha256: Digest,
  hostSha256: Digest,
  driverSha256: Digest,
  cycles: Schema.Tuple([IdleGenerationObservation, IdleGenerationObservation]),
  privateStateRemoved: Schema.Literal(true)
})
