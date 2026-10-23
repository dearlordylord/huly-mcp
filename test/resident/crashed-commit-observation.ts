import { Schema } from "effect"

import { LiveReadProtocol } from "../../scripts/resident-live-read-contract.js"
import { ResidentRegistryEnvelope } from "../../src/resident/managed-contract.js"

export const CommitRetirementMode = Schema.Literals(["drain", "crash"])
export const CrashedCommitObservation = Schema.Struct({
  protocol: LiveReadProtocol,
  generation: ResidentRegistryEnvelope.fields.generation,
  backendPid: ResidentRegistryEnvelope.fields.diagnostics.fields.processId,
  backendExitSignal: Schema.Literal("SIGKILL"),
  originalAdapterExit: Schema.Literal(1),
  originalOutcomeUnknown: Schema.Literal(true),
  negotiationStdoutBytes: Schema.Int.check(Schema.isGreaterThan(0)),
  originalStdoutBytes: Schema.Literal(0),
  recoveringExitCodes: Schema.Tuple([Schema.Literal(0), Schema.Literal(0)]),
  ownershipBytesRetained: Schema.Literal(true),
  writeDispatches: Schema.Literal(1),
  readDispatches: Schema.Literal(0),
  remoteWritesBeforeCommit: Schema.Literal(0),
  remoteWritesAfterCommit: Schema.Literal(1)
})
