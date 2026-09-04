import { Effect, Schema } from "effect"

import {
  HistoricalInstant,
  SocialIdentityId,
  SocialIdentityTypeSchema
} from "../../domain/schemas/person-administration.js"
import { AccountRoleSchema } from "../../domain/schemas/workspace.js"
import {
  BlobId,
  ChannelId,
  Count,
  NonEmptyString,
  PersonId,
  PersonUuid,
  Timestamp,
  UrlString
} from "../../domain/schemas/shared.js"
import { HulyDataInvalidError } from "../errors.js"

export const AccountSocialIdentitySchema = Schema.Struct({
  _id: SocialIdentityId,
  type: SocialIdentityTypeSchema,
  value: Schema.String,
  key: NonEmptyString,
  // The account PostgreSQL adapter emits SQL NULL for an absent display value,
  // despite the public SDK declaring this property as optional.
  displayValue: Schema.optionalKey(Schema.NullOr(Schema.String)),
  verifiedOn: Schema.optionalKey(Timestamp),
  isDeleted: Schema.optionalKey(Schema.Boolean)
})
export type AccountSocialIdentity = Schema.Schema.Type<typeof AccountSocialIdentitySchema>

export const AccountCurrentPersonSchema = Schema.Struct({
  uuid: PersonUuid,
  firstName: Schema.String,
  lastName: Schema.String
})
export type AccountCurrentPerson = Schema.Schema.Type<typeof AccountCurrentPersonSchema>

export const WorkspaceSocialIdentitySchema = Schema.Struct({
  _id: SocialIdentityId,
  space: NonEmptyString,
  attachedTo: NonEmptyString,
  type: SocialIdentityTypeSchema,
  value: Schema.String,
  key: NonEmptyString,
  displayValue: Schema.optionalKey(Schema.String),
  verifiedOn: Schema.optionalKey(Timestamp),
  isDeleted: Schema.optionalKey(Schema.Boolean)
})
export type WorkspaceSocialIdentity = Schema.Schema.Type<typeof WorkspaceSocialIdentitySchema>

export const WorkspaceMemberInfoSchema = Schema.Struct({ person: PersonUuid, role: AccountRoleSchema })
export type WorkspaceMemberInfo = Schema.Schema.Type<typeof WorkspaceMemberInfoSchema>

const WorkspacePersonProjectionSchema = Schema.Struct({
  _id: PersonId,
  personUuid: Schema.optionalKey(PersonUuid),
  birthday: Schema.optionalKey(Schema.NullOr(HistoricalInstant)),
  avatarType: Schema.Literals(["color", "image", "gravatar", "external"]),
  avatar: Schema.optionalKey(Schema.NullOr(BlobId)),
  avatarProps: Schema.optionalKey(
    Schema.Struct({ color: Schema.optionalKey(NonEmptyString), url: Schema.optionalKey(UrlString) })
  ),
  profile: Schema.optionalKey(NonEmptyString)
})
export type WorkspacePersonProjection = Schema.Schema.Type<typeof WorkspacePersonProjectionSchema>

const WorkspaceEmployeeProjectionSchema = Schema.Struct({
  personUuid: Schema.optionalKey(PersonUuid),
  // Mixin queries may omit base Person fields even though the SDK's flattened
  // Employee interface declares active as required.
  active: Schema.optionalKey(Schema.Boolean)
})
export type WorkspaceEmployeeProjection = Schema.Schema.Type<typeof WorkspaceEmployeeProjectionSchema>

const WorkspaceStatusProjectionSchema = Schema.Struct({ name: NonEmptyString, dueDate: Timestamp })
export type WorkspaceStatusProjection = Schema.Schema.Type<typeof WorkspaceStatusProjectionSchema>

const WorkspaceChannelProjectionSchema = Schema.Struct({
  _id: ChannelId,
  items: Schema.optionalKey(Count),
  lastMessage: Schema.optionalKey(Timestamp)
})
export type WorkspaceChannelProjection = Schema.Schema.Type<typeof WorkspaceChannelProjectionSchema>

const WorkspacePersonAdministrationProjectionDataSchema = Schema.Struct({
  person: WorkspacePersonProjectionSchema,
  statuses: Schema.Array(WorkspaceStatusProjectionSchema),
  channels: Schema.Array(WorkspaceChannelProjectionSchema),
  employee: Schema.optionalKey(WorkspaceEmployeeProjectionSchema)
})
export type WorkspacePersonAdministrationProjectionData = Schema.Schema.Type<
  typeof WorkspacePersonAdministrationProjectionDataSchema
>

export const AccountProfileSchema = Schema.Struct({
  uuid: PersonUuid,
  firstName: Schema.String,
  lastName: Schema.String,
  bio: Schema.optionalKey(Schema.NullOr(Schema.String)),
  city: Schema.optionalKey(Schema.NullOr(Schema.String)),
  country: Schema.optionalKey(Schema.NullOr(Schema.String)),
  website: Schema.optionalKey(Schema.NullOr(Schema.String)),
  socialLinks: Schema.optionalKey(Schema.NullOr(Schema.Record(Schema.String, Schema.String))),
  isPublic: Schema.Boolean
})
export type AccountProfile = Schema.Schema.Type<typeof AccountProfileSchema>

const invalidBoundary =
  (operation: string, entity: string) =>
  (cause: unknown): HulyDataInvalidError =>
    new HulyDataInvalidError({ operation, entity, cause })

export const decodeAccountCurrentPerson = (input: unknown): Effect.Effect<AccountCurrentPerson, HulyDataInvalidError> =>
  Schema.decodeUnknownEffect(AccountCurrentPersonSchema)(input).pipe(
    Effect.mapError(invalidBoundary("repairPersonSocialIdentities", "authenticated account Person"))
  )

export const decodeAccountSocialIdentities = (
  input: unknown
): Effect.Effect<ReadonlyArray<AccountSocialIdentity>, HulyDataInvalidError> =>
  Schema.decodeUnknownEffect(Schema.Array(AccountSocialIdentitySchema))(input).pipe(
    Effect.mapError(invalidBoundary("repairPersonSocialIdentities", "authenticated account SocialId"))
  )

export const decodeWorkspaceSocialIdentitiesForRepair = (
  input: unknown
): Effect.Effect<ReadonlyArray<WorkspaceSocialIdentity>, HulyDataInvalidError> =>
  Schema.decodeUnknownEffect(Schema.Array(WorkspaceSocialIdentitySchema))(input).pipe(
    Effect.mapError(invalidBoundary("repairPersonSocialIdentities", "workspace SocialIdentity"))
  )

export const decodeWorkspaceSocialIdentitiesForRead = (
  input: unknown
): Effect.Effect<ReadonlyArray<WorkspaceSocialIdentity>, HulyDataInvalidError> =>
  Schema.decodeUnknownEffect(Schema.Array(WorkspaceSocialIdentitySchema))(input).pipe(
    Effect.mapError(invalidBoundary("getPersonAdministration", "workspace SocialIdentity"))
  )

export const decodeWorkspaceMembers = (
  input: unknown
): Effect.Effect<ReadonlyArray<WorkspaceMemberInfo>, HulyDataInvalidError> =>
  Schema.decodeUnknownEffect(Schema.Array(WorkspaceMemberInfoSchema))(input).pipe(
    Effect.mapError(invalidBoundary("getPersonAdministration", "workspace member"))
  )

export const decodeWorkspacePersonAdministrationProjectionData = (
  input: unknown
): Effect.Effect<WorkspacePersonAdministrationProjectionData, HulyDataInvalidError> =>
  Schema.decodeUnknownEffect(WorkspacePersonAdministrationProjectionDataSchema)(input).pipe(
    Effect.mapError(invalidBoundary("getPersonAdministration", "workspace person administration projection"))
  )

export const decodeAccountProfile = (input: unknown): Effect.Effect<AccountProfile | null, HulyDataInvalidError> =>
  Schema.decodeUnknownEffect(Schema.NullOr(AccountProfileSchema))(input).pipe(
    Effect.mapError(invalidBoundary("getPersonAdministration", "account profile"))
  )
