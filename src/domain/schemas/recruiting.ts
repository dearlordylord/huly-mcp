import { JSONSchema, Schema } from "effect"

import { HULY_NATIVE_REFERENCE_MARKDOWN_INPUT } from "./document-native-references.js"
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

export * from "./recruiting-common.js"

const RecruitingSearchText = NonEmptyString.annotations({
  description: "Non-empty case-insensitive search text."
})

const RecruitingOptionalTextInput = NonEmptyString.annotations({
  description: "Non-empty free-form Recruiting text."
})

const RecruitingClearableTextInput = Schema.NullOr(RecruitingOptionalTextInput).annotations({
  description: "Non-empty replacement text, or null to clear this field."
})

const RecruitingPrivateInput = Schema.Boolean.annotations({
  description: "Whether the created or updated Recruiting object should be private."
})

const RecruitingWorkModeInput = Schema.Boolean.annotations({
  description: "Whether the candidate is available for this work mode."
})

export const ListRecruitingVacancyTypesParamsSchema = Schema.Struct({
  includeArchived: Schema.optional(Schema.Boolean.annotations({
    description: `Include archived vacancy types when Huly marks them archived (default: ${DEFAULT_INCLUDE_ARCHIVED}).`
  })),
  limit: Schema.optional(LimitParam.annotations({
    description: `Maximum number of vacancy types to return (default: ${DEFAULT_LIMIT}).`
  }))
})
export type ListRecruitingVacancyTypesParams = Schema.Schema.Type<typeof ListRecruitingVacancyTypesParamsSchema>

export const ListRecruitingVacancyStatusesParamsSchema = Schema.Struct({
  vacancy: VacancyIdentifier.annotations({
    description: "Vacancy locator: raw _id, VCN-<number>, bare number, or exact vacancy name."
  })
})
export type ListRecruitingVacancyStatusesParams = Schema.Schema.Type<typeof ListRecruitingVacancyStatusesParamsSchema>

export const ListRecruitingVacanciesParamsSchema = Schema.Struct({
  includeArchived: Schema.optional(Schema.Boolean.annotations({
    description: `Include archived vacancies (default: ${DEFAULT_INCLUDE_ARCHIVED}).`
  })),
  query: Schema.optional(RecruitingSearchText.annotations({
    description: "Case-insensitive vacancy name search."
  })),
  type: Schema.optional(NonEmptyString.annotations({
    description: "Vacancy type ID or exact type name."
  })),
  company: Schema.optional(NonEmptyString.annotations({
    description: "Company organization ID or exact name."
  })),
  limit: Schema.optional(LimitParam.annotations({
    description: `Maximum number of vacancies to return (default: ${DEFAULT_LIMIT}).`
  }))
})
export type ListRecruitingVacanciesParams = Schema.Schema.Type<typeof ListRecruitingVacanciesParamsSchema>

export const GetRecruitingVacancyParamsSchema = Schema.Struct({
  vacancy: VacancyIdentifier.annotations({
    description: "Vacancy locator: raw _id, VCN-<number>, bare number, or exact vacancy name."
  })
})
export type GetRecruitingVacancyParams = Schema.Schema.Type<typeof GetRecruitingVacancyParamsSchema>

export const CreateRecruitingVacancyParamsSchema = Schema.Struct({
  name: NonEmptyString.annotations({
    description: "Non-empty vacancy name."
  }),
  shortDescription: Schema.optional(RecruitingOptionalTextInput.annotations({
    description: "Non-empty short vacancy summary."
  })),
  fullDescription: Schema.optional(RecruitingOptionalTextInput.annotations({
    description:
      `Non-empty full vacancy description uploaded as collaborative markdown. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`
  })),
  type: Schema.optional(NonEmptyString.annotations({
    description: "Vacancy type ID or exact type name. Defaults to Huly's Default vacancy type."
  })),
  company: Schema.optional(NonEmptyString.annotations({
    description: "Company organization ID or exact name."
  })),
  location: Schema.optional(RecruitingOptionalTextInput.annotations({
    description: "Non-empty vacancy location text."
  })),
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
  name: Schema.optional(NonEmptyString.annotations({
    description: "Non-empty replacement vacancy name."
  })),
  shortDescription: Schema.optional(RecruitingOptionalTextInput.annotations({
    description: "Non-empty replacement short vacancy summary."
  })),
  fullDescription: Schema.optional(RecruitingClearableTextInput.annotations({
    description:
      `Non-empty replacement full vacancy description in markdown, or null to clear. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`
  })),
  type: Schema.optional(NonEmptyString.annotations({
    description: "Replacement vacancy type ID or exact type name."
  })),
  company: Schema.optional(
    Schema.NullOr(NonEmptyString).annotations({
      description: "Replacement company organization ID or exact name, or null to clear."
    })
  ),
  location: Schema.optional(RecruitingClearableTextInput.annotations({
    description: "Non-empty replacement vacancy location, or null to clear."
  })),
  dueTo: Schema.optional(Schema.NullOr(Timestamp)),
  private: Schema.optional(RecruitingPrivateInput)
}).pipe(
  Schema.filter((params) =>
    hasAtLeastOneDefined(params, UPDATE_RECRUITING_VACANCY_FIELDS)
      ? undefined
      : atLeastOneUpdateFieldMessage(UPDATE_RECRUITING_VACANCY_FIELDS)
  )
)
export type UpdateRecruitingVacancyParams = Schema.Schema.Type<typeof UpdateRecruitingVacancyParamsSchema>
assertUpdateFields<UpdateRecruitingVacancyParams>()(["vacancy"], UPDATE_RECRUITING_VACANCY_FIELDS)

export const ArchiveRecruitingVacancyParamsSchema = GetRecruitingVacancyParamsSchema
export type ArchiveRecruitingVacancyParams = GetRecruitingVacancyParams
export const UnarchiveRecruitingVacancyParamsSchema = GetRecruitingVacancyParamsSchema
export type UnarchiveRecruitingVacancyParams = GetRecruitingVacancyParams

export const ListRecruitingCandidatesParamsSchema = Schema.Struct({
  query: Schema.optional(RecruitingSearchText.annotations({
    description: "Case-insensitive candidate name, title, or source search."
  })),
  limit: Schema.optional(LimitParam.annotations({
    description: `Maximum number of candidates to return (default: ${DEFAULT_LIMIT}).`
  }))
})
export type ListRecruitingCandidatesParams = Schema.Schema.Type<typeof ListRecruitingCandidatesParamsSchema>

export const GetRecruitingCandidateParamsSchema = Schema.Struct({
  candidate: CandidateIdentifier.annotations({
    description: "Candidate locator: person _id, email, or exact person display name."
  })
})
export type GetRecruitingCandidateParams = Schema.Schema.Type<typeof GetRecruitingCandidateParamsSchema>

export const SET_RECRUITING_CANDIDATE_PROFILE_FIELDS = ["title", "source", "onsite", "remote"] as const
export const SetRecruitingCandidateProfileParamsSchema = Schema.Struct({
  candidate: CandidateIdentifier,
  title: Schema.optional(RecruitingOptionalTextInput.annotations({
    description: "Non-empty candidate profile title."
  })),
  source: Schema.optional(RecruitingOptionalTextInput.annotations({
    description: "Non-empty candidate source text."
  })),
  onsite: Schema.optional(RecruitingWorkModeInput),
  remote: Schema.optional(RecruitingWorkModeInput)
}).pipe(
  Schema.filter((params) =>
    hasAtLeastOneDefined(params, SET_RECRUITING_CANDIDATE_PROFILE_FIELDS)
      ? undefined
      : atLeastOneUpdateFieldMessage(SET_RECRUITING_CANDIDATE_PROFILE_FIELDS)
  )
)
export type SetRecruitingCandidateProfileParams = Schema.Schema.Type<typeof SetRecruitingCandidateProfileParamsSchema>
assertUpdateFields<SetRecruitingCandidateProfileParams>()(
  ["candidate"],
  SET_RECRUITING_CANDIDATE_PROFILE_FIELDS
)

export const ListRecruitingSkillsParamsSchema = Schema.Struct({
  titleSearch: Schema.optional(RecruitingSearchText.annotations({
    description: "Case-insensitive skill title search."
  })),
  category: Schema.optional(TagCategoryIdentifier),
  limit: Schema.optional(LimitParam.annotations({
    description: `Maximum number of skills to return (default: ${DEFAULT_LIMIT}).`
  }))
})
export type ListRecruitingSkillsParams = Schema.Schema.Type<typeof ListRecruitingSkillsParamsSchema>

export const ListRecruitingCandidateSkillsParamsSchema = GetRecruitingCandidateParamsSchema
export type ListRecruitingCandidateSkillsParams = GetRecruitingCandidateParams

export const AddRecruitingCandidateSkillParamsSchema = Schema.Struct({
  candidate: CandidateIdentifier,
  skill: TagIdentifier.annotations({
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
  limit: Schema.optional(LimitParam.annotations({
    description: `Maximum number of applicants to return (default: ${DEFAULT_LIMIT}).`
  }))
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
  Schema.filter((params) =>
    hasAtLeastOneDefined(params, UPDATE_RECRUITING_APPLICANT_FIELDS)
      ? undefined
      : atLeastOneUpdateFieldMessage(UPDATE_RECRUITING_APPLICANT_FIELDS)
  )
)
export type UpdateRecruitingApplicantParams = Schema.Schema.Type<typeof UpdateRecruitingApplicantParamsSchema>
assertUpdateFields<UpdateRecruitingApplicantParams>()(
  ["applicant", "vacancy", "candidate"],
  UPDATE_RECRUITING_APPLICANT_FIELDS
)

export const DeleteRecruitingApplicantParamsSchema = ApplicantLocatorSchema
export type DeleteRecruitingApplicantParams = ApplicantLocator

export const listRecruitingVacancyTypesParamsJsonSchema = JSONSchema.make(ListRecruitingVacancyTypesParamsSchema)
export const listRecruitingVacancyStatusesParamsJsonSchema = JSONSchema.make(ListRecruitingVacancyStatusesParamsSchema)
export const listRecruitingVacanciesParamsJsonSchema = JSONSchema.make(ListRecruitingVacanciesParamsSchema)
export const getRecruitingVacancyParamsJsonSchema = JSONSchema.make(GetRecruitingVacancyParamsSchema)
export const createRecruitingVacancyParamsJsonSchema = JSONSchema.make(CreateRecruitingVacancyParamsSchema)
export const updateRecruitingVacancyParamsJsonSchema = withAtLeastOneRequired(
  JSONSchema.make(UpdateRecruitingVacancyParamsSchema),
  UPDATE_RECRUITING_VACANCY_FIELDS
)
export const archiveRecruitingVacancyParamsJsonSchema = JSONSchema.make(ArchiveRecruitingVacancyParamsSchema)
export const unarchiveRecruitingVacancyParamsJsonSchema = JSONSchema.make(UnarchiveRecruitingVacancyParamsSchema)
export const listRecruitingCandidatesParamsJsonSchema = JSONSchema.make(ListRecruitingCandidatesParamsSchema)
export const getRecruitingCandidateParamsJsonSchema = JSONSchema.make(GetRecruitingCandidateParamsSchema)
export const setRecruitingCandidateProfileParamsJsonSchema = withAtLeastOneRequired(
  JSONSchema.make(SetRecruitingCandidateProfileParamsSchema),
  SET_RECRUITING_CANDIDATE_PROFILE_FIELDS
)
export const listRecruitingSkillsParamsJsonSchema = JSONSchema.make(ListRecruitingSkillsParamsSchema)
export const listRecruitingCandidateSkillsParamsJsonSchema = JSONSchema.make(ListRecruitingCandidateSkillsParamsSchema)
export const addRecruitingCandidateSkillParamsJsonSchema = JSONSchema.make(AddRecruitingCandidateSkillParamsSchema)
export const removeRecruitingCandidateSkillParamsJsonSchema = JSONSchema.make(
  RemoveRecruitingCandidateSkillParamsSchema
)
export const listRecruitingApplicantsParamsJsonSchema = JSONSchema.make(ListRecruitingApplicantsParamsSchema)
export const getRecruitingApplicantParamsJsonSchema = JSONSchema.make(GetRecruitingApplicantParamsSchema)
export const createRecruitingApplicantParamsJsonSchema = JSONSchema.make(CreateRecruitingApplicantParamsSchema)
export const updateRecruitingApplicantParamsJsonSchema = withAtLeastOneRequired(
  JSONSchema.make(UpdateRecruitingApplicantParamsSchema),
  UPDATE_RECRUITING_APPLICANT_FIELDS
)
export const deleteRecruitingApplicantParamsJsonSchema = JSONSchema.make(DeleteRecruitingApplicantParamsSchema)

export const parseListRecruitingVacancyTypesParams = Schema.decodeUnknown(ListRecruitingVacancyTypesParamsSchema)
export const parseListRecruitingVacancyStatusesParams = Schema.decodeUnknown(ListRecruitingVacancyStatusesParamsSchema)
export const parseListRecruitingVacanciesParams = Schema.decodeUnknown(ListRecruitingVacanciesParamsSchema)
export const parseGetRecruitingVacancyParams = Schema.decodeUnknown(GetRecruitingVacancyParamsSchema)
export const parseCreateRecruitingVacancyParams = Schema.decodeUnknown(CreateRecruitingVacancyParamsSchema)
export const parseUpdateRecruitingVacancyParams = Schema.decodeUnknown(UpdateRecruitingVacancyParamsSchema)
export const parseArchiveRecruitingVacancyParams = Schema.decodeUnknown(ArchiveRecruitingVacancyParamsSchema)
export const parseUnarchiveRecruitingVacancyParams = Schema.decodeUnknown(UnarchiveRecruitingVacancyParamsSchema)
export const parseListRecruitingCandidatesParams = Schema.decodeUnknown(ListRecruitingCandidatesParamsSchema)
export const parseGetRecruitingCandidateParams = Schema.decodeUnknown(GetRecruitingCandidateParamsSchema)
export const parseSetRecruitingCandidateProfileParams = Schema.decodeUnknown(SetRecruitingCandidateProfileParamsSchema)
export const parseListRecruitingSkillsParams = Schema.decodeUnknown(ListRecruitingSkillsParamsSchema)
export const parseListRecruitingCandidateSkillsParams = Schema.decodeUnknown(ListRecruitingCandidateSkillsParamsSchema)
export const parseAddRecruitingCandidateSkillParams = Schema.decodeUnknown(AddRecruitingCandidateSkillParamsSchema)
export const parseRemoveRecruitingCandidateSkillParams = Schema.decodeUnknown(
  RemoveRecruitingCandidateSkillParamsSchema
)
export const parseListRecruitingApplicantsParams = Schema.decodeUnknown(ListRecruitingApplicantsParamsSchema)
export const parseGetRecruitingApplicantParams = Schema.decodeUnknown(GetRecruitingApplicantParamsSchema)
export const parseCreateRecruitingApplicantParams = Schema.decodeUnknown(CreateRecruitingApplicantParamsSchema)
export const parseUpdateRecruitingApplicantParams = Schema.decodeUnknown(UpdateRecruitingApplicantParamsSchema)
export const parseDeleteRecruitingApplicantParams = Schema.decodeUnknown(DeleteRecruitingApplicantParamsSchema)
