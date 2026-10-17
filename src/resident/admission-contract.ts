import { Schema } from "effect"

export const RESIDENT_ATTACHMENTS_PATH = "/resident/attachments"
export const RESIDENT_ATTACHMENT_HEADER = "x-huly-resident-attachment"
export const AttachmentToken = Schema.RedactedFromValue(
  Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u)).pipe(Schema.brand("ResidentAttachmentToken"))
)
export type AttachmentToken = Schema.Schema.Type<typeof AttachmentToken>
export const LeasePolicy = Schema.Struct({
  durationMillis: Schema.Int.check(Schema.isGreaterThan(0)).pipe(Schema.brand("ResidentLeaseMillis")),
  renewEveryMillis: Schema.Int.check(Schema.isGreaterThan(0)).pipe(Schema.brand("ResidentRenewalMillis"))
}).check(Schema.makeFilter((policy) => policy.renewEveryMillis < policy.durationMillis))
export type LeasePolicy = Schema.Schema.Type<typeof LeasePolicy>
const LEASE_DURATION_MILLIS = 30_000
const RENEWAL_INTERVAL_MILLIS = 5_000
export const DEFAULT_LEASE_POLICY = Schema.decodeUnknownSync(LeasePolicy)({
  durationMillis: LEASE_DURATION_MILLIS,
  renewEveryMillis: RENEWAL_INTERVAL_MILLIS
})
export const AttachmentAdmitted = Schema.Struct({
  version: Schema.Literal(1),
  token: AttachmentToken,
  lease: LeasePolicy
})
export type AttachmentAdmitted = Schema.Schema.Type<typeof AttachmentAdmitted>

export const AdmissionPolicy = Schema.Struct({
  capacity: Schema.Int.check(Schema.isGreaterThan(0)).pipe(Schema.brand("ResidentAttachmentCapacity")),
  closeAllowanceMillis: Schema.Int.check(Schema.isGreaterThan(0)).pipe(Schema.brand("ResidentCloseAllowanceMillis")),
  lease: LeasePolicy
})
export type AdmissionPolicy = Schema.Schema.Type<typeof AdmissionPolicy>

export class AdmissionError extends Schema.TaggedError<AdmissionError>()("AdmissionError", {
  kind: Schema.Literals(["capacity", "unknown", "cleanup", "pending"]),
  message: Schema.String
}) {}
