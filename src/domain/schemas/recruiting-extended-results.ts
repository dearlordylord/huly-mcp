import { Schema } from "effect"

import {
  ApplicantMatchRefSchema,
  ApplicantRefSchema,
  CandidateRefSchema,
  OpinionRefSchema,
  RecruitingCompanyName,
  ReviewRefSchema,
  StoredRecruitingText
} from "./recruiting-common.js"
import { Count, DocId, Timestamp } from "./shared.js"

const RecruitingExtendedDeletedFlag = Schema.Boolean.annotations({
  description: "Whether the Recruiting object was deleted by this call."
})

export const ReviewDetailSchema = Schema.Struct({
  ...ReviewRefSchema.fields,
  description: Schema.optional(StoredRecruitingText),
  verdict: Schema.optional(StoredRecruitingText),
  application: Schema.optional(ApplicantRefSchema),
  company: Schema.optional(Schema.Struct({
    id: DocId,
    name: RecruitingCompanyName
  })),
  location: Schema.optional(StoredRecruitingText),
  date: Timestamp,
  dueDate: Timestamp,
  participants: Schema.Array(CandidateRefSchema),
  opinions: Schema.optional(Count),
  modifiedOn: Schema.optional(Timestamp),
  createdOn: Schema.optional(Timestamp)
})
export type ReviewDetail = Schema.Schema.Type<typeof ReviewDetailSchema>

export const OpinionDetailSchema = Schema.Struct({
  ...OpinionRefSchema.fields,
  description: Schema.optional(StoredRecruitingText),
  comments: Schema.optional(Count),
  attachments: Schema.optional(Count),
  modifiedOn: Schema.optional(Timestamp),
  createdOn: Schema.optional(Timestamp)
})
export type OpinionDetail = Schema.Schema.Type<typeof OpinionDetailSchema>

export const ApplicantMatchDetailSchema = Schema.Struct({
  ...ApplicantMatchRefSchema.fields,
  summary: Schema.optional(StoredRecruitingText),
  response: Schema.optional(StoredRecruitingText),
  modifiedOn: Schema.optional(Timestamp),
  createdOn: Schema.optional(Timestamp)
})
export type ApplicantMatchDetail = Schema.Schema.Type<typeof ApplicantMatchDetailSchema>

export const ListRecruitingReviewsResultSchema = Schema.Struct({
  reviews: Schema.Array(ReviewRefSchema),
  total: Count
})
export type ListRecruitingReviewsResult = Schema.Schema.Type<typeof ListRecruitingReviewsResultSchema>

export const ListRecruitingOpinionsResultSchema = Schema.Struct({
  opinions: Schema.Array(OpinionRefSchema),
  total: Count
})
export type ListRecruitingOpinionsResult = Schema.Schema.Type<typeof ListRecruitingOpinionsResultSchema>

export const ListRecruitingApplicantMatchesResultSchema = Schema.Struct({
  matches: Schema.Array(ApplicantMatchRefSchema),
  total: Count
})
export type ListRecruitingApplicantMatchesResult = Schema.Schema.Type<
  typeof ListRecruitingApplicantMatchesResultSchema
>

export const RecruitingReviewMutationResultSchema = Schema.Struct({
  review: ReviewRefSchema
})
export type RecruitingReviewMutationResult = Schema.Schema.Type<typeof RecruitingReviewMutationResultSchema>

export const RecruitingOpinionMutationResultSchema = Schema.Struct({
  opinion: OpinionRefSchema
})
export type RecruitingOpinionMutationResult = Schema.Schema.Type<typeof RecruitingOpinionMutationResultSchema>

export const DeleteRecruitingReviewResultSchema = Schema.Struct({
  review: ReviewRefSchema,
  deleted: RecruitingExtendedDeletedFlag
})
export type DeleteRecruitingReviewResult = Schema.Schema.Type<typeof DeleteRecruitingReviewResultSchema>

export const DeleteRecruitingOpinionResultSchema = Schema.Struct({
  opinion: OpinionRefSchema,
  deleted: RecruitingExtendedDeletedFlag
})
export type DeleteRecruitingOpinionResult = Schema.Schema.Type<typeof DeleteRecruitingOpinionResultSchema>
