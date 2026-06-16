import type { Employee } from "@hcengineering/contact"
import type { AttachedData, Ref } from "@hcengineering/core"
import { generateId, SortingOrder } from "@hcengineering/core"
import { makeRank } from "@hcengineering/rank"
import type { TaskType } from "@hcengineering/task"
import { Effect } from "effect"

import type {
  ApplicantDetail,
  DeleteRecruitingApplicantResult,
  ListRecruitingApplicantsResult,
  RecruitingApplicantMutationResult
} from "../../domain/schemas/recruiting-common.js"
import {
  ApplicantId,
  ApplicantIdentifier as ApplicantIdentifierSchema
} from "../../domain/schemas/recruiting-common.js"
import type {
  CreateRecruitingApplicantParams,
  DeleteRecruitingApplicantParams,
  GetRecruitingApplicantParams,
  ListRecruitingApplicantsParams,
  UpdateRecruitingApplicantParams
} from "../../domain/schemas/recruiting.js"
import { Count, StatusName, Timestamp } from "../../domain/schemas/shared.js"
import { normalizeForComparison } from "../../utils/normalize.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type { Diagnostics } from "../diagnostics.js"
import type {
  InvalidStatusError,
  PersonIdentifierAmbiguousError,
  RecruitingApplicantIdentifierAmbiguousError,
  RecruitingApplicantNotFoundError,
  RecruitingVacancyIdentifierAmbiguousError,
  RecruitingVacancyNotFoundError
} from "../errors.js"
import {
  PersonNotAnEmployeeError,
  PersonNotFoundError,
  RecruitingDuplicateApplicantError,
  RecruitingModelMissingError,
  RecruitingMutationUnsupportedError
} from "../errors.js"
import { contact } from "../huly-plugins.js"
import { recruitIds } from "../recruit-plugin.js"
import type { Applicant, Candidate, Vacancy } from "../types/recruiting.js"
import { findPersonByExactEmailOrName } from "./contacts-shared.js"
import { hulyQuery, type StrictDocumentQuery } from "./query-helpers.js"
import {
  candidateEmail,
  ensureCandidateMixin,
  findPersonByApplicantAssignee,
  resolveCandidatePerson,
  toCandidateRef
} from "./recruiting-candidate-shared.js"
import {
  applicantIdentifierFromNumber,
  applicantRefFromDoc,
  findApplicant,
  getVacancyStatuses,
  incrementSequence,
  listLimit,
  resolveDefaultRecruitingStatus,
  resolveRecruitingStatusByName,
  resolveVacancy,
  statusNameForApplicant,
  toVacancyRef
} from "./recruiting-shared.js"
import { toRef } from "./sdk-boundary.js"

type ApplicantReadError =
  | HulyClientError
  | InvalidStatusError
  | PersonIdentifierAmbiguousError
  | PersonNotFoundError
  | RecruitingApplicantIdentifierAmbiguousError
  | RecruitingApplicantNotFoundError
  | RecruitingModelMissingError
  | RecruitingVacancyIdentifierAmbiguousError
  | RecruitingVacancyNotFoundError
type ApplicantCreateError =
  | HulyClientError
  | InvalidStatusError
  | PersonIdentifierAmbiguousError
  | PersonNotAnEmployeeError
  | PersonNotFoundError
  | RecruitingDuplicateApplicantError
  | RecruitingModelMissingError
  | RecruitingVacancyIdentifierAmbiguousError
  | RecruitingVacancyNotFoundError
type ApplicantUpdateError = ApplicantReadError | PersonNotAnEmployeeError
type ApplicantDeleteError = ApplicantReadError | RecruitingMutationUnsupportedError

const resolveOptionalVacancy = (
  client: HulyClient["Type"],
  identifier: ListRecruitingApplicantsParams["vacancy"]
) => identifier === undefined ? Effect.succeed(undefined) : resolveVacancy(client, identifier)

const resolveOptionalCandidate = (
  client: HulyClient["Type"],
  identifier: ListRecruitingApplicantsParams["candidate"]
) => identifier === undefined ? Effect.succeed(undefined) : resolveCandidatePerson(client, identifier)

const resolveAssignee = (
  client: HulyClient["Type"],
  assignee: NonNullable<CreateRecruitingApplicantParams["assignee"]>
): Effect.Effect<
  Ref<Employee>,
  HulyClientError | PersonIdentifierAmbiguousError | PersonNotAnEmployeeError | PersonNotFoundError
> =>
  Effect.gen(function*() {
    const byId = yield* client.findOne<Employee>(
      contact.mixin.Employee,
      hulyQuery<Employee>({ _id: toRef<Employee>(assignee) })
    )
    if (byId !== undefined) return byId._id

    const person = yield* findPersonByExactEmailOrName(client, assignee)
    if (person === undefined) {
      return yield* new PersonNotFoundError({ identifier: assignee })
    }

    const employee = yield* client.findOne<Employee>(
      contact.mixin.Employee,
      hulyQuery<Employee>({ _id: toRef<Employee>(person._id) })
    )
    if (employee === undefined) {
      return yield* new PersonNotAnEmployeeError({ identifier: assignee })
    }
    return employee._id
  })

const applicantStatusFilter = (
  client: HulyClient["Type"],
  vacancy: Vacancy | undefined,
  status: ListRecruitingApplicantsParams["status"]
) =>
  status === undefined || vacancy === undefined
    ? Effect.succeed({})
    : Effect.gen(function*() {
      const statuses = yield* getVacancyStatuses(client, vacancy)
      return { status: yield* resolveRecruitingStatusByName(statuses, status, toVacancyRef(vacancy).identifier) }
    })

const applicantMatchesStatusName = (
  statusName: string | undefined,
  requested: ListRecruitingApplicantsParams["status"]
): boolean =>
  requested === undefined
  || (statusName !== undefined && normalizeForComparison(statusName) === normalizeForComparison(requested))

const applicantDetail = (
  client: HulyClient["Type"],
  applicant: Applicant
): Effect.Effect<ApplicantDetail, HulyClientError | RecruitingModelMissingError, Diagnostics> =>
  Effect.gen(function*() {
    const ref = yield* applicantRefFromDoc(client, applicant)
    const assignee = yield* findPersonByApplicantAssignee(client, applicant.assignee)
    return {
      ...ref,
      ...(assignee === undefined ? {} : { assignee }),
      ...(applicant.startDate === null ? {} : { startDate: Timestamp.make(applicant.startDate) }),
      ...(applicant.dueDate === null ? {} : { dueDate: Timestamp.make(applicant.dueDate) }),
      modifiedOn: Timestamp.make(applicant.modifiedOn),
      ...(applicant.createdOn === undefined ? {} : { createdOn: Timestamp.make(applicant.createdOn) })
    }
  })

const resolveApplicantLocator = (
  client: HulyClient["Type"],
  params: GetRecruitingApplicantParams
): Effect.Effect<
  Applicant,
  | HulyClientError
  | PersonIdentifierAmbiguousError
  | PersonNotFoundError
  | RecruitingApplicantIdentifierAmbiguousError
  | RecruitingApplicantNotFoundError
  | RecruitingVacancyIdentifierAmbiguousError
  | RecruitingVacancyNotFoundError
> =>
  Effect.gen(function*() {
    const vacancy = yield* resolveOptionalVacancy(client, params.vacancy)
    const candidate = yield* resolveOptionalCandidate(client, params.candidate)
    return yield* findApplicant(client, params.applicant, vacancy, candidate)
  })

export const listRecruitingApplicants = (
  params: ListRecruitingApplicantsParams
): Effect.Effect<ListRecruitingApplicantsResult, ApplicantReadError, HulyClient | Diagnostics> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const vacancy = yield* resolveOptionalVacancy(client, params.vacancy)
    const candidate = yield* resolveOptionalCandidate(client, params.candidate)
    const statusFilter = yield* applicantStatusFilter(client, vacancy, params.status)
    const requiresInMemoryStatusFilter = params.status !== undefined && vacancy === undefined
    const limit = listLimit(params.limit)
    const query: StrictDocumentQuery<Applicant> = {
      ...(vacancy === undefined ? {} : { space: vacancy._id }),
      ...(candidate === undefined ? {} : { attachedTo: toRef<Candidate>(candidate._id) }),
      ...statusFilter
    }
    const applicants = yield* client.findAll<Applicant>(
      recruitIds.class.Applicant,
      hulyQuery(query),
      {
        ...(requiresInMemoryStatusFilter ? {} : { limit }),
        sort: { modifiedOn: SortingOrder.Descending }
      }
    )
    const refs = yield* Effect.forEach(applicants, (applicant) =>
      Effect.gen(function*() {
        const ref = yield* applicantRefFromDoc(client, applicant)
        return applicantMatchesStatusName(ref.status, params.status) ? ref : undefined
      }))
    const items = refs.filter((ref) => ref !== undefined).slice(0, limit)
    return { applicants: items, total: Count.make(items.length) }
  })

export const getRecruitingApplicant = (
  params: GetRecruitingApplicantParams
): Effect.Effect<ApplicantDetail, ApplicantReadError, HulyClient | Diagnostics> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    return yield* applicantDetail(client, yield* resolveApplicantLocator(client, params))
  })

export const createRecruitingApplicant = (
  params: CreateRecruitingApplicantParams
): Effect.Effect<RecruitingApplicantMutationResult, ApplicantCreateError, HulyClient | Diagnostics> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const vacancy = yield* resolveVacancy(client, params.vacancy)
    const person = yield* resolveCandidatePerson(client, params.candidate)
    const duplicate = yield* client.findOne<Applicant>(
      recruitIds.class.Applicant,
      hulyQuery<Applicant>({ space: vacancy._id, attachedTo: toRef<Candidate>(person._id) })
    )
    if (duplicate !== undefined) {
      return yield* new RecruitingDuplicateApplicantError({ vacancy: params.vacancy, candidate: params.candidate })
    }

    const statuses = yield* getVacancyStatuses(client, vacancy)
    const status = params.status === undefined
      ? yield* resolveDefaultRecruitingStatus(statuses, toVacancyRef(vacancy).identifier)
      : yield* resolveRecruitingStatusByName(statuses, params.status, toVacancyRef(vacancy).identifier)
    const statusName = yield* statusNameForApplicant(statuses, status)
    const assignee = params.assignee === undefined ? null : yield* resolveAssignee(client, params.assignee)
    const number = yield* incrementSequence(client, recruitIds.class.Applicant, "applicant")
    const identifier = applicantIdentifierFromNumber(number)
    const applicantId = generateId<Applicant>()
    const { candidate } = yield* ensureCandidateMixin(client, person, {})
    const lastApplicant = yield* client.findOne<Applicant>(
      recruitIds.class.Applicant,
      hulyQuery<Applicant>({ space: vacancy._id }),
      { sort: { rank: SortingOrder.Descending } }
    )
    const data: AttachedData<Applicant> = {
      status,
      number,
      identifier,
      rank: makeRank(lastApplicant?.rank, undefined),
      assignee,
      startDate: params.startDate ?? null,
      dueDate: params.dueDate ?? null,
      kind: toRef<TaskType>(recruitIds.taskTypes.Applicant),
      isDone: false
    }
    yield* client.addCollection(
      recruitIds.class.Applicant,
      vacancy._id,
      person._id,
      recruitIds.mixin.Candidate,
      "applications",
      data,
      applicantId
    )
    const email = yield* candidateEmail(client, person._id)
    return {
      applicant: {
        id: ApplicantId.make(applicantId),
        identifier: ApplicantIdentifierSchema.make(identifier),
        vacancy: toVacancyRef(vacancy),
        candidate: toCandidateRef(candidate, email),
        status: StatusName.make(statusName)
      }
    }
  })

const buildApplicantUpdate = (
  client: HulyClient["Type"],
  applicant: Applicant,
  params: UpdateRecruitingApplicantParams
): Effect.Effect<
  Partial<Pick<Applicant, "assignee" | "dueDate" | "startDate" | "status">>,
  ApplicantUpdateError,
  Diagnostics
> =>
  Effect.gen(function*() {
    const vacancy = yield* client.findOne<Vacancy>(recruitIds.class.Vacancy, { _id: applicant.space })
    if (vacancy === undefined) {
      return yield* new RecruitingModelMissingError({
        message: `Applicant '${applicant.identifier}' references missing vacancy '${applicant.space}'`
      })
    }
    const status = params.status === undefined
      ? {}
      : {
        status: yield* resolveRecruitingStatusByName(
          yield* getVacancyStatuses(client, vacancy),
          params.status,
          toVacancyRef(vacancy).identifier
        )
      }
    const assignee = params.assignee === undefined
      ? {}
      : { assignee: params.assignee === null ? null : yield* resolveAssignee(client, params.assignee) }
    return {
      ...status,
      ...assignee,
      ...(params.startDate === undefined ? {} : { startDate: params.startDate }),
      ...(params.dueDate === undefined ? {} : { dueDate: params.dueDate })
    }
  })

export const updateRecruitingApplicant = (
  params: UpdateRecruitingApplicantParams
): Effect.Effect<RecruitingApplicantMutationResult, ApplicantUpdateError, HulyClient | Diagnostics> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const applicant = yield* resolveApplicantLocator(client, params)
    const update = yield* buildApplicantUpdate(client, applicant, params)
    yield* client.updateDoc(recruitIds.class.Applicant, applicant.space, applicant._id, update)
    return { applicant: yield* applicantRefFromDoc(client, { ...applicant, ...update }) }
  })

export const deleteRecruitingApplicant = (
  params: DeleteRecruitingApplicantParams
): Effect.Effect<DeleteRecruitingApplicantResult, ApplicantDeleteError, HulyClient | Diagnostics> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const removeCollection = client.removeCollection
    if (removeCollection === undefined) {
      return yield* new RecruitingMutationUnsupportedError({
        message: "Huly client does not support removeCollection; applicant deletion is unavailable"
      })
    }
    const applicant = yield* resolveApplicantLocator(client, params)
    const ref = yield* applicantRefFromDoc(client, applicant)
    yield* removeCollection(
      recruitIds.class.Applicant,
      applicant.space,
      applicant._id,
      applicant.attachedTo,
      recruitIds.mixin.Candidate,
      "applications"
    )
    return { applicant: ref, deleted: true }
  })
