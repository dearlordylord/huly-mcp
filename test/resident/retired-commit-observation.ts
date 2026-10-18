import { Schema } from "effect"
import { LiveReadProtocol } from "../../scripts/resident-live-read-contract.js"

import { ResidentRegistryEnvelope } from "../../src/resident/managed-contract.js"
import { KernelOwnedExit } from "../helpers/kernel-reaped-events.js"

export const RetiredCommitOperation = Schema.Literals(["increment", "read"])
export type RetiredCommitOperation = Schema.Schema.Type<typeof RetiredCommitOperation>
export const retiredCommitToolName = (operation: RetiredCommitOperation) =>
  operation === "increment" ? "fixture_increment" : "fixture_read"
export const RetiredCommitRequest = Schema.Struct({ operation: RetiredCommitOperation })
export const RetiredCommitState = Schema.Struct({ writes: Schema.Natural })
export const RetiredCommitEndpoint = Schema.URLFromString.check(
  Schema.makeFilter(
    (url) => url.protocol === "http:" && url.hostname === "127.0.0.1" && url.username === "" && url.password === ""
  )
)
export const RetiredCommitEvent = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("ready"), generation: ResidentRegistryEnvelope.fields.generation }),
  Schema.Struct({ kind: Schema.Literal("retired"), writes: Schema.Natural, reads: Schema.Natural })
])
export type RetiredCommitEvent = Schema.Schema.Type<typeof RetiredCommitEvent>
const EXPECTED_READ_DISPATCHES = 2
const Hash = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u))
export const RetiredCommitObservation = Schema.Struct({
  protocol: LiveReadProtocol,
  artifacts: Schema.Struct({ mcpSha256: Hash, cliSha256: Hash, backendSha256: Hash, coordinatorSha256: Hash }),
  originalGeneration: ResidentRegistryEnvelope.fields.generation,
  replacementGeneration: ResidentRegistryEnvelope.fields.generation,
  originalBackendExit: KernelOwnedExit,
  replacementBackendExit: KernelOwnedExit,
  originalAdapterExit: Schema.Literals([0, 1]),
  replacementAdapterExit: Schema.Literal(0),
  writeDispatches: Schema.Literal(1),
  readDispatches: Schema.Literal(EXPECTED_READ_DISPATCHES),
  freshReadBeforeCommit: Schema.Literal(0),
  freshReadAfterCommit: Schema.Literal(1),
  privateStateRemoved: Schema.Literal(true)
})
