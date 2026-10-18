import { Schema } from "effect"
import { MAX_ADAPTER_REQUESTS } from "../../src/resident/adapter-limits.js"

import { ModelWaitEvent, ModelWaitHostInput, ModelWaitPairInput, ModelWaitReceipt } from "./model-wait-contract.js"
import { GetProjectResultSchema } from "../../src/domain/schemas/projects.js"
import { ProjectIdentifier } from "../../src/domain/schemas/shared.js"

export const ACTIVE_FIRST_ID = 41
export const ACTIVE_CONTINUED_ID = 42
export const OUTPUT_EXIT_BOUND = 15_000
export const BlockedOutput = Schema.Literals(["closed", "unread"])
export const AdapterLoss = Schema.Literals(["eof", "kill"])
export const ActiveQueryHostInput = Schema.Struct({
  ...ModelWaitHostInput.fields,
  role: Schema.Literals(["departing", "survivor"])
})
export type ActiveQueryHostInput = Schema.Schema.Type<typeof ActiveQueryHostInput>
export const ActiveQueryPairInput = Schema.Struct({
  bundle: ModelWaitPairInput.fields.bundle,
  host: ModelWaitPairInput.fields.host,
  directory: ModelWaitPairInput.fields.directory,
  protocol: ModelWaitPairInput.fields.protocol,
  loss: AdapterLoss
})
export const BurstProjects = Schema.Array(ProjectIdentifier).check(
  Schema.isBetweenLength(MAX_ADAPTER_REQUESTS, MAX_ADAPTER_REQUESTS)
)
export const BurstIds = Schema.Array(Schema.Int).check(
  Schema.isBetweenLength(MAX_ADAPTER_REQUESTS, MAX_ADAPTER_REQUESTS)
)
export const ActiveQueryCommand = Schema.TaggedUnion({
  read: { project: ProjectIdentifier },
  readError: { project: ProjectIdentifier },
  lose: { mode: AdapterLoss },
  stall: { project: ProjectIdentifier, mode: BlockedOutput },
  fill: { projects: BurstProjects },
  overflow: { project: ProjectIdentifier },
  close: {}
})
export type ActiveQueryCommand = Schema.Schema.Type<typeof ActiveQueryCommand>
export const AdapterExit = Schema.Struct({ code: Schema.NullOr(Schema.Int), signal: Schema.NullOr(Schema.String) })
export const ActiveQueryToolError = Schema.Struct({
  isError: Schema.Literal(true),
  content: Schema.Array(Schema.Struct({ type: Schema.Literal("text"), text: Schema.String })).check(
    Schema.isMinLength(1)
  ),
  structuredContent: Schema.optionalKey(Schema.Never)
})
export const ActiveQueryEvent = Schema.TaggedUnion({
  ready: {
    protocol: ModelWaitEvent.cases.ready.fields.protocol,
    parentPid: ModelWaitEvent.cases.ready.fields.parentPid,
    adapterPid: ModelWaitEvent.cases.ready.fields.adapterPid,
    port: ModelWaitEvent.cases.ready.fields.port
  },
  started: { project: ProjectIdentifier, id: Schema.Int },
  result: { project: ProjectIdentifier, id: Schema.Int, result: GetProjectResultSchema },
  toolError: { project: ProjectIdentifier, id: Schema.Int, reply: ActiveQueryToolError },
  interrupted: { project: ProjectIdentifier, id: Schema.Int },
  loss: { mode: AdapterLoss },
  stalled: { project: ProjectIdentifier, id: Schema.Int, mode: BlockedOutput },
  filled: { ids: BurstIds },
  limitExit: { ...AdapterExit.fields, admissionFailure: Schema.Literal(true), rejectedId: Schema.Int },
  outputExit: { ...AdapterExit.fields, outputFailure: Schema.Literal(true) },
  exit: AdapterExit.fields
})
export type ActiveQueryEvent = Schema.Schema.Type<typeof ActiveQueryEvent>
export const ActiveQueryRequestTrace = Schema.Struct({
  kind: Schema.Literal("active-query-request"),
  parentPid: ActiveQueryEvent.cases.ready.fields.parentPid,
  id: ActiveQueryEvent.cases.started.fields.id,
  method: Schema.Literals(["initialize", "server/discover", "tools/call"]),
  step: Schema.TaggedUnion({
    sending: {},
    waiting: {},
    frame: { bytes: Schema.Natural },
    eof: {},
    wrongId: {},
    rejected: { code: Schema.Int },
    completed: {},
    notificationLimit: {}
  })
})
export type ActiveQueryRequestTrace = Schema.Schema.Type<typeof ActiveQueryRequestTrace>
export const ActiveQueryReceipt = Schema.Struct({
  mcpSha256: ModelWaitReceipt.fields.mcpSha256,
  protocol: ModelWaitReceipt.fields.protocol,
  generation: ModelWaitReceipt.fields.generation,
  modelRequests: ModelWaitReceipt.fields.modelRequests,
  projectReads: ModelWaitReceipt.fields.projectReads,
  parentExits: ModelWaitReceipt.fields.parentExits,
  backendExit: ModelWaitReceipt.fields.backendExit,
  registryUnchanged: ModelWaitReceipt.fields.registryUnchanged,
  privateStateRemoved: ModelWaitReceipt.fields.privateStateRemoved,
  loss: AdapterLoss,
  parents: Schema.Tuple([ActiveQueryEvent.cases.ready, ActiveQueryEvent.cases.ready]),
  statuses: ModelWaitReceipt.fields.statuses,
  departed: AdapterExit,
  projectQueries: Schema.Tuple([Schema.Literal("LEAVE"), Schema.Literal("SURVIVE"), Schema.Literal("SURVIVE")]),
  interruptedId: Schema.Literal(ACTIVE_FIRST_ID),
  survivingIds: Schema.Tuple([Schema.Literal(ACTIVE_FIRST_ID), Schema.Literal(ACTIVE_CONTINUED_ID)])
})
