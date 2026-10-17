import { Schema } from "effect"

import { HulyConfigSchema } from "../config/config.js"
import { McpProcessPolicy } from "../mcp/process-policy.js"
import { ResidentTlsIdentity } from "./tls-channel.js"

export const ResidentSelection = Schema.Struct({
  huly: HulyConfigSchema,
  policy: McpProcessPolicy,
  lazyEnvs: Schema.Boolean
})
export type ResidentSelection = Schema.Schema.Type<typeof ResidentSelection>

const Hex32 = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u))
export const CompatibilityNonce = Schema.RedactedFromValue(Hex32.pipe(Schema.brand("ResidentCompatibilityNonce")))
export type CompatibilityNonce = Schema.Schema.Type<typeof CompatibilityNonce>
export const CompatibilityMac = Schema.RedactedFromValue(Hex32.pipe(Schema.brand("ResidentCompatibilityMac")))
export type CompatibilityMac = Schema.Schema.Type<typeof CompatibilityMac>

export const CompatibilityChallenge = Schema.Struct({
  version: Schema.Literal(1),
  implementation: Schema.NonEmptyString,
  generation: ResidentTlsIdentity.fields.generation,
  nonce: CompatibilityNonce
})
export type CompatibilityChallenge = Schema.Schema.Type<typeof CompatibilityChallenge>
export const CompatibilityProof = Schema.Struct({ ...CompatibilityChallenge.fields, mac: CompatibilityMac })
export type CompatibilityProof = Schema.Schema.Type<typeof CompatibilityProof>
export const RESIDENT_COMPATIBILITY_PATH = "/resident/compatibility"
export const MAX_COMPATIBILITY_REQUEST_BYTES = 4_096

export class CompatibilityError extends Schema.TaggedError<CompatibilityError>()("CompatibilityError", {
  kind: Schema.Literals(["capacity", "unknown", "mismatch", "encoding", "entropy", "input"]),
  message: Schema.String
}) {}

export const MAX_COMPATIBILITY_CHALLENGES = 32
export const COMPATIBILITY_CHALLENGE_MILLIS = 5_000
