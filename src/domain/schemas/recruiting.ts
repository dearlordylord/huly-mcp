import { Schema } from "effect"

import { HULY_NATIVE_REFERENCE_MARKDOWN_INPUT } from "./document-native-references.js"
import { toDraft07JsonSchema as toDraft07JsonSchemaBase, withJsonSchemaPropertyDescriptions } from "./json-schema.js"
import { ApplicantIdentifier, CandidateIdentifier, VacancyIdentifier } from "./recruiting-common.js"
import {
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  ColorCode,
  DEFAULT_INCLUDE_ARCHIVED,
  DEFAULT_LIMIT,
  hasAtLeastOneDefined,
  LimitParam,
  NonEmptyString,
  PersonRefInput,
  StatusName,
  TagCategoryIdentifier,
  TagIdentifier,
  Timestamp,
  withAtLeastOneRequired
} from "./shared.js"
import { TagWeight } from "./tags.js"

const RECRUITING_FIELD_DESCRIPTIONS = {
  includeArchived: "Include archived records.",
  limit: "Maximum number of records to return.",
  query: "Case-insensitive search text.",
  vacancy: "Vacancy locator.",
  candidate: "Candidate locator.",
  applicant: "Applicant locator.",
  status: "Exact Recruiting status name.",
  assignee: "Employee assignee locator.",
  name: "Vacancy name.",
  shortDescription: "Short vacancy description.",
  fullDescription: `Full vacancy description in Markdown. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`,
  type: "Vacancy type locator.",
  company: "Company organization locator.",
  location: "Vacancy location.",
  dueTo: "Vacancy due timestamp.",
  private: "Whether the vacancy is private.",
  title: "Recruiting title or search text.",
  titleSearch: "Case-insensitive skill title search text.",
  source: "Candidate source text.",
  fieldId: "Custom field attribute ID returned by list_recruiting_candidate_custom_fields.",
  value: "Value in the custom field's documented wire format.",
  onsite: "Whether the candidate accepts onsite work.",
  remote: "Whether the candidate accepts remote work.",
  skill: "Skill locator.",
  category: "Skill category.",
  color: "Skill color.",
  weight: "Skill weight.",
  startDate: "Applicant start timestamp.",
  dueDate: "Applicant due timestamp."
}

const toDraft07JsonSchema = (schema: Schema.Constraint): object =>
  withJsonSchemaPropertyDescriptions(toDraft07JsonSchemaBase(schema), RECRUITING_FIELD_DESCRIPTIONS)

export * from "./recruiting-common.js"
export * from "./recruiting-candidate-custom-fields.js"

const RecruitingSearchText = NonEmptyString.annotateKey({ description: "Non-empty case-insensitive search text." })

const RecruitingOptionalTextInput = NonEmptyString.annotateKey({ description: "Non-empty free-form Recruiting text." })

const RecruitingClearableTextInput = Schema.NullOr(RecruitingOptionalTextInput).annotate({
  description: "Non-empty replacement text, or null to clear this field."
})

const RecruitingPrivateInput = Schema.Boolean.annotate({
  description: "Whether the created or updated Recruiting object should be private."
})

const RecruitingWorkModeInput = Schema.Boolean.annotate({
  description: "Whether the candidate is available for this work mode."
})

export const ListRecruitingVacancyTypesParamsSchema = Schema.Struct({
  includeArchived: Schema.optional(
    Schema.Boolean.annotate({
      description: `Include archived vacancy types when Huly marks them archived (default: ${DEFAULT_INCLUDE_ARCHIVED}).`
    })
  ),
  limit: Schema.optional(
    LimitParam.annotateKey({ description: `Maximum number of vacancy types to return (default: ${DEFAULT_LIMIT}).` })
  )
})
export type ListRecruitingVacancyTypesParams = Schema.Schema.Type<typeof ListRecruitingVacancyTypesParamsSchema>

export const ListRecruitingVacancyStatusesParamsSchema = Schema.Struct({
  vacancy: VacancyIdentifier.annotate({
    description: "Vacancy locator: raw _id, VCN-<number>, bare number, or exact vacancy name."
  })
})
export type ListRecruitingVacancyStatusesParams = Schema.Schema.Type<typeof ListRecruitingVacancyStatusesParamsSchema>

export const ListRecruitingVacanciesParamsSchema = Schema.Struct({
  includeArchived: Schema.optional(
    Schema.Boolean.annotateKey({ description: `Include archived vacancies (default: ${DEFAULT_INCLUDE_ARCHIVED}).` })
  ),
  query: Schema.optional(RecruitingSearchText.annotateKey({ description: "Case-insensitive vacancy name search." })),
  type: Schema.optional(NonEmptyString.annotateKey({ description: "Vacancy type ID or exact type name." })),
  company: Schema.optional(NonEmptyString.annotateKey({ description: "Company organization ID or exact name." })),
  limit: Schema.optional(
    LimitParam.annotateKey({ description: `Maximum number of vacancies to return (default: ${DEFAULT_LIMIT}).` })
  )
})
export type ListRecruitingVacanciesParams = Schema.Schema.Type<typeof ListRecruitingVacanciesParamsSchema>

export const GetRecruitingVacancyParamsSchema = Schema.Struct({
  vacancy: VacancyIdentifier.annotate({
    description: "Vacancy locator: raw _id, VCN-<number>, bare number, or exact vacancy name."
  })
})
export type GetRecruitingVacancyParams = Schema.Schema.Type<typeof GetRecruitingVacancyParamsSchema>

export const CreateRecruitingVacancyParamsSchema = Schema.Struct({
  name: NonEmptyString.annotateKey({ description: "Non-empty vacancy name." }),
  shortDescription: Schema.optional(
    RecruitingOptionalTextInput.annotateKey({ description: "Non-empty short vacancy summary." })
  ),
  fullDescription: Schema.optional(
    RecruitingOptionalTextInput.annotate({
      description: `Non-empty full vacancy description uploaded as collaborative markdown. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`
    })
  ),
  type: Schema.optional(
    NonEmptyString.annotate({
      description: "Vacancy type ID or exact type name. Defaults to Huly's Default vacancy type."
    })
  ),
  company: Schema.optional(NonEmptyString.annotateKey({ description: "Company organization ID or exact name." })),
  location: Schema.optional(
    RecruitingOptionalTextInput.annotateKey({ description: "Non-empty vacancy location text." })
  ),
  dueTo: Schema.optional(Timestamp),
  private: Schema.optional(RecruitingPrivateInput)
})
export type CreateRecruitingVacancyParams = Schema.Schema.Type<typeof CreateRecruitingVacancyParamsSchema>

export const UPDATE_RECRUITING_VACANCY_FIELDS = [
  "name",
  "shortDescription",
  "fullDescription",
  "type",
  "company",
  "location",
  "dueTo",
  "private"
] as const

export const UpdateRecruitingVacancyParamsSchema = Schema.Struct({
  vacancy: VacancyIdentifier,
  name: Schema.optional(NonEmptyString.annotateKey({ description: "Non-empty replacement vacancy name." })),
  shortDescription: Schema.optional(
    RecruitingOptionalTextInput.annotateKey({ description: "Non-empty replacement short vacancy summary." })
  ),
  fullDescription: Schema.optional(
    RecruitingClearableTextInput.annotate({
      description: `Non-empty replacement full vacancy description in markdown, or null to clear. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`
    })
  ),
  type: Schema.optional(NonEmptyString.annotateKey({ description: "Replacement vacancy type ID or exact type name." })),
  company: Schema.optional(
    Schema.NullOr(NonEmptyString).annotate({
      description: "Replacement company organization ID or exact name, or null to clear."
    })
  ),
  location: Schema.optional(
    RecruitingClearableTextInput.annotateKey({
      description: "Non-empty replacement vacancy location, or null to clear."
    })
  ),
  dueTo: Schema.optional(Schema.NullOr(Timestamp)),
  private: Schema.optional(RecruitingPrivateInput)
}).pipe(
  Schema.check(
    Schema.makeFilter((params) =>
      hasAtLeastOneDefined(params, UPDATE_RECRUITING_VACANCY_FIELDS)
        ? undefined
        : atLeastOneUpdateFieldMessage(UPDATE_RECRUITING_VACANCY_FIELDS)
    )
  )
)
export type UpdateRecruitingVacancyParams = Schema.Schema.Type<typeof UpdateRecruitingVacancyParamsSchema>
assertUpdateFields<UpdateRecruitingVacancyParams>()(["vacancy"], UPDATE_RECRUITING_VACANCY_FIELDS)

export const ArchiveRecruitingVacancyParamsSchema = GetRecruitingVacancyParamsSchema
export type ArchiveRecruitingVacancyParams = GetRecruitingVacancyParams
export const UnarchiveRecruitingVacancyParamsSchema = GetRecruitingVacancyParamsSchema
export type UnarchiveRecruitingVacancyParams = GetRecruitingVacancyParams

export const ListRecruitingCandidatesParamsSchema = Schema.Struct({
  query: Schema.optional(
    RecruitingSearchText.annotateKey({ description: "Case-insensitive candidate name, title, or source search." })
  ),
  limit: Schema.optional(
    LimitParam.annotateKey({ description: `Maximum number of candidates to return (default: ${DEFAULT_LIMIT}).` })
  )
})
export type ListRecruitingCandidatesParams = Schema.Schema.Type<typeof ListRecruitingCandidatesParamsSchema>

export const GetRecruitingCandidateParamsSchema = Schema.Struct({
  candidate: CandidateIdentifier.annotate({
    description: "Candidate locator: person _id, email, or exact person display name."
  })
})
export type GetRecruitingCandidateParams = Schema.Schema.Type<typeof GetRecruitingCandidateParamsSchema>

export const SET_RECRUITING_CANDIDATE_PROFILE_FIELDS = ["title", "source", "onsite", "remote"] as const
export const SetRecruitingCandidateProfileParamsSchema = Schema.Struct({
  candidate: CandidateIdentifier,
  title: Schema.optional(
    RecruitingOptionalTextInput.annotateKey({ description: "Non-empty candidate profile title." })
  ),
  source: Schema.optional(RecruitingOptionalTextInput.annotateKey({ description: "Non-empty candidate source text." })),
  onsite: Schema.optional(RecruitingWorkModeInput),
  remote: Schema.optional(RecruitingWorkModeInput)
}).pipe(
  Schema.check(
    Schema.makeFilter((params) =>
      hasAtLeastOneDefined(params, SET_RECRUITING_CANDIDATE_PROFILE_FIELDS)
        ? undefined
        : atLeastOneUpdateFieldMessage(SET_RECRUITING_CANDIDATE_PROFILE_FIELDS)
    )
  )
)
export type SetRecruitingCandidateProfileParams = Schema.Schema.Type<typeof SetRecruitingCandidateProfileParamsSchema>
assertUpdateFields<SetRecruitingCandidateProfileParams>()(["candidate"], SET_RECRUITING_CANDIDATE_PROFILE_FIELDS)

export const ListRecruitingSkillsParamsSchema = Schema.Struct({
  titleSearch: Schema.optional(
    RecruitingSearchText.annotateKey({ description: "Case-insensitive skill title search." })
  ),
  category: Schema.optional(TagCategoryIdentifier),
  limit: Schema.optional(
    LimitParam.annotateKey({ description: `Maximum number of skills to return (default: ${DEFAULT_LIMIT}).` })
  )
})
export type ListRecruitingSkillsParams = Schema.Schema.Type<typeof ListRecruitingSkillsParamsSchema>

export const ListRecruitingCandidateSkillsParamsSchema = GetRecruitingCandidateParamsSchema
export type ListRecruitingCandidateSkillsParams = GetRecruitingCandidateParams

export const AddRecruitingCandidateSkillParamsSchema = Schema.Struct({
  candidate: CandidateIdentifier,
  skill: TagIdentifier.annotate({
    description: "Skill tag title or tag ID. Missing titles are created automatically."
  }),
  category: Schema.optional(TagCategoryIdentifier),
  color: Schema.optional(ColorCode),
  weight: Schema.optional(TagWeight)
})
export type AddRecruitingCandidateSkillParams = Schema.Schema.Type<typeof AddRecruitingCandidateSkillParamsSchema>

export const RemoveRecruitingCandidateSkillParamsSchema = Schema.Struct({
  candidate: CandidateIdentifier,
  skill: TagIdentifier
})
export type RemoveRecruitingCandidateSkillParams = Schema.Schema.Type<typeof RemoveRecruitingCandidateSkillParamsSchema>

export const ListRecruitingApplicantsParamsSchema = Schema.Struct({
  vacancy: Schema.optional(VacancyIdentifier),
  candidate: Schema.optional(CandidateIdentifier),
  status: Schema.optional(StatusName),
  limit: Schema.optional(
    LimitParam.annotateKey({ description: `Maximum number of applicants to return (default: ${DEFAULT_LIMIT}).` })
  )
})
export type ListRecruitingApplicantsParams = Schema.Schema.Type<typeof ListRecruitingApplicantsParamsSchema>

export const ApplicantLocatorSchema = Schema.Struct({
  applicant: ApplicantIdentifier,
  vacancy: Schema.optional(VacancyIdentifier),
  candidate: Schema.optional(CandidateIdentifier)
})
export type ApplicantLocator = Schema.Schema.Type<typeof ApplicantLocatorSchema>

export const GetRecruitingApplicantParamsSchema = ApplicantLocatorSchema
export type GetRecruitingApplicantParams = ApplicantLocator

export const CreateRecruitingApplicantParamsSchema = Schema.Struct({
  vacancy: VacancyIdentifier,
  candidate: CandidateIdentifier,
  status: Schema.optional(StatusName),
  assignee: Schema.optional(PersonRefInput),
  startDate: Schema.optional(Timestamp),
  dueDate: Schema.optional(Timestamp)
})
export type CreateRecruitingApplicantParams = Schema.Schema.Type<typeof CreateRecruitingApplicantParamsSchema>

export const UPDATE_RECRUITING_APPLICANT_FIELDS = ["status", "assignee", "startDate", "dueDate"] as const
export const UpdateRecruitingApplicantParamsSchema = Schema.Struct({
  applicant: ApplicantIdentifier,
  vacancy: Schema.optional(VacancyIdentifier),
  candidate: Schema.optional(CandidateIdentifier),
  status: Schema.optional(StatusName),
  assignee: Schema.optional(Schema.NullOr(PersonRefInput)),
  startDate: Schema.optional(Schema.NullOr(Timestamp)),
  dueDate: Schema.optional(Schema.NullOr(Timestamp))
}).pipe(
  Schema.check(
    Schema.makeFilter((params) =>
      hasAtLeastOneDefined(params, UPDATE_RECRUITING_APPLICANT_FIELDS)
        ? undefined
        : atLeastOneUpdateFieldMessage(UPDATE_RECRUITING_APPLICANT_FIELDS)
    )
  )
)
export type UpdateRecruitingApplicantParams = Schema.Schema.Type<typeof UpdateRecruitingApplicantParamsSchema>
assertUpdateFields<UpdateRecruitingApplicantParams>()(
  ["applicant", "vacancy", "candidate"],
  UPDATE_RECRUITING_APPLICANT_FIELDS
)

export const DeleteRecruitingApplicantParamsSchema = ApplicantLocatorSchema
export type DeleteRecruitingApplicantParams = ApplicantLocator

export const listRecruitingVacancyTypesParamsJsonSchema = toDraft07JsonSchema(ListRecruitingVacancyTypesParamsSchema)
export const listRecruitingVacancyStatusesParamsJsonSchema = toDraft07JsonSchema(
  ListRecruitingVacancyStatusesParamsSchema
)
export const listRecruitingVacanciesParamsJsonSchema = toDraft07JsonSchema(ListRecruitingVacanciesParamsSchema)
export const getRecruitingVacancyParamsJsonSchema = toDraft07JsonSchema(GetRecruitingVacancyParamsSchema)
export const createRecruitingVacancyParamsJsonSchema = toDraft07JsonSchema(CreateRecruitingVacancyParamsSchema)
export const updateRecruitingVacancyParamsJsonSchema = withAtLeastOneRequired(
  toDraft07JsonSchema(UpdateRecruitingVacancyParamsSchema),
  UPDATE_RECRUITING_VACANCY_FIELDS
)
export const archiveRecruitingVacancyParamsJsonSchema = toDraft07JsonSchema(ArchiveRecruitingVacancyParamsSchema)
export const unarchiveRecruitingVacancyParamsJsonSchema = toDraft07JsonSchema(UnarchiveRecruitingVacancyParamsSchema)
export const listRecruitingCandidatesParamsJsonSchema = toDraft07JsonSchema(ListRecruitingCandidatesParamsSchema)
export const getRecruitingCandidateParamsJsonSchema = toDraft07JsonSchema(GetRecruitingCandidateParamsSchema)
export const setRecruitingCandidateProfileParamsJsonSchema = withAtLeastOneRequired(
  toDraft07JsonSchema(SetRecruitingCandidateProfileParamsSchema),
  SET_RECRUITING_CANDIDATE_PROFILE_FIELDS
)
export const listRecruitingSkillsParamsJsonSchema = toDraft07JsonSchema(ListRecruitingSkillsParamsSchema)
export const listRecruitingCandidateSkillsParamsJsonSchema = toDraft07JsonSchema(
  ListRecruitingCandidateSkillsParamsSchema
)
export const addRecruitingCandidateSkillParamsJsonSchema = toDraft07JsonSchema(AddRecruitingCandidateSkillParamsSchema)
export const removeRecruitingCandidateSkillParamsJsonSchema = toDraft07JsonSchema(
  RemoveRecruitingCandidateSkillParamsSchema
)
export const listRecruitingApplicantsParamsJsonSchema = toDraft07JsonSchema(ListRecruitingApplicantsParamsSchema)
export const getRecruitingApplicantParamsJsonSchema = toDraft07JsonSchema(GetRecruitingApplicantParamsSchema)
export const createRecruitingApplicantParamsJsonSchema = toDraft07JsonSchema(CreateRecruitingApplicantParamsSchema)
export const updateRecruitingApplicantParamsJsonSchema = withAtLeastOneRequired(
  toDraft07JsonSchema(UpdateRecruitingApplicantParamsSchema),
  UPDATE_RECRUITING_APPLICANT_FIELDS
)
export const deleteRecruitingApplicantParamsJsonSchema = toDraft07JsonSchema(DeleteRecruitingApplicantParamsSchema)

export const parseListRecruitingVacancyTypesParams = Schema.decodeUnknownEffect(ListRecruitingVacancyTypesParamsSchema)
export const parseListRecruitingVacancyStatusesParams = Schema.decodeUnknownEffect(
  ListRecruitingVacancyStatusesParamsSchema
)
export const parseListRecruitingVacanciesParams = Schema.decodeUnknownEffect(ListRecruitingVacanciesParamsSchema)
export const parseGetRecruitingVacancyParams = Schema.decodeUnknownEffect(GetRecruitingVacancyParamsSchema)
export const parseCreateRecruitingVacancyParams = Schema.decodeUnknownEffect(CreateRecruitingVacancyParamsSchema)
export const parseUpdateRecruitingVacancyParams = Schema.decodeUnknownEffect(UpdateRecruitingVacancyParamsSchema)
export const parseArchiveRecruitingVacancyParams = Schema.decodeUnknownEffect(ArchiveRecruitingVacancyParamsSchema)
export const parseUnarchiveRecruitingVacancyParams = Schema.decodeUnknownEffect(UnarchiveRecruitingVacancyParamsSchema)
export const parseListRecruitingCandidatesParams = Schema.decodeUnknownEffect(ListRecruitingCandidatesParamsSchema)
export const parseGetRecruitingCandidateParams = Schema.decodeUnknownEffect(GetRecruitingCandidateParamsSchema)
export const parseSetRecruitingCandidateProfileParams = Schema.decodeUnknownEffect(
  SetRecruitingCandidateProfileParamsSchema
)
export const parseListRecruitingSkillsParams = Schema.decodeUnknownEffect(ListRecruitingSkillsParamsSchema)
export const parseListRecruitingCandidateSkillsParams = Schema.decodeUnknownEffect(
  ListRecruitingCandidateSkillsParamsSchema
)
export const parseAddRecruitingCandidateSkillParams = Schema.decodeUnknownEffect(
  AddRecruitingCandidateSkillParamsSchema
)
export const parseRemoveRecruitingCandidateSkillParams = Schema.decodeUnknownEffect(
  RemoveRecruitingCandidateSkillParamsSchema
)
export const parseListRecruitingApplicantsParams = Schema.decodeUnknownEffect(ListRecruitingApplicantsParamsSchema)
export const parseGetRecruitingApplicantParams = Schema.decodeUnknownEffect(GetRecruitingApplicantParamsSchema)
export const parseCreateRecruitingApplicantParams = Schema.decodeUnknownEffect(CreateRecruitingApplicantParamsSchema)
export const parseUpdateRecruitingApplicantParams = Schema.decodeUnknownEffect(UpdateRecruitingApplicantParamsSchema)
export const parseDeleteRecruitingApplicantParams = Schema.decodeUnknownEffect(DeleteRecruitingApplicantParamsSchema)
