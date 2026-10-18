import { Schema } from "effect"
import { MAX_ADAPTER_REQUESTS } from "../../src/resident/adapter-limits.js"
import { ProjectIdentifier } from "../../src/domain/schemas/shared.js"
import { ActiveQueryPairInput, ActiveQueryReceipt, BurstIds } from "./active-query-contract.js"

export const BURST_SURVIVOR_READS = 2
export const BURST_TOTAL_READS = MAX_ADAPTER_REQUESTS + BURST_SURVIVOR_READS
export const BurstIsolationInput = Schema.Struct({
  bundle: ActiveQueryPairInput.fields.bundle,
  host: ActiveQueryPairInput.fields.host,
  directory: ActiveQueryPairInput.fields.directory,
  protocol: ActiveQueryPairInput.fields.protocol
})
export const BurstIsolationReceipt = Schema.Struct({
  mcpSha256: ActiveQueryReceipt.fields.mcpSha256,
  protocol: ActiveQueryReceipt.fields.protocol,
  generation: ActiveQueryReceipt.fields.generation,
  parents: ActiveQueryReceipt.fields.parents,
  statuses: ActiveQueryReceipt.fields.statuses,
  modelRequests: ActiveQueryReceipt.fields.modelRequests,
  projectReads: Schema.Literal(BURST_TOTAL_READS),
  parentExits: ActiveQueryReceipt.fields.parentExits,
  backendExit: ActiveQueryReceipt.fields.backendExit,
  registryUnchanged: ActiveQueryReceipt.fields.registryUnchanged,
  privateStateRemoved: ActiveQueryReceipt.fields.privateStateRemoved,
  admissionFailure: Schema.Literal(true),
  saturatedExit: Schema.Struct({ code: Schema.Literal(1), signal: Schema.Null }),
  projectQueries: Schema.Array(ProjectIdentifier).check(Schema.isBetweenLength(BURST_TOTAL_READS, BURST_TOTAL_READS)),
  filledIds: BurstIds,
  rejectedId: Schema.Int,
  survivingIds: ActiveQueryReceipt.fields.survivingIds
})
