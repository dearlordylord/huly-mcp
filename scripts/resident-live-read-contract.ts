import { Schema } from "effect"

import { GetHulyContextResultSchema } from "../src/domain/schemas/huly-context.js"
import { ProjectIdentifier } from "../src/domain/schemas/shared.js"
import { ResidentPackagePath, ResidentRegistryEnvelope } from "../src/resident/managed-contract.js"
import { ResidentDirectory, ResidentFilePath } from "../src/resident/protected-path.js"
import { ResidentTlsIdentity } from "../src/resident/tls-channel.js"

export const LiveReadProtocol = Schema.Literals(["2026-07-28", "2025-06-18"])
export type LiveReadProtocol = Schema.Schema.Type<typeof LiveReadProtocol>
export const resolveLiveReadProtocol = (protocol: LiveReadProtocol | undefined): LiveReadProtocol =>
  protocol ?? "2026-07-28"
export const LiveReadProtocolInput = Schema.optionalKey(LiveReadProtocol)
export const LiveReadClient = Schema.Struct({
  name: Schema.NonEmptyString,
  configuredMode: GetHulyContextResultSchema.fields.toolExposure.fields.configuredMode,
  exposure: GetHulyContextResultSchema.fields.toolExposure.fields.resolvedMode
})
export type LiveReadClient = Schema.Schema.Type<typeof LiveReadClient>
export const resolveLiveReadClient = (host: "first" | "second", client: LiveReadClient | undefined): LiveReadClient =>
  client ?? { name: `resident-live-${host}`, configuredMode: "native", exposure: "native" }
const LiveReadClients = Schema.optionalKey(Schema.Tuple([LiveReadClient, LiveReadClient]))
export const LIVE_FIRST_READ_ID = 41
export const LIVE_CONTINUED_READ_ID = 42
export const LIVE_PROBE_IO_BOUND = "5 seconds"
export const LIVE_PROBE_HOST_BOUND = "30 seconds"
export const LiveProbeEnvironment = Schema.Record(Schema.String, Schema.RedactedFromValue(Schema.String))
export type LiveProbeEnvironment = Schema.Schema.Type<typeof LiveProbeEnvironment>
export const LiveProjectTarget = Schema.Struct({ project: ProjectIdentifier, name: Schema.NonEmptyString })
export const LiveReadTargets = Schema.Tuple([LiveProjectTarget, LiveProjectTarget]).check(
  Schema.makeFilter(
    (targets) =>
      (targets[0].project !== targets[1].project && targets[0].name !== targets[1].name) ||
      "Use two fixture projects with different identifiers and names"
  )
)
export const LiveReadPairInput = Schema.Struct({
  clients: LiveReadClients,
  protocol: LiveReadProtocolInput,
  bundle: ResidentPackagePath,
  attachment: ResidentFilePath,
  targets: LiveReadTargets
})
export const ManagedLiveReadPairInput = Schema.Struct({
  clients: LiveReadClients,
  protocol: LiveReadProtocolInput,
  bundle: ResidentPackagePath,
  directory: ResidentDirectory,
  targets: LiveReadTargets
})
export type ManagedLiveReadPairInput = Schema.Schema.Type<typeof ManagedLiveReadPairInput>
export type LiveReadPairInput = Schema.Schema.Type<typeof LiveReadPairInput>
export const LiveReadHostInput = Schema.Struct({
  client: Schema.optionalKey(LiveReadClient),
  protocol: LiveReadProtocolInput,
  bundle: ResidentPackagePath,
  attachment: ResidentFilePath,
  target: LiveProjectTarget,
  host: Schema.Literals(["first", "second"]),
  generation: ResidentTlsIdentity.fields.generation
})
export type LiveReadHostInput = Schema.Schema.Type<typeof LiveReadHostInput>
export const ManagedLiveReadHostInput = Schema.Struct({
  client: Schema.optionalKey(LiveReadClient),
  protocol: LiveReadProtocolInput,
  bundle: LiveReadHostInput.fields.bundle,
  directory: ResidentDirectory,
  target: LiveProjectTarget,
  host: LiveReadHostInput.fields.host
})
export type ManagedLiveReadHostInput = Schema.Schema.Type<typeof ManagedLiveReadHostInput>
const ProcessId = Schema.Int.check(Schema.isGreaterThan(0))
export const LiveReadHostReceipt = Schema.Struct({
  client: Schema.optionalKey(LiveReadClient),
  catalog: Schema.optionalKey(Schema.Array(Schema.String)),
  exposure: Schema.optionalKey(GetHulyContextResultSchema.fields.toolExposure),
  mode: Schema.Literal("manual"),
  host: LiveReadHostInput.fields.host,
  parentPid: ProcessId,
  adapterPid: ProcessId,
  generation: ResidentTlsIdentity.fields.generation,
  firstId: Schema.Literal(LIVE_FIRST_READ_ID),
  continuedId: Schema.Literal(LIVE_CONTINUED_READ_ID),
  target: LiveProjectTarget,
  adapterExit: Schema.Literal(0)
})
export type LiveReadHostReceipt = Schema.Schema.Type<typeof LiveReadHostReceipt>
export const ManagedLiveReadHostReceipt = Schema.Struct({
  ...LiveReadHostReceipt.fields,
  mode: Schema.Literal("managed"),
  backendProcessId: ResidentRegistryEnvelope.fields.diagnostics.fields.processId
})
export type ManagedLiveReadHostReceipt = Schema.Schema.Type<typeof ManagedLiveReadHostReceipt>
export const AnyLiveReadHostReceipt = Schema.Union([LiveReadHostReceipt, ManagedLiveReadHostReceipt])
export const LiveReadPairReceipt = Schema.Struct({
  mode: Schema.Literal("manual"),
  protocol: LiveReadProtocol,
  readers: Schema.Tuple([LiveReadHostReceipt, LiveReadHostReceipt]),
  parentExits: Schema.Tuple([Schema.Literal(0), Schema.Literal(0)]),
  backendRetirement: Schema.Literal("not-requested")
})
export const ManagedLiveReadPairReceipt = Schema.Struct({
  mode: Schema.Literal("managed"),
  protocol: LiveReadProtocol,
  readers: Schema.Tuple([ManagedLiveReadHostReceipt, ManagedLiveReadHostReceipt]),
  parentExits: LiveReadPairReceipt.fields.parentExits,
  backendRetirement: Schema.Literal("confirmed"),
  backendExit: Schema.Struct({
    processId: ResidentRegistryEnvelope.fields.diagnostics.fields.processId,
    exitCode: Schema.Literal(0)
  }),
  privateStateRemoved: Schema.Literal(true)
})
export const LiveReadProbePhase = Schema.Literals([
  "input",
  "spawn",
  "send",
  "response",
  "discover",
  "catalog",
  "templates",
  "read",
  "exit",
  "cleanup",
  "pair",
  "ownership",
  "retirement"
])
export const LiveReadProbeDiagnostic = Schema.Struct({
  kind: Schema.Literal("resident-live-read-failure"),
  phase: LiveReadProbePhase
})
export class LiveReadProbeError extends Schema.TaggedError<LiveReadProbeError>()("LiveReadProbeError", {
  phase: LiveReadProbePhase
}) {}
