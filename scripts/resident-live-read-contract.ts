import { Schema } from "effect"

import { ProjectIdentifier } from "../src/domain/schemas/shared.js"
import { ResidentPackagePath } from "../src/resident/managed-contract.js"
import { ResidentFilePath } from "../src/resident/protected-path.js"
import { ResidentTlsIdentity } from "../src/resident/tls-channel.js"

export const LIVE_FIRST_READ_ID = 41
export const LIVE_CONTINUED_READ_ID = 42
export const LIVE_PROBE_IO_BOUND = "5 seconds"
export const LIVE_PROBE_HOST_BOUND = "30 seconds"
export const LiveProbeEnvironment = Schema.Record(Schema.String, Schema.RedactedFromValue(Schema.String))
export type LiveProbeEnvironment = Schema.Schema.Type<typeof LiveProbeEnvironment>
export const LiveProjectTarget = Schema.Struct({ project: ProjectIdentifier, name: Schema.NonEmptyString })
export const LiveReadPairInput = Schema.Struct({
  bundle: ResidentPackagePath,
  attachment: ResidentFilePath,
  targets: Schema.Tuple([LiveProjectTarget, LiveProjectTarget])
}).check(
  Schema.makeFilter(
    ({ targets }) =>
      (targets[0].project !== targets[1].project && targets[0].name !== targets[1].name) ||
      "Use two fixture projects with different identifiers and names"
  )
)
export type LiveReadPairInput = Schema.Schema.Type<typeof LiveReadPairInput>
export const LiveReadHostInput = Schema.Struct({
  bundle: ResidentPackagePath,
  attachment: ResidentFilePath,
  target: LiveProjectTarget,
  host: Schema.Literals(["first", "second"]),
  generation: ResidentTlsIdentity.fields.generation
})
export type LiveReadHostInput = Schema.Schema.Type<typeof LiveReadHostInput>
const ProcessId = Schema.Int.check(Schema.isGreaterThan(0))
export const LiveReadHostReceipt = Schema.Struct({
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
export const LiveReadPairReceipt = Schema.Struct({
  mode: Schema.Literal("manual"),
  protocol: Schema.Literal("2026-07-28"),
  readers: Schema.Tuple([LiveReadHostReceipt, LiveReadHostReceipt]),
  parentExits: Schema.Tuple([Schema.Literal(0), Schema.Literal(0)]),
  backendRetirement: Schema.Literal("not-requested")
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
  "pair"
])
export const LiveReadProbeDiagnostic = Schema.Struct({
  kind: Schema.Literal("resident-live-read-failure"),
  phase: LiveReadProbePhase
})
export class LiveReadProbeError extends Schema.TaggedError<LiveReadProbeError>()("LiveReadProbeError", {
  phase: LiveReadProbePhase
}) {}
