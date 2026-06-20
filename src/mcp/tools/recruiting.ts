import {
  ApplicantDetailSchema,
  CandidateDetailSchema,
  DeleteRecruitingApplicantResultSchema,
  ListRecruitingApplicantsResultSchema,
  ListRecruitingCandidateSkillsResultSchema,
  ListRecruitingCandidatesResultSchema,
  ListRecruitingSkillsResultSchema,
  ListRecruitingVacanciesResultSchema,
  ListRecruitingVacancyStatusesResultSchema,
  ListRecruitingVacancyTypesResultSchema,
  RecruitingApplicantMutationResultSchema,
  RecruitingCandidateMutationResultSchema,
  RecruitingSkillAttachResultSchema,
  RecruitingSkillDetachResultSchema,
  RecruitingVacancyMutationResultSchema,
  VacancyDetailSchema
} from "../../domain/schemas/recruiting-common.js"
import {
  addRecruitingCandidateSkillParamsJsonSchema,
  archiveRecruitingVacancyParamsJsonSchema,
  createRecruitingApplicantParamsJsonSchema,
  createRecruitingVacancyParamsJsonSchema,
  deleteRecruitingApplicantParamsJsonSchema,
  getRecruitingApplicantParamsJsonSchema,
  getRecruitingCandidateParamsJsonSchema,
  getRecruitingVacancyParamsJsonSchema,
  listRecruitingApplicantsParamsJsonSchema,
  listRecruitingCandidateSkillsParamsJsonSchema,
  listRecruitingCandidatesParamsJsonSchema,
  listRecruitingSkillsParamsJsonSchema,
  listRecruitingVacanciesParamsJsonSchema,
  listRecruitingVacancyStatusesParamsJsonSchema,
  listRecruitingVacancyTypesParamsJsonSchema,
  parseAddRecruitingCandidateSkillParams,
  parseArchiveRecruitingVacancyParams,
  parseCreateRecruitingApplicantParams,
  parseCreateRecruitingVacancyParams,
  parseDeleteRecruitingApplicantParams,
  parseGetRecruitingApplicantParams,
  parseGetRecruitingCandidateParams,
  parseGetRecruitingVacancyParams,
  parseListRecruitingApplicantsParams,
  parseListRecruitingCandidateSkillsParams,
  parseListRecruitingCandidatesParams,
  parseListRecruitingSkillsParams,
  parseListRecruitingVacanciesParams,
  parseListRecruitingVacancyStatusesParams,
  parseListRecruitingVacancyTypesParams,
  parseRemoveRecruitingCandidateSkillParams,
  parseSetRecruitingCandidateProfileParams,
  parseUnarchiveRecruitingVacancyParams,
  parseUpdateRecruitingApplicantParams,
  parseUpdateRecruitingVacancyParams,
  removeRecruitingCandidateSkillParamsJsonSchema,
  setRecruitingCandidateProfileParamsJsonSchema,
  unarchiveRecruitingVacancyParamsJsonSchema,
  updateRecruitingApplicantParamsJsonSchema,
  updateRecruitingVacancyParamsJsonSchema
} from "../../domain/schemas/recruiting.js"
import {
  createRecruitingApplicant,
  deleteRecruitingApplicant,
  getRecruitingApplicant,
  listRecruitingApplicants,
  updateRecruitingApplicant
} from "../../huly/operations/recruiting-applicants.js"
import {
  addRecruitingCandidateSkill,
  getRecruitingCandidate,
  listRecruitingCandidates,
  listRecruitingCandidateSkills,
  listRecruitingSkills,
  removeRecruitingCandidateSkill,
  setRecruitingCandidateProfile
} from "../../huly/operations/recruiting-candidates.js"
import {
  archiveRecruitingVacancy,
  createRecruitingVacancy,
  getRecruitingVacancy,
  listRecruitingVacancies,
  listRecruitingVacancyStatuses,
  listRecruitingVacancyTypes,
  unarchiveRecruitingVacancy,
  updateRecruitingVacancy
} from "../../huly/operations/recruiting-vacancies.js"
import { recruitingExtendedTools } from "./recruiting-extended.js"
import { recruitingMediaTools } from "./recruiting-media.js"
import { defineTool, type RegisteredTool } from "./registry.js"
const CATEGORY = "recruiting" as const
export const recruitingTools: ReadonlyArray<RegisteredTool> = [
  defineTool(
    {
      name: "list_recruiting_vacancy_types",
      description:
        "List Huly Recruiting vacancy workflow types. Use the returned type ID or exact type name in create_recruiting_vacancy. Defaults vacancy creation to Huly's Default vacancy type when omitted.",
      category: CATEGORY,
      inputSchema: listRecruitingVacancyTypesParamsJsonSchema,
      resultSchema: ListRecruitingVacancyTypesResultSchema
    },
    parseListRecruitingVacancyTypesParams,
    listRecruitingVacancyTypes
  ),
  defineTool(
    {
      name: "list_recruiting_vacancy_statuses",
      description:
        "List applicant workflow statuses for one vacancy. vacancy accepts raw _id, VCN-<number>, bare number, or exact name. Statuses are read from the vacancy's ProjectType; they are workspace data, not hardcoded names.",
      category: CATEGORY,
      inputSchema: listRecruitingVacancyStatusesParamsJsonSchema,
      resultSchema: ListRecruitingVacancyStatusesResultSchema
    },
    parseListRecruitingVacancyStatusesParams,
    listRecruitingVacancyStatuses
  ),
  defineTool(
    {
      name: "list_recruiting_vacancies",
      description:
        "List Recruiting vacancies as stable refs. Supports includeArchived, name query, type ID/name, company organization ID/name, and limit. Vacancy refs include both raw id and derived VCN-<number> identifier.",
      category: CATEGORY,
      inputSchema: listRecruitingVacanciesParamsJsonSchema,
      resultSchema: ListRecruitingVacanciesResultSchema
    },
    parseListRecruitingVacanciesParams,
    listRecruitingVacancies
  ),
  defineTool(
    {
      name: "get_recruiting_vacancy",
      description:
        "Get one Recruiting vacancy by raw _id, VCN-<number>, bare number, or exact name. Returns descriptions, type, company, location, due date, privacy, archive state, and existing counts.",
      category: CATEGORY,
      inputSchema: getRecruitingVacancyParamsJsonSchema,
      resultSchema: VacancyDetailSchema
    },
    parseGetRecruitingVacancyParams,
    getRecruitingVacancy
  ),
  defineTool(
    {
      name: "create_recruiting_vacancy",
      description:
        "Create a Recruiting vacancy like the Huly UI: increments the vacancy sequence, stores fullDescription as markdown-backed collaborative markup, defaults members/owners to the current account, and creates vacancy type-data mixin {}.",
      category: CATEGORY,
      inputSchema: createRecruitingVacancyParamsJsonSchema,
      resultSchema: RecruitingVacancyMutationResultSchema
    },
    parseCreateRecruitingVacancyParams,
    createRecruitingVacancy
  ),
  defineTool(
    {
      name: "update_recruiting_vacancy",
      description:
        "Update mutable Recruiting vacancy fields. vacancy accepts raw _id, VCN-<number>, bare number, or exact name. Provide at least one field. Pass null for fullDescription, company, location, or dueTo to clear.",
      category: CATEGORY,
      inputSchema: updateRecruitingVacancyParamsJsonSchema,
      resultSchema: RecruitingVacancyMutationResultSchema
    },
    parseUpdateRecruitingVacancyParams,
    updateRecruitingVacancy
  ),
  defineTool(
    {
      name: "archive_recruiting_vacancy",
      description: "Archive a Recruiting vacancy by raw _id, VCN-<number>, bare number, or exact name.",
      category: CATEGORY,
      inputSchema: archiveRecruitingVacancyParamsJsonSchema,
      resultSchema: RecruitingVacancyMutationResultSchema
    },
    parseArchiveRecruitingVacancyParams,
    archiveRecruitingVacancy
  ),
  defineTool(
    {
      name: "unarchive_recruiting_vacancy",
      description: "Unarchive a Recruiting vacancy by raw _id, VCN-<number>, bare number, or exact name.",
      category: CATEGORY,
      inputSchema: unarchiveRecruitingVacancyParamsJsonSchema,
      resultSchema: RecruitingVacancyMutationResultSchema
    },
    parseUnarchiveRecruitingVacancyParams,
    unarchiveRecruitingVacancy
  ),
  defineTool(
    {
      name: "list_recruiting_candidates",
      description:
        "List persons that already have the Recruiting Candidate mixin. Use set_recruiting_candidate_profile, add_recruiting_candidate_skill, or create_recruiting_applicant to recruit-enable an existing person.",
      category: CATEGORY,
      inputSchema: listRecruitingCandidatesParamsJsonSchema,
      resultSchema: ListRecruitingCandidatesResultSchema
    },
    parseListRecruitingCandidatesParams,
    listRecruitingCandidates
  ),
  defineTool(
    {
      name: "get_recruiting_candidate",
      description:
        "Get one Recruiting candidate by person _id, email, or exact display name. Returns profile fields, skills, application/review counts, and primary email when available.",
      category: CATEGORY,
      inputSchema: getRecruitingCandidateParamsJsonSchema,
      resultSchema: CandidateDetailSchema
    },
    parseGetRecruitingCandidateParams,
    getRecruitingCandidate
  ),
  defineTool(
    {
      name: "set_recruiting_candidate_profile",
      description:
        "Create or update the Recruiting Candidate profile mixin on an existing person. candidate accepts person _id, email, or exact display name. Provide at least one of title, source, onsite, remote.",
      category: CATEGORY,
      inputSchema: setRecruitingCandidateProfileParamsJsonSchema,
      resultSchema: RecruitingCandidateMutationResultSchema
    },
    parseSetRecruitingCandidateProfileParams,
    setRecruitingCandidateProfile
  ),
  defineTool(
    {
      name: "list_recruiting_skills",
      description:
        "List Recruiting skill tag definitions. Skills are Huly tags scoped to targetClass recruit:mixin:Candidate; use returned titles or IDs with candidate skill tools.",
      category: CATEGORY,
      inputSchema: listRecruitingSkillsParamsJsonSchema,
      resultSchema: ListRecruitingSkillsResultSchema
    },
    parseListRecruitingSkillsParams,
    listRecruitingSkills
  ),
  defineTool(
    {
      name: "list_recruiting_candidate_skills",
      description:
        "List skill tag references attached to one Recruiting candidate by person _id, email, or exact name.",
      category: CATEGORY,
      inputSchema: listRecruitingCandidateSkillsParamsJsonSchema,
      resultSchema: ListRecruitingCandidateSkillsResultSchema
    },
    parseListRecruitingCandidateSkillsParams,
    listRecruitingCandidateSkills
  ),
  defineTool(
    {
      name: "add_recruiting_candidate_skill",
      description:
        "Attach a skill to a candidate. candidate accepts person _id, email, or exact name. skill accepts title or tag ID; missing skill titles are created. Optional category/color apply only to newly created skill tags.",
      category: CATEGORY,
      inputSchema: addRecruitingCandidateSkillParamsJsonSchema,
      resultSchema: RecruitingSkillAttachResultSchema
    },
    parseAddRecruitingCandidateSkillParams,
    addRecruitingCandidateSkill
  ),
  defineTool(
    {
      name: "remove_recruiting_candidate_skill",
      description:
        "Detach a Recruiting skill from a candidate by skill title or tag ID. Idempotent when the skill is absent.",
      category: CATEGORY,
      inputSchema: removeRecruitingCandidateSkillParamsJsonSchema,
      resultSchema: RecruitingSkillDetachResultSchema
    },
    parseRemoveRecruitingCandidateSkillParams,
    removeRecruitingCandidateSkill
  ),
  defineTool(
    {
      name: "list_recruiting_applicants",
      description:
        "List Recruiting applicants. Optionally filter by vacancy, candidate, and status. vacancy accepts raw _id/VCN-number/number/name; candidate accepts person _id/email/exact name.",
      category: CATEGORY,
      inputSchema: listRecruitingApplicantsParamsJsonSchema,
      resultSchema: ListRecruitingApplicantsResultSchema
    },
    parseListRecruitingApplicantsParams,
    listRecruitingApplicants
  ),
  defineTool(
    {
      name: "get_recruiting_applicant",
      description:
        "Get one Recruiting applicant by raw _id, APP-<number>, or bare number. Pass vacancy and/or candidate when an APP number could be ambiguous.",
      category: CATEGORY,
      inputSchema: getRecruitingApplicantParamsJsonSchema,
      resultSchema: ApplicantDetailSchema
    },
    parseGetRecruitingApplicantParams,
    getRecruitingApplicant
  ),
  defineTool(
    {
      name: "create_recruiting_applicant",
      description:
        "Create an applicant linking one vacancy and candidate. Rejects duplicate vacancy/candidate pairs, increments APP sequence, resolves status from that vacancy workflow, and recruit-enables the person if needed.",
      category: CATEGORY,
      inputSchema: createRecruitingApplicantParamsJsonSchema,
      resultSchema: RecruitingApplicantMutationResultSchema
    },
    parseCreateRecruitingApplicantParams,
    createRecruitingApplicant
  ),
  defineTool(
    {
      name: "update_recruiting_applicant",
      description:
        "Update applicant status, assignee, startDate, and/or dueDate. applicant accepts raw _id, APP-<number>, or number; vacancy/candidate only disambiguate. Pass null to clear assignee, startDate, or dueDate.",
      category: CATEGORY,
      inputSchema: updateRecruitingApplicantParamsJsonSchema,
      resultSchema: RecruitingApplicantMutationResultSchema
    },
    parseUpdateRecruitingApplicantParams,
    updateRecruitingApplicant
  ),
  defineTool(
    {
      name: "delete_recruiting_applicant",
      description:
        "Delete an applicant with Huly removeCollection. applicant accepts raw _id, APP-<number>, or number; vacancy/candidate can disambiguate APP numbers.",
      category: CATEGORY,
      inputSchema: deleteRecruitingApplicantParamsJsonSchema,
      annotations: { destructiveHint: true, idempotentHint: false },
      resultSchema: DeleteRecruitingApplicantResultSchema
    },
    parseDeleteRecruitingApplicantParams,
    deleteRecruitingApplicant
  ),
  ...recruitingExtendedTools,
  ...recruitingMediaTools
]
