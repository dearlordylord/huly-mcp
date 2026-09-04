import { Schema } from "effect"

import { toDraft07JsonSchema, withJsonSchemaPropertyDescriptions } from "./json-schema.js"
import { PersonAdministrationLocatorSchema } from "./person-administration.js"
import {
  Count,
  DocId,
  NonEmptyString,
  ObjectClassName,
  PersonId,
  PersonName,
  PersonUuid,
  PositiveInteger,
  Sha256Hex,
  SpaceId
} from "./shared.js"

export const PersonMergeReferenceKindSchema = Schema.Literals(["single", "array"])
export type PersonMergeReferenceKind = Schema.Schema.Type<typeof PersonMergeReferenceKindSchema>

export const PersonMergeReferenceCategorySchema = Schema.Literals([
  "identity",
  "channel",
  "membership",
  "comment",
  "attachment",
  "other"
])
export type PersonMergeReferenceCategory = Schema.Schema.Type<typeof PersonMergeReferenceCategorySchema>

export const PersonMergeSnapshotDigest = Sha256Hex.pipe(
  Schema.brand("PersonMergeSnapshotDigest"),
  Schema.annotate({
    identifier: "PersonMergeSnapshotDigest",
    description:
      "SHA-256 digest of canonical affected document IDs, write-routing fields, and current reference values."
  })
)
export type PersonMergeSnapshotDigest = Schema.Schema.Type<typeof PersonMergeSnapshotDigest>

export const PersonMergeReferenceImpactSchema = Schema.Struct({
  attributeId: DocId,
  ownerClass: ObjectClassName,
  concreteClass: ObjectClassName,
  targetClass: ObjectClassName,
  field: NonEmptyString,
  kind: PersonMergeReferenceKindSchema,
  category: PersonMergeReferenceCategorySchema,
  count: PositiveInteger,
  snapshotDigest: PersonMergeSnapshotDigest
})
export type PersonMergeReferenceImpact = Schema.Schema.Type<typeof PersonMergeReferenceImpactSchema>

export const PersonMergeImpactSchema = Schema.Struct({
  identities: Count,
  channels: Count,
  memberships: Count,
  comments: Count,
  attachments: Count,
  otherReferences: Count,
  totalReferences: Count,
  references: Schema.Array(PersonMergeReferenceImpactSchema)
})
export type PersonMergeImpact = Schema.Schema.Type<typeof PersonMergeImpactSchema>

export const PersonMergeRecordSchema = Schema.Struct({
  id: PersonId,
  name: PersonName,
  space: SpaceId,
  personUuid: Schema.optionalKey(PersonUuid)
})
export type PersonMergeRecord = Schema.Schema.Type<typeof PersonMergeRecordSchema>

export const PersonMergePreflightToken = Sha256Hex.pipe(
  Schema.brand("PersonMergePreflightToken"),
  Schema.annotate({
    identifier: "PersonMergePreflightToken",
    description: "Opaque token for one exact person-merge impact snapshot."
  })
)
export type PersonMergePreflightToken = Schema.Schema.Type<typeof PersonMergePreflightToken>

const PersonMergePreviewParamsSchema = Schema.Struct({
  source: PersonAdministrationLocatorSchema,
  survivor: PersonAdministrationLocatorSchema,
  execute: Schema.optionalKey(Schema.Literal(false)),
  expectedPreflightToken: Schema.optionalKey(Schema.Never)
})

const PersonMergeExecuteParamsSchema = Schema.Struct({
  source: PersonAdministrationLocatorSchema,
  survivor: PersonAdministrationLocatorSchema,
  execute: Schema.Literal(true),
  expectedPreflightToken: PersonMergePreflightToken
})

export const MergePeopleParamsSchema = Schema.Union([
  PersonMergePreviewParamsSchema,
  PersonMergeExecuteParamsSchema
]).annotate({
  title: "MergePeopleParams",
  description:
    "Preview by default. Execution requires execute=true and the exact preflight token returned for the same source, survivor, and current reference snapshot."
})
export type MergePeopleParams = Schema.Schema.Type<typeof MergePeopleParamsSchema>

export const PersonMergePreflightAccountActionSchema = Schema.Literals([
  "not-needed",
  "already-unified",
  "ready",
  "blocked"
])
export type PersonMergePreflightAccountAction = Schema.Schema.Type<typeof PersonMergePreflightAccountActionSchema>

export const PersonMergeFinalAccountActionSchema = Schema.Literals(["not-needed", "already-unified", "merged"])
export type PersonMergeFinalAccountAction = Schema.Schema.Type<typeof PersonMergeFinalAccountActionSchema>

export const PersonMergeUnmigratedSchema = Schema.Struct({ subject: NonEmptyString, reason: NonEmptyString })
export type PersonMergeUnmigrated = Schema.Schema.Type<typeof PersonMergeUnmigratedSchema>

export const PersonMergeBaseUnmigratedSchema = Schema.Tuple([PersonMergeUnmigratedSchema, PersonMergeUnmigratedSchema])
export type PersonMergeBaseUnmigrated = Schema.Schema.Type<typeof PersonMergeBaseUnmigratedSchema>

export const PersonMergeBlockedUnmigratedSchema = Schema.Tuple([
  PersonMergeUnmigratedSchema,
  PersonMergeUnmigratedSchema,
  PersonMergeUnmigratedSchema
])
export type PersonMergeBlockedUnmigrated = Schema.Schema.Type<typeof PersonMergeBlockedUnmigratedSchema>

const MergePeopleResultCommon = {
  source: PersonMergeRecordSchema,
  survivor: PersonMergeRecordSchema,
  impact: PersonMergeImpactSchema,
  preflightToken: PersonMergePreflightToken,
  sourceRecordRetained: Schema.Literal(true)
}

const MergePeoplePreviewResultSchema = Schema.Struct({
  ...MergePeopleResultCommon,
  executed: Schema.Literal(false),
  accountAction: Schema.Literals(["not-needed", "already-unified", "ready"]),
  unmigrated: PersonMergeBaseUnmigratedSchema
})

const MergePeopleBlockedPreviewResultSchema = Schema.Struct({
  ...MergePeopleResultCommon,
  executed: Schema.Literal(false),
  accountAction: Schema.Literal("blocked"),
  unmigrated: PersonMergeBlockedUnmigratedSchema
})

const MergePeopleExecutedResultSchema = Schema.Struct({
  ...MergePeopleResultCommon,
  executed: Schema.Literal(true),
  accountAction: PersonMergeFinalAccountActionSchema,
  unmigrated: PersonMergeBaseUnmigratedSchema
})

export const MergePeopleResultSchema = Schema.Union([
  MergePeoplePreviewResultSchema,
  MergePeopleBlockedPreviewResultSchema,
  MergePeopleExecutedResultSchema
])
export type MergePeopleResult = Schema.Schema.Type<typeof MergePeopleResultSchema>

export const mergePeopleParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(MergePeopleParamsSchema),
  {
    source: "Exact locator for the duplicate/source Person. This record is never selected implicitly.",
    survivor: "Exact locator for the Person that must survive. This record is never selected implicitly.",
    execute: "Omit or pass false to preview. Pass true only with expectedPreflightToken from a current preview.",
    expectedPreflightToken:
      "Exact opaque token returned by the preview; execution fails if any reference or account precondition changed."
  }
)

export const parseMergePeopleParams = Schema.decodeUnknownEffect(MergePeopleParamsSchema, { onExcessProperty: "error" })
