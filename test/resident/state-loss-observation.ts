import { Schema } from "effect"

import { ResidentRegistryEnvelope } from "../../src/resident/managed-contract.js"
import { KernelOwnedExit } from "../helpers/kernel-reaped-events.js"

export const StateFault = Schema.Literals([
  "corrupt-record",
  "missing-record",
  "missing-registry",
  "missing-descriptor",
  "missing-indexes"
])
const Sha256 = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u))
export const StateLossObservation = Schema.Struct({
  artifacts: Schema.Struct({ mcpSha256: Sha256, coordinatorSha256: Sha256, hostSha256: Sha256 }),
  generation: ResidentRegistryEnvelope.fields.generation,
  faults: Schema.Tuple(StateFault.members),
  backendExit: KernelOwnedExit,
  existingCallerRetained: Schema.Literal(true),
  privateStateRestored: Schema.Literal(true),
  credentialDisclosure: Schema.Literal(false),
  privateStateRemoved: Schema.Literal(true)
})
