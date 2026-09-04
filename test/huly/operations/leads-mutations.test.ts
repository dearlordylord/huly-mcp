import { describe, it } from "@effect/vitest"
import { AvatarType } from "@hcengineering/contact"
import type { Person } from "@hcengineering/contact"
import type { Class, Doc, DocumentQuery, FindOptions, Ref } from "@hcengineering/core"
import type { TaskType } from "@hcengineering/task"
import { Effect, Schema } from "effect"
import { expect } from "vitest"

import {
  FunnelReference,
  FunnelIdentifier,
  LeadIdentifier,
  parseDeleteLeadParams,
  parseMakePersonCustomerParams,
  parseMoveLeadParams,
  parseUpdateLeadParams
} from "../../../src/domain/schemas/leads.js"
import {
  LeadMutationDocumentSchema,
  type LeadOrganizationDocument,
  type LeadPersonDocument
} from "../../../src/domain/schemas/leads-mutations.js"
import { PersonLocator } from "../../../src/domain/schemas/hr-departments.js"
import {
  BlobId,
  Count,
  DocId,
  NonEmptyString,
  OrganizationId,
  PersonId,
  PersonName,
  SpaceId,
  StatusName,
  TaskTypeId,
  Timestamp,
  WorkflowStatusId
} from "../../../src/domain/schemas/shared.js"
import { HulyClient } from "../../../src/huly/client.js"
import { leadClassIds } from "../../../src/huly/lead-plugin.js"
import {
  assigneeUpdate,
  applyPersonCustomer,
  compatibleDestinationWorkflow,
  customerDescriptionUpdate,
  deleteLead,
  deleteResolvedLead,
  deletionImpact,
  descriptionUpdate,
  destinationStatus,
  destinationStatusReason,
  leadFieldUpdates,
  leadUpdateChanged,
  makePersonCustomer,
  moveLead,
  moveOperations,
  moveRequired,
  persistLeadMove,
  persistLeadUpdate,
  rejectArchivedLeadUpdate,
  rejectInactiveMoveFunnels,
  resolvedMoveStatusName,
  requireDestinationWorkflow,
  statusForLead,
  statusUpdate,
  updateLead
} from "../../../src/huly/operations/leads-mutations.js"
import {
  customerMixinWriteAttributes,
  parseLeadMutationDocument,
  parseLeadEmployeeDocument,
  parseLeadOrganizationDocument,
  parseLeadPersonDocument,
  parseOptionalLeadPersonDocument,
  requireEmployee,
  requireLeadDocument,
  resolveLeadCustomer,
  toMarkupBlobRef
} from "../../../src/huly/operations/leads-mutations-boundary.js"
import {
  currentStatus,
  customerClass,
  findLead,
  hasCustomerMixin,
  resolveExactPerson,
  resolveEmployee,
  statusByName,
  uniquePersonMatch,
  updateLeadCustomerDescription,
  updateCustomerDescription,
  updateLeadDescription,
  validatedFunnel,
  workflowForLead,
  type HulyLead
} from "../../../src/huly/operations/leads-mutations-shared.js"
import type { FunnelWorkflowTaskType, HulyFunnel } from "../../../src/huly/operations/funnels-shared.js"
import { attachment, chunter, contact, core, tags, task } from "../../../src/huly/huly-plugins.js"
import { testMarkupUrlConfig } from "../../../src/huly/operations/markup.js"
import { renderMarkdownWithNativeReferencesForWrite } from "../../../src/huly/operations/native-reference-markup.js"
import { toClassRef } from "../../../src/huly/operations/sdk-boundary.js"
import { corePersonId, docRef, findResult, spaceRef, statusRef } from "../../helpers/huly-sdk.js"
import { withDiagnostics } from "../../helpers/diagnostics.js"

const leadStatusId = WorkflowStatusId.make("lead:status:Incoming")
const leadStatus = statusRef(String(leadStatusId))
const leadTaskTypeId = TaskTypeId.make("lead:taskType:Lead")
const leadTaskType = docRef<TaskType>(String(leadTaskTypeId))
const lead: HulyLead = {
  _id: DocId.make("lead-1"),
  _class: DocId.make(leadClassIds.class.Lead),
  space: SpaceId.make("funnel-1"),
  attachedTo: DocId.make("person-1"),
  attachedToClass: DocId.make(contact.class.Person),
  collection: "leads",
  title: NonEmptyString.make("A lead"),
  identifier: LeadIdentifier.make("LEAD-1"),
  status: leadStatusId,
  kind: leadTaskTypeId,
  assignee: null,
  description: null,
  startDate: null,
  dueDate: null
}

const person = (id: PersonId, name: PersonName): LeadPersonDocument => ({
  _id: id,
  _class: DocId.make(contact.class.Person),
  space: SpaceId.make(String(contact.space.Contacts)),
  name
})

const workflow: FunnelWorkflowTaskType = {
  taskType: {
    _id: leadTaskType,
    _class: task.class.TaskType,
    space: core.space.Model,
    modifiedBy: corePersonId("user-1"),
    modifiedOn: Timestamp.make(0),
    parent: docRef("project-type-1"),
    descriptor: docRef("task-type-descriptor"),
    name: "Lead",
    kind: "task",
    ofClass: leadClassIds.class.Lead,
    targetClass: docRef("lead:mixin:LeadTypeData"),
    statuses: [leadStatus],
    statusClass: core.class.Status,
    statusCategories: []
  },
  statuses: [{ id: leadStatus, name: "Incoming" }]
}

const activeFunnel: HulyFunnel = {
  _id: docRef("funnel-1"),
  _class: toClassRef<HulyFunnel>(leadClassIds.class.Funnel),
  space: spaceRef("workspace"),
  modifiedBy: corePersonId("user-1"),
  modifiedOn: Timestamp.make(0),
  name: "Sales",
  description: "",
  private: false,
  members: [],
  archived: false,
  type: docRef("project-type-1")
}

describe("Lead mutation functional helpers", () => {
  it.effect("parses each native lead mutation boundary and reports malformed documents", () =>
    Effect.gen(function* () {
      const leadPerson = person(PersonId.make("person-1"), PersonName.make("Prospect,Pat"))
      const organization: LeadOrganizationDocument = {
        _id: OrganizationId.make("organization-1"),
        _class: DocId.make(contact.class.Organization),
        space: SpaceId.make(String(contact.space.Contacts)),
        name: NonEmptyString.make("Acme")
      }
      const employee = { ...leadPerson, _class: DocId.make(contact.mixin.Employee), position: "Sales" }
      const nativePerson: Person = {
        _id: docRef<Person>("person-1"),
        _class: contact.class.Person,
        space: contact.space.Contacts,
        modifiedBy: corePersonId("user-1"),
        modifiedOn: Timestamp.make(0),
        name: "Prospect,Pat",
        city: "",
        avatarType: AvatarType.COLOR
      }

      expect(yield* parseLeadPersonDocument(leadPerson)).toEqual(leadPerson)
      expect(yield* parseOptionalLeadPersonDocument(undefined)).toBeUndefined()
      expect(yield* parseOptionalLeadPersonDocument(nativePerson)).toEqual(nativePerson)
      expect(yield* parseLeadEmployeeDocument(employee)).toEqual(employee)
      expect(yield* parseLeadOrganizationDocument(organization)).toEqual(organization)
      expect(yield* customerMixinWriteAttributes({ customerDescription: null })).toEqual({ customerDescription: null })
      expect(yield* customerMixinWriteAttributes({ customerDescription: "customer-markup" })).toEqual({
        customerDescription: toMarkupBlobRef(NonEmptyString.make("customer-markup"))
      })

      const error = yield* Effect.flip(parseLeadPersonDocument({ _id: "missing-native-fields" }))
      expect(error._tag).toBe("HulyDataInvalidError")
      expect(error.entity).toBe("Person document")
    })
  )

  it.effect("calculates deletion impact from authoritative native relations", () =>
    Effect.gen(function* () {
      const calls: Array<{
        readonly className: string
        readonly limit: number | undefined
        readonly total: boolean | undefined
      }> = []
      const client = yield* HulyClient.pipe(
        Effect.provide(
          HulyClient.testLayer({
            findAll: <T extends Doc>(
              documentClass: Ref<Class<T>>,
              _query: DocumentQuery<T>,
              options?: FindOptions<T>
            ) => {
              calls.push({ className: String(documentClass), limit: options?.limit, total: options?.total })
              const total =
                String(documentClass) === String(chunter.class.ChatMessage)
                  ? 2
                  : String(documentClass) === String(attachment.class.Attachment)
                    ? 3
                    : String(documentClass) === String(tags.class.TagReference)
                      ? 1
                      : 0
              const result = findResult<T>([])
              result.total = total
              return Effect.succeed(result)
            }
          })
        )
      )
      const impacted = yield* deletionImpact(client, lead)

      expect(impacted).toEqual({
        comments: Count.make(2),
        attachments: Count.make(3),
        labels: Count.make(1),
        totalAffected: Count.make(6)
      })
      expect(calls).toEqual([
        { className: String(chunter.class.ChatMessage), limit: 1, total: true },
        { className: String(attachment.class.Attachment), limit: 1, total: true },
        { className: String(tags.class.TagReference), limit: 1, total: true }
      ])
    })
  )

  it.effect("reports zero-count impact when authoritative relation totals are zero", () =>
    Effect.gen(function* () {
      const client = yield* HulyClient.pipe(
        Effect.provide(
          HulyClient.testLayer({
            findAll: <T extends Doc>() => {
              const result = findResult<T>([])
              result.total = 0
              return Effect.succeed(result)
            }
          })
        )
      )
      const impacted = yield* deletionImpact(client, lead)

      expect(impacted).toEqual({
        comments: Count.make(0),
        attachments: Count.make(0),
        labels: Count.make(0),
        totalAffected: Count.make(0)
      })
    })
  )

  it.effect("refuses deletion impact when a native relation total is unknown", () =>
    Effect.gen(function* () {
      const client = yield* HulyClient.pipe(
        Effect.provide(
          HulyClient.testLayer({
            findAll: <T extends Doc>() => {
              const result = findResult<T>([])
              result.total = -1
              return Effect.succeed(result)
            }
          })
        )
      )
      const error = yield* Effect.flip(deletionImpact(client, lead))

      expect(error._tag).toBe("HulyDataInvalidError")
      if (error._tag === "HulyDataInvalidError") expect(error.entity).toContain("comments relation count")
    })
  )

  it.effect("requires AttachedDoc collection metadata before lead deletion", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        Schema.decodeUnknownEffect(LeadMutationDocumentSchema)({ ...lead, attachedTo: undefined })
      )

      expect(error._tag).toBe("SchemaError")
    })
  )

  it.effect("resolves a workflow status by normalized display name", () =>
    Effect.gen(function* () {
      const resolved = yield* statusByName(
        workflow.statuses,
        StatusName.make("incoming"),
        FunnelReference.make("funnel-1")
      )
      expect(resolved).toBe(leadStatus)
    })
  )

  it.effect("rejects missing and duplicate workflow status names", () =>
    Effect.gen(function* () {
      const missing = yield* Effect.flip(
        statusByName(workflow.statuses, StatusName.make("Won"), FunnelReference.make("funnel-1"))
      )
      const duplicate = yield* Effect.flip(
        statusByName(
          [...workflow.statuses, { id: statusRef("lead:status:Incoming-2"), name: "Incoming" }],
          StatusName.make("Incoming"),
          FunnelReference.make("funnel-1")
        )
      )

      expect(missing._tag).toBe("InvalidStatusError")
      expect(duplicate._tag).toBe("InvalidStatusError")
    })
  )

  it.effect("rejects cross-modality person collisions", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        uniquePersonMatch(PersonLocator.make("shared@example.com"), [
          person(PersonId.make("person-by-id"), PersonName.make("Person by ID")),
          person(PersonId.make("person-by-email"), PersonName.make("Person by email"))
        ])
      )
      expect(error._tag).toBe("PersonIdentifierAmbiguousError")
      if (error._tag === "PersonIdentifierAmbiguousError") expect(error.matches).toBe(2)
    })
  )

  it.effect("rejects duplicate exact email matches", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        uniquePersonMatch(PersonLocator.make("duplicate@example.com"), [
          person(PersonId.make("first"), PersonName.make("First")),
          person(PersonId.make("second"), PersonName.make("Second"))
        ])
      )
      expect(error._tag).toBe("PersonIdentifierAmbiguousError")
      if (error._tag === "PersonIdentifierAmbiguousError") expect(error.matches).toBe(2)
    })
  )

  it.effect("deduplicates the same person and reports an absent exact person", () =>
    Effect.gen(function* () {
      const samePerson = person(PersonId.make("person-1"), PersonName.make("Prospect,Pat"))
      expect(yield* uniquePersonMatch(PersonLocator.make("person-1"), [samePerson, undefined, samePerson])).toEqual(
        samePerson
      )

      const error = yield* Effect.flip(uniquePersonMatch(PersonLocator.make("missing"), []))
      expect(error._tag).toBe("PersonNotFoundError")
    })
  )

  it.effect("reports absent people and leads through the default client seam", () =>
    Effect.gen(function* () {
      const client = yield* HulyClient.pipe(Effect.provide(HulyClient.testLayer({})))
      const plainIdentifier = yield* Effect.flip(resolveExactPerson(client, PersonLocator.make("Missing Person")))
      const emailIdentifier = yield* Effect.flip(resolveExactPerson(client, PersonLocator.make("missing@example.com")))
      const missingLead = yield* Effect.flip(findLead(client, activeFunnel, LeadIdentifier.make("LEAD-404")))

      expect(plainIdentifier._tag).toBe("PersonNotFoundError")
      expect(emailIdentifier._tag).toBe("PersonNotFoundError")
      expect(missingLead._tag).toBe("LeadNotFoundError")
    })
  )

  it.effect("selects the lead workflow and rejects missing task types and statuses", () =>
    Effect.gen(function* () {
      expect(yield* workflowForLead([workflow], lead, activeFunnel)).toEqual(workflow)

      const missingWorkflow = yield* Effect.flip(workflowForLead([], lead, activeFunnel))
      const missingStatus = yield* Effect.flip(currentStatus({ ...workflow, statuses: [] }, lead, activeFunnel))
      expect(missingWorkflow._tag).toBe("HulyError")
      expect(missingWorkflow.message).toContain("not configured")
      expect(missingStatus._tag).toBe("HulyError")
      expect(missingStatus.message).toContain("has status")
    })
  )

  it.effect("computes lead field, assignee, and status update decisions without unnecessary writes", () =>
    Effect.gen(function* () {
      const client = yield* HulyClient.pipe(Effect.provide(HulyClient.testLayer({})))
      const base = yield* parseUpdateLeadParams({ funnel: "funnel-1", identifier: "LEAD-1", title: "A lead" })
      const changed = yield* parseUpdateLeadParams({
        funnel: "funnel-1",
        identifier: "LEAD-1",
        title: "Changed",
        startDate: 10,
        dueDate: 20
      })
      const unassign = yield* parseUpdateLeadParams({ funnel: "funnel-1", identifier: "LEAD-1", assignee: null })
      const clearExisting = { ...lead, assignee: PersonId.make("person-2") }

      expect(leadFieldUpdates(base, lead)).toEqual({})
      expect(leadFieldUpdates(changed, lead)).toEqual({ title: "Changed", startDate: 10, dueDate: 20 })
      expect(yield* assigneeUpdate(client, base, lead)).toEqual({ operations: {}, changed: false })
      expect(yield* assigneeUpdate(client, unassign, lead)).toEqual({ operations: {}, changed: false })
      expect(yield* assigneeUpdate(client, unassign, clearExisting)).toEqual({
        operations: { assignee: null },
        changed: true
      })
      const assignMissing = yield* parseUpdateLeadParams({
        funnel: "funnel-1",
        identifier: "LEAD-1",
        assignee: "missing"
      })
      expect((yield* Effect.flip(assigneeUpdate(client, assignMissing, lead)))._tag).toBe("PersonNotFoundError")
      expect(yield* statusUpdate([workflow], lead, activeFunnel, base)).toEqual({ operations: {}, changed: false })

      const sameStatus = yield* parseUpdateLeadParams({ funnel: "funnel-1", identifier: "LEAD-1", status: "Incoming" })
      expect(yield* statusForLead([workflow], lead, activeFunnel, StatusName.make("Incoming"), sameStatus.funnel)).toBe(
        leadStatus
      )
      expect(yield* statusUpdate([workflow], lead, activeFunnel, sameStatus)).toEqual({
        operations: {},
        changed: false
      })
      const wonStatus = statusRef("lead:status:Won")
      const changedStatus = yield* parseUpdateLeadParams({ funnel: "funnel-1", identifier: "LEAD-1", status: "Won" })
      expect(
        yield* statusUpdate(
          [{ ...workflow, statuses: [...workflow.statuses, { id: wonStatus, name: "Won" }] }],
          lead,
          activeFunnel,
          changedStatus
        )
      ).toEqual({ operations: { status: wonStatus }, changed: true })
    })
  )

  it.effect("rejects archived updates and inactive moves with typed conflicts", () =>
    Effect.gen(function* () {
      const update = yield* parseUpdateLeadParams({ funnel: "funnel-1", identifier: "LEAD-1", title: "Changed" })
      yield* rejectArchivedLeadUpdate(update, activeFunnel)
      const archivedUpdate = yield* Effect.flip(rejectArchivedLeadUpdate(update, { ...activeFunnel, archived: true }))
      expect(archivedUpdate._tag).toBe("LeadUpdateConflictError")

      yield* rejectInactiveMoveFunnels(lead.identifier, activeFunnel, { ...activeFunnel, _id: docRef("funnel-2") })
      const archivedSource = yield* Effect.flip(
        rejectInactiveMoveFunnels(
          lead.identifier,
          { ...activeFunnel, archived: true },
          { ...activeFunnel, _id: docRef<HulyFunnel>("funnel-2") }
        )
      )
      const archivedDestination = yield* Effect.flip(
        rejectInactiveMoveFunnels(lead.identifier, activeFunnel, {
          ...activeFunnel,
          _id: docRef<HulyFunnel>("funnel-2"),
          archived: true
        })
      )
      expect(archivedSource._tag).toBe("LeadMoveConflictError")
      expect(archivedDestination._tag).toBe("LeadMoveConflictError")
    })
  )

  it.effect("computes destination workflow and status decisions for compatible lead moves", () =>
    Effect.gen(function* () {
      const alternateTaskType: FunnelWorkflowTaskType = {
        ...workflow,
        taskType: { ...workflow.taskType, _id: docRef<TaskType>("alternate-type") }
      }
      const destinationFunnel: HulyFunnel = { ...activeFunnel, _id: docRef<HulyFunnel>("funnel-2"), name: "Expansion" }
      expect(compatibleDestinationWorkflow([workflow], lead)).toEqual(workflow)
      expect(compatibleDestinationWorkflow([alternateTaskType], lead)).toEqual(alternateTaskType)
      expect(
        compatibleDestinationWorkflow([workflow, alternateTaskType], { ...lead, kind: TaskTypeId.make("missing") })
      ).toBeUndefined()
      expect(
        yield* requireDestinationWorkflow(
          workflow,
          lead.identifier,
          FunnelIdentifier.make("funnel-1"),
          FunnelIdentifier.make("funnel-2")
        )
      ).toEqual(workflow)

      const missingWorkflow = yield* Effect.flip(
        requireDestinationWorkflow(
          undefined,
          lead.identifier,
          FunnelIdentifier.make("funnel-1"),
          FunnelIdentifier.make("funnel-2")
        )
      )
      expect(missingWorkflow._tag).toBe("LeadMoveConflictError")

      const params = yield* parseMoveLeadParams({
        funnel: "funnel-1",
        identifier: "LEAD-1",
        destinationFunnel: "funnel-2"
      })
      expect(
        yield* destinationStatus(
          workflow,
          params,
          StatusName.make("Incoming"),
          lead.identifier,
          FunnelIdentifier.make("funnel-1"),
          FunnelIdentifier.make("funnel-2")
        )
      ).toBe(leadStatus)
      const invalidStatus = yield* parseMoveLeadParams({
        funnel: "funnel-1",
        identifier: "LEAD-1",
        destinationFunnel: "funnel-2",
        status: "Won"
      })
      expect(
        (yield* Effect.flip(
          destinationStatus(
            workflow,
            invalidStatus,
            StatusName.make("Incoming"),
            lead.identifier,
            FunnelIdentifier.make("funnel-1"),
            FunnelIdentifier.make("funnel-2")
          )
        ))._tag
      ).toBe("LeadMoveConflictError")
      expect(destinationStatusReason(undefined, StatusName.make("Incoming"))).toContain("current status")
      expect(destinationStatusReason(StatusName.make("Won"), StatusName.make("Incoming"))).toContain("requested status")
      expect(moveRequired(activeFunnel, activeFunnel, leadStatus, lead, false)).toBe(false)
      expect(moveRequired(activeFunnel, destinationFunnel, leadStatus, lead, false)).toBe(true)
      expect(moveRequired(activeFunnel, activeFunnel, statusRef("other-status"), lead, false)).toBe(true)
      expect(moveRequired(activeFunnel, activeFunnel, leadStatus, lead, true)).toBe(true)
      expect(moveOperations(destinationFunnel, leadStatus, workflow, false)).toEqual({
        space: destinationFunnel._id,
        status: leadStatus
      })
      expect(moveOperations(destinationFunnel, leadStatus, alternateTaskType, true)).toEqual({
        space: destinationFunnel._id,
        status: leadStatus,
        kind: alternateTaskType.taskType._id
      })
    })
  )

  it.effect("skips empty persistence and writes concrete update and move decisions", () =>
    Effect.gen(function* () {
      const writes: Array<unknown> = []
      const client = yield* HulyClient.pipe(
        Effect.provide(
          HulyClient.testLayer({
            updateDoc: (_class, _space, _id, operations) => {
              writes.push(operations)
              return Effect.succeed({})
            }
          })
        )
      )
      yield* persistLeadUpdate(client, activeFunnel, lead, {})
      yield* persistLeadUpdate(client, activeFunnel, lead, { title: NonEmptyString.make("Changed") })
      yield* persistLeadMove(client, activeFunnel, lead, { status: statusRef("new-status") }, false)
      yield* persistLeadMove(client, activeFunnel, lead, { status: statusRef("new-status") }, true)
      expect(writes).toEqual([{ title: "Changed" }, { status: "new-status" }])
    })
  )

  it.effect("short-circuits omitted description fields before customer lookup", () =>
    Effect.gen(function* () {
      const client = yield* HulyClient.pipe(Effect.provide(HulyClient.testLayer({})))
      const params = yield* parseUpdateLeadParams({ funnel: "funnel-1", identifier: "LEAD-1", title: "Changed" })
      expect(yield* descriptionUpdate(client, params, lead)).toEqual({ operations: {}, changed: false })
      expect(yield* customerDescriptionUpdate(client, params, lead)).toBe(false)
      expect(yield* descriptionUpdate(client, { ...params, description: null }, lead)).toEqual({
        operations: {},
        changed: false
      })
      expect(
        (yield* Effect.flip(customerDescriptionUpdate(client, { ...params, customerDescription: null }, lead)))._tag
      ).toBe("HulyError")
    })
  )

  it.effect("covers mutation entrypoint lookup failures through the injected client", () =>
    Effect.gen(function* () {
      const layer = HulyClient.testLayer({})
      const update = yield* parseUpdateLeadParams({ funnel: "missing", identifier: "LEAD-1", title: "Changed" })
      const move = yield* parseMoveLeadParams({
        funnel: "missing",
        identifier: "LEAD-1",
        destinationFunnel: "also-missing"
      })
      const deletion = yield* parseDeleteLeadParams({ funnel: "missing", identifier: "LEAD-1" })
      const customer = yield* parseMakePersonCustomerParams({ identifier: "missing" })
      const client = yield* HulyClient.pipe(Effect.provide(layer))

      expect((yield* Effect.flip(validatedFunnel(client, update.funnel).pipe(withDiagnostics)))._tag).toBe(
        "FunnelNotFoundError"
      )
      expect((yield* Effect.flip(resolveEmployee(client, PersonName.make("Missing,Person"))))._tag).toBe(
        "PersonNotFoundError"
      )
      expect((yield* Effect.flip(updateLead(update).pipe(Effect.provide(layer), withDiagnostics)))._tag).toBe(
        "FunnelNotFoundError"
      )
      expect((yield* Effect.flip(moveLead(move).pipe(Effect.provide(layer), withDiagnostics)))._tag).toBe(
        "FunnelNotFoundError"
      )
      expect((yield* Effect.flip(deleteLead(deletion).pipe(Effect.provide(layer), withDiagnostics)))._tag).toBe(
        "FunnelNotFoundError"
      )
      expect((yield* Effect.flip(makePersonCustomer(customer).pipe(Effect.provide(layer))))._tag).toBe(
        "PersonNotFoundError"
      )
    })
  )

  it.effect("applies and updates Customer descriptions for people and organizations", () =>
    Effect.gen(function* () {
      const mutations: Array<string> = []
      const client = yield* HulyClient.pipe(
        Effect.provide(
          HulyClient.testLayer({
            uploadMarkup: () => Effect.succeed(toMarkupBlobRef(NonEmptyString.make("customer-description"))),
            createMixin: () => {
              mutations.push("create")
              return Effect.succeed({})
            },
            updateMixin: () => {
              mutations.push("update")
              return Effect.succeed({})
            }
          })
        )
      )
      const plainPerson = person(PersonId.make("person-1"), PersonName.make("Prospect,Pat"))
      const customerPerson = { ...plainPerson, [leadClassIds.mixin.Customer]: { customerDescription: null } }
      const organization: LeadOrganizationDocument = {
        _id: OrganizationId.make("organization-1"),
        _class: DocId.make(contact.class.Organization),
        space: SpaceId.make(String(contact.space.Contacts)),
        name: NonEmptyString.make("Acme")
      }
      const customerOrganization = { ...organization, [leadClassIds.mixin.Customer]: { customerDescription: null } }

      expect(String(customerClass(plainPerson))).toBe(String(contact.class.Person))
      expect(String(customerClass(organization))).toBe(String(contact.class.Organization))
      expect(yield* updateCustomerDescription(client, plainPerson, null)).toBe(false)
      expect(yield* updateCustomerDescription(client, customerPerson, null)).toBe(true)
      expect(yield* updateCustomerDescription(client, plainPerson, "new person notes")).toBe(true)
      expect(yield* updateCustomerDescription(client, customerOrganization, "new organization notes")).toBe(true)
      expect(mutations).toEqual(["update", "create", "update"])
    })
  )

  it.effect("previews, conflicts, and executes resolved lead deletion with authoritative counts", () =>
    Effect.gen(function* () {
      const removals: Array<string> = []
      const client = yield* HulyClient.pipe(
        Effect.provide(
          HulyClient.testLayer({
            removeCollection: (_class, _space, _objectId, attachedTo) => {
              removals.push("removed")
              return Effect.succeed(attachedTo)
            }
          })
        )
      )
      const preview = yield* parseDeleteLeadParams({ funnel: "funnel-1", identifier: "LEAD-1" })
      const execute = yield* parseDeleteLeadParams({
        funnel: "funnel-1",
        identifier: "LEAD-1",
        execute: true,
        expectedComments: 0,
        expectedAttachments: 0,
        expectedLabels: 0
      })
      expect(yield* deleteResolvedLead(client, { funnel: activeFunnel }, lead, preview)).toMatchObject({
        deleted: false,
        impact: { totalAffected: 0 }
      })

      for (const expectations of [
        { expectedComments: 1, expectedAttachments: 0, expectedLabels: 0 },
        { expectedComments: 0, expectedAttachments: 1, expectedLabels: 0 },
        { expectedComments: 0, expectedAttachments: 0, expectedLabels: 1 }
      ]) {
        const changed = yield* parseDeleteLeadParams({
          funnel: "funnel-1",
          identifier: "LEAD-1",
          execute: true,
          ...expectations
        })
        expect((yield* Effect.flip(deleteResolvedLead(client, { funnel: activeFunnel }, lead, changed)))._tag).toBe(
          "LeadDeleteConflictError"
        )
      }

      expect(yield* deleteResolvedLead(client, { funnel: activeFunnel }, lead, execute)).toMatchObject({
        deleted: true
      })
      expect(removals).toEqual(["removed"])

      const { removeCollection: _removeCollection, ...clientWithoutCollectionRemoval } = client
      expect(
        (yield* Effect.flip(
          deleteResolvedLead(clientWithoutCollectionRemoval, { funnel: activeFunnel }, lead, execute)
        ))._tag
      ).toBe("HulyDataInvalidError")
    })
  )

  it.effect("applies person Customer promotion idempotently", () =>
    Effect.gen(function* () {
      const mutations: Array<string> = []
      const client = yield* HulyClient.pipe(
        Effect.provide(
          HulyClient.testLayer({
            createMixin: () => {
              mutations.push("create")
              return Effect.succeed({})
            }
          })
        )
      )
      const plain = person(PersonId.make("person-1"), PersonName.make("Prospect,Pat"))
      const existing = { ...plain, [leadClassIds.mixin.Customer]: { customerDescription: null } }
      expect(yield* applyPersonCustomer(client, plain)).toEqual({ id: PersonId.make("person-1"), applied: true })
      expect(yield* applyPersonCustomer(client, existing)).toEqual({ id: PersonId.make("person-1"), applied: false })
      expect(mutations).toEqual(["create"])
    })
  )

  it.effect("decodes lead documents and preserves update and move result precedence", () =>
    Effect.gen(function* () {
      const nativeLead = { ...lead, modifiedBy: PersonId.make("user-1"), modifiedOn: Timestamp.make(0) }
      expect(yield* parseLeadMutationDocument(nativeLead)).toEqual(lead)
      expect((yield* Effect.flip(parseLeadMutationDocument({ _id: "broken" })))._tag).toBe("HulyDataInvalidError")
      expect(yield* requireLeadDocument(nativeLead, lead.identifier, FunnelIdentifier.make("funnel-1"))).toEqual(lead)
      expect(
        (yield* Effect.flip(requireLeadDocument(undefined, lead.identifier, FunnelIdentifier.make("funnel-1"))))._tag
      ).toBe("LeadNotFoundError")

      const nativeEmployee = {
        _id: PersonId.make("person-1"),
        _class: DocId.make(contact.mixin.Employee),
        space: SpaceId.make(String(contact.space.Contacts)),
        name: PersonName.make("Prospect,Pat"),
        position: "Sales"
      }
      expect(yield* requireEmployee(PersonName.make("Prospect,Pat"), nativeEmployee)).toBe("person-1")
      expect((yield* Effect.flip(requireEmployee(PersonName.make("Prospect,Pat"), undefined)))._tag).toBe(
        "PersonNotAnEmployeeError"
      )

      const nativePerson = {
        _id: PersonId.make("person-1"),
        _class: DocId.make(contact.class.Person),
        space: SpaceId.make(String(contact.space.Contacts)),
        name: PersonName.make("Prospect,Pat")
      }
      const nativeOrganization = {
        _id: OrganizationId.make("organization-1"),
        _class: DocId.make(contact.class.Organization),
        space: SpaceId.make(String(contact.space.Contacts)),
        name: NonEmptyString.make("Acme")
      }
      expect(yield* resolveLeadCustomer(nativePerson, undefined, lead)).toEqual(nativePerson)
      expect(yield* resolveLeadCustomer(undefined, nativeOrganization, lead)).toEqual(nativeOrganization)
      expect((yield* Effect.flip(resolveLeadCustomer(undefined, undefined, lead)))._tag).toBe("HulyError")

      expect(leadUpdateChanged({ title: NonEmptyString.make("Changed") }, false, false)).toBe(true)
      expect(leadUpdateChanged({}, true, false)).toBe(true)
      expect(leadUpdateChanged({}, false, true)).toBe(true)
      expect(leadUpdateChanged({}, false, false)).toBe(false)
      expect(
        resolvedMoveStatusName(workflow, leadStatus, StatusName.make("Requested"), StatusName.make("Current"))
      ).toBe("Incoming")
      expect(
        resolvedMoveStatusName(workflow, statusRef("unknown"), StatusName.make("Requested"), StatusName.make("Current"))
      ).toBe("Requested")
      expect(resolvedMoveStatusName(workflow, statusRef("unknown"), undefined, StatusName.make("Current"))).toBe(
        "Current"
      )
    })
  )

  it("detects native Customer mixins on either supported customer kind", () => {
    const plain = person(PersonId.make("plain"), PersonName.make("Plain,Person"))
    const customer = { ...plain, [leadClassIds.mixin.Customer]: { customerDescription: null } }
    expect(hasCustomerMixin(plain)).toBe(false)
    expect(hasCustomerMixin(customer)).toBe(true)
  })

  it.effect("resolves the current status from the configured workflow", () =>
    Effect.gen(function* () {
      const resolved = yield* currentStatus(workflow, lead, {
        _id: docRef("funnel-1"),
        _class: toClassRef<HulyFunnel>(leadClassIds.class.Funnel),
        space: spaceRef("workspace"),
        modifiedBy: corePersonId("user-1"),
        modifiedOn: Timestamp.make(0),
        name: "Sales",
        description: "",
        private: false,
        members: [],
        archived: false,
        type: docRef("project-type-1")
      })
      expect(resolved).toEqual({ id: leadStatus, name: StatusName.make("Incoming") })
    })
  )

  it.effect("models explicit description clear separately from an existing value", () =>
    Effect.gen(function* () {
      const client = yield* HulyClient.pipe(Effect.provide(HulyClient.testLayer({})))
      const existing = yield* updateLeadDescription(client, { ...lead, description: BlobId.make("markup-ref") }, null)
      const absent = yield* updateLeadDescription(client, lead, null)

      expect(existing).toEqual({ operations: { description: null }, changed: true })
      expect(absent).toEqual({ operations: {}, changed: false })
    })
  )

  it.effect("does not write an existing description when native markup is unchanged", () =>
    Effect.gen(function* () {
      const rendered = renderMarkdownWithNativeReferencesForWrite("same", testMarkupUrlConfig, "description")
      if (rendered._tag !== "success") throw new Error(rendered.reason)
      const client = yield* HulyClient.pipe(
        Effect.provide(HulyClient.testLayer({ fetchMarkup: () => Effect.succeed(rendered.rendered.markup) }))
      )
      const result = yield* updateLeadDescription(client, { ...lead, description: BlobId.make("markup-ref") }, "same")

      expect(result).toEqual({ operations: {}, changed: false })
    })
  )

  it.effect("uploads a new description and updates changed existing markup", () =>
    Effect.gen(function* () {
      const mutations: Array<string> = []
      const client = yield* HulyClient.pipe(
        Effect.provide(
          HulyClient.testLayer({
            uploadMarkup: () => {
              mutations.push("upload")
              return Effect.succeed(toMarkupBlobRef(NonEmptyString.make("uploaded-description")))
            },
            fetchMarkup: () => Effect.succeed("old-markup"),
            updateMarkup: () => {
              mutations.push("update")
              return Effect.void
            }
          })
        )
      )
      const created = yield* updateLeadDescription(client, lead, "new")
      const updated = yield* updateLeadDescription(
        client,
        { ...lead, description: BlobId.make("existing-markup") },
        "changed"
      )

      expect(created).toEqual({ operations: { description: "uploaded-description" }, changed: true })
      expect(updated).toEqual({ operations: {}, changed: true })
      expect(mutations).toEqual(["upload", "update"])
    })
  )

  it.effect("rejects malformed description references and missing lead customers", () =>
    Effect.gen(function* () {
      const client = yield* HulyClient.pipe(Effect.provide(HulyClient.testLayer({})))
      const malformed = yield* Effect.flip(
        updateLeadDescription(client, lead, "Broken [Doc](https://test.invalid/browse?workspace=test&_id=doc-1).")
      )
      const missingCustomer = yield* Effect.flip(updateLeadCustomerDescription(client, lead, "customer notes"))

      expect(malformed._tag).toBe("HulyError")
      expect(malformed.message).toContain("malformed Huly native reference")
      expect(missingCustomer._tag).toBe("HulyError")
      expect(missingCustomer.message).toContain("missing customer")
    })
  )
})
