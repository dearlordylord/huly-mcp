import type { Organization } from "@hcengineering/contact"
import type { Data, DocumentUpdate, Ref } from "@hcengineering/core"
import { generateId, SortingOrder } from "@hcengineering/core"
import type { ProjectType, ProjectTypeDescriptor } from "@hcengineering/task"
import { Effect } from "effect"

import type {
  ListRecruitingVacanciesResult,
  ListRecruitingVacancyStatusesResult,
  ListRecruitingVacancyTypesResult,
  RecruitingVacancyMutationResult,
  VacancyDetail
} from "../../domain/schemas/recruiting-common.js"
import { VacancyId } from "../../domain/schemas/recruiting-common.js"
import type {
  ArchiveRecruitingVacancyParams,
  CreateRecruitingVacancyParams,
  GetRecruitingVacancyParams,
  ListRecruitingVacanciesParams,
  ListRecruitingVacancyStatusesParams,
  ListRecruitingVacancyTypesParams,
  UnarchiveRecruitingVacancyParams,
  UpdateRecruitingVacancyParams
} from "../../domain/schemas/recruiting.js"
import { Count, DocId, Timestamp } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type { Diagnostics } from "../diagnostics.js"
import type {
  OrganizationIdentifierAmbiguousError,
  OrganizationNotFoundError,
  RecruitingModelMissingError,
  RecruitingVacancyIdentifierAmbiguousError,
  RecruitingVacancyNotFoundError,
  RecruitingVacancyTypeNotFoundError
} from "../errors.js"
import { contact, core, task } from "../huly-plugins.js"
import { recruitIds } from "../recruit-plugin.js"
import type { Vacancy } from "../types/recruiting.js"
import { renderMarkdownPreservingNativeReferences } from "./native-reference-markup.js"
import { resolveOrganizationByIdentifier } from "./organization-resolvers.js"
import { hulyQuery, type StrictDocumentQuery } from "./query-helpers.js"
import {
  getVacancyStatuses,
  getVacancyTypeById,
  incrementSequence,
  listLimit,
  markupBlobRefAsMarkupRef,
  markupRefAsBlobRef,
  optionalCount,
  resolveVacancy,
  resolveVacancyType,
  sortByModifiedDescending,
  toVacancyRef,
  toVacancyTypeSummary,
  vacancyIdentifierFromNumber,
  vacancyNameSearchFilter
} from "./recruiting-shared.js"
import { toMixinRef, toRef } from "./sdk-boundary.js"

type ListVacancyTypesError = HulyClientError
type VacancyStatusError =
  | HulyClientError
  | RecruitingModelMissingError
  | RecruitingVacancyIdentifierAmbiguousError
  | RecruitingVacancyNotFoundError
type ListVacanciesError =
  | HulyClientError
  | OrganizationIdentifierAmbiguousError
  | OrganizationNotFoundError
  | RecruitingVacancyTypeNotFoundError
type VacancyGetError = VacancyStatusError
type VacancyCreateError =
  | HulyClientError
  | OrganizationIdentifierAmbiguousError
  | OrganizationNotFoundError
  | RecruitingModelMissingError
  | RecruitingVacancyTypeNotFoundError
type VacancyUpdateError =
  | HulyClientError
  | OrganizationIdentifierAmbiguousError
  | OrganizationNotFoundError
  | RecruitingVacancyIdentifierAmbiguousError
  | RecruitingVacancyNotFoundError
  | RecruitingVacancyTypeNotFoundError

const companySummary = (
  client: HulyClient["Type"],
  company: Ref<Organization> | undefined
) =>
  company === undefined
    ? Effect.succeed(undefined)
    : Effect.map(
      client.findOne<Organization>(contact.class.Organization, { _id: company }),
      (org) => org === undefined ? undefined : { id: DocId.make(org._id), name: org.name }
    )

const uploadFullDescription = (
  client: HulyClient["Type"],
  vacancyId: Ref<Vacancy>,
  fullDescription: string | undefined
) =>
  fullDescription === undefined || fullDescription.trim() === ""
    ? Effect.succeed(null)
    : Effect.gen(function*() {
      const rendered = renderMarkdownPreservingNativeReferences(fullDescription, client.markupUrlConfig)
      const ref = yield* client.uploadMarkup(
        recruitIds.class.Vacancy,
        vacancyId,
        "fullDescription",
        rendered.markup,
        rendered.format
      )
      return markupRefAsBlobRef(ref)
    })

const fetchFullDescription = (
  client: HulyClient["Type"],
  vacancy: Vacancy
) =>
  vacancy.fullDescription === null
    ? Effect.succeed(undefined)
    : client.fetchMarkup(
      recruitIds.class.Vacancy,
      vacancy._id,
      "fullDescription",
      markupBlobRefAsMarkupRef(vacancy.fullDescription),
      "markdown"
    )

const toVacancyDetail = (
  client: HulyClient["Type"],
  vacancy: Vacancy
): Effect.Effect<VacancyDetail, HulyClientError | RecruitingModelMissingError, Diagnostics> =>
  Effect.gen(function*() {
    const [type, fullDescription, company] = yield* Effect.all([
      getVacancyTypeById(client, vacancy.type),
      fetchFullDescription(client, vacancy),
      companySummary(client, vacancy.company)
    ])
    const applicants = optionalCount(vacancy.applications)
    const comments = optionalCount(vacancy.comments)
    const attachments = optionalCount(vacancy.attachments)

    return {
      ...toVacancyRef(vacancy),
      ...(vacancy.description === "" ? {} : { shortDescription: vacancy.description }),
      ...(fullDescription === undefined || fullDescription === "" ? {} : { fullDescription }),
      type: toVacancyTypeSummary(type),
      ...(company === undefined ? {} : { company }),
      ...(vacancy.location === undefined || vacancy.location === "" ? {} : { location: vacancy.location }),
      ...(vacancy.dueTo === undefined ? {} : { dueTo: Timestamp.make(vacancy.dueTo) }),
      private: vacancy.private,
      ...(applicants === undefined ? {} : { applicants }),
      ...(comments === undefined ? {} : { comments }),
      ...(attachments === undefined ? {} : { attachments }),
      modifiedOn: Timestamp.make(vacancy.modifiedOn),
      ...(vacancy.createdOn === undefined ? {} : { createdOn: Timestamp.make(vacancy.createdOn) })
    }
  })

export const listRecruitingVacancyTypes = (
  params: ListRecruitingVacancyTypesParams
): Effect.Effect<ListRecruitingVacancyTypesResult, ListVacancyTypesError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const types = yield* client.findAll<ProjectType>(
      task.class.ProjectType,
      hulyQuery<ProjectType>({ descriptor: toRef<ProjectTypeDescriptor>(recruitIds.descriptors.VacancyType) }),
      { limit: listLimit(params.limit), sort: { name: SortingOrder.Ascending } }
    )
    const summaries = types.map(toVacancyTypeSummary)
    return { types: summaries, total: Count.make(summaries.length) }
  })

export const listRecruitingVacancyStatuses = (
  params: ListRecruitingVacancyStatusesParams
): Effect.Effect<ListRecruitingVacancyStatusesResult, VacancyStatusError, HulyClient | Diagnostics> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const vacancy = yield* resolveVacancy(client, params.vacancy)
    const statuses = yield* getVacancyStatuses(client, vacancy)
    return { statuses: [...statuses], total: Count.make(statuses.length) }
  })

export const listRecruitingVacancies = (
  params: ListRecruitingVacanciesParams
): Effect.Effect<ListRecruitingVacanciesResult, ListVacanciesError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const typeFilter: StrictDocumentQuery<Vacancy> = params.type === undefined
      ? {}
      : { type: (yield* resolveVacancyType(client, params.type))._id }
    const companyFilter: StrictDocumentQuery<Vacancy> = params.company === undefined
      ? {}
      : { company: (yield* resolveOrganizationByIdentifier(client, params.company))._id }
    const query: StrictDocumentQuery<Vacancy> = {
      ...(params.includeArchived === true ? {} : { archived: false }),
      ...vacancyNameSearchFilter(params.query),
      ...typeFilter,
      ...companyFilter
    }

    const vacancies = yield* client.findAll<Vacancy>(
      recruitIds.class.Vacancy,
      hulyQuery(query),
      { limit: listLimit(params.limit), ...sortByModifiedDescending }
    )
    return { vacancies: vacancies.map(toVacancyRef), total: Count.make(vacancies.length) }
  })

export const getRecruitingVacancy = (
  params: GetRecruitingVacancyParams
): Effect.Effect<VacancyDetail, VacancyGetError, HulyClient | Diagnostics> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    return yield* toVacancyDetail(client, yield* resolveVacancy(client, params.vacancy))
  })

export const createRecruitingVacancy = (
  params: CreateRecruitingVacancyParams
): Effect.Effect<RecruitingVacancyMutationResult, VacancyCreateError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const type = yield* resolveVacancyType(client, params.type)
    const company = params.company === undefined
      ? undefined
      : (yield* resolveOrganizationByIdentifier(client, params.company))._id
    const vacancyId = generateId<Vacancy>()
    const number = yield* incrementSequence(client, recruitIds.class.Vacancy, "vacancy")
    const fullDescription = yield* uploadFullDescription(client, vacancyId, params.fullDescription)
    const accountUuid = client.getAccountUuid()
    const data: Data<Vacancy> = {
      name: params.name,
      description: params.shortDescription ?? type.shortDescription ?? "",
      fullDescription,
      dueTo: params.dueTo,
      location: params.location,
      company,
      number,
      archived: false,
      private: params.private ?? false,
      members: [accountUuid],
      owners: [accountUuid],
      autoJoin: type.autoJoin ?? false,
      type: type._id
    }

    yield* client.createDoc(recruitIds.class.Vacancy, core.space.Space, data, vacancyId)
    yield* client.createMixin(
      vacancyId,
      recruitIds.class.Vacancy,
      core.space.Space,
      toMixinRef<Vacancy>(String(type.targetClass)),
      {}
    )

    return {
      vacancy: {
        id: VacancyId.make(vacancyId),
        identifier: vacancyIdentifierFromNumber(number),
        name: data.name,
        archived: false
      }
    }
  })

const buildVacancyUpdate = (
  client: HulyClient["Type"],
  params: UpdateRecruitingVacancyParams,
  vacancy: Vacancy
): Effect.Effect<
  DocumentUpdate<Vacancy>,
  | HulyClientError
  | OrganizationIdentifierAmbiguousError
  | OrganizationNotFoundError
  | RecruitingVacancyTypeNotFoundError
> =>
  Effect.gen(function*() {
    const clearFields = {
      ...(params.company === null ? { company: "" } : {}),
      ...(params.dueTo === null ? { dueTo: "" } : {})
    }
    return {
      ...(params.name === undefined ? {} : { name: params.name }),
      ...(params.shortDescription === undefined ? {} : { description: params.shortDescription }),
      ...(params.fullDescription === undefined
        ? {}
        : {
          fullDescription: params.fullDescription === null || params.fullDescription.trim() === ""
            ? null
            : yield* uploadFullDescription(client, vacancy._id, params.fullDescription)
        }),
      ...(params.type === undefined ? {} : { type: (yield* resolveVacancyType(client, params.type))._id }),
      ...(params.company === undefined
        ? {}
        : params.company === null
        ? {}
        : { company: (yield* resolveOrganizationByIdentifier(client, params.company))._id }),
      ...(params.location === undefined ? {} : { location: params.location ?? "" }),
      ...(params.dueTo === undefined || params.dueTo === null ? {} : { dueTo: params.dueTo }),
      ...(params.private === undefined ? {} : { private: params.private }),
      ...(Object.keys(clearFields).length === 0 ? {} : { $unset: clearFields })
    }
  })

export const updateRecruitingVacancy = (
  params: UpdateRecruitingVacancyParams
): Effect.Effect<RecruitingVacancyMutationResult, VacancyUpdateError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const vacancy = yield* resolveVacancy(client, params.vacancy)
    const update = yield* buildVacancyUpdate(client, params, vacancy)
    yield* client.updateDoc(recruitIds.class.Vacancy, vacancy.space, vacancy._id, update)
    return { vacancy: toVacancyRef({ ...vacancy, ...update }) }
  })

const setVacancyArchiveState = (
  vacancyIdentifier: GetRecruitingVacancyParams["vacancy"],
  archived: boolean
): Effect.Effect<RecruitingVacancyMutationResult, VacancyUpdateError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const vacancy = yield* resolveVacancy(client, vacancyIdentifier)
    yield* client.updateDoc(recruitIds.class.Vacancy, vacancy.space, vacancy._id, { archived })
    return { vacancy: toVacancyRef({ ...vacancy, archived }) }
  })

export const archiveRecruitingVacancy = (
  params: ArchiveRecruitingVacancyParams
): Effect.Effect<RecruitingVacancyMutationResult, VacancyUpdateError, HulyClient> =>
  setVacancyArchiveState(params.vacancy, true)

export const unarchiveRecruitingVacancy = (
  params: UnarchiveRecruitingVacancyParams
): Effect.Effect<RecruitingVacancyMutationResult, VacancyUpdateError, HulyClient> =>
  setVacancyArchiveState(params.vacancy, false)
