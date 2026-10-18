import { Schema } from "effect"
import { ResidentLiveStatus } from "../../src/resident/status-contract.js"
import { KernelOwnedExit } from "../helpers/kernel-reaped-events.js"
import { ActiveQueryEvent } from "./active-query-contract.js"
export { ErrorRoutingInput as ConfigFaultInput } from "./error-routing-contract.js"

export const CONFIG_FAULT_READS = 2
export const OwnedBackendSignal = Schema.Struct({
  processId: KernelOwnedExit.fields.processId,
  startTicks: Schema.Natural,
  signal: Schema.Literal("SIGKILL")
})
export const ConfigFaultReceipt = Schema.Struct({
  protocol: ActiveQueryEvent.cases.ready.fields.protocol,
  survivor: ActiveQueryEvent.cases.ready,
  failed: ActiveQueryEvent.cases.ready,
  statuses: Schema.Tuple([ResidentLiveStatus, ResidentLiveStatus, ResidentLiveStatus]),
  results: Schema.Tuple([ActiveQueryEvent.cases.result, ActiveQueryEvent.cases.result]),
  failedAdapterExit: ActiveQueryEvent.cases.exit,
  backendSignal: OwnedBackendSignal,
  failedBackendExit: KernelOwnedExit,
  survivorBackendExit: KernelOwnedExit,
  survivorAdapterExit: ActiveQueryEvent.cases.exit,
  survivorRegistryUnchanged: Schema.Literal(true),
  failedRegistryRetained: Schema.Literal(true),
  survivorModelRequests: Schema.Literal(1),
  survivorReads: Schema.Literal(CONFIG_FAULT_READS),
  survivorWrites: Schema.Literal(0),
  failedReads: Schema.Literal(0),
  invalidRequests: Schema.Literal(0)
})
