import { Schema } from "effect"

import { ActiveQueryEvent, ActiveQueryPairInput, ActiveQueryReceipt } from "./active-query-contract.js"
import { ResidentLiveStatus } from "../../src/resident/status-contract.js"

export const ERROR_ROUTING_PROJECT_READS = 4

export const ErrorRoutingInput = Schema.Struct({
  bundle: ActiveQueryPairInput.fields.bundle,
  host: ActiveQueryPairInput.fields.host,
  directory: ActiveQueryPairInput.fields.directory,
  protocol: ActiveQueryPairInput.fields.protocol
})
export const ErrorRoutingReceipt = Schema.Struct({
  mcpSha256: ActiveQueryReceipt.fields.mcpSha256,
  protocol: ActiveQueryReceipt.fields.protocol,
  generation: ActiveQueryReceipt.fields.generation,
  parents: ActiveQueryReceipt.fields.parents,
  statuses: Schema.Tuple([ResidentLiveStatus, ResidentLiveStatus, ResidentLiveStatus]),
  error: ActiveQueryEvent.cases.toolError,
  results: Schema.Tuple([ActiveQueryEvent.cases.result, ActiveQueryEvent.cases.result, ActiveQueryEvent.cases.result]),
  modelRequests: Schema.Literal(1),
  projectReads: Schema.Literal(ERROR_ROUTING_PROJECT_READS),
  projectQueries: Schema.Tuple([
    Schema.Literal("SURVIVE"),
    Schema.Literal("MISSING"),
    Schema.Literal("FRESH"),
    Schema.Literal("SURVIVE")
  ]),
  projectWrites: Schema.Literal(0),
  invalidRequests: Schema.Literal(0),
  parentExits: ActiveQueryReceipt.fields.parentExits,
  adapterExits: Schema.Tuple([Schema.Literal(0), Schema.Literal(0)]),
  backendExit: ActiveQueryReceipt.fields.backendExit,
  registryUnchanged: Schema.Literal(true),
  privateStateRemoved: Schema.Literal(true)
})
