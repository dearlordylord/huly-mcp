import { JSONSchema, Schema } from "effect"

import { UPDATE_ATTACHMENT_FIELDS } from "./attachments.js"
import { HULY_NATIVE_REFERENCE_MARKDOWN_INPUT } from "./document-native-references.js"
import { AttachmentDescription, AttachmentFileName, Base64FileData, LocalFilePath } from "./domain-values.js"
import { withExactlyOneRequired, withJsonSchemaPropertyDescriptions } from "./json-schema.js"
import {
  ApplicantIdentifier,
  CandidateIdentifier,
  OpinionIdentifier,
  ReviewIdentifier,
  VacancyIdentifier
} from "./recruiting-common.js"
import {
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  AttachmentId,
  CommentId,
  DEFAULT_LIMIT,
  hasAtLeastOneDefined,
  IssueIdentifier,
  LimitParam,
  MimeType,
  NonEmptyString,
  ProjectIdentifier,
  UrlString,
  withAtLeastOneRequired
} from "./shared.js"

export * from "./recruiting-media-results.js"

const VacancyTargetLocatorSchema = Schema.Struct({
  kind: Schema.Literal("vacancy"),
  vacancy: VacancyIdentifier.annotations({
    description: "Vacancy locator: raw _id, VCN-<number>, bare number, or exact vacancy name."
  })
})
const CandidateTargetLocatorSchema = Schema.Struct({
  kind: Schema.Literal("candidate"),
  candidate: CandidateIdentifier.annotations({
    description: "Candidate locator: person _id, email, or exact person display name."
  })
})
const ApplicantTargetLocatorSchema = Schema.Struct({
  kind: Schema.Literal("applicant"),
  applicant: ApplicantIdentifier.annotations({
    description: "Applicant locator: raw _id, APP-<number>, or bare number."
  }),
  vacancy: Schema.optional(VacancyIdentifier.annotations({
    description: "Optional vacancy locator to disambiguate applicant numbers."
  })),
  candidate: Schema.optional(CandidateIdentifier.annotations({
    description: "Optional candidate locator to disambiguate applicant numbers."
  }))
})
const ReviewTargetLocatorSchema = Schema.Struct({
  kind: Schema.Literal("review"),
  review: ReviewIdentifier.annotations({
    description: "Review locator: raw _id, RVE-<number>, bare number, or exact title."
  }),
  candidate: Schema.optional(CandidateIdentifier.annotations({
    description: "Optional candidate locator to disambiguate reviews."
  })),
  application: Schema.optional(ApplicantIdentifier.annotations({
    description: "Optional application/applicant locator to disambiguate reviews."
  }))
})
const OpinionTargetLocatorSchema = Schema.Struct({
  kind: Schema.Literal("opinion"),
  opinion: OpinionIdentifier.annotations({
    description: "Opinion locator: raw _id, OPE-<number>, or bare number."
  }),
  review: Schema.optional(ReviewIdentifier.annotations({
    description: "Optional review locator to disambiguate opinions."
  }))
})

const RecruitingCommentTargetSchema = Schema.Union(
  VacancyTargetLocatorSchema,
  CandidateTargetLocatorSchema,
  ApplicantTargetLocatorSchema,
  ReviewTargetLocatorSchema,
  OpinionTargetLocatorSchema
)
export type RecruitingCommentTarget = Schema.Schema.Type<typeof RecruitingCommentTargetSchema>

const RecruitingAttachmentTargetSchema = Schema.Union(
  VacancyTargetLocatorSchema,
  CandidateTargetLocatorSchema,
  ApplicantTargetLocatorSchema,
  OpinionTargetLocatorSchema
)
export type RecruitingAttachmentTarget = Schema.Schema.Type<typeof RecruitingAttachmentTargetSchema>

const RecruitingActivityTargetSchema = Schema.Union(
  VacancyTargetLocatorSchema,
  CandidateTargetLocatorSchema,
  ApplicantTargetLocatorSchema,
  ReviewTargetLocatorSchema
)
export type RecruitingActivityTarget = Schema.Schema.Type<typeof RecruitingActivityTargetSchema>

const RecruitingRelatedIssueTargetSchema = Schema.Union(
  VacancyTargetLocatorSchema,
  CandidateTargetLocatorSchema,
  ApplicantTargetLocatorSchema
)
export type RecruitingRelatedIssueTarget = Schema.Schema.Type<typeof RecruitingRelatedIssueTargetSchema>

const RecruitingAttachmentFileFields = {
  filename: AttachmentFileName.annotations({
    description: "Name of the file to attach to the Recruiting object."
  }),
  contentType: MimeType.annotations({
    description: "MIME type of the file, such as image/png or application/pdf."
  }),
  filePath: Schema.optional(LocalFilePath.annotations({
    description: "Local file path to upload. Mutually exclusive with fileUrl and data."
  })),
  fileUrl: Schema.optional(UrlString.annotations({
    description: "Remote URL to fetch and upload. Mutually exclusive with filePath and data."
  })),
  data: Schema.optional(Base64FileData.annotations({
    description: "Base64-encoded file data. Mutually exclusive with filePath and fileUrl."
  })),
  description: Schema.optional(AttachmentDescription.annotations({
    description: "Optional attachment description."
  })),
  pinned: Schema.optional(Schema.Boolean.annotations({
    description: "Whether the attachment should be pinned."
  }))
} as const

const RECRUITING_ATTACHMENT_FILE_SOURCE_FIELDS = ["filePath", "fileUrl", "data"] as const
const recruitingAttachmentExactlyOneFileSourceMessage = `Provide exactly one of ${
  RECRUITING_ATTACHMENT_FILE_SOURCE_FIELDS.join(", ")
}.`
const requireExactlyOneAttachmentFileSource = (params: {
  readonly filePath?: unknown
  readonly fileUrl?: unknown
  readonly data?: unknown
}) =>
  RECRUITING_ATTACHMENT_FILE_SOURCE_FIELDS.filter((field) => params[field] !== undefined).length === 1
  || recruitingAttachmentExactlyOneFileSourceMessage

const ListRecruitingCommentsParamsSchema = Schema.Struct({
  target: RecruitingCommentTargetSchema,
  limit: Schema.optional(LimitParam.annotations({
    description: `Maximum number of comments to return (default: ${DEFAULT_LIMIT}).`
  }))
})
export type ListRecruitingCommentsParams = Schema.Schema.Type<typeof ListRecruitingCommentsParamsSchema>

const AddRecruitingCommentParamsSchema = Schema.Struct({
  target: RecruitingCommentTargetSchema,
  body: NonEmptyString.annotations({
    description: `Comment body in markdown. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`
  })
})
export type AddRecruitingCommentParams = Schema.Schema.Type<typeof AddRecruitingCommentParamsSchema>

const UpdateRecruitingCommentParamsSchema = Schema.Struct({
  target: RecruitingCommentTargetSchema,
  commentId: CommentId.annotations({
    description: "Comment ID. Must belong directly to the resolved Recruiting target."
  }),
  body: NonEmptyString.annotations({
    description: `New comment body in markdown. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`
  })
})
export type UpdateRecruitingCommentParams = Schema.Schema.Type<typeof UpdateRecruitingCommentParamsSchema>

const DeleteRecruitingCommentParamsSchema = Schema.Struct({
  target: RecruitingCommentTargetSchema,
  commentId: CommentId.annotations({
    description: "Comment ID. Must belong directly to the resolved Recruiting target."
  })
})
export type DeleteRecruitingCommentParams = Schema.Schema.Type<typeof DeleteRecruitingCommentParamsSchema>

const ListRecruitingAttachmentsParamsSchema = Schema.Struct({
  target: RecruitingAttachmentTargetSchema,
  limit: Schema.optional(LimitParam.annotations({
    description: `Maximum number of attachments to return (default: ${DEFAULT_LIMIT}).`
  }))
})
export type ListRecruitingAttachmentsParams = Schema.Schema.Type<typeof ListRecruitingAttachmentsParamsSchema>

const GetRecruitingAttachmentParamsSchema = Schema.Struct({
  target: RecruitingAttachmentTargetSchema,
  attachmentId: AttachmentId.annotations({
    description: "Attachment ID. Must belong directly to the resolved Recruiting target."
  })
})
export type GetRecruitingAttachmentParams = Schema.Schema.Type<typeof GetRecruitingAttachmentParamsSchema>

const AddRecruitingAttachmentParamsSchema = Schema.Struct({
  target: RecruitingAttachmentTargetSchema,
  ...RecruitingAttachmentFileFields
}).pipe(Schema.filter(requireExactlyOneAttachmentFileSource))
export type AddRecruitingAttachmentParams = Schema.Schema.Type<typeof AddRecruitingAttachmentParamsSchema>

const UPDATE_RECRUITING_ATTACHMENT_FIELDS = UPDATE_ATTACHMENT_FIELDS
const UpdateRecruitingAttachmentParamsSchema = Schema.Struct({
  target: RecruitingAttachmentTargetSchema,
  attachmentId: AttachmentId.annotations({
    description: "Attachment ID. Must belong directly to the resolved Recruiting target."
  }),
  description: Schema.optional(
    Schema.NullOr(AttachmentDescription).annotations({
      description: "New description; use null to clear it."
    })
  ),
  pinned: Schema.optional(Schema.Boolean.annotations({
    description: "Pin or unpin the attachment."
  }))
}).pipe(
  Schema.filter((params) =>
    hasAtLeastOneDefined(params, UPDATE_RECRUITING_ATTACHMENT_FIELDS)
      ? undefined
      : atLeastOneUpdateFieldMessage(UPDATE_RECRUITING_ATTACHMENT_FIELDS)
  )
)
export type UpdateRecruitingAttachmentParams = Schema.Schema.Type<typeof UpdateRecruitingAttachmentParamsSchema>
assertUpdateFields<UpdateRecruitingAttachmentParams>()(
  ["target", "attachmentId"],
  UPDATE_RECRUITING_ATTACHMENT_FIELDS
)

const DeleteRecruitingAttachmentParamsSchema = GetRecruitingAttachmentParamsSchema
export type DeleteRecruitingAttachmentParams = GetRecruitingAttachmentParams

const ListRecruitingActivityParamsSchema = Schema.Struct({
  target: RecruitingActivityTargetSchema,
  limit: Schema.optional(LimitParam.annotations({
    description: `Maximum number of activity messages to return (default: ${DEFAULT_LIMIT}).`
  }))
})
export type ListRecruitingActivityParams = Schema.Schema.Type<typeof ListRecruitingActivityParamsSchema>

const RecruitingRelatedIssueFields = {
  target: RecruitingRelatedIssueTargetSchema
} as const

const ListRecruitingRelatedIssuesParamsSchema = Schema.Struct({
  ...RecruitingRelatedIssueFields,
  limit: Schema.optional(LimitParam.annotations({
    description: `Maximum number of related issues to return (default: ${DEFAULT_LIMIT}).`
  }))
})
export type ListRecruitingRelatedIssuesParams = Schema.Schema.Type<typeof ListRecruitingRelatedIssuesParamsSchema>

const AddRecruitingRelatedIssueParamsSchema = Schema.Struct({
  ...RecruitingRelatedIssueFields,
  issue: IssueIdentifier.annotations({
    description: "Issue identifier, such as HULY-123, or a numeric issue number when project is also provided."
  }),
  project: Schema.optional(ProjectIdentifier.annotations({
    description: "Project identifier. Optional when issue already includes a project prefix like HULY-123."
  }))
})
export type AddRecruitingRelatedIssueParams = Schema.Schema.Type<typeof AddRecruitingRelatedIssueParamsSchema>

const RemoveRecruitingRelatedIssueParamsSchema = AddRecruitingRelatedIssueParamsSchema
export type RemoveRecruitingRelatedIssueParams = AddRecruitingRelatedIssueParams

const RECRUITING_MEDIA_FIELD_DESCRIPTIONS: Readonly<Partial<Record<string, string>>> = {
  target:
    "Recruiting target locator. Supported kinds depend on the tool: comments use vacancy/candidate/applicant/review/opinion; attachments use vacancy/candidate/applicant/opinion; activity uses vacancy/candidate/applicant/review; related issues use vacancy/candidate/applicant.",
  limit: `Maximum number of matching rows to return (default: ${DEFAULT_LIMIT}).`,
  body: `Comment body in markdown. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`,
  commentId: "Comment ID. Must belong directly to the resolved Recruiting target.",
  attachmentId: "Attachment ID. Must belong directly to the resolved Recruiting target.",
  filename: "Name of the file to attach to the Recruiting object.",
  contentType: "MIME type of the file, such as image/png or application/pdf.",
  filePath: "Local file path to upload. Mutually exclusive with fileUrl and data.",
  fileUrl: "Remote URL to fetch and upload. Mutually exclusive with filePath and data.",
  data: "Base64-encoded file data. Mutually exclusive with filePath and fileUrl.",
  description: "Optional attachment description. Use null on update to clear it.",
  pinned: "Whether the attachment should be pinned.",
  issue: "Issue identifier, such as HULY-123, or a numeric issue number when project is also provided.",
  project: "Project identifier. Optional when issue already includes a project prefix like HULY-123."
}

const recruitingMediaJsonSchema = <A, I, R>(schema: Schema.Schema<A, I, R>): object =>
  withJsonSchemaPropertyDescriptions(JSONSchema.make(schema), RECRUITING_MEDIA_FIELD_DESCRIPTIONS)

const withExactlyOneRecruitingAttachmentFileSource = (schema: object): object =>
  withExactlyOneRequired(schema, RECRUITING_ATTACHMENT_FILE_SOURCE_FIELDS)

export const listRecruitingCommentsParamsJsonSchema = recruitingMediaJsonSchema(ListRecruitingCommentsParamsSchema)
export const addRecruitingCommentParamsJsonSchema = recruitingMediaJsonSchema(AddRecruitingCommentParamsSchema)
export const updateRecruitingCommentParamsJsonSchema = recruitingMediaJsonSchema(UpdateRecruitingCommentParamsSchema)
export const deleteRecruitingCommentParamsJsonSchema = recruitingMediaJsonSchema(DeleteRecruitingCommentParamsSchema)
export const listRecruitingAttachmentsParamsJsonSchema = recruitingMediaJsonSchema(
  ListRecruitingAttachmentsParamsSchema
)
export const getRecruitingAttachmentParamsJsonSchema = recruitingMediaJsonSchema(GetRecruitingAttachmentParamsSchema)
export const addRecruitingAttachmentParamsJsonSchema = withExactlyOneRecruitingAttachmentFileSource(
  recruitingMediaJsonSchema(AddRecruitingAttachmentParamsSchema)
)
export const updateRecruitingAttachmentParamsJsonSchema = withAtLeastOneRequired(
  recruitingMediaJsonSchema(UpdateRecruitingAttachmentParamsSchema),
  UPDATE_RECRUITING_ATTACHMENT_FIELDS
)
export const deleteRecruitingAttachmentParamsJsonSchema = recruitingMediaJsonSchema(
  DeleteRecruitingAttachmentParamsSchema
)
export const listRecruitingActivityParamsJsonSchema = recruitingMediaJsonSchema(ListRecruitingActivityParamsSchema)
export const listRecruitingRelatedIssuesParamsJsonSchema = recruitingMediaJsonSchema(
  ListRecruitingRelatedIssuesParamsSchema
)
export const addRecruitingRelatedIssueParamsJsonSchema = recruitingMediaJsonSchema(
  AddRecruitingRelatedIssueParamsSchema
)
export const removeRecruitingRelatedIssueParamsJsonSchema = recruitingMediaJsonSchema(
  RemoveRecruitingRelatedIssueParamsSchema
)

export const parseListRecruitingCommentsParams = Schema.decodeUnknown(ListRecruitingCommentsParamsSchema)
export const parseAddRecruitingCommentParams = Schema.decodeUnknown(AddRecruitingCommentParamsSchema)
export const parseUpdateRecruitingCommentParams = Schema.decodeUnknown(UpdateRecruitingCommentParamsSchema)
export const parseDeleteRecruitingCommentParams = Schema.decodeUnknown(DeleteRecruitingCommentParamsSchema)
export const parseListRecruitingAttachmentsParams = Schema.decodeUnknown(ListRecruitingAttachmentsParamsSchema)
export const parseGetRecruitingAttachmentParams = Schema.decodeUnknown(GetRecruitingAttachmentParamsSchema)
export const parseAddRecruitingAttachmentParams = Schema.decodeUnknown(AddRecruitingAttachmentParamsSchema)
export const parseUpdateRecruitingAttachmentParams = Schema.decodeUnknown(UpdateRecruitingAttachmentParamsSchema)
export const parseDeleteRecruitingAttachmentParams = Schema.decodeUnknown(DeleteRecruitingAttachmentParamsSchema)
export const parseListRecruitingActivityParams = Schema.decodeUnknown(ListRecruitingActivityParamsSchema)
export const parseListRecruitingRelatedIssuesParams = Schema.decodeUnknown(ListRecruitingRelatedIssuesParamsSchema)
export const parseAddRecruitingRelatedIssueParams = Schema.decodeUnknown(AddRecruitingRelatedIssueParamsSchema)
export const parseRemoveRecruitingRelatedIssueParams = Schema.decodeUnknown(RemoveRecruitingRelatedIssueParamsSchema)
