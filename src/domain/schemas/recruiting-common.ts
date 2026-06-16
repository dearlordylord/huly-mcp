import { ParseResult, Schema } from "effect"

import {
  ColorCode,
  Count,
  DocId,
  IssueStatusId,
  NonEmptyString,
  PersonId,
  PersonName,
  ProjectTypeId,
  StatusName,
  TagElementId,
  TagReferenceId,
  Timestamp
} from "./shared.js"
import { AttachedTagSummarySchema } from "./tags.js"
import { StatusCategoryValueSchema } from "./task-management.js"

const RawRecruitingLocatorInput = Schema.String.annotations({
  description: "Raw Recruiting locator before normalization; transforms trim whitespace and reject empty values."
})

export const StoredRecruitingText = Schema.String.annotations({
  description:
    "Free-form text already stored in Huly. Plain string is intentional because existing records may be empty."
})

const RecruitingArchivedFlag = Schema.Boolean.annotations({
  description: "Whether the Recruiting object is archived."
})

const RecruitingPrivateFlag = Schema.Boolean.annotations({
  description: "Whether the Recruiting object is private."
})

const VacancyTypeDefaultFlag = Schema.Boolean.annotations({
  description: "Whether this vacancy type is Huly's default vacancy type."
})

const RecruitingCreatedFlag = Schema.Boolean.annotations({
  description: "Whether this write created the Recruiting object instead of updating an existing one."
})

const RecruitingSkillAttachedFlag = Schema.Boolean.annotations({
  description: "Whether the skill tag reference was attached by this call."
})

const RecruitingSkillDetachedFlag = Schema.Boolean.annotations({
  description: "Whether a matching skill tag reference was detached by this call."
})

const RecruitingDeletedFlag = Schema.Boolean.annotations({
  description: "Whether the Recruiting object was deleted by this call."
})

const ApplicantMatchCompleteFlag = Schema.Boolean.annotations({
  description: "Whether Huly has finished generating this applicant match."
})

const RecruitingWorkModeFlag = Schema.Boolean.annotations({
  description: "Candidate work-mode preference copied from Huly candidate profile data."
})

export const VacancyName = NonEmptyString.annotations({
  description: "Non-empty Recruiting vacancy display name."
})
export type VacancyName = Schema.Schema.Type<typeof VacancyName>

export const VacancyTypeName = NonEmptyString.annotations({
  description: "Non-empty Recruiting vacancy type display name."
})
export type VacancyTypeName = Schema.Schema.Type<typeof VacancyTypeName>

export const RecruitingCompanyName = NonEmptyString.annotations({
  description: "Non-empty company display name used on a Recruiting vacancy."
})
export type RecruitingCompanyName = Schema.Schema.Type<typeof RecruitingCompanyName>

export const RecruitingSkillTitle = NonEmptyString.annotations({
  description: "Non-empty Recruiting skill tag title."
})
export type RecruitingSkillTitle = Schema.Schema.Type<typeof RecruitingSkillTitle>

export const RecruitingSkillCategory = NonEmptyString.annotations({
  description: "Non-empty Recruiting skill tag category."
})
export type RecruitingSkillCategory = Schema.Schema.Type<typeof RecruitingSkillCategory>

export const RecruitingReviewTitle = NonEmptyString.annotations({
  description: "Non-empty Recruiting review title."
})
export type RecruitingReviewTitle = Schema.Schema.Type<typeof RecruitingReviewTitle>

export const RecruitingOpinionValue = NonEmptyString.annotations({
  description: "Non-empty Recruiting opinion value."
})
export type RecruitingOpinionValue = Schema.Schema.Type<typeof RecruitingOpinionValue>

export const VacancyId = DocId.pipe(Schema.brand("VacancyId"))
export type VacancyId = Schema.Schema.Type<typeof VacancyId>

export const ApplicantId = DocId.pipe(Schema.brand("ApplicantId"))
export type ApplicantId = Schema.Schema.Type<typeof ApplicantId>

export const ApplicantMatchId = DocId.pipe(Schema.brand("ApplicantMatchId"))
export type ApplicantMatchId = Schema.Schema.Type<typeof ApplicantMatchId>

export const ReviewId = DocId.pipe(Schema.brand("ReviewId"))
export type ReviewId = Schema.Schema.Type<typeof ReviewId>

export const OpinionId = DocId.pipe(Schema.brand("OpinionId"))
export type OpinionId = Schema.Schema.Type<typeof OpinionId>

const prefixedLocator = (
  prefix: "APP" | "OPE" | "RVE" | "VCN",
  expected: string
) =>
  Schema.transformOrFail(RawRecruitingLocatorInput, NonEmptyString, {
    strict: true,
    decode: (input, _options, ast) => {
      const trimmed = input.trim()
      if (trimmed === "") {
        return ParseResult.fail(new ParseResult.Type(ast, input, expected))
      }
      const match = new RegExp(`^(?:${prefix}-)?(\\d+)$`, "i").exec(trimmed)
      return ParseResult.succeed(match === null ? trimmed : `${prefix}-${match[1]}`)
    },
    encode: ParseResult.succeed
  }).annotations({
    jsonSchema: { type: "string" }
  })

export const VacancyIdentifier = prefixedLocator("VCN", "Expected vacancy ID, VCN-<number>, number, or exact name")
  .pipe(Schema.brand("VacancyIdentifier"))
export type VacancyIdentifier = Schema.Schema.Type<typeof VacancyIdentifier>

export const ApplicantIdentifier = prefixedLocator("APP", "Expected applicant ID, APP-<number>, or number")
  .pipe(Schema.brand("ApplicantIdentifier"))
export type ApplicantIdentifier = Schema.Schema.Type<typeof ApplicantIdentifier>

export const ReviewIdentifier = prefixedLocator("RVE", "Expected review ID, RVE-<number>, number, or exact title")
  .pipe(Schema.brand("ReviewIdentifier"))
export type ReviewIdentifier = Schema.Schema.Type<typeof ReviewIdentifier>

export const OpinionIdentifier = prefixedLocator("OPE", "Expected opinion ID, OPE-<number>, or number")
  .pipe(Schema.brand("OpinionIdentifier"))
export type OpinionIdentifier = Schema.Schema.Type<typeof OpinionIdentifier>

export const ApplicantMatchIdentifier = NonEmptyString.pipe(Schema.brand("ApplicantMatchIdentifier"))
export type ApplicantMatchIdentifier = Schema.Schema.Type<typeof ApplicantMatchIdentifier>

export const CandidateIdentifier = NonEmptyString.pipe(Schema.brand("CandidateIdentifier"))
export type CandidateIdentifier = Schema.Schema.Type<typeof CandidateIdentifier>

export const VacancyRefSchema = Schema.Struct({
  id: VacancyId,
  identifier: VacancyIdentifier,
  name: VacancyName,
  archived: RecruitingArchivedFlag
}).annotations({
  title: "RecruitingVacancyRef",
  description: "Stable Recruiting vacancy reference."
})
export type VacancyRef = Schema.Schema.Type<typeof VacancyRefSchema>

export const CandidateRefSchema = Schema.Struct({
  id: PersonId,
  name: PersonName,
  email: Schema.optional(StoredRecruitingText)
}).annotations({
  title: "RecruitingCandidateRef",
  description: "Stable Recruiting candidate reference."
})
export type CandidateRef = Schema.Schema.Type<typeof CandidateRefSchema>

export const ApplicantRefSchema = Schema.Struct({
  id: ApplicantId,
  identifier: ApplicantIdentifier,
  vacancy: VacancyRefSchema,
  candidate: CandidateRefSchema,
  status: StatusName
}).annotations({
  title: "RecruitingApplicantRef",
  description: "Stable Recruiting applicant reference."
})
export type ApplicantRef = Schema.Schema.Type<typeof ApplicantRefSchema>

export const ReviewRefSchema = Schema.Struct({
  id: ReviewId,
  identifier: ReviewIdentifier,
  title: RecruitingReviewTitle,
  candidate: CandidateRefSchema
}).annotations({
  title: "RecruitingReviewRef",
  description: "Stable Recruiting review reference."
})
export type ReviewRef = Schema.Schema.Type<typeof ReviewRefSchema>

export const OpinionRefSchema = Schema.Struct({
  id: OpinionId,
  identifier: OpinionIdentifier,
  review: ReviewRefSchema,
  value: RecruitingOpinionValue
}).annotations({
  title: "RecruitingOpinionRef",
  description: "Stable Recruiting opinion reference."
})
export type OpinionRef = Schema.Schema.Type<typeof OpinionRefSchema>

export const ApplicantMatchRefSchema = Schema.Struct({
  id: ApplicantMatchId,
  candidate: CandidateRefSchema,
  complete: ApplicantMatchCompleteFlag,
  vacancy: StoredRecruitingText
}).annotations({
  title: "RecruitingApplicantMatchRef",
  description: "Stable Recruiting applicant-match reference."
})
export type ApplicantMatchRef = Schema.Schema.Type<typeof ApplicantMatchRefSchema>

export const VacancyTypeSummarySchema = Schema.Struct({
  id: ProjectTypeId,
  name: VacancyTypeName,
  description: Schema.optional(StoredRecruitingText),
  default: VacancyTypeDefaultFlag
})
export type VacancyTypeSummary = Schema.Schema.Type<typeof VacancyTypeSummarySchema>

export const RecruitingStatusSummarySchema = Schema.Struct({
  id: IssueStatusId,
  name: StatusName,
  category: StatusCategoryValueSchema
})
export type RecruitingStatusSummary = Schema.Schema.Type<typeof RecruitingStatusSummarySchema>

export const RecruitingSkillSummarySchema = Schema.Struct({
  id: TagElementId,
  title: RecruitingSkillTitle,
  color: ColorCode,
  category: RecruitingSkillCategory,
  refCount: Schema.optional(Count)
})
export type RecruitingSkillSummary = Schema.Schema.Type<typeof RecruitingSkillSummarySchema>

export const VacancyDetailSchema = Schema.Struct({
  ...VacancyRefSchema.fields,
  shortDescription: Schema.optional(StoredRecruitingText),
  fullDescription: Schema.optional(StoredRecruitingText),
  type: VacancyTypeSummarySchema,
  company: Schema.optional(Schema.Struct({
    id: DocId,
    name: RecruitingCompanyName
  })),
  location: Schema.optional(StoredRecruitingText),
  dueTo: Schema.optional(Timestamp),
  private: RecruitingPrivateFlag,
  applicants: Schema.optional(Count),
  comments: Schema.optional(Count),
  attachments: Schema.optional(Count),
  modifiedOn: Schema.optional(Timestamp),
  createdOn: Schema.optional(Timestamp)
})
export type VacancyDetail = Schema.Schema.Type<typeof VacancyDetailSchema>

export const CandidateDetailSchema = Schema.Struct({
  ...CandidateRefSchema.fields,
  title: Schema.optional(StoredRecruitingText),
  source: Schema.optional(StoredRecruitingText),
  onsite: Schema.optional(RecruitingWorkModeFlag),
  remote: Schema.optional(RecruitingWorkModeFlag),
  applications: Schema.optional(Count),
  reviews: Schema.optional(Count),
  skills: Schema.Array(AttachedTagSummarySchema),
  modifiedOn: Schema.optional(Timestamp),
  createdOn: Schema.optional(Timestamp)
})
export type CandidateDetail = Schema.Schema.Type<typeof CandidateDetailSchema>

export const ApplicantDetailSchema = Schema.Struct({
  ...ApplicantRefSchema.fields,
  assignee: Schema.optional(CandidateRefSchema),
  startDate: Schema.optional(Timestamp),
  dueDate: Schema.optional(Timestamp),
  modifiedOn: Schema.optional(Timestamp),
  createdOn: Schema.optional(Timestamp)
})
export type ApplicantDetail = Schema.Schema.Type<typeof ApplicantDetailSchema>

export const ListRecruitingVacancyTypesResultSchema = Schema.Struct({
  types: Schema.Array(VacancyTypeSummarySchema),
  total: Count
})
export type ListRecruitingVacancyTypesResult = Schema.Schema.Type<typeof ListRecruitingVacancyTypesResultSchema>

export const ListRecruitingVacancyStatusesResultSchema = Schema.Struct({
  statuses: Schema.Array(RecruitingStatusSummarySchema),
  total: Count
})
export type ListRecruitingVacancyStatusesResult = Schema.Schema.Type<typeof ListRecruitingVacancyStatusesResultSchema>

export const ListRecruitingVacanciesResultSchema = Schema.Struct({
  vacancies: Schema.Array(VacancyRefSchema),
  total: Count
})
export type ListRecruitingVacanciesResult = Schema.Schema.Type<typeof ListRecruitingVacanciesResultSchema>

export const ListRecruitingCandidatesResultSchema = Schema.Struct({
  candidates: Schema.Array(CandidateRefSchema),
  total: Count
})
export type ListRecruitingCandidatesResult = Schema.Schema.Type<typeof ListRecruitingCandidatesResultSchema>

export const ListRecruitingSkillsResultSchema = Schema.Struct({
  skills: Schema.Array(RecruitingSkillSummarySchema),
  total: Count
})
export type ListRecruitingSkillsResult = Schema.Schema.Type<typeof ListRecruitingSkillsResultSchema>

export const ListRecruitingCandidateSkillsResultSchema = Schema.Struct({
  skills: Schema.Array(AttachedTagSummarySchema),
  total: Count
})
export type ListRecruitingCandidateSkillsResult = Schema.Schema.Type<typeof ListRecruitingCandidateSkillsResultSchema>

export const ListRecruitingApplicantsResultSchema = Schema.Struct({
  applicants: Schema.Array(ApplicantRefSchema),
  total: Count
})
export type ListRecruitingApplicantsResult = Schema.Schema.Type<typeof ListRecruitingApplicantsResultSchema>

export const RecruitingVacancyMutationResultSchema = Schema.Struct({
  vacancy: VacancyRefSchema
})
export type RecruitingVacancyMutationResult = Schema.Schema.Type<typeof RecruitingVacancyMutationResultSchema>

export const RecruitingCandidateMutationResultSchema = Schema.Struct({
  candidate: CandidateRefSchema,
  created: RecruitingCreatedFlag
})
export type RecruitingCandidateMutationResult = Schema.Schema.Type<typeof RecruitingCandidateMutationResultSchema>

export const RecruitingApplicantMutationResultSchema = Schema.Struct({
  applicant: ApplicantRefSchema
})
export type RecruitingApplicantMutationResult = Schema.Schema.Type<typeof RecruitingApplicantMutationResultSchema>

export const RecruitingSkillAttachResultSchema = Schema.Struct({
  id: TagReferenceId,
  tag: TagElementId,
  title: RecruitingSkillTitle,
  attached: RecruitingSkillAttachedFlag
})
export type RecruitingSkillAttachResult = Schema.Schema.Type<typeof RecruitingSkillAttachResultSchema>

export const RecruitingSkillDetachResultSchema = Schema.Struct({
  detached: RecruitingSkillDetachedFlag,
  detachedCount: Count
})
export type RecruitingSkillDetachResult = Schema.Schema.Type<typeof RecruitingSkillDetachResultSchema>

export const DeleteRecruitingApplicantResultSchema = Schema.Struct({
  applicant: ApplicantRefSchema,
  deleted: RecruitingDeletedFlag
})
export type DeleteRecruitingApplicantResult = Schema.Schema.Type<typeof DeleteRecruitingApplicantResultSchema>
