import { Schema } from "effect"

import { GetProjectResultSchema } from "../../src/domain/schemas/projects.js"
import { ProjectIdentifier } from "../../src/domain/schemas/shared.js"
import { ResidentPackagePath, ResidentRegistryEnvelope } from "../../src/resident/managed-contract.js"
import { ResidentDirectory } from "../../src/resident/protected-path.js"
import { ResidentLiveStatus } from "../../src/resident/status-contract.js"
import { KernelOwnedExit } from "../helpers/kernel-reaped-events.js"
import { ManagedParentConnected } from "./managed-observation.js"
import { HttpPort } from "../../src/mcp/http-transport.js"

export const ModelWaitProtocol = Schema.Literals(["2026-07-28", "2025-06-18"])
export const MODEL_WAIT_PROJECT_READS = 3
export const ModelWaitRole = Schema.Literals(["creator", "joiner"])
export const ModelWaitHostInput = Schema.Struct({
  bundle: ResidentPackagePath,
  directory: ResidentDirectory,
  endpoint: Schema.NonEmptyString,
  protocol: ModelWaitProtocol,
  role: ModelWaitRole
})
export type ModelWaitHostInput = Schema.Schema.Type<typeof ModelWaitHostInput>
export const ModelWaitPairInput = Schema.Struct({
  bundle: ResidentPackagePath,
  host: ResidentPackagePath,
  directory: ResidentDirectory,
  protocol: ModelWaitProtocol,
  cancelledRole: ModelWaitRole,
  clockBackend: Schema.optionalKey(ResidentPackagePath)
})
export const ModelWaitCommand = Schema.TaggedUnion({ read: { project: ProjectIdentifier }, cancel: {}, close: {} })
export type ModelWaitCommand = Schema.Schema.Type<typeof ModelWaitCommand>
export const ModelWaitEvent = Schema.TaggedUnion({
  ready: {
    protocol: ModelWaitProtocol,
    parentPid: ManagedParentConnected.fields.parentPid,
    adapterPid: ManagedParentConnected.fields.adapterPid,
    port: HttpPort.check(Schema.isGreaterThan(0))
  },
  started: { project: ProjectIdentifier },
  cancelled: { project: ProjectIdentifier },
  result: { project: ProjectIdentifier, result: GetProjectResultSchema },
  failed: {}
})
export type ModelWaitEvent = Schema.Schema.Type<typeof ModelWaitEvent>
export const ModelWaitReceipt = Schema.Struct({
  clockControlled: Schema.Boolean,
  mcpSha256: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u)),
  protocol: ModelWaitProtocol,
  cancelledRole: ModelWaitRole,
  generation: ResidentRegistryEnvelope.fields.generation,
  parents: Schema.Tuple([ModelWaitEvent.cases.ready, ModelWaitEvent.cases.ready]),
  statuses: Schema.Tuple([ResidentLiveStatus, ResidentLiveStatus, ResidentLiveStatus]),
  discoveryDuringInitialization: Schema.Struct({
    parent: ModelWaitEvent.cases.ready,
    status: ResidentLiveStatus,
    parentExit: Schema.Literal(0)
  }),
  modelRequests: Schema.Literal(1),
  projectReads: Schema.Literal(MODEL_WAIT_PROJECT_READS),
  projectQueries: Schema.Tuple([Schema.Literal("SURVIVE"), Schema.Literal("FRESH"), Schema.Literal("SURVIVE")]),
  parentExits: Schema.Tuple([Schema.Literal(0), Schema.Literal(0)]),
  backendExit: KernelOwnedExit,
  registryUnchanged: Schema.Literal(true),
  privateStateRemoved: Schema.Literal(true)
})
