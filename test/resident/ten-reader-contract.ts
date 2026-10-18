import { Schema } from "effect"

import { ProjectIdentifier } from "../../src/domain/schemas/shared.js"
import { ResidentLiveStatus } from "../../src/resident/status-contract.js"
import { ActiveQueryEvent, ActiveQueryPairInput } from "./active-query-contract.js"
import { ModelWaitReceipt } from "./model-wait-contract.js"

export const TEN_READERS = 10
export const TEN_READER_ROUNDS = 2
export const TEN_READER_READS = TEN_READERS * TEN_READER_ROUNDS
export const TenReaderInput = Schema.Struct({
  bundle: ActiveQueryPairInput.fields.bundle,
  host: ActiveQueryPairInput.fields.host,
  directory: ActiveQueryPairInput.fields.directory,
  protocol: ActiveQueryPairInput.fields.protocol
})
const TenResults = Schema.Array(ActiveQueryEvent.cases.result).check(Schema.isBetweenLength(TEN_READERS, TEN_READERS))
export const TenReaderReceipt = Schema.Struct({
  mcpSha256: ModelWaitReceipt.fields.mcpSha256,
  protocol: ModelWaitReceipt.fields.protocol,
  generation: ModelWaitReceipt.fields.generation,
  parents: Schema.Array(ActiveQueryEvent.cases.ready).check(Schema.isBetweenLength(TEN_READERS, TEN_READERS)),
  statuses: Schema.Tuple([ResidentLiveStatus, ResidentLiveStatus]),
  rounds: Schema.Tuple([TenResults, TenResults]),
  modelRequests: Schema.Literal(1),
  projectReads: Schema.Literal(TEN_READER_READS),
  projectQueries: Schema.Array(ProjectIdentifier).check(Schema.isBetweenLength(TEN_READER_READS, TEN_READER_READS)),
  projectWrites: Schema.Literal(0),
  invalidRequests: Schema.Literal(0),
  fullModelRequested: Schema.Literal(true),
  parentExits: Schema.Array(Schema.Literal(0)).check(Schema.isBetweenLength(TEN_READERS, TEN_READERS)),
  adapterExits: Schema.Array(Schema.Literal(0)).check(Schema.isBetweenLength(TEN_READERS, TEN_READERS)),
  backendExit: ModelWaitReceipt.fields.backendExit,
  registryUnchanged: Schema.Literal(true),
  privateStateRemoved: Schema.Literal(true)
})
