import { Schema } from "effect"

import { CLI_FAILURE_CONTRACT } from "../../packages/huly-cli/src/failures.js"
import { ResidentRegistryEnvelope } from "../../src/resident/managed-contract.js"
import { KernelOwnedExit } from "../helpers/kernel-reaped-events.js"
import { ManagedNativeHostObservation } from "./native-host-observation.js"

const ArtifactHash = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u))
export const ManagedStopObservation = Schema.Struct({
  artifacts: Schema.Struct({ mcpSha256: ArtifactHash, cliSha256: ArtifactHash }),
  stop: Schema.Union([
    Schema.Struct({ exitCode: Schema.Literal(0), outcome: Schema.Literal("accepted") }),
    Schema.Struct({
      exitCode: Schema.Literal(CLI_FAILURE_CONTRACT.conflict.exitStatus),
      outcome: Schema.Literal("unconfirmed")
    })
  ]),
  originalGeneration: ResidentRegistryEnvelope.fields.generation,
  replacementGeneration: ResidentRegistryEnvelope.fields.generation,
  replacementCallers: Schema.Tuple([ManagedNativeHostObservation, ManagedNativeHostObservation]),
  unrelatedGeneration: ResidentRegistryEnvelope.fields.generation,
  originalExit: KernelOwnedExit,
  replacementExit: KernelOwnedExit,
  unrelatedExit: KernelOwnedExit,
  survivor: ManagedNativeHostObservation,
  unrelatedRecordUnchanged: Schema.Literal(true),
  privateStateRemoved: Schema.Literal(true)
})
