import { JSONSchema, Schema } from "effect"

import { EventParticipantLocatorSchema } from "./calendar.js"
import {
  ApplicantIdentifier,
  ApplicantMatchIdentifier,
  CandidateIdentifier,
  OpinionIdentifier,
  ReviewIdentifier
} from "./recruiting-common.js"
import {
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  DEFAULT_LIMIT,
  hasAtLeastOneDefined,
  LimitParam,
  NonEmptyString,
  Timestamp,
  withAtLeastOneRequired
} from "./shared.js"

export * from "./recruiting-common.js"
export * from "./recruiting-extended-results.js"

const RecruitingSearchText = NonEmptyString.annotations({
  description: "Non-empty case-insensitive search text."
})

const RecruitingMarkdownInput = NonEmptyString.annotations({
  description: "Non-empty markdown text converted to Huly rich-text markup."
})

const RecruitingClearableMarkdownInput = Schema.NullOr(RecruitingMarkdownInput).annotations({
  description: "Non-empty markdown replacement text, or null to clear this rich-text field."
})

const RecruitingFreeTextInput = NonEmptyString.annotations({
  description: "Non-empty free-form Recruiting text."
})

const RecruitingClearableFreeTextInput = Schema.NullOr(RecruitingFreeTextInput).annotations({
  description: "Non-empty replacement text, or null to clear this field."
})

const ApplicantMatchCompleteInput = Schema.Boolean.annotations({
  description: "Filter generated applicant matches by Huly completion state."
})

export const ListRecruitingApplicantMatchesParamsSchema = Schema.Struct({
  candidate: Schema.optional(CandidateIdentifier.annotations({
    description: "Candidate locator: person _id, email, or exact person display name."
  })),
  complete: Schema.optional(ApplicantMatchCompleteInput),
  query: Schema.optional(RecruitingSearchText.annotations({
    description: "Case-insensitive applicant-match vacancy or summary search."
  })),
  limit: Schema.optional(LimitParam.annotations({
    description: `Maximum number of applicant matches to return (default: ${DEFAULT_LIMIT}).`
  }))
})
export type ListRecruitingApplicantMatchesParams = Schema.Schema.Type<
  typeof ListRecruitingApplicantMatchesParamsSchema
>

export const GetRecruitingApplicantMatchParamsSchema = Schema.Struct({
  match: ApplicantMatchIdentifier.annotations({
    description: "Applicant match locator: raw Huly applicant-match _id."
  })
})
export type GetRecruitingApplicantMatchParams = Schema.Schema.Type<typeof GetRecruitingApplicantMatchParamsSchema>

export const ListRecruitingReviewsParamsSchema = Schema.Struct({
  candidate: Schema.optional(CandidateIdentifier),
  application: Schema.optional(ApplicantIdentifier),
  query: Schema.optional(RecruitingSearchText.annotations({
    description: "Case-insensitive review title, verdict, or location search."
  })),
  from: Schema.optional(Timestamp),
  to: Schema.optional(Timestamp),
  limit: Schema.optional(LimitParam.annotations({
    description: `Maximum number of reviews to return (default: ${DEFAULT_LIMIT}).`
  }))
})
export type ListRecruitingReviewsParams = Schema.Schema.Type<typeof ListRecruitingReviewsParamsSchema>

export const ReviewLocatorSchema = Schema.Struct({
  review: ReviewIdentifier.annotations({
    description: "Review locator: raw _id, RVE-<number>, bare number, or exact title."
  }),
  candidate: Schema.optional(CandidateIdentifier),
  application: Schema.optional(ApplicantIdentifier)
})
export type ReviewLocator = Schema.Schema.Type<typeof ReviewLocatorSchema>

export const GetRecruitingReviewParamsSchema = ReviewLocatorSchema
export type GetRecruitingReviewParams = ReviewLocator

export const CreateRecruitingReviewParamsSchema = Schema.Struct({
  candidate: CandidateIdentifier,
  title: RecruitingFreeTextInput.annotations({
    description: "Non-empty review title."
  }),
  date: Timestamp,
  dueDate: Schema.optional(Timestamp),
  description: Schema.optional(RecruitingMarkdownInput),
  verdict: Schema.optional(RecruitingFreeTextInput.annotations({
    description: "Non-empty initial review verdict text."
  })),
  application: Schema.optional(ApplicantIdentifier),
  company: Schema.optional(RecruitingFreeTextInput.annotations({
    description: "Company organization ID or exact name."
  })),
  location: Schema.optional(RecruitingFreeTextInput.annotations({
    description: "Non-empty review location text."
  })),
  participants: Schema.optional(Schema.Array(EventParticipantLocatorSchema))
})
export type CreateRecruitingReviewParams = Schema.Schema.Type<typeof CreateRecruitingReviewParamsSchema>

export const UPDATE_RECRUITING_REVIEW_FIELDS = [
  "title",
  "description",
  "verdict",
  "date",
  "dueDate",
  "application",
  "company",
  "location",
  "participants"
] as const

export const UpdateRecruitingReviewParamsSchema = Schema.Struct({
  review: ReviewIdentifier,
  candidate: Schema.optional(CandidateIdentifier),
  applicationContext: Schema.optional(ApplicantIdentifier),
  title: Schema.optional(RecruitingFreeTextInput.annotations({
    description: "Non-empty replacement review title."
  })),
  description: Schema.optional(RecruitingClearableMarkdownInput),
  verdict: Schema.optional(RecruitingClearableFreeTextInput),
  date: Schema.optional(Timestamp),
  dueDate: Schema.optional(Timestamp),
  application: Schema.optional(Schema.NullOr(ApplicantIdentifier)),
  company: Schema.optional(Schema.NullOr(RecruitingFreeTextInput)),
  location: Schema.optional(RecruitingClearableFreeTextInput),
  participants: Schema.optional(Schema.Array(EventParticipantLocatorSchema))
}).pipe(
  Schema.filter((params) =>
    hasAtLeastOneDefined(params, UPDATE_RECRUITING_REVIEW_FIELDS)
      ? undefined
      : atLeastOneUpdateFieldMessage(UPDATE_RECRUITING_REVIEW_FIELDS)
  )
)
export type UpdateRecruitingReviewParams = Schema.Schema.Type<typeof UpdateRecruitingReviewParamsSchema>
assertUpdateFields<UpdateRecruitingReviewParams>()(
  ["review", "candidate", "applicationContext"],
  UPDATE_RECRUITING_REVIEW_FIELDS
)

export const DeleteRecruitingReviewParamsSchema = ReviewLocatorSchema
export type DeleteRecruitingReviewParams = ReviewLocator

export const ListRecruitingOpinionsParamsSchema = Schema.Struct({
  review: ReviewIdentifier,
  limit: Schema.optional(LimitParam.annotations({
    description: `Maximum number of opinions to return (default: ${DEFAULT_LIMIT}).`
  }))
})
export type ListRecruitingOpinionsParams = Schema.Schema.Type<typeof ListRecruitingOpinionsParamsSchema>

export const OpinionLocatorSchema = Schema.Struct({
  opinion: OpinionIdentifier.annotations({
    description: "Opinion locator: raw _id, OPE-<number>, or bare number."
  }),
  review: Schema.optional(ReviewIdentifier)
})
export type OpinionLocator = Schema.Schema.Type<typeof OpinionLocatorSchema>

export const GetRecruitingOpinionParamsSchema = OpinionLocatorSchema
export type GetRecruitingOpinionParams = OpinionLocator

export const CreateRecruitingOpinionParamsSchema = Schema.Struct({
  review: ReviewIdentifier,
  value: RecruitingFreeTextInput.annotations({
    description: "Non-empty opinion value."
  }),
  description: Schema.optional(RecruitingMarkdownInput)
})
export type CreateRecruitingOpinionParams = Schema.Schema.Type<typeof CreateRecruitingOpinionParamsSchema>

export const UPDATE_RECRUITING_OPINION_FIELDS = ["value", "description"] as const
export const UpdateRecruitingOpinionParamsSchema = Schema.Struct({
  opinion: OpinionIdentifier,
  review: Schema.optional(ReviewIdentifier),
  value: Schema.optional(RecruitingFreeTextInput.annotations({
    description: "Non-empty replacement opinion value."
  })),
  description: Schema.optional(RecruitingClearableMarkdownInput)
}).pipe(
  Schema.filter((params) =>
    hasAtLeastOneDefined(params, UPDATE_RECRUITING_OPINION_FIELDS)
      ? undefined
      : atLeastOneUpdateFieldMessage(UPDATE_RECRUITING_OPINION_FIELDS)
  )
)
export type UpdateRecruitingOpinionParams = Schema.Schema.Type<typeof UpdateRecruitingOpinionParamsSchema>
assertUpdateFields<UpdateRecruitingOpinionParams>()(["opinion", "review"], UPDATE_RECRUITING_OPINION_FIELDS)

export const DeleteRecruitingOpinionParamsSchema = OpinionLocatorSchema
export type DeleteRecruitingOpinionParams = OpinionLocator

export const listRecruitingApplicantMatchesParamsJsonSchema = JSONSchema.make(
  ListRecruitingApplicantMatchesParamsSchema
)
export const getRecruitingApplicantMatchParamsJsonSchema = JSONSchema.make(GetRecruitingApplicantMatchParamsSchema)
export const listRecruitingReviewsParamsJsonSchema = JSONSchema.make(ListRecruitingReviewsParamsSchema)
export const getRecruitingReviewParamsJsonSchema = JSONSchema.make(GetRecruitingReviewParamsSchema)
export const createRecruitingReviewParamsJsonSchema = JSONSchema.make(CreateRecruitingReviewParamsSchema)
export const updateRecruitingReviewParamsJsonSchema = withAtLeastOneRequired(
  JSONSchema.make(UpdateRecruitingReviewParamsSchema),
  UPDATE_RECRUITING_REVIEW_FIELDS
)
export const deleteRecruitingReviewParamsJsonSchema = JSONSchema.make(DeleteRecruitingReviewParamsSchema)
export const listRecruitingOpinionsParamsJsonSchema = JSONSchema.make(ListRecruitingOpinionsParamsSchema)
export const getRecruitingOpinionParamsJsonSchema = JSONSchema.make(GetRecruitingOpinionParamsSchema)
export const createRecruitingOpinionParamsJsonSchema = JSONSchema.make(CreateRecruitingOpinionParamsSchema)
export const updateRecruitingOpinionParamsJsonSchema = withAtLeastOneRequired(
  JSONSchema.make(UpdateRecruitingOpinionParamsSchema),
  UPDATE_RECRUITING_OPINION_FIELDS
)
export const deleteRecruitingOpinionParamsJsonSchema = JSONSchema.make(DeleteRecruitingOpinionParamsSchema)

export const parseListRecruitingApplicantMatchesParams = Schema.decodeUnknown(
  ListRecruitingApplicantMatchesParamsSchema
)
export const parseGetRecruitingApplicantMatchParams = Schema.decodeUnknown(GetRecruitingApplicantMatchParamsSchema)
export const parseListRecruitingReviewsParams = Schema.decodeUnknown(ListRecruitingReviewsParamsSchema)
export const parseGetRecruitingReviewParams = Schema.decodeUnknown(GetRecruitingReviewParamsSchema)
export const parseCreateRecruitingReviewParams = Schema.decodeUnknown(CreateRecruitingReviewParamsSchema)
export const parseUpdateRecruitingReviewParams = Schema.decodeUnknown(UpdateRecruitingReviewParamsSchema)
export const parseDeleteRecruitingReviewParams = Schema.decodeUnknown(DeleteRecruitingReviewParamsSchema)
export const parseListRecruitingOpinionsParams = Schema.decodeUnknown(ListRecruitingOpinionsParamsSchema)
export const parseGetRecruitingOpinionParams = Schema.decodeUnknown(GetRecruitingOpinionParamsSchema)
export const parseCreateRecruitingOpinionParams = Schema.decodeUnknown(CreateRecruitingOpinionParamsSchema)
export const parseUpdateRecruitingOpinionParams = Schema.decodeUnknown(UpdateRecruitingOpinionParamsSchema)
export const parseDeleteRecruitingOpinionParams = Schema.decodeUnknown(DeleteRecruitingOpinionParamsSchema)
