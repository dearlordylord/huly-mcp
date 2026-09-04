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

export const PersonMergeSnapshotDigest = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^[0-9a-f]{64}$/u)),
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

export const PersonMergePreflightToken = NonEmptyString.pipe(
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

export const PersonMergeAccountActionSchema = Schema.Literals([
  "not-needed",
  "already-unified",
  "ready",
  "merged",
  "blocked"
])

const PersonMergeUnmigratedSchema = Schema.Struct({ subject: NonEmptyString, reason: NonEmptyString })

export const MergePeopleResultSchema = Schema.Struct({
  source: PersonMergeRecordSchema,
  survivor: PersonMergeRecordSchema,
  impact: PersonMergeImpactSchema,
  preflightToken: PersonMergePreflightToken,
  executed: Schema.Boolean,
  sourceRecordRetained: Schema.Literal(true),
  accountAction: PersonMergeAccountActionSchema,
  unmigrated: Schema.Array(PersonMergeUnmigratedSchema)
})
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
