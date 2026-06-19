import type { MarkupRef } from "@hcengineering/api-client"
import type { Person } from "@hcengineering/contact"
import type {
  Class,
  Doc,
  DocumentUpdate,
  MarkupBlobRef,
  Ref,
  Sequence,
  Status,
  StatusCategory
} from "@hcengineering/core"
import { SortingOrder } from "@hcengineering/core"
import type { ProjectType, ProjectTypeDescriptor } from "@hcengineering/task"
import { Effect, Schema } from "effect"

import {
  ApplicantId,
  ApplicantIdentifier as ApplicantIdentifierSchema,
  VacancyId,
  VacancyIdentifier as VacancyIdentifierSchema
} from "../../domain/schemas/recruiting-common.js"
import type {
  ApplicantIdentifier,
  ApplicantRef,
  RecruitingStatusSummary,
  VacancyIdentifier,
  VacancyRef,
  VacancyTypeSummary
} from "../../domain/schemas/recruiting-common.js"
import { Count, IssueStatusId, ProjectTypeId, StatusName } from "../../domain/schemas/shared.js"
import {
  StatusCategoryEntries,
  type StatusCategoryValue,
  UnknownStatusCategoryValue
} from "../../domain/schemas/task-management.js"
import { assertAt } from "../../utils/assertions.js"
import { normalizeForComparison } from "../../utils/normalize.js"
import type { HulyClient, HulyClientError } from "../client.js"
import type { Diagnostics } from "../diagnostics.js"
import {
  InvalidStatusError,
  RecruitingApplicantIdentifierAmbiguousError,
  RecruitingApplicantNotFoundError,
  RecruitingModelMissingError,
  RecruitingVacancyIdentifierAmbiguousError,
  RecruitingVacancyNotFoundError,
  RecruitingVacancyTypeNotFoundError
} from "../errors.js"
import { contact, core, task } from "../huly-plugins.js"
import { recruitIds } from "../recruit-plugin.js"
import type { Applicant, Candidate, Vacancy } from "../types/recruiting.js"
import { findStatusDocs, resolveByStatusRef, uniqueStatusRefs, workflowStatusFromRef } from "./issues-shared.js"
import { clampLimit, escapeLikeWildcards, hulyQuery, type StrictDocumentQuery } from "./query-helpers.js"
import { candidateEmail, toCandidateRef } from "./recruiting-candidate-shared.js"
import { toRef } from "./sdk-boundary.js"

const prefixedNumber = (identifier: string, prefix: "APP" | "VCN"): number | undefined => {
  const match = new RegExp(`^${prefix}-(\\d+)$`, "i").exec(identifier)
  return match === null ? undefined : Number(match[1])
}

export const vacancyIdentifierFromNumber = (number: number): VacancyIdentifier =>
  VacancyIdentifierSchema.make(`VCN-${number}`)

export const applicantIdentifierFromNumber = (number: number): ApplicantIdentifier =>
  ApplicantIdentifierSchema.make(`APP-${number}`)

export const toVacancyRef = (vacancy: Vacancy): VacancyRef => ({
  id: VacancyId.make(vacancy._id),
  identifier: vacancyIdentifierFromNumber(vacancy.number),
  name: vacancy.name,
  archived: vacancy.archived
})

const toApplicantRef = (
  applicant: Applicant,
  vacancy: Vacancy,
  candidate: Pick<Person, "_id" | "name">,
  statusName: string,
  email?: string
): ApplicantRef => ({
  id: ApplicantId.make(applicant._id),
  identifier: ApplicantIdentifierSchema.make(applicant.identifier),
  vacancy: toVacancyRef(vacancy),
  candidate: toCandidateRef(candidate, email),
  status: StatusName.make(statusName)
})

export const optionalCount = (value: number | undefined): Count | undefined =>
  value === undefined ? undefined : Count.make(value)

const statusCategoryValueFromRef = (category: Ref<StatusCategory> | undefined): StatusCategoryValue =>
  category === undefined
    ? UnknownStatusCategoryValue
    : StatusCategoryEntries.find((entry) => entry.ref === category)?.key ?? UnknownStatusCategoryValue

const workflowStatusFromDoc = (doc: Status): RecruitingStatusSummary => ({
  id: IssueStatusId.make(doc._id),
  name: StatusName.make(doc.name),
  category: statusCategoryValueFromRef(doc.category)
})

const workflowStatusSummaryFromRef = (statusRef: Ref<Status>): RecruitingStatusSummary => {
  const fallback = workflowStatusFromRef(statusRef)
  return {
    id: IssueStatusId.make(statusRef),
    name: StatusName.make(fallback.name),
    category: fallback.category
  }
}

const statusSummariesFromRefs = (
  statusRefs: ReadonlyArray<Ref<Status>>,
  statusDocs: ReadonlyArray<Status>
): ReadonlyArray<RecruitingStatusSummary> =>
  resolveByStatusRef(statusRefs, statusDocs, workflowStatusFromDoc, workflowStatusSummaryFromRef)

export const getVacancyStatuses = (
  client: HulyClient["Type"],
  vacancy: Vacancy
): Effect.Effect<ReadonlyArray<RecruitingStatusSummary>, HulyClientError | RecruitingModelMissingError, Diagnostics> =>
  Effect.gen(function*() {
    const projectType = yield* getVacancyTypeById(client, vacancy.type)
    const statusRefs = uniqueStatusRefs(projectType.statuses.map((status) => status._id))
    if (statusRefs.length === 0) {
      return yield* new RecruitingModelMissingError({
        message: `Vacancy type '${projectType.name}' has no applicant statuses`
      })
    }

    const statusDocs = yield* findStatusDocs(client, statusRefs)
    return statusSummariesFromRefs(statusRefs, statusDocs)
  })

export const resolveRecruitingStatusByName = (
  statuses: ReadonlyArray<RecruitingStatusSummary>,
  statusName: string,
  vacancyIdentifier: VacancyIdentifier
): Effect.Effect<Ref<Status>, InvalidStatusError> => {
  const normalizedInput = normalizeForComparison(statusName)
  const matchingStatus = statuses.find((status) => normalizeForComparison(status.name) === normalizedInput)
  return matchingStatus === undefined
    ? Effect.fail(new InvalidStatusError({ status: statusName, project: vacancyIdentifier }))
    : Effect.succeed(toRef<Status>(matchingStatus.id))
}

export const resolveDefaultRecruitingStatus = (
  statuses: ReadonlyArray<RecruitingStatusSummary>,
  vacancyIdentifier: VacancyIdentifier
): Effect.Effect<Ref<Status>, InvalidStatusError> => {
  const status = statuses.at(0)
  return status === undefined
    ? Effect.fail(new InvalidStatusError({ status: "(default)", project: vacancyIdentifier }))
    : Effect.succeed(toRef<Status>(status.id))
}

export const statusNameForApplicant = (
  statuses: ReadonlyArray<RecruitingStatusSummary>,
  statusId: Ref<Status>
): Effect.Effect<string, RecruitingModelMissingError> => {
  const status = statuses.find((candidate) => String(candidate.id) === String(statusId))
  return status === undefined
    ? Effect.fail(new RecruitingModelMissingError({ message: `Applicant references unknown status '${statusId}'` }))
    : Effect.succeed(status.name)
}

export const getVacancyTypeById = (
  client: HulyClient["Type"],
  typeId: Ref<ProjectType>
): Effect.Effect<ProjectType, HulyClientError | RecruitingModelMissingError> =>
  Effect.gen(function*() {
    const projectType = yield* client.findOne<ProjectType>(
      task.class.ProjectType,
      hulyQuery<ProjectType>({ _id: typeId })
    )
    if (projectType === undefined) {
      return yield* new RecruitingModelMissingError({
        message: `Recruiting vacancy type '${typeId}' is missing from the Huly model`
      })
    }
    return projectType
  })

export const resolveVacancyType = (
  client: HulyClient["Type"],
  identifier: string | undefined
): Effect.Effect<ProjectType, HulyClientError | RecruitingVacancyTypeNotFoundError> =>
  Effect.gen(function*() {
    const normalized = identifier?.trim()
    const defaultType = toRef<ProjectType>(recruitIds.template.DefaultVacancy)
    if (normalized === undefined || normalized === "") {
      const found = yield* client.findOne<ProjectType>(task.class.ProjectType, { _id: defaultType })
      if (found === undefined) {
        return yield* new RecruitingVacancyTypeNotFoundError({ identifier: "recruit:template:DefaultVacancy" })
      }
      return found
    }

    const byId = yield* client.findOne<ProjectType>(task.class.ProjectType, { _id: toRef<ProjectType>(normalized) })
    if (byId !== undefined) return byId

    const byName = yield* client.findOne<ProjectType>(
      task.class.ProjectType,
      hulyQuery<ProjectType>({
        descriptor: toRef<ProjectTypeDescriptor>(recruitIds.descriptors.VacancyType),
        name: normalized
      })
    )
    if (byName === undefined) {
      return yield* new RecruitingVacancyTypeNotFoundError({ identifier: normalized })
    }
    return byName
  })

export const toVacancyTypeSummary = (projectType: ProjectType): VacancyTypeSummary => ({
  id: ProjectTypeId.make(projectType._id),
  name: projectType.name,
  ...(projectType.shortDescription === undefined ? {} : { description: projectType.shortDescription }),
  default: String(projectType._id) === String(recruitIds.template.DefaultVacancy)
})

export const resolveVacancy = (
  client: HulyClient["Type"],
  identifier: VacancyIdentifier
): Effect.Effect<
  Vacancy,
  HulyClientError | RecruitingVacancyIdentifierAmbiguousError | RecruitingVacancyNotFoundError
> =>
  Effect.gen(function*() {
    const byId = yield* client.findOne<Vacancy>(
      recruitIds.class.Vacancy,
      hulyQuery<Vacancy>({ _id: toRef<Vacancy>(identifier) })
    )
    if (byId !== undefined) return byId

    const number = prefixedNumber(identifier, "VCN")
    if (number !== undefined) {
      const byNumber = yield* client.findOne<Vacancy>(recruitIds.class.Vacancy, hulyQuery<Vacancy>({ number }))
      if (byNumber !== undefined) return byNumber
    }

    const byName = yield* client.findAll<Vacancy>(recruitIds.class.Vacancy, hulyQuery<Vacancy>({ name: identifier }))
    if (byName.length === 0) {
      return yield* new RecruitingVacancyNotFoundError({ identifier })
    }
    if (byName.length > 1) {
      return yield* new RecruitingVacancyIdentifierAmbiguousError({
        identifier,
        matches: Count.make(byName.length)
      })
    }
    return assertAt(byName, 0)
  })

export const findApplicant = (
  client: HulyClient["Type"],
  applicantIdentifier: ApplicantIdentifier,
  vacancy?: Vacancy,
  candidate?: Person
): Effect.Effect<
  Applicant,
  HulyClientError | RecruitingApplicantIdentifierAmbiguousError | RecruitingApplicantNotFoundError
> =>
  Effect.gen(function*() {
    const byId = yield* client.findOne<Applicant>(
      recruitIds.class.Applicant,
      hulyQuery<Applicant>({ _id: toRef<Applicant>(applicantIdentifier) })
    )
    if (byId !== undefined) {
      const vacancyMatches = vacancy === undefined || byId.space === vacancy._id
      const candidateMatches = candidate === undefined || byId.attachedTo === toRef<Candidate>(candidate._id)
      if (vacancyMatches && candidateMatches) return byId
      return yield* new RecruitingApplicantNotFoundError({ identifier: applicantIdentifier })
    }

    const identifierFilter: StrictDocumentQuery<Applicant> = { identifier: applicantIdentifier }
    const filters: StrictDocumentQuery<Applicant> = {
      ...identifierFilter,
      ...(vacancy === undefined ? {} : { space: vacancy._id }),
      ...(candidate === undefined ? {} : { attachedTo: toRef<Candidate>(candidate._id) })
    }
    const applicants = yield* client.findAll<Applicant>(recruitIds.class.Applicant, hulyQuery(filters))
    if (applicants.length === 0) {
      return yield* new RecruitingApplicantNotFoundError({ identifier: applicantIdentifier })
    }
    if (applicants.length > 1) {
      return yield* new RecruitingApplicantIdentifierAmbiguousError({
        identifier: applicantIdentifier,
        matches: Count.make(applicants.length)
      })
    }
    return assertAt(applicants, 0)
  })

export const applicantRefFromDoc = (
  client: HulyClient["Type"],
  applicant: Applicant
): Effect.Effect<ApplicantRef, HulyClientError | RecruitingModelMissingError, Diagnostics> =>
  Effect.gen(function*() {
    const vacancy = yield* client.findOne<Vacancy>(recruitIds.class.Vacancy, { _id: applicant.space })
    const candidate = yield* client.findOne<Person>(contact.class.Person, { _id: toRef<Person>(applicant.attachedTo) })
    if (vacancy === undefined || candidate === undefined) {
      return yield* new RecruitingModelMissingError({
        message: `Applicant '${applicant.identifier}' references a missing vacancy or candidate`
      })
    }
    const statuses = yield* getVacancyStatuses(client, vacancy)
    const statusName = yield* statusNameForApplicant(statuses, applicant.status)
    const email = yield* candidateEmail(client, candidate._id)
    return toApplicantRef(applicant, vacancy, candidate, statusName, email)
  })

const TxIncResult = Schema.Struct({
  object: Schema.Struct({ sequence: Schema.Number })
})

const extractUpdatedSequence = (txResult: unknown): number | undefined => {
  const decoded = Schema.decodeUnknownOption(TxIncResult)(txResult)
  return decoded._tag === "Some" ? decoded.value.object.sequence : undefined
}

export const incrementSequence = (
  client: HulyClient["Type"],
  attachedTo: Ref<Class<Doc>>,
  label: string
): Effect.Effect<number, HulyClientError | RecruitingModelMissingError> =>
  Effect.gen(function*() {
    const sequence = yield* client.findOne<Sequence>(
      core.class.Sequence,
      hulyQuery<Sequence>({ attachedTo })
    )
    if (sequence === undefined) {
      return yield* new RecruitingModelMissingError({ message: `Recruiting ${label} sequence is missing` })
    }

    const update: DocumentUpdate<Sequence> = { $inc: { sequence: 1 } }
    const result = yield* client.updateDoc(core.class.Sequence, sequence.space, sequence._id, update, true)
    const number = extractUpdatedSequence(result)
    if (number === undefined) {
      return yield* new RecruitingModelMissingError({
        message: `Recruiting ${label} sequence increment did not return the updated value`
      })
    }
    return number
  })

export const markupRefAsBlobRef = (ref: MarkupRef): MarkupBlobRef => {
  // eslint-disable-next-line no-restricted-syntax -- SDK boundary: MarkupRef and MarkupBlobRef are opaque strings
  return ref as MarkupBlobRef
}

export const markupBlobRefAsMarkupRef = (ref: MarkupBlobRef): MarkupRef => {
  // eslint-disable-next-line no-restricted-syntax -- SDK boundary: MarkupRef and MarkupBlobRef are opaque strings
  return ref as MarkupRef
}

export const listLimit = clampLimit

export const vacancyNameSearchFilter = (query: string | undefined): StrictDocumentQuery<Vacancy> => {
  const search = query?.trim() ?? ""
  return search === "" ? {} : { name: { $like: `%${escapeLikeWildcards(search)}%` } }
}

export const sortByModifiedDescending = { sort: { modifiedOn: SortingOrder.Descending } }
