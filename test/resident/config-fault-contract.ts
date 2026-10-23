import { Schema } from "effect"
import { ResidentLiveStatus } from "../../src/resident/status-contract.js"
import { KernelOwnedExit } from "../helpers/kernel-reaped-events.js"
import { ActiveQueryEvent } from "./active-query-contract.js"
import { ErrorRoutingInput } from "./error-routing-contract.js"

export const ConfigFaultMode = Schema.Literals(["adapter-backend", "backend-only"])
export const ConfigFaultLaunch = Schema.Literals(["sequential", "concurrent"])
export const ConfigFaultInput = Schema.Struct({
  ...ErrorRoutingInput.fields,
  mode: ConfigFaultMode,
  launch: ConfigFaultLaunch
})

export const CONFIG_FAULT_READS = 2
export const OwnedBackendSignal = Schema.Struct({
  processId: KernelOwnedExit.fields.processId,
  startTicks: Schema.Natural,
  signal: Schema.Literal("SIGKILL"),
  closed: Schema.Literal(true),
  adapterPid: Schema.optionalKey(KernelOwnedExit.fields.processId)
})
export const ConfigFaultReceipt = Schema.Struct({
  protocol: ActiveQueryEvent.cases.ready.fields.protocol,
  launch: ConfigFaultLaunch,
  survivor: ActiveQueryEvent.cases.ready,
  failed: ActiveQueryEvent.cases.ready,
  statuses: Schema.Tuple([ResidentLiveStatus, ResidentLiveStatus, ResidentLiveStatus]),
  results: Schema.Tuple([ActiveQueryEvent.cases.result, ActiveQueryEvent.cases.result]),
  fault: Schema.Union([
    Schema.Struct({
      kind: Schema.Literal("adapter-backend"),
      adapterExit: ActiveQueryEvent.cases.exit,
      backendExit: KernelOwnedExit,
      signal: OwnedBackendSignal
    }),
    Schema.Struct({
      kind: Schema.Literal("backend-only"),
      adapterExit: ActiveQueryEvent.cases.exit,
      signal: Schema.Struct({ ...OwnedBackendSignal.fields, adapterPid: KernelOwnedExit.fields.processId })
    })
  ]),
  survivorBackendExit: KernelOwnedExit,
  survivorAdapterExit: ActiveQueryEvent.cases.exit,
  freshStartRefused: Schema.Literal(true),
  survivorRegistryUnchanged: Schema.Literal(true),
  failedRegistryRetained: Schema.Literal(true),
  survivorModelRequests: Schema.Literal(1),
  survivorReads: Schema.Literal(CONFIG_FAULT_READS),
  survivorWrites: Schema.Literal(0),
  failedReads: Schema.Literal(0),
  invalidRequests: Schema.Literal(0)
})
