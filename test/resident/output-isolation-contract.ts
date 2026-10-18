import { Schema } from "effect"

import { ActiveQueryPairInput, ActiveQueryReceipt, BlockedOutput } from "./active-query-contract.js"

export const OutputIsolationInput = Schema.Struct({
  bundle: ActiveQueryPairInput.fields.bundle,
  host: ActiveQueryPairInput.fields.host,
  directory: ActiveQueryPairInput.fields.directory,
  protocol: ActiveQueryPairInput.fields.protocol,
  mode: BlockedOutput
})
export const OutputIsolationReceipt = Schema.Struct({
  mcpSha256: ActiveQueryReceipt.fields.mcpSha256,
  protocol: ActiveQueryReceipt.fields.protocol,
  generation: ActiveQueryReceipt.fields.generation,
  parents: ActiveQueryReceipt.fields.parents,
  statuses: ActiveQueryReceipt.fields.statuses,
  modelRequests: ActiveQueryReceipt.fields.modelRequests,
  projectReads: ActiveQueryReceipt.fields.projectReads,
  parentExits: ActiveQueryReceipt.fields.parentExits,
  backendExit: ActiveQueryReceipt.fields.backendExit,
  registryUnchanged: ActiveQueryReceipt.fields.registryUnchanged,
  privateStateRemoved: ActiveQueryReceipt.fields.privateStateRemoved,
  mode: BlockedOutput,
  outputFailure: Schema.Literal(true),
  blockedExit: Schema.Struct({ code: Schema.Literal(1), signal: Schema.Null }),
  projectQueries: Schema.Tuple([Schema.Literal("BLOCKED"), Schema.Literal("SURVIVE"), Schema.Literal("SURVIVE")]),
  stalledId: ActiveQueryReceipt.fields.interruptedId,
  survivingIds: ActiveQueryReceipt.fields.survivingIds
})
