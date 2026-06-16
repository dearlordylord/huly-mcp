/* eslint-disable no-restricted-syntax -- test fixtures bridge Huly SDK phantom refs and generic client operation signatures */
import { describe, it } from "@effect/vitest"
import {
  AvatarType,
  type Channel,
  type Employee,
  type Organization,
  type Person,
  type SocialIdentity
} from "@hcengineering/contact"
import type {
  AccountUuid,
  AttachedData,
  AttachedDoc,
  Attribute,
  Class,
  Data,
  Doc,
  DocumentQuery,
  FindOptions,
  Ref,
  Sequence,
  Space,
  Status,
  TxResult
} from "@hcengineering/core"
import type { TagCategory, TagElement, TagReference } from "@hcengineering/tags"
import type { ProjectType, TaskType } from "@hcengineering/task"
import { Effect } from "effect"
import { expect } from "vitest"

import {
  ApplicantIdentifier,
  CandidateIdentifier,
  VacancyIdentifier
} from "../../../src/domain/schemas/recruiting-common.js"
import {
  ColorCode,
  PersonName,
  StatusName,
  TagCategoryIdentifier,
  TagIdentifier,
  Timestamp
} from "../../../src/domain/schemas/shared.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import {
  InvalidStatusError,
  PersonNotAnEmployeeError,
  PersonNotFoundError,
  RecruitingApplicantIdentifierAmbiguousError,
  RecruitingApplicantNotFoundError,
  RecruitingCandidateNotFoundError,
  RecruitingDuplicateApplicantError,
  RecruitingModelMissingError,
  RecruitingMutationUnsupportedError,
  RecruitingVacancyIdentifierAmbiguousError,
  RecruitingVacancyNotFoundError,
  RecruitingVacancyTypeNotFoundError
} from "../../../src/huly/errors.js"
import { contact, core, tags, task } from "../../../src/huly/huly-plugins.js"
import {
  createRecruitingApplicant,
  deleteRecruitingApplicant,
  getRecruitingApplicant,
  listRecruitingApplicants,
  updateRecruitingApplicant
} from "../../../src/huly/operations/recruiting-applicants.js"
import {
  addRecruitingCandidateSkill,
  getRecruitingCandidate,
  listRecruitingCandidates,
  listRecruitingCandidateSkills,
  listRecruitingSkills,
  removeRecruitingCandidateSkill,
  setRecruitingCandidateProfile
} from "../../../src/huly/operations/recruiting-candidates.js"
import { resolveDefaultRecruitingStatus } from "../../../src/huly/operations/recruiting-shared.js"
import {
  archiveRecruitingVacancy,
  createRecruitingVacancy,
  getRecruitingVacancy,
  listRecruitingVacancies,
  listRecruitingVacancyStatuses,
  listRecruitingVacancyTypes,
  unarchiveRecruitingVacancy,
  updateRecruitingVacancy
} from "../../../src/huly/operations/recruiting-vacancies.js"
import { recruitIds } from "../../../src/huly/recruit-plugin.js"
import type { Applicant, Candidate, Vacancy } from "../../../src/huly/types/recruiting.js"
import { withDiagnostics } from "../../helpers/diagnostics.js"
import { corePersonId, docRef, findResult, personRef, spaceRef, statusRef } from "../../helpers/huly-sdk.js"

const accountUuid = "00000000-0000-4000-8000-000000000000" as AccountUuid

const vacancyTypeRef = docRef<ProjectType>("recruit:template:DefaultVacancy")
const vacancyTypeDataRef = docRef<Doc>("recruit:mixin:DefaultVacancyTypeData")
const applicantTaskTypeRef = docRef<TaskType>("recruit:taskTypes:Applicant")
const activeStatusRef = statusRef("status-active")
const interviewStatusRef = statusRef("status-interview")
const offerStatusRef = statusRef("status-offer")
const skillCategoryRef = docRef<TagCategory>("skill-category")
const pythonSkillRef = docRef<TagElement>("skill-python")

interface Captures {
  readonly createdDocs: Array<{
    readonly class: string
    readonly id: string | undefined
    readonly attributes: object
  }>
  readonly updatedDocs: Array<{
    readonly class: string
    readonly id: string
    readonly operations: object
    readonly retrieve: boolean | undefined
  }>
  readonly addedCollections: Array<{
    readonly class: string
    readonly space: string
    readonly attachedTo: string
    readonly collection: string
    readonly attributes: object
    readonly id: string | undefined
  }>
  readonly createdMixins: Array<{
    readonly id: string
    readonly mixin: string
    readonly attributes: object
  }>
  readonly updatedMixins: Array<{
    readonly id: string
    readonly mixin: string
    readonly attributes: object
  }>
  readonly removedCollections: Array<{
    readonly class: string
    readonly id: string
    readonly attachedTo: string
    readonly collection: string
  }>
  readonly removedDocs: Array<{
    readonly class: string
    readonly id: string
  }>
  readonly uploadedMarkup: Array<{
    readonly id: string
    readonly markup: string
    readonly format: string
  }>
}

interface RecruitingData {
  readonly applicants?: ReadonlyArray<Applicant>
  readonly candidates?: ReadonlyArray<Candidate>
  readonly channels?: ReadonlyArray<Channel>
  readonly employees?: ReadonlyArray<Employee>
  readonly organizations?: ReadonlyArray<Organization>
  readonly people?: ReadonlyArray<Person>
  readonly sequences?: ReadonlyArray<Sequence>
  readonly socialIdentities?: ReadonlyArray<SocialIdentity>
  readonly statuses?: ReadonlyArray<Status>
  readonly tagCategories?: ReadonlyArray<TagCategory>
  readonly tagElements?: ReadonlyArray<TagElement>
  readonly tagReferences?: ReadonlyArray<TagReference>
  readonly vacancyTypes?: ReadonlyArray<ProjectType>
  readonly vacancies?: ReadonlyArray<Vacancy>
  readonly removeCollectionAvailable?: boolean
  readonly sequenceUpdateResult?: TxResult
}

const baseDoc = <T extends Doc>(
  id: Ref<T>,
  _class: Ref<Class<T>>,
  space: Ref<Space> = spaceRef("space")
) => ({
  _id: id,
  _class,
  space,
  modifiedBy: corePersonId("user"),
  modifiedOn: 1700000000000,
  createdBy: corePersonId("user"),
  createdOn: 1699000000000
})

const makeStatus = (id: Ref<Status>, name: string): Status => ({
  ...baseDoc(id, core.class.Status),
  name,
  category: task.statusCategory.Active,
  ofAttribute: docRef<Attribute<Status>>("recruit:attribute:State")
})

const makeVacancyType = (overrides: Partial<ProjectType> = {}): ProjectType => ({
  ...baseDoc(vacancyTypeRef, task.class.ProjectType),
  name: "Default Vacancy",
  shortDescription: "Default vacancy type",
  descriptor: docRef("recruit:descriptors:VacancyType"),
  members: [],
  roles: 0,
  autoJoin: false,
  targetClass: docRef("recruit:mixin:DefaultVacancyTypeData"),
  tasks: [applicantTaskTypeRef],
  description: "Default vacancy type",
  statuses: [
    { _id: activeStatusRef, taskType: applicantTaskTypeRef },
    { _id: interviewStatusRef, taskType: applicantTaskTypeRef },
    { _id: offerStatusRef, taskType: applicantTaskTypeRef }
  ],
  classic: false,
  ...overrides
})

const makeVacancy = (overrides: Partial<Vacancy> = {}): Vacancy => ({
  ...baseDoc(docRef<Vacancy>("vacancy-1"), recruitIds.class.Vacancy),
  name: "Backend Engineer",
  description: "Build APIs",
  fullDescription: null,
  private: false,
  members: [accountUuid],
  archived: false,
  owners: [accountUuid],
  autoJoin: false,
  type: vacancyTypeRef,
  number: 1,
  applications: 1,
  comments: 0,
  attachments: 0,
  ...overrides
})

const makePerson = (id: string, name: string): Person => ({
  ...baseDoc(personRef(id), contact.class.Person, contact.space.Contacts),
  name,
  city: "",
  avatarType: AvatarType.COLOR
})

const makeEmployee = (
  person = makePerson("person-1", "Ada Lovelace"),
  overrides: Partial<Employee> = {}
): Employee => ({
  ...person,
  _id: person._id as unknown as Ref<Employee>,
  _class: contact.mixin.Employee,
  active: true,
  personUuid: accountUuid,
  ...overrides
})

const makeCandidate = (overrides: Partial<Candidate> = {}): Candidate => ({
  ...makePerson("person-1", "Ada Lovelace"),
  title: "Engineer",
  source: "Referral",
  onsite: false,
  remote: true,
  applications: 1,
  reviews: 0,
  ...overrides
})

const makeChannel = (person: Person, value = "ada@example.com"): Channel => ({
  ...baseDoc(docRef<Channel>(`channel-${person._id}`), contact.class.Channel, contact.space.Contacts),
  attachedTo: person._id,
  attachedToClass: contact.class.Person,
  collection: "channels",
  provider: contact.channelProvider.Email,
  value
})

const makeOrganization = (): Organization => ({
  ...baseDoc(docRef<Organization>("org-1"), contact.class.Organization, contact.space.Contacts),
  name: "Acme",
  avatarType: AvatarType.COLOR,
  members: 0,
  description: null
})

const makeSequence = (id: string, attachedTo: Ref<Class<Doc>>, sequence: number): Sequence => ({
  ...baseDoc(docRef<Sequence>(id), core.class.Sequence),
  attachedTo,
  sequence
})

const makeApplicant = (overrides: Partial<Applicant> = {}): Applicant => ({
  _id: docRef<Applicant>("applicant-1"),
  _class: recruitIds.class.Applicant,
  space: docRef<Vacancy>("vacancy-1"),
  modifiedBy: corePersonId("user"),
  modifiedOn: 1700000000000,
  createdBy: corePersonId("user"),
  createdOn: 1699000000000,
  attachedTo: docRef<Candidate>("person-1"),
  attachedToClass: recruitIds.mixin.Candidate,
  collection: "applications",
  kind: applicantTaskTypeRef,
  status: activeStatusRef,
  isDone: false,
  number: 1,
  identifier: "APP-1",
  rank: "0|a",
  assignee: null,
  startDate: null,
  dueDate: null,
  ...overrides
})

const makeTagCategory = (): TagCategory => ({
  ...baseDoc(skillCategoryRef, tags.class.TagCategory),
  icon: tags.icon.Tags,
  label: "Skills",
  targetClass: docRef("recruit:mixin:Candidate"),
  tags: [],
  default: true
})

const makeTagElement = (overrides: Partial<TagElement> = {}): TagElement => ({
  ...baseDoc(pythonSkillRef, tags.class.TagElement),
  title: "Python",
  targetClass: docRef("recruit:mixin:Candidate"),
  description: "",
  color: 3,
  category: skillCategoryRef,
  refCount: 1,
  ...overrides
})

const makeTagReference = (overrides: Partial<TagReference> = {}): TagReference => ({
  ...baseDoc(docRef<TagReference>("tag-ref-1"), tags.class.TagReference, contact.space.Contacts),
  attachedTo: docRef("person-1"),
  attachedToClass: docRef("recruit:mixin:Candidate"),
  collection: "skills",
  tag: pythonSkillRef,
  title: "Python",
  color: 3,
  weight: 5,
  ...overrides
})

const readQuery = (query: unknown): Record<string, unknown> => (query ?? {}) as Record<string, unknown>
const readDoc = (doc: unknown): Record<string, unknown> => doc as Record<string, unknown>

const matchesValue = (actual: unknown, expected: unknown): boolean => {
  if (typeof expected === "object" && expected !== null && "$in" in expected) {
    const values = readDoc(expected).$in
    return Array.isArray(values) && values.includes(actual)
  }
  if (typeof expected === "object" && expected !== null && "$like" in expected) {
    const pattern = String(readDoc(expected).$like).replaceAll("%", "").replaceAll("\\", "")
    return String(actual).includes(pattern)
  }
  return actual === expected
}

const matchesSearch = (doc: Doc, expected: unknown): boolean => {
  const search = String(expected).replaceAll("\\", "").toLowerCase()
  return Object.values(readDoc(doc)).some((value) => String(value).toLowerCase().includes(search))
}

const matchesQuery = <T extends Doc>(doc: T, query: DocumentQuery<T>): boolean => {
  const entries = Object.entries(readQuery(query))
  return entries.every(([key, expected]) =>
    key === "$search" ? matchesSearch(doc, expected) : matchesValue(readDoc(doc)[key], expected)
  )
}

const applySort = <T extends Doc>(docs: ReadonlyArray<T>, options: FindOptions<T> | undefined): Array<T> => {
  const sort = readQuery(options).sort
  const sorted = typeof sort !== "object" || sort === null
    ? [...docs]
    : (() => {
      const rankSort = readQuery(sort).rank
      return rankSort === undefined
        ? [...docs]
        : [...docs].sort((left, right) => String(readDoc(right).rank).localeCompare(String(readDoc(left).rank)))
    })()
  const limit = readQuery(options).limit
  return typeof limit === "number" ? sorted.slice(0, limit) : sorted
}

const createCaptures = (): Captures => ({
  createdDocs: [],
  updatedDocs: [],
  addedCollections: [],
  createdMixins: [],
  updatedMixins: [],
  removedCollections: [],
  removedDocs: [],
  uploadedMarkup: []
})

const docsAs = <T extends Doc>(docs: ReadonlyArray<Doc>): Array<T> => [...docs] as unknown as Array<T>

const createRecruitingLayer = (data: RecruitingData, captures = createCaptures()) => {
  const applicants = [...(data.applicants ?? [makeApplicant()])]
  const candidates = [...(data.candidates ?? [makeCandidate()])]
  const people = [...(data.people ?? [makePerson("person-1", "Ada Lovelace")])]
  const employees = [...(data.employees ?? people.map((person) => makeEmployee(person)))]
  const statuses = [
    ...(data.statuses ?? [
      makeStatus(activeStatusRef, "Active"),
      makeStatus(interviewStatusRef, "Interview"),
      makeStatus(offerStatusRef, "Offer")
    ])
  ]
  const tagElements = [...(data.tagElements ?? [makeTagElement()])]
  const tagReferences = [...(data.tagReferences ?? [makeTagReference()])]
  const sequences = [
    ...(data.sequences ?? [
      makeSequence("seq-vacancy", recruitIds.class.Vacancy, 1),
      makeSequence("seq-applicant", recruitIds.class.Applicant, 1)
    ])
  ]
  const docsForClass = <T extends Doc>(_class: Ref<Class<T>>): Array<T> => {
    switch (String(_class)) {
      case String(recruitIds.class.Vacancy):
        return docsAs<T>(data.vacancies ?? [makeVacancy()])
      case String(recruitIds.class.Applicant):
        return docsAs<T>(applicants)
      case String(recruitIds.mixin.Candidate):
        return docsAs<T>(candidates)
      case String(contact.class.Person):
        return docsAs<T>(people)
      case String(contact.mixin.Employee):
        return docsAs<T>(employees)
      case String(contact.class.Channel):
        return docsAs<T>(data.channels ?? people.map((person) => makeChannel(person)))
      case String(contact.class.SocialIdentity):
        return docsAs<T>(data.socialIdentities ?? [])
      case String(contact.class.Organization):
        return docsAs<T>(data.organizations ?? [makeOrganization()])
      case String(task.class.ProjectType):
        return docsAs<T>(data.vacancyTypes ?? [makeVacancyType()])
      case String(core.class.Status):
        return docsAs<T>(statuses)
      case String(core.class.Sequence):
        return docsAs<T>(sequences)
      case String(tags.class.TagCategory):
        return docsAs<T>(data.tagCategories ?? [makeTagCategory()])
      case String(tags.class.TagElement):
        return docsAs<T>(tagElements)
      case String(tags.class.TagReference):
        return docsAs<T>(tagReferences)
      default:
        return []
    }
  }

  const findAll: HulyClientOperations["findAll"] = (_class, query, options) =>
    Effect.succeed(findResult(applySort(docsForClass(_class).filter((doc) => matchesQuery(doc, query)), options)))

  const findOne: HulyClientOperations["findOne"] = (_class, query, options) =>
    Effect.succeed(applySort(docsForClass(_class).filter((doc) => matchesQuery(doc, query)), options)[0])

  const updateDoc: HulyClientOperations["updateDoc"] = (_class, _space, objectId, operations, retrieve) => {
    captures.updatedDocs.push({
      class: String(_class),
      id: String(objectId),
      operations,
      retrieve
    })
    if (String(_class) === String(core.class.Sequence)) {
      const sequence = sequences.find((candidate) => String(candidate._id) === String(objectId))
      if (sequence !== undefined) {
        sequence.sequence += 1
        const incrementResult: TxResult = { object: { sequence: sequence.sequence } }
        return Effect.succeed(data.sequenceUpdateResult ?? incrementResult)
      }
    }
    if (String(_class) === String(recruitIds.class.Applicant)) {
      const applicant = applicants.find((candidate) => String(candidate._id) === String(objectId))
      if (applicant !== undefined) Object.assign(applicant, operations)
    }
    const emptyResult: TxResult = {}
    return Effect.succeed(emptyResult)
  }

  const createDoc: HulyClientOperations["createDoc"] = <T extends Doc>(
    _class: Ref<Class<T>>,
    _space: Ref<Space>,
    attributes: Data<T>,
    id?: Ref<T>
  ) => {
    captures.createdDocs.push({ class: String(_class), id: id === undefined ? undefined : String(id), attributes })
    if (String(_class) === String(tags.class.TagElement) && id !== undefined) {
      tagElements.push(
        { ...baseDoc(id as unknown as Ref<TagElement>, tags.class.TagElement), ...attributes } as unknown as TagElement
      )
    }
    return Effect.succeed(id ?? docRef<T>("created-doc"))
  }

  const addCollection: HulyClientOperations["addCollection"] = <T extends Doc, P extends AttachedDoc>(
    _class: Ref<Class<P>>,
    space: Ref<Space>,
    attachedTo: Ref<T>,
    _attachedToClass: Ref<Class<T>>,
    collection: string,
    attributes: AttachedData<P>,
    id?: Ref<P>
  ) => {
    captures.addedCollections.push({
      class: String(_class),
      space: String(space),
      attachedTo: String(attachedTo),
      collection,
      attributes,
      id: id === undefined ? undefined : String(id)
    })
    if (String(_class) === String(recruitIds.class.Applicant) && id !== undefined) {
      applicants.push({
        ...baseDoc(id as unknown as Ref<Applicant>, recruitIds.class.Applicant, space as unknown as Ref<Vacancy>),
        attachedTo: attachedTo as unknown as Ref<Candidate>,
        attachedToClass: recruitIds.mixin.Candidate,
        collection,
        ...attributes
      } as unknown as Applicant)
    }
    if (String(_class) === String(tags.class.TagReference)) {
      const tagRefId = docRef<TagReference>("created-tag-ref")
      tagReferences.push({
        ...baseDoc(tagRefId, tags.class.TagReference, space),
        attachedTo: attachedTo as unknown as Ref<Doc>,
        attachedToClass: _attachedToClass,
        collection,
        ...attributes
      } as unknown as TagReference)
      return Effect.succeed(tagRefId as unknown as Ref<P>)
    }
    return Effect.succeed(id ?? docRef<P>("created-attached-doc"))
  }

  const createMixin: HulyClientOperations["createMixin"] = (
    objectId,
    _objectClass,
    _objectSpace,
    mixin,
    attributes
  ) => {
    captures.createdMixins.push({ id: String(objectId), mixin: String(mixin), attributes })
    if (String(mixin) === String(recruitIds.mixin.Candidate)) {
      const person = people.find((candidate) => String(candidate._id) === String(objectId))
      if (person !== undefined) candidates.push({ ...person, ...attributes } as Candidate)
    }
    return Effect.succeed({} as TxResult)
  }

  const updateMixin: HulyClientOperations["updateMixin"] = (
    objectId,
    _objectClass,
    _objectSpace,
    mixin,
    attributes
  ) => {
    captures.updatedMixins.push({ id: String(objectId), mixin: String(mixin), attributes })
    const candidate = candidates.find((item) => String(item._id) === String(objectId))
    if (candidate !== undefined) Object.assign(candidate, attributes)
    return Effect.succeed({} as TxResult)
  }

  const removeCollection: NonNullable<HulyClientOperations["removeCollection"]> = <
    T extends Doc,
    P extends AttachedDoc
  >(
    _class: Ref<Class<P>>,
    _space: Ref<Space>,
    objectId: Ref<P>,
    attachedTo: Ref<T>,
    _attachedToClass: Ref<Class<T>>,
    collection: Extract<keyof T, string> | string
  ) => {
    captures.removedCollections.push({
      class: String(_class),
      id: String(objectId),
      attachedTo: String(attachedTo),
      collection
    })
    return Effect.succeed(attachedTo)
  }

  const removeDoc: HulyClientOperations["removeDoc"] = (_class, _space, objectId) => {
    captures.removedDocs.push({ class: String(_class), id: String(objectId) })
    return Effect.succeed({} as TxResult)
  }

  const uploadMarkup: HulyClientOperations["uploadMarkup"] = (_class, objectId, _attr, markup, format) => {
    captures.uploadedMarkup.push({ id: String(objectId), markup, format })
    return Effect.succeed(docRef("markup-ref"))
  }

  return {
    captures,
    layer: HulyClient.testLayer({
      getAccountUuid: () => accountUuid,
      findAll,
      findAllInModel: findAll,
      findOne,
      updateDoc,
      createDoc,
      addCollection,
      createMixin,
      updateMixin,
      ...(data.removeCollectionAvailable === false ? {} : { removeCollection }),
      removeDoc,
      uploadMarkup,
      fetchMarkup: () => Effect.succeed("# Full description")
    })
  }
}

describe("Recruiting Operations", () => {
  it.effect("resolves vacancies by identifier and detects ambiguous names", () =>
    Effect.gen(function*() {
      const duplicate = makeVacancy({ _id: docRef("vacancy-2"), number: 2 })
      const { layer } = createRecruitingLayer({ vacancies: [makeVacancy(), duplicate] })

      const byId = yield* getRecruitingVacancy({ vacancy: VacancyIdentifier.make("vacancy-1") }).pipe(
        Effect.provide(layer),
        withDiagnostics
      )
      expect(byId.identifier).toBe("VCN-1")

      const byIdentifier = yield* getRecruitingVacancy({ vacancy: VacancyIdentifier.make("VCN-1") }).pipe(
        Effect.provide(layer),
        withDiagnostics
      )
      expect(byIdentifier.identifier).toBe("VCN-1")
      expect(byIdentifier.fullDescription).toBeUndefined()

      const byName = yield* getRecruitingVacancy({ vacancy: VacancyIdentifier.make("Frontend Engineer") }).pipe(
        Effect.provide(
          createRecruitingLayer({
            vacancies: [makeVacancy({ _id: docRef("vacancy-3"), name: "Frontend Engineer", number: 3 })]
          }).layer
        ),
        withDiagnostics
      )
      expect(byName.identifier).toBe("VCN-3")

      const error = yield* Effect.flip(
        getRecruitingVacancy({ vacancy: VacancyIdentifier.make("Backend Engineer") }).pipe(
          Effect.provide(layer),
          withDiagnostics
        )
      )
      expect(error).toBeInstanceOf(RecruitingVacancyIdentifierAmbiguousError)

      const missing = yield* Effect.flip(
        getRecruitingVacancy({ vacancy: VacancyIdentifier.make("Missing Role") }).pipe(
          Effect.provide(layer),
          withDiagnostics
        )
      )
      expect(missing).toBeInstanceOf(RecruitingVacancyNotFoundError)
    }))

  it.effect("lists vacancy workflow data, reads rich details, filters, and updates nullable fields", () =>
    Effect.gen(function*() {
      const organization = makeOrganization()
      const vacancy = makeVacancy({
        fullDescription: docRef("markup-ref") as Vacancy["fullDescription"],
        company: organization._id,
        location: "Remote",
        dueTo: 1703000000000,
        applications: 3,
        comments: 2,
        attachments: 1
      })
      const { captures, layer } = createRecruitingLayer({ organizations: [organization], vacancies: [vacancy] })

      const types = yield* listRecruitingVacancyTypes({ limit: 5 }).pipe(Effect.provide(layer))
      expect(types.types).toEqual([
        {
          id: "recruit:template:DefaultVacancy",
          name: "Default Vacancy",
          description: "Default vacancy type",
          default: true
        }
      ])

      const statuses = yield* listRecruitingVacancyStatuses({ vacancy: VacancyIdentifier.make("vacancy-1") }).pipe(
        Effect.provide(layer),
        withDiagnostics
      )
      expect(statuses.statuses.map((status) => status.name)).toEqual(["Active", "Interview", "Offer"])

      const detail = yield* getRecruitingVacancy({ vacancy: VacancyIdentifier.make("vacancy-1") }).pipe(
        Effect.provide(layer),
        withDiagnostics
      )
      expect(detail.fullDescription).toBe("# Full description")
      expect(detail.company).toEqual({ id: "org-1", name: "Acme" })
      expect(detail.location).toBe("Remote")
      expect(detail.dueTo).toBe(1703000000000)
      expect(detail.applicants).toBe(3)
      expect(detail.comments).toBe(2)
      expect(detail.attachments).toBe(1)

      const filtered = yield* listRecruitingVacancies({
        type: "Default Vacancy",
        company: "Acme",
        query: "Backend",
        includeArchived: true
      }).pipe(Effect.provide(layer))
      expect(filtered.total).toBe(1)

      const updated = yield* updateRecruitingVacancy({
        vacancy: VacancyIdentifier.make("VCN-1"),
        name: "Principal Engineer",
        shortDescription: "Lead APIs",
        fullDescription: "# Updated",
        type: "Default Vacancy",
        company: "Acme",
        location: "Hybrid",
        dueTo: Timestamp.make(1704000000000),
        private: true
      }).pipe(Effect.provide(layer))
      expect(updated.vacancy.name).toBe("Principal Engineer")
      expect(captures.uploadedMarkup.at(-1)).toMatchObject({ id: "vacancy-1", markup: "# Updated" })
      expect(captures.updatedDocs.at(-1)?.operations).toMatchObject({
        name: "Principal Engineer",
        description: "Lead APIs",
        fullDescription: "markup-ref",
        type: vacancyTypeRef,
        company: organization._id,
        location: "Hybrid",
        dueTo: 1704000000000,
        private: true
      })

      yield* updateRecruitingVacancy({
        vacancy: VacancyIdentifier.make("VCN-1"),
        fullDescription: null,
        company: null,
        location: null,
        dueTo: null
      }).pipe(Effect.provide(layer))
      expect(captures.updatedDocs.at(-1)?.operations).toEqual({
        fullDescription: null,
        location: "",
        $unset: {
          company: "",
          dueTo: ""
        }
      })
    }))

  it.effect("omits sparse vacancy detail fields and uses vacancy creation/update defaults", () =>
    Effect.gen(function*() {
      const organization = makeOrganization()
      const { autoJoin: _autoJoin, shortDescription: _shortDescription, ...sparseTypeBase } = makeVacancyType()
      const sparseType: ProjectType = sparseTypeBase
      const {
        applications: _applications,
        attachments: _attachments,
        comments: _comments,
        createdOn: _createdOn,
        ...sparseVacancyBase
      } = makeVacancy({
        description: "",
        company: docRef("missing-org")
      })
      const sparseVacancy: Vacancy = sparseVacancyBase
      const { captures, layer } = createRecruitingLayer({
        organizations: [organization],
        vacancies: [sparseVacancy],
        vacancyTypes: [sparseType]
      })

      const detail = yield* getRecruitingVacancy({ vacancy: VacancyIdentifier.make("VCN-1") }).pipe(
        Effect.provide(layer),
        withDiagnostics
      )
      expect(detail.shortDescription).toBeUndefined()
      expect(detail.company).toBeUndefined()
      expect(detail.applicants).toBeUndefined()
      expect(detail.comments).toBeUndefined()
      expect(detail.attachments).toBeUndefined()
      expect(detail.createdOn).toBeUndefined()

      const created = yield* createRecruitingVacancy({
        name: "SRE",
        company: "Acme"
      }).pipe(Effect.provide(layer))
      expect(created.vacancy.archived).toBe(false)
      expect(captures.createdDocs[0]?.attributes).toMatchObject({
        description: "",
        fullDescription: null,
        company: organization._id,
        private: false,
        autoJoin: false
      })

      yield* updateRecruitingVacancy({
        vacancy: VacancyIdentifier.make("VCN-1"),
        name: "Backend Platform Engineer"
      }).pipe(Effect.provide(layer))
      expect(captures.updatedDocs.at(-1)?.operations).toEqual({ name: "Backend Platform Engineer" })
    }))

  it.effect("reports vacancy model errors for missing types, statuses, and sequences", () =>
    Effect.gen(function*() {
      const missingType = yield* Effect.flip(
        createRecruitingVacancy({ name: "No Type" }).pipe(
          Effect.provide(createRecruitingLayer({ vacancyTypes: [] }).layer)
        )
      )
      expect(missingType).toBeInstanceOf(RecruitingVacancyTypeNotFoundError)

      const missingStatuses = yield* Effect.flip(
        listRecruitingVacancyStatuses({ vacancy: VacancyIdentifier.make("VCN-1") }).pipe(
          Effect.provide(createRecruitingLayer({ vacancyTypes: [makeVacancyType({ statuses: [] })] }).layer),
          withDiagnostics
        )
      )
      expect(missingStatuses).toBeInstanceOf(RecruitingModelMissingError)

      const missingSequence = yield* Effect.flip(
        createRecruitingVacancy({ name: "No Sequence" }).pipe(
          Effect.provide(createRecruitingLayer({ sequences: [] }).layer)
        )
      )
      expect(missingSequence).toBeInstanceOf(RecruitingModelMissingError)

      const malformedResult: TxResult = {}
      const malformedSequence = yield* Effect.flip(
        createRecruitingVacancy({ name: "Bad Sequence" }).pipe(
          Effect.provide(createRecruitingLayer({ sequenceUpdateResult: malformedResult }).layer)
        )
      )
      expect(malformedSequence).toBeInstanceOf(RecruitingModelMissingError)
    }))

  it.effect("reports vacancy type lookup errors and status fallback categories", () =>
    Effect.gen(function*() {
      const customStatusRef = statusRef("status-custom-category")
      const missingStatusRef = statusRef("status-missing-doc")
      const { layer } = createRecruitingLayer({
        statuses: (() => {
          const { category: _category, ...active } = makeStatus(activeStatusRef, "Active")
          return [active, { ...makeStatus(customStatusRef, "Custom"), category: docRef("custom-category") }]
        })(),
        vacancyTypes: [
          makeVacancyType({
            statuses: [
              { _id: activeStatusRef, taskType: applicantTaskTypeRef },
              { _id: customStatusRef, taskType: applicantTaskTypeRef },
              { _id: missingStatusRef, taskType: applicantTaskTypeRef }
            ]
          })
        ]
      })

      const statuses = yield* listRecruitingVacancyStatuses({ vacancy: VacancyIdentifier.make("VCN-1") }).pipe(
        Effect.provide(layer),
        withDiagnostics
      )
      expect(statuses.statuses.map((status) => status.category)).toEqual(["unknown", "unknown", "unknown"])

      const byTypeId = yield* listRecruitingVacancies({ type: "recruit:template:DefaultVacancy" }).pipe(
        Effect.provide(layer)
      )
      expect(byTypeId.total).toBe(1)

      const missingNamedType = yield* Effect.flip(
        listRecruitingVacancies({ type: "Unknown Type" }).pipe(Effect.provide(layer))
      )
      expect(missingNamedType).toBeInstanceOf(RecruitingVacancyTypeNotFoundError)

      const missingModelType = yield* Effect.flip(
        getRecruitingVacancy({ vacancy: VacancyIdentifier.make("VCN-1") }).pipe(
          Effect.provide(
            createRecruitingLayer({
              vacancies: [makeVacancy({ type: docRef("missing-type") })],
              vacancyTypes: []
            }).layer
          ),
          withDiagnostics
        )
      )
      expect(missingModelType).toBeInstanceOf(RecruitingModelMissingError)

      const noDefaultStatus = yield* Effect.flip(
        resolveDefaultRecruitingStatus([], VacancyIdentifier.make("VCN-1"))
      )
      expect(noDefaultStatus).toBeInstanceOf(InvalidStatusError)
    }))

  it.effect("creates vacancies with sequence increment, markup upload, owner defaults, and type-data mixin", () =>
    Effect.gen(function*() {
      const { captures, layer } = createRecruitingLayer({
        sequences: [makeSequence("seq-vacancy", recruitIds.class.Vacancy, 41)]
      })

      const result = yield* createRecruitingVacancy({
        name: "Platform Engineer",
        fullDescription: "# Role",
        private: true
      }).pipe(Effect.provide(layer))

      expect(result.vacancy.identifier).toBe("VCN-42")
      expect(captures.uploadedMarkup[0]?.markup).toBe("# Role")
      expect(captures.createdDocs[0]?.class).toBe(String(recruitIds.class.Vacancy))
      expect(captures.createdDocs[0]?.attributes).toMatchObject({
        name: "Platform Engineer",
        number: 42,
        private: true,
        members: [accountUuid],
        owners: [accountUuid]
      })
      expect(captures.createdMixins[0]).toMatchObject({
        mixin: String(vacancyTypeDataRef),
        attributes: {}
      })
    }))

  it.effect("archives and unarchives vacancies", () =>
    Effect.gen(function*() {
      const { captures, layer } = createRecruitingLayer({})

      const archived = yield* archiveRecruitingVacancy({ vacancy: VacancyIdentifier.make("VCN-1") }).pipe(
        Effect.provide(layer)
      )
      const unarchived = yield* unarchiveRecruitingVacancy({ vacancy: VacancyIdentifier.make("VCN-1") }).pipe(
        Effect.provide(layer)
      )

      expect(archived.vacancy.archived).toBe(true)
      expect(unarchived.vacancy.archived).toBe(false)
      expect(captures.updatedDocs.map((update) => update.operations)).toContainEqual({ archived: true })
      expect(captures.updatedDocs.map((update) => update.operations)).toContainEqual({ archived: false })
    }))

  it.effect("lists vacancies with archive filtering", () =>
    Effect.gen(function*() {
      const { layer } = createRecruitingLayer({
        vacancies: [makeVacancy(), makeVacancy({ _id: docRef("vacancy-2"), number: 2, archived: true })]
      })

      const result = yield* listRecruitingVacancies({}).pipe(Effect.provide(layer))

      expect(result.total).toBe(1)
      expect(result.vacancies[0]?.identifier).toBe("VCN-1")
    }))

  it.effect("creates and updates candidate profile mixins", () =>
    Effect.gen(function*() {
      const person = makePerson("person-2", "Grace Hopper")
      const created = createRecruitingLayer({ candidates: [], people: [person] })

      const createResult = yield* setRecruitingCandidateProfile({
        candidate: CandidateIdentifier.make("Grace Hopper"),
        title: "Compiler Engineer",
        remote: true
      }).pipe(Effect.provide(created.layer))

      expect(createResult.created).toBe(true)
      expect(created.captures.createdMixins[0]).toMatchObject({
        id: "person-2",
        mixin: String(recruitIds.mixin.Candidate),
        attributes: { title: "Compiler Engineer", remote: true }
      })

      const updated = createRecruitingLayer({})
      const updateResult = yield* setRecruitingCandidateProfile({
        candidate: CandidateIdentifier.make("Ada Lovelace"),
        source: "Inbound",
        onsite: true
      }).pipe(Effect.provide(updated.layer))

      expect(updateResult.created).toBe(false)
      expect(updated.captures.updatedMixins[0]).toMatchObject({
        id: "person-1",
        attributes: { source: "Inbound", onsite: true }
      })
    }))

  it.effect("lists candidates by query and resolves candidates by id and email", () =>
    Effect.gen(function*() {
      const ada = makePerson("person-1", "Ada Lovelace")
      const grace = makePerson("person-2", "Grace Hopper")
      const {
        applications: _graceApplications,
        reviews: _graceReviews,
        ...graceCandidateBase
      } = makeCandidate({
        _id: grace._id,
        name: grace.name,
        title: "Compiler Engineer",
        source: "Inbound"
      })
      const graceCandidate: Candidate = graceCandidateBase
      const { layer } = createRecruitingLayer({
        candidates: [makeCandidate(), graceCandidate],
        channels: [makeChannel(ada), makeChannel(grace, "grace@example.com")],
        people: [ada, grace]
      })

      const allCandidates = yield* listRecruitingCandidates({}).pipe(Effect.provide(layer))
      expect(allCandidates.total).toBe(2)

      const filtered = yield* listRecruitingCandidates({ query: "compiler" }).pipe(Effect.provide(layer))
      expect(filtered.candidates).toEqual([{ id: "person-2", name: "Grace Hopper", email: "grace@example.com" }])

      const byId = yield* getRecruitingCandidate({ candidate: CandidateIdentifier.make("person-1") }).pipe(
        Effect.provide(layer)
      )
      const byEmail = yield* getRecruitingCandidate({ candidate: CandidateIdentifier.make("ada@example.com") }).pipe(
        Effect.provide(layer)
      )
      expect(byId.id).toBe("person-1")
      expect(byEmail.id).toBe("person-1")
    }))

  it.effect("omits empty candidate profile fields and reports missing candidate mixins", () =>
    Effect.gen(function*() {
      const {
        applications: _minimalApplications,
        createdOn: _minimalCreatedOn,
        onsite: _minimalOnsite,
        remote: _minimalRemote,
        reviews: _minimalReviews,
        title: _minimalTitle,
        ...minimalBase
      } = makeCandidate({ source: "" })
      const minimal: Candidate = minimalBase
      const { layer } = createRecruitingLayer({ candidates: [minimal], tagReferences: [] })

      const detail = yield* getRecruitingCandidate({ candidate: CandidateIdentifier.make("Ada Lovelace") }).pipe(
        Effect.provide(layer)
      )
      expect(detail.title).toBeUndefined()
      expect(detail.source).toBeUndefined()
      expect(detail.onsite).toBeUndefined()
      expect(detail.remote).toBeUndefined()
      expect(detail.applications).toBeUndefined()
      expect(detail.reviews).toBeUndefined()
      expect(detail.skills).toEqual([])

      const missing = yield* Effect.flip(
        getRecruitingCandidate({ candidate: CandidateIdentifier.make("Ada Lovelace") }).pipe(
          Effect.provide(createRecruitingLayer({ candidates: [] }).layer)
        )
      )
      expect(missing).toBeInstanceOf(RecruitingCandidateNotFoundError)
    }))

  it.effect("returns candidate refs without email when no channel exists and reports missing people", () =>
    Effect.gen(function*() {
      const noEmailLayer = createRecruitingLayer({ channels: [] })
      const candidate = yield* getRecruitingCandidate({ candidate: CandidateIdentifier.make("Ada Lovelace") }).pipe(
        Effect.provide(noEmailLayer.layer)
      )
      expect(candidate.email).toBeUndefined()

      const missingPerson = yield* Effect.flip(
        getRecruitingCandidate({ candidate: CandidateIdentifier.make("Nobody") }).pipe(
          Effect.provide(noEmailLayer.layer)
        )
      )
      expect(missingPerson).toBeInstanceOf(PersonNotFoundError)
    }))

  it.effect("returns candidate detail with email and skills", () =>
    Effect.gen(function*() {
      const { layer } = createRecruitingLayer({})

      const candidate = yield* getRecruitingCandidate({ candidate: CandidateIdentifier.make("Ada Lovelace") }).pipe(
        Effect.provide(layer)
      )

      expect(candidate.email).toBe("ada@example.com")
      expect(candidate.skills.map((skill) => skill.title)).toEqual(["Python"])
      expect(candidate.remote).toBe(true)
    }))

  it.effect("filters skills, lists candidate skills, and handles idempotent attach/detach", () =>
    Effect.gen(function*() {
      const attachedLayer = createRecruitingLayer({})

      const filteredSkills = yield* listRecruitingSkills({
        category: TagCategoryIdentifier.make("Skills"),
        titleSearch: "Py"
      }).pipe(Effect.provide(attachedLayer.layer))
      expect(filteredSkills.skills).toEqual([{
        id: "skill-python",
        title: "Python",
        color: 3,
        category: skillCategoryRef,
        refCount: 1
      }])

      const candidateSkills = yield* listRecruitingCandidateSkills({
        candidate: CandidateIdentifier.make("Ada Lovelace")
      }).pipe(Effect.provide(attachedLayer.layer))
      expect(candidateSkills.total).toBe(1)
      expect(candidateSkills.skills[0]?.title).toBe("Python")

      const alreadyAttached = yield* addRecruitingCandidateSkill({
        candidate: CandidateIdentifier.make("Ada Lovelace"),
        skill: TagIdentifier.make("Python")
      }).pipe(Effect.provide(attachedLayer.layer))
      expect(alreadyAttached.attached).toBe(false)
      expect(attachedLayer.captures.addedCollections).toEqual([])

      const detachedLayer = createRecruitingLayer({ tagReferences: [] })
      const notDetached = yield* removeRecruitingCandidateSkill({
        candidate: CandidateIdentifier.make("Ada Lovelace"),
        skill: TagIdentifier.make("Python")
      }).pipe(Effect.provide(detachedLayer.layer))
      expect(notDetached.detached).toBe(false)
      expect(notDetached.detachedCount).toBe(0)

      const noCountSkill = yield* listRecruitingSkills({
        titleSearch: "Rust"
      }).pipe(
        Effect.provide(
          createRecruitingLayer({
            tagElements: [(() => {
              const { refCount: _refCount, ...rust } = makeTagElement({
                _id: docRef("skill-rust"),
                title: "Rust"
              })
              return rust
            })()]
          }).layer
        )
      )
      expect(noCountSkill.skills).toEqual([{
        id: "skill-rust",
        title: "Rust",
        color: 3,
        category: skillCategoryRef
      }])
    }))

  it.effect("lists, adds, and removes candidate skills through tag helpers", () =>
    Effect.gen(function*() {
      const { captures, layer } = createRecruitingLayer({ tagElements: [] })

      const before = yield* listRecruitingSkills({}).pipe(Effect.provide(layer))
      expect(before.total).toBe(0)

      const added = yield* addRecruitingCandidateSkill({
        candidate: CandidateIdentifier.make("Ada Lovelace"),
        skill: TagIdentifier.make("TypeScript"),
        category: TagCategoryIdentifier.make("Skills"),
        color: ColorCode.make(4),
        weight: 8
      }).pipe(Effect.provide(layer))

      expect(added.attached).toBe(true)
      expect(captures.createdDocs[0]?.class).toBe(String(tags.class.TagElement))
      expect(captures.addedCollections[0]).toMatchObject({
        class: String(tags.class.TagReference),
        attachedTo: "person-1",
        collection: "skills"
      })

      const removed = yield* removeRecruitingCandidateSkill({
        candidate: CandidateIdentifier.make("Ada Lovelace"),
        skill: TagIdentifier.make("TypeScript")
      }).pipe(Effect.provide(layer))

      expect(removed.detached).toBe(true)
      expect(captures.removedDocs[0]?.class).toBe(String(tags.class.TagReference))
    }))

  it.effect("creates applicants with default status and assignee, and validates status and assignee inputs", () =>
    Effect.gen(function*() {
      const ada = makePerson("person-1", "Ada Lovelace")
      const recruiter = makePerson("person-2", "Recruiter One")
      const { captures, layer } = createRecruitingLayer({
        applicants: [],
        channels: [makeChannel(ada), makeChannel(recruiter, "recruiter@example.com")],
        people: [ada, recruiter],
        sequences: [makeSequence("seq-applicant", recruitIds.class.Applicant, 20)]
      })

      const result = yield* createRecruitingApplicant({
        vacancy: VacancyIdentifier.make("VCN-1"),
        candidate: CandidateIdentifier.make("Ada Lovelace"),
        assignee: PersonName.make("Recruiter One"),
        dueDate: Timestamp.make(1705000000000)
      }).pipe(Effect.provide(layer), withDiagnostics)

      expect(result.applicant.identifier).toBe("APP-21")
      expect(result.applicant.status).toBe("Active")
      expect(captures.addedCollections[0]?.attributes).toMatchObject({
        assignee: recruiter._id,
        dueDate: 1705000000000,
        status: activeStatusRef
      })

      const invalidStatusLayer = createRecruitingLayer({ applicants: [], candidates: [] })
      const invalidStatus = yield* Effect.flip(
        createRecruitingApplicant({
          vacancy: VacancyIdentifier.make("VCN-1"),
          candidate: CandidateIdentifier.make("Ada Lovelace"),
          status: StatusName.make("Screening")
        }).pipe(Effect.provide(invalidStatusLayer.layer), withDiagnostics)
      )
      expect(invalidStatus).toBeInstanceOf(InvalidStatusError)
      expect(invalidStatusLayer.captures.createdMixins).toEqual([])

      const missingAssigneeLayer = createRecruitingLayer({ applicants: [], candidates: [] })
      const missingAssignee = yield* Effect.flip(
        createRecruitingApplicant({
          vacancy: VacancyIdentifier.make("VCN-1"),
          candidate: CandidateIdentifier.make("Ada Lovelace"),
          assignee: PersonName.make("Nobody")
        }).pipe(Effect.provide(missingAssigneeLayer.layer), withDiagnostics)
      )
      expect(missingAssignee).toBeInstanceOf(PersonNotFoundError)
      expect(missingAssigneeLayer.captures.createdMixins).toEqual([])

      const nonEmployeeLayer = createRecruitingLayer({ applicants: [], candidates: [], employees: [] })
      const nonEmployeeAssignee = yield* Effect.flip(
        createRecruitingApplicant({
          vacancy: VacancyIdentifier.make("VCN-1"),
          candidate: CandidateIdentifier.make("Ada Lovelace"),
          assignee: PersonName.make("Ada Lovelace")
        }).pipe(Effect.provide(nonEmployeeLayer.layer), withDiagnostics)
      )
      expect(nonEmployeeAssignee).toBeInstanceOf(PersonNotAnEmployeeError)
      expect(nonEmployeeLayer.captures.createdMixins).toEqual([])
    }))

  it.effect("creates applicants and rejects duplicate vacancy/candidate pairs", () =>
    Effect.gen(function*() {
      const { captures, layer } = createRecruitingLayer({
        applicants: [],
        sequences: [makeSequence("seq-applicant", recruitIds.class.Applicant, 6)]
      })

      const result = yield* createRecruitingApplicant({
        vacancy: VacancyIdentifier.make("VCN-1"),
        candidate: CandidateIdentifier.make("Ada Lovelace"),
        status: StatusName.make("Interview"),
        startDate: Timestamp.make(1701000000000)
      }).pipe(Effect.provide(layer), withDiagnostics)

      expect(result.applicant.identifier).toBe("APP-7")
      expect(result.applicant.status).toBe("Interview")
      expect(captures.addedCollections[0]).toMatchObject({
        class: String(recruitIds.class.Applicant),
        space: "vacancy-1",
        attachedTo: "person-1",
        collection: "applications"
      })
      expect(captures.addedCollections[0]?.attributes).toMatchObject({
        identifier: "APP-7",
        number: 7,
        status: interviewStatusRef,
        startDate: 1701000000000
      })

      const duplicate = yield* Effect.flip(
        createRecruitingApplicant({
          vacancy: VacancyIdentifier.make("VCN-1"),
          candidate: CandidateIdentifier.make("Ada Lovelace")
        }).pipe(Effect.provide(layer), withDiagnostics)
      )
      expect(duplicate).toBeInstanceOf(RecruitingDuplicateApplicantError)
    }))

  it.effect("returns applicant detail fields and filters applicants by vacancy, candidate, and status", () =>
    Effect.gen(function*() {
      const ada = makePerson("person-1", "Ada Lovelace")
      const recruiter = makePerson("person-2", "Recruiter One")
      const applicant = makeApplicant({
        assignee: recruiter._id,
        startDate: 1701000000000,
        dueDate: 1702000000000
      })
      const { layer } = createRecruitingLayer({
        applicants: [applicant],
        channels: [makeChannel(ada), makeChannel(recruiter, "recruiter@example.com")],
        people: [ada, recruiter]
      })

      const detail = yield* getRecruitingApplicant({
        applicant: ApplicantIdentifier.make("applicant-1")
      }).pipe(Effect.provide(layer), withDiagnostics)
      expect(detail.assignee).toEqual({ id: "person-2", name: "Recruiter One", email: "recruiter@example.com" })
      expect(detail.startDate).toBe(1701000000000)
      expect(detail.dueDate).toBe(1702000000000)
      expect(detail.createdOn).toBe(1699000000000)

      const listed = yield* listRecruitingApplicants({
        vacancy: VacancyIdentifier.make("VCN-1"),
        candidate: CandidateIdentifier.make("Ada Lovelace"),
        status: StatusName.make("Active")
      }).pipe(Effect.provide(layer), withDiagnostics)
      expect(listed.applicants.map((item) => item.identifier)).toEqual(["APP-1"])

      const staleAssignee = yield* getRecruitingApplicant({
        applicant: ApplicantIdentifier.make("APP-1")
      }).pipe(
        Effect.provide(
          createRecruitingLayer({
            applicants: [(() => {
              const { createdOn: _applicantCreatedOn, ...applicant } = makeApplicant({
                assignee: personRef("missing-person")
              })
              return applicant
            })()]
          }).layer
        ),
        withDiagnostics
      )
      expect(staleAssignee.assignee).toBeUndefined()
      expect(staleAssignee.createdOn).toBeUndefined()
    }))

  it.effect("finds status-filtered applicants beyond the default page when no vacancy disambiguates status", () =>
    Effect.gen(function*() {
      const activeApplicants = Array.from({ length: 50 }, (_, index) =>
        makeApplicant({
          _id: docRef(`applicant-active-${index}`),
          number: index + 1,
          identifier: `APP-${index + 1}`,
          status: activeStatusRef
        }))
      const offerApplicant = makeApplicant({
        _id: docRef("applicant-offer"),
        number: 99,
        identifier: "APP-99",
        status: offerStatusRef
      })
      const { layer } = createRecruitingLayer({ applicants: [...activeApplicants, offerApplicant] })

      const listed = yield* listRecruitingApplicants({ status: StatusName.make("Offer") }).pipe(
        Effect.provide(layer),
        withDiagnostics
      )

      expect(listed.applicants.map((applicant) => applicant.identifier)).toEqual(["APP-99"])
    }))

  it.effect("updates applicants with assignees and reports missing referenced model data", () =>
    Effect.gen(function*() {
      const { captures, layer } = createRecruitingLayer({})

      const updated = yield* updateRecruitingApplicant({
        applicant: ApplicantIdentifier.make("APP-1"),
        assignee: PersonName.make("Ada Lovelace")
      }).pipe(Effect.provide(layer), withDiagnostics)
      expect(updated.applicant.identifier).toBe("APP-1")
      expect(captures.updatedDocs.at(-1)?.operations).toEqual({ assignee: personRef("person-1") })

      const statusOnly = yield* updateRecruitingApplicant({
        applicant: ApplicantIdentifier.make("APP-1"),
        status: StatusName.make("Interview")
      }).pipe(Effect.provide(layer), withDiagnostics)
      expect(statusOnly.applicant.status).toBe("Interview")
      expect(captures.updatedDocs.at(-1)?.operations).toEqual({ status: interviewStatusRef })

      const nonEmployeeUpdate = yield* Effect.flip(
        updateRecruitingApplicant({
          applicant: ApplicantIdentifier.make("APP-1"),
          assignee: PersonName.make("Ada Lovelace")
        }).pipe(
          Effect.provide(createRecruitingLayer({ employees: [] }).layer),
          withDiagnostics
        )
      )
      expect(nonEmployeeUpdate).toBeInstanceOf(PersonNotAnEmployeeError)

      const missingVacancy = yield* Effect.flip(
        updateRecruitingApplicant({
          applicant: ApplicantIdentifier.make("APP-1"),
          status: StatusName.make("Active")
        }).pipe(
          Effect.provide(createRecruitingLayer({ applicants: [makeApplicant()], vacancies: [] }).layer),
          withDiagnostics
        )
      )
      expect(missingVacancy).toBeInstanceOf(RecruitingModelMissingError)

      const missingCandidate = yield* Effect.flip(
        getRecruitingApplicant({ applicant: ApplicantIdentifier.make("APP-1") }).pipe(
          Effect.provide(createRecruitingLayer({ people: [] }).layer),
          withDiagnostics
        )
      )
      expect(missingCandidate).toBeInstanceOf(RecruitingModelMissingError)

      const unknownStatus = yield* Effect.flip(
        getRecruitingApplicant({ applicant: ApplicantIdentifier.make("APP-1") }).pipe(
          Effect.provide(
            createRecruitingLayer({ applicants: [makeApplicant({ status: statusRef("missing") })] }).layer
          ),
          withDiagnostics
        )
      )
      expect(unknownStatus).toBeInstanceOf(RecruitingModelMissingError)
    }))

  it.effect("honors applicant raw-id disambiguators and reports missing removeCollection support", () =>
    Effect.gen(function*() {
      const grace = makePerson("person-2", "Grace Hopper")
      const secondVacancy = makeVacancy({ _id: docRef("vacancy-2"), number: 2, name: "Frontend Engineer" })
      const { layer } = createRecruitingLayer({
        people: [makePerson("person-1", "Ada Lovelace"), grace],
        vacancies: [makeVacancy(), secondVacancy]
      })

      const rawMatch = yield* getRecruitingApplicant({
        applicant: ApplicantIdentifier.make("applicant-1"),
        vacancy: VacancyIdentifier.make("VCN-1"),
        candidate: CandidateIdentifier.make("Ada Lovelace")
      }).pipe(Effect.provide(layer), withDiagnostics)
      expect(rawMatch.identifier).toBe("APP-1")

      const vacancyMismatch = yield* Effect.flip(
        getRecruitingApplicant({
          applicant: ApplicantIdentifier.make("applicant-1"),
          vacancy: VacancyIdentifier.make("VCN-2")
        }).pipe(Effect.provide(layer), withDiagnostics)
      )
      expect(vacancyMismatch).toBeInstanceOf(RecruitingApplicantNotFoundError)

      const candidateMismatch = yield* Effect.flip(
        getRecruitingApplicant({
          applicant: ApplicantIdentifier.make("applicant-1"),
          candidate: CandidateIdentifier.make("Grace Hopper")
        }).pipe(Effect.provide(layer), withDiagnostics)
      )
      expect(candidateMismatch).toBeInstanceOf(RecruitingApplicantNotFoundError)

      const missingApplicant = yield* Effect.flip(
        getRecruitingApplicant({ applicant: ApplicantIdentifier.make("APP-404") }).pipe(
          Effect.provide(layer),
          withDiagnostics
        )
      )
      expect(missingApplicant).toBeInstanceOf(RecruitingApplicantNotFoundError)

      const unsupportedDelete = yield* Effect.flip(
        deleteRecruitingApplicant({ applicant: ApplicantIdentifier.make("APP-1") }).pipe(
          Effect.provide(createRecruitingLayer({ removeCollectionAvailable: false }).layer),
          withDiagnostics
        )
      )
      expect(unsupportedDelete).toBeInstanceOf(RecruitingMutationUnsupportedError)
    }))

  it.effect("lists applicants, resolves ambiguous applicant numbers, updates, and deletes", () =>
    Effect.gen(function*() {
      const second = makeApplicant({
        _id: docRef("applicant-2"),
        space: docRef("vacancy-2"),
        number: 1,
        identifier: "APP-1",
        status: interviewStatusRef
      })
      const { captures, layer } = createRecruitingLayer({
        applicants: [makeApplicant(), second],
        vacancies: [makeVacancy(), makeVacancy({ _id: docRef("vacancy-2"), number: 2 })]
      })

      const listed = yield* listRecruitingApplicants({ status: StatusName.make("Interview") }).pipe(
        Effect.provide(layer),
        withDiagnostics
      )
      expect(listed.total).toBe(1)
      expect(listed.applicants[0]?.id).toBe("applicant-2")

      const ambiguous = yield* Effect.flip(
        getRecruitingApplicant({ applicant: ApplicantIdentifier.make("APP-1") }).pipe(
          Effect.provide(layer),
          withDiagnostics
        )
      )
      expect(ambiguous).toBeInstanceOf(RecruitingApplicantIdentifierAmbiguousError)

      const updated = yield* updateRecruitingApplicant({
        applicant: ApplicantIdentifier.make("APP-1"),
        vacancy: VacancyIdentifier.make("VCN-1"),
        candidate: CandidateIdentifier.make("Ada Lovelace"),
        status: StatusName.make("Offer"),
        assignee: null,
        startDate: null,
        dueDate: Timestamp.make(1702000000000)
      }).pipe(Effect.provide(layer), withDiagnostics)

      expect(updated.applicant.status).toBe("Offer")
      expect(captures.updatedDocs.at(-1)?.operations).toMatchObject({
        status: offerStatusRef,
        assignee: null,
        startDate: null,
        dueDate: 1702000000000
      })

      const deleted = yield* deleteRecruitingApplicant({
        applicant: ApplicantIdentifier.make("APP-1"),
        vacancy: VacancyIdentifier.make("VCN-1"),
        candidate: CandidateIdentifier.make("Ada Lovelace")
      }).pipe(Effect.provide(layer), withDiagnostics)

      expect(deleted.deleted).toBe(true)
      expect(captures.removedCollections[0]).toMatchObject({
        class: String(recruitIds.class.Applicant),
        id: "applicant-1",
        attachedTo: "person-1",
        collection: "applications"
      })
    }))
})
