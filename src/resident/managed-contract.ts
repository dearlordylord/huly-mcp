import { isAbsolute } from "node:path"
import { Schema } from "effect"

import { SanitizedHulyRuntimeConfigContextSchema } from "../domain/schemas/huly-context.js"
import { ResidentSelection } from "./compatibility-contract.js"
import { ResidentDirectory, ResidentFilePath } from "./protected-path.js"
import { ResidentTlsIdentity } from "./tls-channel.js"
import { SelectionClaimTransfer } from "./selection-claim.js"

export const MANAGED_SELECTION_MILLIS = 10_000
export const MANAGED_FAILURE_CLEANUP_MILLIS = 5_000
export const PREPARED_CHILD_MILLIS = 5_000
export const CLAIM_RETRY_MILLIS = 25
export const MANAGED_IDLE_MILLIS = 5_000
export const MAX_REGISTRY_RECORDS = 16
export const MAX_REGISTRY_BYTES = 65_536
export const MAX_BOOTSTRAP_BYTES = 65_536
export const MANAGED_PACKAGE_NAME = "@firfi/huly-mcp"
export const MANAGED_BOOTSTRAP_VERSION = 2

export const ResidentStartupCapture = Schema.Struct({
  selection: ResidentSelection,
  runtimeContext: SanitizedHulyRuntimeConfigContextSchema
})
export type ResidentStartupCapture = Schema.Schema.Type<typeof ResidentStartupCapture>

export const BootstrapNonce = Schema.RedactedFromValue(
  Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u)).pipe(Schema.brand("ResidentBootstrapNonce"))
)
export type BootstrapNonce = Schema.Schema.Type<typeof BootstrapNonce>
const PackageIdentity = Schema.Struct({ name: Schema.Literal(MANAGED_PACKAGE_NAME), version: Schema.NonEmptyString })
export const PreparedChild = Schema.Struct({
  kind: Schema.Literal("prepared"),
  version: Schema.Literal(MANAGED_BOOTSTRAP_VERSION),
  implementation: PackageIdentity,
  nonce: BootstrapNonce
})
export const StartChild = Schema.Struct({
  kind: Schema.Literal("start"),
  version: Schema.Literal(MANAGED_BOOTSTRAP_VERSION),
  nonce: BootstrapNonce,
  directory: ResidentDirectory,
  capture: ResidentStartupCapture,
  claim: SelectionClaimTransfer
})
export const ChildReply = Schema.Union([
  PreparedChild,
  Schema.Struct({
    kind: Schema.Literal("ready"),
    version: Schema.Literal(MANAGED_BOOTSTRAP_VERSION),
    file: ResidentFilePath
  }),
  Schema.Struct({ kind: Schema.Literal("refused"), version: Schema.Literal(MANAGED_BOOTSTRAP_VERSION) })
])
export type ChildReply = Schema.Schema.Type<typeof ChildReply>

const DiagnosticProcessId = Schema.Int.check(Schema.isGreaterThan(0))
export const ResidentRegistryEnvelope = Schema.Struct({
  format: Schema.Int.check(Schema.isGreaterThan(0)),
  implementation: PackageIdentity,
  generation: ResidentTlsIdentity.fields.generation,
  descriptor: Schema.RedactedFromValue(Schema.Unknown),
  diagnostics: Schema.Struct({ processId: DiagnosticProcessId, parentProcessId: DiagnosticProcessId })
})
export type ResidentRegistryEnvelope = Schema.Schema.Type<typeof ResidentRegistryEnvelope>

export class ManagedLaunchError extends Schema.TaggedError<ManagedLaunchError>()("ManagedLaunchError", {
  reason: Schema.Literals([
    "input",
    "ownership",
    "unavailable",
    "deadline",
    "capacity",
    "protocol",
    "retirement",
    "ipc"
  ]),
  message: Schema.String
}) {}

export const NodeExecutablePath = Schema.NonEmptyString.check(Schema.makeFilter(isAbsolute)).pipe(
  Schema.brand("ResidentNodeExecutablePath")
)
export const ResidentPackagePath = Schema.NonEmptyString.check(Schema.makeFilter(isAbsolute)).pipe(
  Schema.brand("ResidentPackagePath")
)
export const ManagedExecutable = Schema.Struct({ executable: NodeExecutablePath, packageFile: ResidentPackagePath })
export type ManagedExecutable = Schema.Schema.Type<typeof ManagedExecutable>

export const registryCapacityFailure = () =>
  new ManagedLaunchError({
    reason: "capacity",
    message: "Resident registry reached sixteen generations; no generation was replaced"
  })
