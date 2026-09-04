import { describe, it } from "@effect/vitest"
import type { MarkupRef } from "@hcengineering/api-client"
import type {
  Employee as HulyEmployee,
  Organization as HulyOrganization,
  Person as HulyPerson
} from "@hcengineering/contact"
import { AvatarType } from "@hcengineering/contact"
import type {
  Attribute,
  Class,
  Doc,
  DocumentQuery,
  FindResult,
  Ref,
  Sequence,
  Space,
  Status
} from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import type {
  Project,
  ProjectType,
  ProjectTypeDescriptor,
  Task,
  TaskType,
  TaskTypeDescriptor
} from "@hcengineering/task"
import { Effect } from "effect"
import { expect } from "vitest"

import { parseCreateLeadParams } from "../../../src/domain/schemas/leads.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { contact, core, task } from "../../../src/huly/huly-plugins.js"
import { leadClassIds } from "../../../src/huly/lead-plugin.js"
import { createLead } from "../../../src/huly/operations/leads-create.js"
import { toAccountUuid } from "../../../src/huly/operations/sdk-boundary.js"
import type { HulyStorageOperations } from "../../../src/huly/storage.js"
import { leadTools } from "../../../src/mcp/tools/leads.js"
import { withDiagnostics } from "../../helpers/diagnostics.js"
import { corePersonId, docRef } from "../../helpers/huly-sdk.js"

const ref = docRef
const personId = corePersonId
// eslint-disable-next-line no-restricted-syntax -- fixture-only bridge for an opaque SDK string brand
const markupRef = (value: string): MarkupRef => value as MarkupRef
const findResult = <T extends Doc>(docs: ReadonlyArray<T>): FindResult<T> => toFindResult([...docs])

const storageClient: HulyStorageOperations = {
  uploadFile: () => Effect.die(new Error("not implemented")),
  getFileUrl: () => "https://test.invalid/files"
}

const baseDoc = <T extends Doc>(_id: Ref<T>, _class: Ref<Class<T>>, space: Ref<Space>) => ({
  _id,
  _class,
  space,
  modifiedBy: personId("user-1"),
  modifiedOn: 0,
  createdBy: personId("user-1"),
  createdOn: 0
})

interface TestFunnel extends Doc {
  readonly name: string
  readonly archived: boolean
  readonly type: Ref<ProjectType> | undefined
}

const funnelId = ref<TestFunnel>("funnel-1")
const projectTypeId = ref<ProjectType>("project-type-1")
const leadTaskTypeId = ref<TaskType>("lead:taskType:Lead")
const incomingStatusId = ref<Status>("lead:status:Incoming")

const funnel: TestFunnel = {
  ...baseDoc(funnelId, ref<Class<TestFunnel>>(leadClassIds.class.Funnel), ref<Space>("core:space:Space")),
  name: "Sales",
  archived: false,
  type: projectTypeId
}

const projectType: ProjectType = {
  ...baseDoc(projectTypeId, task.class.ProjectType, core.space.Model),
  name: "Sales funnel",
  descriptor: ref<ProjectTypeDescriptor>("lead:descriptor:FunnelType"),
  roles: 0,
  description: "",
  tasks: [leadTaskTypeId],
  statuses: [{ _id: incomingStatusId, taskType: leadTaskTypeId }],
  targetClass: ref<Class<Project>>("lead:mixin:DefaultFunnelTypeData"),
  classic: false
}

const leadTaskType: TaskType = {
  ...baseDoc(leadTaskTypeId, task.class.TaskType, core.space.Model),
  parent: projectTypeId,
  descriptor: ref<TaskTypeDescriptor>("lead:descriptors:Lead"),
  name: "Lead",
  kind: "task",
  ofClass: leadClassIds.class.Lead,
  targetClass: ref<Class<Task>>("lead:mixin:LeadTypeData"),
  statuses: [incomingStatusId],
  statusClass: core.class.Status,
  statusCategories: [task.statusCategory.Active]
}

const incomingStatus: Status = {
  ...baseDoc(incomingStatusId, core.class.Status, core.space.Model),
  name: "Incoming",
  category: task.statusCategory.Active,
  ofAttribute: ref<Attribute<Status>>("lead:attribute:State")
}

const person: HulyPerson = {
  ...baseDoc(ref<HulyPerson>("person-1"), contact.class.Person, contact.space.Contacts),
  name: "Prospect,Pat",
  city: "",
  avatarType: AvatarType.COLOR
}

const employee: HulyEmployee = {
  ...baseDoc(ref<HulyEmployee>("person-1"), contact.mixin.Employee, contact.space.Contacts),
  name: "Prospect,Pat",
  city: "",
  avatarType: AvatarType.COLOR,
  active: true,
  position: "Sales",
  personUuid: toAccountUuid("00000000-0000-4000-8000-000000000001")
}

const organization: HulyOrganization = {
  ...baseDoc(ref<HulyOrganization>("organization-1"), contact.class.Organization, contact.space.Contacts),
  name: "Acme",
  city: "",
  avatarType: AvatarType.COLOR,
  members: 0,
  description: null,
  [leadClassIds.mixin.Customer]: { customerDescription: null }
}

const sequence: Sequence = {
  ...baseDoc(ref<Sequence>("lead-sequence"), core.class.Sequence, core.space.Model),
  attachedTo: leadClassIds.class.Lead,
  sequence: 41
}

interface LeadCreateHarnessConfig {
  readonly employee?: HulyEmployee
  readonly funnels?: ReadonlyArray<typeof funnel>
  readonly organizations?: ReadonlyArray<HulyOrganization>
  readonly people?: ReadonlyArray<HulyPerson>
  readonly projectType?: ProjectType | null
  readonly sequence?: Sequence | null
  readonly sequenceResult?: unknown
  readonly statuses?: ReadonlyArray<Status>
  readonly taskTypes?: ReadonlyArray<TaskType>
  readonly uploadedDescription?: MarkupRef
}

const makeLeadCreateHarness = (config: LeadCreateHarnessConfig = {}) => {
  const captures: Record<string, unknown> = {}
  const mutations: Array<string> = []
  const reads: Array<string> = []
  const funnels = config.funnels ?? [funnel]
  const organizations = config.organizations ?? []
  const people = config.people ?? [person]
  const resolvedProjectType = config.projectType === null ? undefined : (config.projectType ?? projectType)
  const resolvedSequence = config.sequence === null ? undefined : (config.sequence ?? sequence)
  const statuses = config.statuses ?? [incomingStatus]
  const taskTypes = config.taskTypes ?? [leadTaskType]

  const findOne: HulyClientOperations["findOne"] = <T extends Doc>(
    requestedClass: Ref<Class<T>>,
    query: DocumentQuery<T>
  ) => {
    reads.push(String(requestedClass))
    const id = Reflect.get(query, "_id")
    if (requestedClass === leadClassIds.class.Funnel) {
      const match = funnels.find((candidate) => candidate._id === id)
      // eslint-disable-next-line no-restricted-syntax -- class-ref branch establishes the fixture's generic SDK type
      return Effect.succeed(match as unknown as T | undefined)
    }
    if (requestedClass === task.class.ProjectType) {
      // eslint-disable-next-line no-restricted-syntax -- class-ref branch establishes the fixture's generic SDK type
      return Effect.succeed(resolvedProjectType as unknown as T | undefined)
    }
    if (requestedClass === contact.class.Person) {
      const match = people.find((candidate) => candidate._id === id)
      // eslint-disable-next-line no-restricted-syntax -- class-ref branch establishes the fixture's generic SDK type
      return Effect.succeed(match as unknown as T | undefined)
    }
    if (requestedClass === contact.mixin.Employee) {
      // eslint-disable-next-line no-restricted-syntax -- class-ref branch establishes the fixture's generic SDK type
      return Effect.succeed(config.employee as unknown as T | undefined)
    }
    if (requestedClass === contact.class.Organization) {
      const match = organizations.find((candidate) => candidate._id === id)
      // eslint-disable-next-line no-restricted-syntax -- class-ref branch establishes the fixture's generic SDK type
      return Effect.succeed(match as unknown as T | undefined)
    }
    if (requestedClass === core.class.Sequence) {
      // eslint-disable-next-line no-restricted-syntax -- class-ref branch establishes the fixture's generic SDK type
      return Effect.succeed(resolvedSequence as unknown as T | undefined)
    }
    return Effect.succeed(undefined)
  }

  const findAll: HulyClientOperations["findAll"] = <T extends Doc>(
    requestedClass: Ref<Class<T>>,
    query: DocumentQuery<T>
  ) => {
    reads.push(String(requestedClass))
    let matches: ReadonlyArray<Doc> = []
    if (requestedClass === leadClassIds.class.Funnel) {
      const id = Reflect.get(query, "_id")
      const name = Reflect.get(query, "name")
      matches = funnels.filter((candidate) => candidate._id === id || candidate.name === name)
    } else if (requestedClass === task.class.TaskType) {
      matches = taskTypes
    } else if (requestedClass === core.class.Status) {
      matches = statuses
    } else if (requestedClass === contact.class.Person) {
      const name = Reflect.get(query, "name")
      matches = people.filter((candidate) => candidate.name === name)
    } else if (requestedClass === contact.class.Organization) {
      const name = Reflect.get(query, "name")
      matches = organizations.filter((candidate) => candidate.name === name)
    }
    // eslint-disable-next-line no-restricted-syntax -- class-ref branches establish every fixture's generic SDK type
    return Effect.succeed(findResult(matches as ReadonlyArray<T>))
  }

  const layer = HulyClient.testLayer({
    findOne,
    findAll,
    createMixin: (_id, _class, _space, mixin, attributes) => {
      mutations.push("customer-mixin")
      captures.mixin = mixin
      captures.customerDescription = Reflect.get(attributes, "customerDescription")
      return Effect.succeed({})
    },
    updateDoc: (_class, _space, _id, operations, retrieve) => {
      mutations.push("sequence")
      captures.sequenceUpdate = operations
      captures.sequenceRetrieve = retrieve
      return Effect.succeed(config.sequenceResult ?? { object: { sequence: 42 } })
    },
    uploadMarkup: (_class, _id, _attribute, markup, format) => {
      mutations.push("description")
      captures.uploadedMarkup = markup
      captures.uploadedFormat = format
      return Effect.succeed(config.uploadedDescription ?? markupRef("lead-description"))
    },
    addCollection: (_class, space, attachedTo, attachedToClass, collection, attributes, id) => {
      mutations.push("lead")
      captures.space = space
      captures.attachedTo = attachedTo
      captures.attachedToClass = attachedToClass
      captures.collection = collection
      captures.leadData = attributes
      captures.leadId = id
      return Effect.succeed(ref("lead-42"))
    }
  })
  const client = Effect.runSync(HulyClient.pipe(Effect.provide(layer)))

  return { captures, client, layer, mutations, reads }
}

describe("createLead", () => {
  it.effect("creates a native lead for an existing person and promotes the customer", () =>
    Effect.gen(function* () {
      const harness = makeLeadCreateHarness()

      const params = yield* parseCreateLeadParams({
        funnel: "funnel-1",
        customer: { kind: "person", identifier: "person-1" },
        title: "Enterprise renewal"
      })
      const result = yield* createLead(params).pipe(Effect.provide(harness.layer), withDiagnostics)

      expect(result).toEqual({ leadId: harness.captures.leadId, identifier: "LEAD-42" })
      expect(harness.mutations).toEqual(["customer-mixin", "sequence", "lead"])
      expect(harness.captures.mixin).toBe(leadClassIds.mixin.Customer)
      expect(harness.captures.customerDescription).toBeNull()
      expect(harness.captures.sequenceUpdate).toEqual({ $inc: { sequence: 1 } })
      expect(harness.captures.sequenceRetrieve).toBe(true)
      expect(harness.captures.space).toBe(funnelId)
      expect(harness.captures.attachedTo).toBe(person._id)
      expect(harness.captures.attachedToClass).toBe(leadClassIds.mixin.Customer)
      expect(harness.captures.collection).toBe("leads")
      expect(harness.captures.leadData).toMatchObject({
        identifier: "LEAD-42",
        number: 42,
        title: "Enterprise renewal",
        kind: leadTaskTypeId,
        status: incomingStatusId,
        assignee: null,
        startDate: null,
        dueDate: null
      })
      expect(harness.reads.filter((readClass) => readClass === String(leadClassIds.class.Lead))).toEqual([])
    })
  )

  it.effect("encodes the create_lead MCP handler result as structured output", () =>
    Effect.gen(function* () {
      const harness = makeLeadCreateHarness()
      const tool = leadTools.find((candidate) => candidate.name === "create_lead")
      if (tool === undefined) return yield* Effect.die(new Error("create_lead tool is missing"))

      const response = yield* Effect.promise(() =>
        tool.handler(
          { funnel: "funnel-1", customer: { kind: "person", identifier: "person-1" }, title: "Structured output" },
          harness.client,
          storageClient
        )
      )

      expect(response.isError).toBeUndefined()
      expect(response.structuredContent).toMatchObject({
        result: { leadId: harness.captures.leadId, identifier: "LEAD-42" }
      })
    })
  )

  it.effect("uses exact friendly locators, skips an existing Customer mixin, and preserves native references", () =>
    Effect.gen(function* () {
      const harness = makeLeadCreateHarness({ employee, organizations: [organization] })
      const params = yield* parseCreateLeadParams({
        funnel: "Sales",
        customer: { kind: "organization", identifier: "Acme" },
        title: "Account expansion",
        description:
          "Follow up with [Pat](https://test.invalid/browse?workspace=test&_class=contact%3Aclass%3APerson&_id=person-1&label=Pat).",
        assignee: "person-1",
        taskType: "Lead",
        status: "Incoming"
      })

      const result = yield* createLead(params).pipe(Effect.provide(harness.layer), withDiagnostics)

      expect(result.identifier).toBe("LEAD-42")
      expect(harness.mutations).toEqual(["sequence", "description", "lead"])
      expect(harness.captures.attachedTo).toBe(organization._id)
      expect(harness.captures.uploadedFormat).toBe("markup")
      expect(harness.captures.uploadedMarkup).toEqual(expect.stringContaining('"type":"reference"'))
      expect(harness.captures.uploadedMarkup).toEqual(expect.stringContaining('"id":"person-1"'))
      expect(harness.captures.leadData).toMatchObject({
        assignee: person._id,
        description: "lead-description",
        kind: leadTaskTypeId,
        status: incomingStatusId
      })
    })
  )

  it.effect("rejects malformed native references before promoting the customer", () =>
    Effect.gen(function* () {
      const harness = makeLeadCreateHarness()
      const params = yield* parseCreateLeadParams({
        funnel: "funnel-1",
        customer: { kind: "person", identifier: "person-1" },
        title: "Malformed reference",
        description: "Broken [Doc](https://test.invalid/browse?workspace=test&_id=doc-1)."
      })

      const error = yield* Effect.flip(createLead(params).pipe(Effect.provide(harness.layer), withDiagnostics))

      expect(error._tag).toBe("HulyError")
      expect(error.message).toContain("malformed Huly native reference links in description")
      expect(harness.mutations).toEqual([])
    })
  )

  it.effect("rejects archived and ambiguous funnels before any mutation", () =>
    Effect.gen(function* () {
      const archivedHarness = makeLeadCreateHarness({ funnels: [{ ...funnel, archived: true }] })
      const archivedParams = yield* parseCreateLeadParams({
        funnel: "funnel-1",
        customer: { kind: "person", identifier: "person-1" },
        title: "Blocked"
      })
      const archivedError = yield* Effect.flip(
        createLead(archivedParams).pipe(Effect.provide(archivedHarness.layer), withDiagnostics)
      )

      const duplicateFunnel: TestFunnel = { ...funnel, _id: ref<TestFunnel>("funnel-2") }
      const ambiguousHarness = makeLeadCreateHarness({ funnels: [funnel, duplicateFunnel] })
      const ambiguousParams = yield* parseCreateLeadParams({
        funnel: "Sales",
        customer: { kind: "person", identifier: "person-1" },
        title: "Ambiguous"
      })
      const ambiguousError = yield* Effect.flip(
        createLead(ambiguousParams).pipe(Effect.provide(ambiguousHarness.layer), withDiagnostics)
      )

      expect(archivedError._tag).toBe("HulyError")
      expect(archivedError.message).toContain("archived")
      expect(archivedHarness.mutations).toEqual([])
      expect(ambiguousError._tag).toBe("FunnelIdentifierAmbiguousError")
      expect(ambiguousError.message).toContain("matched 2 funnels")
      expect(ambiguousHarness.mutations).toEqual([])
    })
  )

  it.effect("rejects ambiguous customers and non-employee assignees before any mutation", () =>
    Effect.gen(function* () {
      const duplicatePerson: HulyPerson = { ...person, _id: ref<HulyPerson>("person-2") }
      const ambiguousHarness = makeLeadCreateHarness({ people: [person, duplicatePerson] })
      const ambiguousParams = yield* parseCreateLeadParams({
        funnel: "funnel-1",
        customer: { kind: "person", identifier: "Prospect,Pat" },
        title: "Ambiguous customer"
      })
      const ambiguousError = yield* Effect.flip(
        createLead(ambiguousParams).pipe(Effect.provide(ambiguousHarness.layer), withDiagnostics)
      )

      const assigneeHarness = makeLeadCreateHarness()
      const assigneeParams = yield* parseCreateLeadParams({
        funnel: "funnel-1",
        customer: { kind: "person", identifier: "person-1" },
        title: "No employee",
        assignee: "person-1"
      })
      const assigneeError = yield* Effect.flip(
        createLead(assigneeParams).pipe(Effect.provide(assigneeHarness.layer), withDiagnostics)
      )

      expect(ambiguousError._tag).toBe("PersonIdentifierAmbiguousError")
      expect(ambiguousHarness.mutations).toEqual([])
      expect(assigneeError._tag).toBe("PersonNotAnEmployeeError")
      expect(assigneeHarness.mutations).toEqual([])
    })
  )

  it.effect("rejects ambiguous task types and statuses outside the selected workflow before mutation", () =>
    Effect.gen(function* () {
      const customTypeId = ref<TaskType>("lead:taskType:Custom")
      const customType: TaskType = { ...leadTaskType, _id: customTypeId, name: "Custom Lead" }
      const multiTypeProject: ProjectType = { ...projectType, tasks: [leadTaskTypeId, customTypeId] }
      const taskTypeHarness = makeLeadCreateHarness({
        projectType: multiTypeProject,
        taskTypes: [leadTaskType, customType]
      })
      const taskTypeParams = yield* parseCreateLeadParams({
        funnel: "funnel-1",
        customer: { kind: "person", identifier: "person-1" },
        title: "Bad type",
        taskType: "Missing"
      })
      const taskTypeError = yield* Effect.flip(
        createLead(taskTypeParams).pipe(Effect.provide(taskTypeHarness.layer), withDiagnostics)
      )

      const statusHarness = makeLeadCreateHarness()
      const statusParams = yield* parseCreateLeadParams({
        funnel: "funnel-1",
        customer: { kind: "person", identifier: "person-1" },
        title: "Bad status",
        status: "Won"
      })
      const statusError = yield* Effect.flip(
        createLead(statusParams).pipe(Effect.provide(statusHarness.layer), withDiagnostics)
      )

      expect(taskTypeError._tag).toBe("HulyError")
      expect(taskTypeError.message).toContain("was not found as a compatible type")
      expect(taskTypeHarness.mutations).toEqual([])
      expect(statusError._tag).toBe("HulyError")
      expect(statusError.message).toContain("not valid")
      expect(statusHarness.mutations).toEqual([])
    })
  )

  it.effect("fails actionably when the authoritative sequence is absent or malformed", () =>
    Effect.gen(function* () {
      const customerWithMixin: HulyPerson = { ...person, [leadClassIds.mixin.Customer]: { customerDescription: null } }
      const missingHarness = makeLeadCreateHarness({ sequence: null })
      const params = yield* parseCreateLeadParams({
        funnel: "funnel-1",
        customer: { kind: "person", identifier: "person-1" },
        title: "Sequence failure"
      })
      const missingError = yield* Effect.flip(
        createLead(params).pipe(Effect.provide(missingHarness.layer), withDiagnostics)
      )

      const malformedHarness = makeLeadCreateHarness({
        people: [customerWithMixin],
        sequenceResult: { object: { sequence: "42" } }
      })
      const malformedError = yield* Effect.flip(
        createLead(params).pipe(Effect.provide(malformedHarness.layer), withDiagnostics)
      )

      expect(missingError._tag).toBe("HulyDataInvalidError")
      expect(missingHarness.mutations).toEqual([])
      expect(malformedError._tag).toBe("HulyDataInvalidError")
      expect(malformedHarness.mutations).toEqual(["sequence"])
    })
  )

  it.effect("reports missing funnels, customers, assignees, and funnel workflow metadata before mutation", () =>
    Effect.gen(function* () {
      const missingFunnelHarness = makeLeadCreateHarness({ funnels: [] })
      const missingFunnelParams = yield* parseCreateLeadParams({
        funnel: "Missing",
        customer: { kind: "person", identifier: "person-1" },
        title: "Missing funnel"
      })
      const missingFunnelError = yield* Effect.flip(
        createLead(missingFunnelParams).pipe(Effect.provide(missingFunnelHarness.layer), withDiagnostics)
      )

      const missingCustomerHarness = makeLeadCreateHarness({ people: [] })
      const missingCustomerParams = yield* parseCreateLeadParams({
        funnel: "funnel-1",
        customer: { kind: "person", identifier: "missing-person" },
        title: "Missing customer"
      })
      const missingCustomerError = yield* Effect.flip(
        createLead(missingCustomerParams).pipe(Effect.provide(missingCustomerHarness.layer), withDiagnostics)
      )

      const missingAssigneeHarness = makeLeadCreateHarness()
      const missingAssigneeParams = yield* parseCreateLeadParams({
        funnel: "funnel-1",
        customer: { kind: "person", identifier: "person-1" },
        title: "Missing assignee",
        assignee: "missing-person"
      })
      const missingAssigneeError = yield* Effect.flip(
        createLead(missingAssigneeParams).pipe(Effect.provide(missingAssigneeHarness.layer), withDiagnostics)
      )

      const funnelWithoutType: TestFunnel = { ...funnel, type: undefined }
      const missingTypeHarness = makeLeadCreateHarness({ funnels: [funnelWithoutType] })
      const standardParams = yield* parseCreateLeadParams({
        funnel: "funnel-1",
        customer: { kind: "person", identifier: "person-1" },
        title: "Missing workflow"
      })
      const missingTypeError = yield* Effect.flip(
        createLead(standardParams).pipe(Effect.provide(missingTypeHarness.layer), withDiagnostics)
      )

      const missingProjectTypeHarness = makeLeadCreateHarness({ projectType: null })
      const missingProjectTypeError = yield* Effect.flip(
        createLead(standardParams).pipe(Effect.provide(missingProjectTypeHarness.layer), withDiagnostics)
      )

      expect(missingFunnelError._tag).toBe("FunnelNotFoundError")
      expect(missingCustomerError._tag).toBe("PersonNotFoundError")
      expect(missingAssigneeError._tag).toBe("PersonNotFoundError")
      expect(missingTypeError._tag).toBe("HulyDataInvalidError")
      expect(missingProjectTypeError._tag).toBe("HulyDataInvalidError")
      expect(
        [
          missingFunnelHarness,
          missingCustomerHarness,
          missingAssigneeHarness,
          missingTypeHarness,
          missingProjectTypeHarness
        ].map((harness) => harness.mutations)
      ).toEqual([[], [], [], [], []])
    })
  )

  it.effect("selects a sole custom Lead type and rejects absent or ambiguous default choices", () =>
    Effect.gen(function* () {
      const customTypeId = ref<TaskType>("lead:taskType:Custom")
      const customType: TaskType = { ...leadTaskType, _id: customTypeId, name: "Custom Lead" }
      const customProjectType: ProjectType = {
        ...projectType,
        tasks: [customTypeId],
        statuses: [{ _id: incomingStatusId, taskType: customTypeId }]
      }
      const soleHarness = makeLeadCreateHarness({ projectType: customProjectType, taskTypes: [customType] })
      const params = yield* parseCreateLeadParams({
        funnel: "funnel-1",
        customer: { kind: "person", identifier: "person-1" },
        title: "Custom type",
        description: "   "
      })
      yield* createLead(params).pipe(Effect.provide(soleHarness.layer), withDiagnostics)

      const absentHarness = makeLeadCreateHarness({ projectType: customProjectType, taskTypes: [] })
      const absentError = yield* Effect.flip(
        createLead(params).pipe(Effect.provide(absentHarness.layer), withDiagnostics)
      )

      const secondTypeId = ref<TaskType>("lead:taskType:Second")
      const secondType: TaskType = { ...customType, _id: secondTypeId, name: "Second Lead" }
      const ambiguousProjectType: ProjectType = { ...customProjectType, tasks: [customTypeId, secondTypeId] }
      const ambiguousHarness = makeLeadCreateHarness({
        projectType: ambiguousProjectType,
        taskTypes: [customType, secondType]
      })
      const ambiguousError = yield* Effect.flip(
        createLead(params).pipe(Effect.provide(ambiguousHarness.layer), withDiagnostics)
      )

      expect(soleHarness.captures.leadData).toMatchObject({ kind: customTypeId, description: null })
      expect(soleHarness.mutations).not.toContain("description")
      expect(absentError.message).toContain("No Lead-compatible task types")
      expect(absentHarness.mutations).toEqual([])
      expect(ambiguousError.message).toContain("matched more than one compatible type")
      expect(ambiguousHarness.mutations).toEqual([])
    })
  )

  it.effect("rejects duplicate requested task types and missing or duplicate task statuses", () =>
    Effect.gen(function* () {
      const duplicateTypeId = ref<TaskType>("lead:taskType:Duplicate")
      const duplicateType: TaskType = { ...leadTaskType, _id: duplicateTypeId }
      const duplicateTypeProject: ProjectType = { ...projectType, tasks: [leadTaskTypeId, duplicateTypeId] }
      const duplicateTypeHarness = makeLeadCreateHarness({
        projectType: duplicateTypeProject,
        taskTypes: [leadTaskType, duplicateType]
      })
      const requestedParams = yield* parseCreateLeadParams({
        funnel: "funnel-1",
        customer: { kind: "person", identifier: "person-1" },
        title: "Duplicate type",
        taskType: "Lead"
      })
      const duplicateTypeError = yield* Effect.flip(
        createLead(requestedParams).pipe(Effect.provide(duplicateTypeHarness.layer), withDiagnostics)
      )

      const statuslessType: TaskType = { ...leadTaskType, statuses: [] }
      const missingStatusHarness = makeLeadCreateHarness({ taskTypes: [statuslessType], statuses: [] })
      const defaultParams = yield* parseCreateLeadParams({
        funnel: "funnel-1",
        customer: { kind: "person", identifier: "person-1" },
        title: "Missing status"
      })
      const missingStatusError = yield* Effect.flip(
        createLead(defaultParams).pipe(Effect.provide(missingStatusHarness.layer), withDiagnostics)
      )

      const duplicateStatusId = ref<Status>("lead:status:IncomingDuplicate")
      const duplicateStatus: Status = { ...incomingStatus, _id: duplicateStatusId }
      const duplicateStatusType: TaskType = { ...leadTaskType, statuses: [incomingStatusId, duplicateStatusId] }
      const duplicateStatusHarness = makeLeadCreateHarness({
        taskTypes: [duplicateStatusType],
        statuses: [incomingStatus, duplicateStatus]
      })
      const statusParams = yield* parseCreateLeadParams({
        funnel: "funnel-1",
        customer: { kind: "person", identifier: "person-1" },
        title: "Duplicate status",
        status: "Incoming"
      })
      const duplicateStatusError = yield* Effect.flip(
        createLead(statusParams).pipe(Effect.provide(duplicateStatusHarness.layer), withDiagnostics)
      )

      expect(duplicateTypeError.message).toContain("matched more than one compatible type")
      expect(missingStatusError.message).toContain("no deterministic default status")
      expect(duplicateStatusError.message).toContain("matched more than one status")
      expect(duplicateTypeHarness.mutations).toEqual([])
      expect(missingStatusHarness.mutations).toEqual([])
      expect(duplicateStatusHarness.mutations).toEqual([])
    })
  )
})
