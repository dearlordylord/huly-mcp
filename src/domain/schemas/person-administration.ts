import { Schema } from "effect"

import { MAX_FILE_SIZE_MB } from "../../huly/errors-files.js"
import { AttachmentWireSchema, AttachmentSummaryWireSchema } from "./attachments.js"
import { AttachmentDescription, AttachmentFileName, Base64FileData, LocalFilePath } from "./domain-values.js"
import { CommentSchema } from "./comments.js"
import { HULY_NATIVE_REFERENCE_MARKDOWN_INPUT } from "./document-native-references.js"
import { toDraft07JsonSchema, withJsonSchemaPropertyDescriptions } from "./json-schema.js"
import { AccountRoleSchema } from "./workspace.js"
import {
  AttachmentId,
  BlobId,
  ChannelId,
  CommentId,
  Count,
  DEFAULT_LIMIT,
  Email,
  LimitParam,
  MimeType,
  NonEmptyString,
  PersonId,
  PersonName,
  PersonUuid,
  Timestamp,
  UrlString
} from "./shared.js"
import {
  UPLOAD_BASE64_DATA_DESCRIPTION,
  UPLOAD_FILE_PATH_DESCRIPTION,
  UPLOAD_FILE_URL_DESCRIPTION
} from "./upload-source.js"

const ByPersonId = Schema.Struct({
  id: PersonId.annotateKey({ description: "Exact Huly Person document ID." }),
  email: Schema.optionalKey(Schema.Never),
  name: Schema.optionalKey(Schema.Never)
})
const ByPersonEmail = Schema.Struct({
  email: Email.annotateKey({ description: "Exact social identity or contact-channel email address." }),
  id: Schema.optionalKey(Schema.Never),
  name: Schema.optionalKey(Schema.Never)
})
const ByPersonName = Schema.Struct({
  name: PersonName.annotateKey({ description: "Exact Huly Person display name." }),
  id: Schema.optionalKey(Schema.Never),
  email: Schema.optionalKey(Schema.Never)
})

export const PersonAdministrationLocatorSchema = Schema.Union([ByPersonId, ByPersonEmail, ByPersonName]).annotate({
  title: "PersonAdministrationLocator",
  description: "Exact person locator. Provide exactly one of id, email, or name; ambiguous matches fail.",
  jsonSchema: {
    oneOf: [
      { type: "object", required: ["id"] },
      { type: "object", required: ["email"] },
      { type: "object", required: ["name"] }
    ]
  }
})
export type PersonAdministrationLocator = Schema.Schema.Type<typeof PersonAdministrationLocatorSchema>

export const SocialIdentityTypeSchema = Schema.Literals([
  "email",
  "github",
  "google",
  "phone",
  "oidc",
  "huly",
  "telegram",
  "huly-assistant"
])
export const SocialIdentityId = NonEmptyString.pipe(
  Schema.brand("SocialIdentityId"),
  Schema.annotate({ identifier: "SocialIdentityId", description: "Exact Huly SocialIdentity document ID." })
)
export type SocialIdentityId = Schema.Schema.Type<typeof SocialIdentityId>
export const HistoricalInstant = Schema.Int.pipe(
  Schema.brand("HistoricalInstant"),
  Schema.annotate({
    identifier: "HistoricalInstant",
    description: "Signed Unix instant in milliseconds; negative values represent dates before 1970."
  })
)
export type HistoricalInstant = Schema.Schema.Type<typeof HistoricalInstant>
export const SocialIdentitySchema = Schema.Struct({
  id: SocialIdentityId,
  type: SocialIdentityTypeSchema,
  value: NonEmptyString,
  key: NonEmptyString,
  displayValue: Schema.optionalKey(NonEmptyString),
  verifiedOn: Schema.optionalKey(Timestamp),
  isDeleted: Schema.Boolean
})
export const SocialIdentityProviderSchema = Schema.Struct({ id: NonEmptyString, type: SocialIdentityTypeSchema })

const FieldClassificationSchema = Schema.Struct({
  field: NonEmptyString,
  classification: Schema.Literals(["exposed", "derived", "unsupported"]),
  reason: NonEmptyString
})
const AvatarMetadataSchema = Schema.Struct({
  type: Schema.Literals(["color", "image", "gravatar", "external"]),
  blobId: Schema.optionalKey(BlobId),
  color: Schema.optionalKey(NonEmptyString),
  externalUrl: Schema.optionalKey(UrlString)
})
const ContactStatusSchema = Schema.Struct({ name: NonEmptyString, dueDate: Timestamp })
const WorkspaceMembershipSchema = Schema.Union([
  Schema.Struct({ member: Schema.Literal(false), active: Schema.optionalKey(Schema.Boolean) }),
  Schema.Struct({ member: Schema.Literal(true), active: Schema.optionalKey(Schema.Boolean), role: AccountRoleSchema })
])
const PersonProfileSchema = Schema.Struct({
  firstName: Schema.String,
  lastName: Schema.String,
  bio: Schema.optionalKey(Schema.String),
  city: Schema.optionalKey(Schema.String),
  country: Schema.optionalKey(Schema.String),
  website: Schema.optionalKey(Schema.String),
  socialLinks: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  isPublic: Schema.Boolean
})
const ChannelActivitySchema = Schema.Struct({
  channelId: ChannelId,
  items: Schema.optionalKey(Count),
  lastMessage: Schema.optionalKey(Timestamp)
})

export const GetPersonAdministrationParamsSchema = Schema.Struct({ person: PersonAdministrationLocatorSchema })
export type GetPersonAdministrationParams = Schema.Schema.Type<typeof GetPersonAdministrationParamsSchema>
export const GetPersonAdministrationResultSchema = Schema.Struct({
  personId: PersonId,
  personUuid: Schema.optionalKey(PersonUuid),
  birthday: Schema.optionalKey(Schema.NullOr(HistoricalInstant)),
  avatar: AvatarMetadataSchema,
  contactStatuses: Schema.Array(ContactStatusSchema),
  workspaceMember: WorkspaceMembershipSchema,
  socialIdentities: Schema.Array(SocialIdentitySchema),
  profileCardId: Schema.optionalKey(NonEmptyString),
  profile: Schema.optionalKey(PersonProfileSchema),
  channelActivity: Schema.Array(ChannelActivitySchema),
  fieldClassifications: Schema.Array(FieldClassificationSchema)
})
export type GetPersonAdministrationResult = Schema.Schema.Type<typeof GetPersonAdministrationResultSchema>

export const ListSocialIdentityProvidersParamsSchema = Schema.Struct({})
export const ListSocialIdentityProvidersResultSchema = Schema.Array(SocialIdentityProviderSchema)

export const RepairPersonSocialIdentitiesParamsSchema = Schema.Struct({ person: PersonAdministrationLocatorSchema })
export type RepairPersonSocialIdentitiesParams = Schema.Schema.Type<typeof RepairPersonSocialIdentitiesParamsSchema>
const UnsupportedIdentityMutationSchema = Schema.Struct({
  identityId: Schema.optionalKey(SocialIdentityId),
  reason: NonEmptyString
})
export const RepairPersonSocialIdentitiesResultSchema = Schema.Struct({
  personId: PersonId,
  created: Count,
  updated: Count,
  unchanged: Count,
  unsupported: Schema.Array(UnsupportedIdentityMutationSchema)
})
export type RepairPersonSocialIdentitiesResult = Schema.Schema.Type<typeof RepairPersonSocialIdentitiesResultSchema>

const PersonTarget = { person: PersonAdministrationLocatorSchema }
export const ListPersonCommentsParamsSchema = Schema.Struct({ ...PersonTarget, limit: Schema.optionalKey(LimitParam) })
export const AddPersonCommentParamsSchema = Schema.Struct({
  ...PersonTarget,
  body: NonEmptyString.annotateKey({ description: `Note/comment markdown. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}` })
})
export const UpdatePersonCommentParamsSchema = Schema.Struct({
  ...PersonTarget,
  commentId: CommentId,
  body: NonEmptyString.annotateKey({ description: `Replacement markdown. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}` })
})
export const DeletePersonCommentParamsSchema = Schema.Struct({ ...PersonTarget, commentId: CommentId })
export type ListPersonCommentsParams = Schema.Schema.Type<typeof ListPersonCommentsParamsSchema>
export type AddPersonCommentParams = Schema.Schema.Type<typeof AddPersonCommentParamsSchema>
export type UpdatePersonCommentParams = Schema.Schema.Type<typeof UpdatePersonCommentParamsSchema>
export type DeletePersonCommentParams = Schema.Schema.Type<typeof DeletePersonCommentParamsSchema>
export const ListPersonCommentsResultSchema = Schema.Struct({
  personId: PersonId,
  comments: Schema.Array(CommentSchema),
  total: Count
})
export const AddPersonCommentResultSchema = Schema.Struct({ personId: PersonId, commentId: CommentId })
export const UpdatePersonCommentResultSchema = Schema.Struct({
  personId: PersonId,
  commentId: CommentId,
  updated: Schema.Boolean
})
export const DeletePersonCommentResultSchema = Schema.Struct({
  personId: PersonId,
  commentId: CommentId,
  deleted: Schema.Literal(true)
})

const UploadSourceFields = {
  filename: AttachmentFileName,
  contentType: MimeType,
  filePath: Schema.optionalKey(LocalFilePath.annotate({ description: UPLOAD_FILE_PATH_DESCRIPTION })),
  fileUrl: Schema.optionalKey(UrlString.annotate({ description: UPLOAD_FILE_URL_DESCRIPTION })),
  data: Schema.optionalKey(
    Base64FileData.annotate({ description: `${UPLOAD_BASE64_DATA_DESCRIPTION} Limit: ${MAX_FILE_SIZE_MB} MiB.` })
  ),
  description: Schema.optionalKey(AttachmentDescription),
  pinned: Schema.optionalKey(Schema.Boolean)
}
const hasUploadSource = (value: {
  readonly filePath?: LocalFilePath
  readonly fileUrl?: UrlString
  readonly data?: Base64FileData
}) => {
  const sources = [value.filePath, value.fileUrl, value.data].filter((source) => source !== undefined)
  return sources.length === 1 || "Provide exactly one file source: filePath, fileUrl, or data."
}
export const ListPersonAttachmentsParamsSchema = Schema.Struct({
  ...PersonTarget,
  limit: Schema.optionalKey(LimitParam)
})
export const AddPersonAttachmentParamsSchema = Schema.Struct({ ...PersonTarget, ...UploadSourceFields }).pipe(
  Schema.check(Schema.makeFilter(hasUploadSource))
)
export const GetPersonAttachmentParamsSchema = Schema.Struct({ ...PersonTarget, attachmentId: AttachmentId })
export const UpdatePersonAttachmentParamsSchema = Schema.Struct({
  ...PersonTarget,
  attachmentId: AttachmentId,
  description: Schema.optionalKey(Schema.NullOr(AttachmentDescription)),
  pinned: Schema.optionalKey(Schema.Boolean)
}).pipe(
  Schema.check(
    Schema.makeFilter((value) =>
      value.description !== undefined || value.pinned !== undefined
        ? undefined
        : "Provide description or pinned to update."
    )
  )
)
export const DeletePersonAttachmentParamsSchema = Schema.Struct({ ...PersonTarget, attachmentId: AttachmentId })
export type ListPersonAttachmentsParams = Schema.Schema.Type<typeof ListPersonAttachmentsParamsSchema>
export type AddPersonAttachmentParams = Schema.Schema.Type<typeof AddPersonAttachmentParamsSchema>
export type GetPersonAttachmentParams = Schema.Schema.Type<typeof GetPersonAttachmentParamsSchema>
export type UpdatePersonAttachmentParams = Schema.Schema.Type<typeof UpdatePersonAttachmentParamsSchema>
export type DeletePersonAttachmentParams = Schema.Schema.Type<typeof DeletePersonAttachmentParamsSchema>
export const ListPersonAttachmentsResultSchema = Schema.Struct({
  personId: PersonId,
  attachments: Schema.Array(AttachmentSummaryWireSchema),
  total: Count
})
export const AddPersonAttachmentResultSchema = Schema.Struct({
  personId: PersonId,
  attachmentId: AttachmentId,
  blobId: BlobId,
  url: UrlString
})
export const GetPersonAttachmentResultSchema = Schema.Struct({ personId: PersonId, attachment: AttachmentWireSchema })
export const UpdatePersonAttachmentResultSchema = Schema.Struct({
  personId: PersonId,
  attachmentId: AttachmentId,
  updated: Schema.Literal(true)
})
export const DeletePersonAttachmentResultSchema = Schema.Struct({
  personId: PersonId,
  attachmentId: AttachmentId,
  deleted: Schema.Literal(true)
})

const json = (schema: Schema.Constraint) =>
  withJsonSchemaPropertyDescriptions(toDraft07JsonSchema(schema), {
    person: "Exact person locator with exactly one of id, email, or name.",
    body: `Markdown preserving Huly native references. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`,
    limit: `Maximum results (default ${DEFAULT_LIMIT}).`,
    filePath: UPLOAD_FILE_PATH_DESCRIPTION,
    fileUrl: UPLOAD_FILE_URL_DESCRIPTION,
    data: UPLOAD_BASE64_DATA_DESCRIPTION
  })

export const getPersonAdministrationParamsJsonSchema = json(GetPersonAdministrationParamsSchema)
export const listSocialIdentityProvidersParamsJsonSchema = json(ListSocialIdentityProvidersParamsSchema)
export const repairPersonSocialIdentitiesParamsJsonSchema = json(RepairPersonSocialIdentitiesParamsSchema)
export const listPersonCommentsParamsJsonSchema = json(ListPersonCommentsParamsSchema)
export const addPersonCommentParamsJsonSchema = json(AddPersonCommentParamsSchema)
export const updatePersonCommentParamsJsonSchema = json(UpdatePersonCommentParamsSchema)
export const deletePersonCommentParamsJsonSchema = json(DeletePersonCommentParamsSchema)
export const listPersonAttachmentsParamsJsonSchema = json(ListPersonAttachmentsParamsSchema)
export const addPersonAttachmentParamsJsonSchema = json(AddPersonAttachmentParamsSchema)
export const getPersonAttachmentParamsJsonSchema = json(GetPersonAttachmentParamsSchema)
export const updatePersonAttachmentParamsJsonSchema = json(UpdatePersonAttachmentParamsSchema)
export const deletePersonAttachmentParamsJsonSchema = json(DeletePersonAttachmentParamsSchema)

export const parseGetPersonAdministrationParams = Schema.decodeUnknownEffect(GetPersonAdministrationParamsSchema)
export const parseListSocialIdentityProvidersParams = Schema.decodeUnknownEffect(
  ListSocialIdentityProvidersParamsSchema
)
export const parseRepairPersonSocialIdentitiesParams = Schema.decodeUnknownEffect(
  RepairPersonSocialIdentitiesParamsSchema
)
export const parseListPersonCommentsParams = Schema.decodeUnknownEffect(ListPersonCommentsParamsSchema)
export const parseAddPersonCommentParams = Schema.decodeUnknownEffect(AddPersonCommentParamsSchema)
export const parseUpdatePersonCommentParams = Schema.decodeUnknownEffect(UpdatePersonCommentParamsSchema)
export const parseDeletePersonCommentParams = Schema.decodeUnknownEffect(DeletePersonCommentParamsSchema)
export const parseListPersonAttachmentsParams = Schema.decodeUnknownEffect(ListPersonAttachmentsParamsSchema)
export const parseAddPersonAttachmentParams = Schema.decodeUnknownEffect(AddPersonAttachmentParamsSchema)
export const parseGetPersonAttachmentParams = Schema.decodeUnknownEffect(GetPersonAttachmentParamsSchema)
export const parseUpdatePersonAttachmentParams = Schema.decodeUnknownEffect(UpdatePersonAttachmentParamsSchema)
export const parseDeletePersonAttachmentParams = Schema.decodeUnknownEffect(DeletePersonAttachmentParamsSchema)
