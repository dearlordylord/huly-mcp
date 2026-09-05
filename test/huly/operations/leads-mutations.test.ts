import { describe, it } from "@effect/vitest"
import type { Blob, Class, Doc, DocumentQuery, FindOptions, Ref } from "@hcengineering/core"
import type { TaskType } from "@hcengineering/task"
import { Effect } from "effect"
import { expect } from "vitest"

import {
  LeadIdentifier,
  parseDeleteLeadParams,
  parseMakePersonCustomerParams,
  parseMoveLeadParams,
  parseUpdateLeadParams
} from "../../../src/domain/schemas/leads.js"
import type { LeadOrganizationDocument, LeadPersonDocument } from "../../../src/domain/schemas/leads-mutations.js"
import {
  BlobId,
  DocId,
  NonEmptyString,
  OrganizationId,
  PersonId,
  PersonLocator,
  PersonName,
  SpaceId,
  TaskTypeId,
  Timestamp,
  WorkflowStatusId
} from "../../../src/domain/schemas/shared.js"
import { HulyClient } from "../../../src/huly/client.js"
import { HulyError } from "../../../src/huly/errors.js"
import { contact, core, task } from "../../../src/huly/huly-plugins.js"
import { leadClassIds } from "../../../src/huly/lead-plugin.js"
import { deleteLead, makePersonCustomer, moveLead, updateLead } from "../../../src/huly/operations/leads-mutations.js"
import type { HulyLead } from "../../../src/huly/operations/leads-mutations-boundary.js"
import { markupBlobRefAsMarkupRef } from "../../../src/huly/operations/recruiting-shared.js"
import type { FunnelWorkflowTaskType, HulyFunnel } from "../../../src/huly/operations/funnels-shared.js"
import { testMarkupUrlConfig } from "../../../src/huly/operations/markup.js"
import { renderMarkdownWithNativeReferencesForWrite } from "../../../src/huly/operations/native-reference-markup.js"
import { toClassRef, toRef } from "../../../src/huly/operations/sdk-boundary.js"
import { withDiagnostics } from "../../helpers/diagnostics.js"
import { corePersonId, docRef, findResult, spaceRef, statusRef } from "../../helpers/huly-sdk.js"
import { mockFn } from "../../helpers/mock-fn.js"

const incomingStatus = statusRef("lead:status:Incoming")
const wonStatus = statusRef("lead:status:Won")
const leadTaskType = docRef<TaskType>("lead:taskType:Lead")
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
    statuses: [incomingStatus, wonStatus],
    statusClass: core.class.Status,
    statusCategories: []
  },
  statuses: [
    { id: incomingStatus, name: "Incoming" },
    { id: wonStatus, name: "Won" }
  ]
}

const funnel = (id: string, name: string): HulyFunnel => ({
  _id: docRef<HulyFunnel>(id),
  _class: toClassRef<HulyFunnel>(leadClassIds.class.Funnel),
  space: spaceRef("workspace"),
  modifiedBy: corePersonId("user-1"),
  modifiedOn: Timestamp.make(0),
  name,
  description: "",
  private: false,
  members: [],
  archived: false,
  type: docRef("project-type-1")
})

const sourceFunnel = funnel("funnel-1", "Sales")
const destinationFunnel = funnel("funnel-2", "Expansion")
const lead: HulyLead = {
  _id: DocId.make("lead-1"),
  _class: DocId.make(leadClassIds.class.Lead),
  space: SpaceId.make("funnel-1"),
  attachedTo: DocId.make("person-1"),
  attachedToClass: DocId.make(contact.class.Person),
  collection: "leads",
  title: NonEmptyString.make("A lead"),
  identifier: LeadIdentifier.make("LEAD-1"),
  status: WorkflowStatusId.make(String(incomingStatus)),
  kind: TaskTypeId.make(String(leadTaskType)),
  assignee: null,
  description: BlobId.make("lead-description"),
  startDate: null,
  dueDate: null
}

const person = (customerDescription?: string | null): LeadPersonDocument => ({
  _id: PersonId.make("person-1"),
  _class: DocId.make(contact.class.Person),
  space: SpaceId.make(String(contact.space.Contacts)),
  name: PersonName.make("Prospect,Pat"),
  ...(customerDescription === undefined ? {} : { [leadClassIds.mixin.Customer]: { customerDescription } })
})

const organization = (customerDescription?: string | null): LeadOrganizationDocument => ({
  _id: OrganizationId.make("organization-1"),
  _class: DocId.make(contact.class.Organization),
  space: SpaceId.make(String(contact.space.Contacts)),
  name: NonEmptyString.make("Acme"),
  ...(customerDescription === undefined ? {} : { [leadClassIds.mixin.Customer]: { customerDescription } })
})

type Resolvers = NonNullable<Parameters<typeof updateLead>[1]>
const resolvers = (
  customer: LeadPersonDocument | LeadOrganizationDocument = person(),
  resolvedLead: HulyLead = lead,
  exactPerson: LeadPersonDocument = person()
): Resolvers => ({
  validatedFunnel: (_client, identifier) =>
    Effect.succeed({
      funnel: String(identifier) === "funnel-2" ? destinationFunnel : sourceFunnel,
      workflow: [workflow]
    }),
  findLead: () => Effect.succeed(resolvedLead),
  resolveEmployee: () => Effect.succeed(docRef("employee-1")),
  resolveExactPerson: () => Effect.succeed(exactPerson),
  findLeadCustomer: () => Effect.succeed(customer)
})

interface Captures {
  readonly writes: Array<string>
  readonly markupClasses: Array<string>
  readonly documentUpdates: Array<unknown>
}

const emptyCaptures = (): Captures => ({ writes: [], markupClasses: [], documentUpdates: [] })
const makeLayer = (captures: Captures, currentCustomerMarkup = "old customer markup") =>
  HulyClient.testLayer({
    findAll: <T extends Doc>(_documentClass: Ref<Class<T>>, _query: DocumentQuery<T>, _options?: FindOptions<T>) =>
      Effect.succeed(findResult<T>([])),
    fetchMarkup: (_class, _id, attribute) =>
      Effect.succeed(attribute === "customerDescription" ? currentCustomerMarkup : "old lead markup"),
    uploadMarkup: (objectClass) => {
      captures.writes.push("uploadMarkup")
      captures.markupClasses.push(String(objectClass))
      return Effect.succeed(markupBlobRefAsMarkupRef(toRef<Blob>(BlobId.make("uploaded-markup"))))
    },
    updateMarkup: () => {
      captures.writes.push("updateMarkup")
      return Effect.void
    },
    updateDoc: (_class, _space, _id, operations) => {
      captures.writes.push("updateDoc")
      captures.documentUpdates.push(operations)
      return Effect.succeed({})
    },
    createMixin: () => {
      captures.writes.push("createMixin")
      return Effect.succeed({})
    },
    updateMixin: () => {
      captures.writes.push("updateMixin")
      return Effect.succeed({})
    },
    removeCollection: (_class, _space, _id, attachedTo) => {
      captures.writes.push("removeCollection")
      return Effect.succeed(attachedTo)
    }
  })

const emptyLayer = (captures: Captures, total = 0, includeRemover = true) => {
  const findAll = <T extends Doc>(
    _documentClass: Ref<Class<T>>,
    _query: DocumentQuery<T>,
    _options?: FindOptions<T>
  ) => {
    const result = findResult<T>([])
    result.total = total
    return Effect.succeed(result)
  }
  return includeRemover
    ? HulyClient.testLayer({
        findAll,
        removeCollection: (_class, _space, _id, attachedTo) => {
          captures.writes.push("removeCollection")
          return Effect.succeed(attachedTo)
        }
      })
    : HulyClient.testLayer({ findAll })
}

describe("lead mutation public operations", () => {
  it.effect("plans every requested field before executing a multi-field update", () =>
    Effect.gen(function* () {
      const captures = emptyCaptures()
      const params = yield* parseUpdateLeadParams({
        funnel: "funnel-1",
        identifier: "LEAD-1",
        title: "Changed",
        description: "new lead markup",
        customerDescription: "new customer markup",
        assignee: "Prospect,Pat",
        status: "Won",
        startDate: 10,
        dueDate: 20
      })
      const result = yield* updateLead(params, resolvers(person("customer-description"))).pipe(
        Effect.provide(makeLayer(captures)),
        withDiagnostics
      )

      expect(result).toEqual({ identifier: "LEAD-1", updated: true })
      expect(captures.writes).toEqual(["updateMarkup", "uploadMarkup", "updateMixin", "updateDoc"])
      expect(captures.markupClasses).toEqual([String(leadClassIds.mixin.Customer)])
      expect(captures.documentUpdates).toEqual([
        { title: "Changed", status: wonStatus, assignee: "employee-1", startDate: 10, dueDate: 20 }
      ])
    })
  )

  it.effect("performs zero writes when a late customer resolution fails", () =>
    Effect.gen(function* () {
      const captures = emptyCaptures()
      const params = yield* parseUpdateLeadParams({
        funnel: "funnel-1",
        identifier: "LEAD-1",
        description: "new lead markup",
        customerDescription: "new customer markup",
        status: "Won"
      })
      const lateFailure: Resolvers = {
        ...resolvers(),
        findLeadCustomer: () => Effect.fail(new HulyError({ message: "customer disappeared" }))
      }
      const error = yield* Effect.flip(
        updateLead(params, lateFailure).pipe(Effect.provide(makeLayer(captures)), withDiagnostics)
      )
      expect(error._tag).toBe("HulyError")
      expect(captures.writes).toEqual([])
    })
  )

  it.effect("keeps repeated customer description content and null clears idempotent", () =>
    Effect.gen(function* () {
      const sameCaptures = emptyCaptures()
      const rendered = renderMarkdownWithNativeReferencesForWrite(
        "same customer markup",
        testMarkupUrlConfig,
        "customerDescription"
      )
      if (rendered._tag !== "success") return yield* Effect.die(new Error(rendered.reason))
      const same = yield* parseUpdateLeadParams({
        funnel: "funnel-1",
        identifier: "LEAD-1",
        customerDescription: "same customer markup"
      })
      const sameResult = yield* updateLead(same, resolvers(person("customer-description"))).pipe(
        Effect.provide(makeLayer(sameCaptures, rendered.rendered.markup)),
        withDiagnostics
      )
      expect(sameResult.updated).toBe(false)
      expect(sameCaptures.writes).toEqual([])

      const clearCaptures = emptyCaptures()
      const clear = yield* parseUpdateLeadParams({
        funnel: "funnel-1",
        identifier: "LEAD-1",
        customerDescription: null
      })
      const clearResult = yield* updateLead(clear, resolvers(person(null))).pipe(
        Effect.provide(makeLayer(clearCaptures)),
        withDiagnostics
      )
      expect(clearResult.updated).toBe(false)
      expect(clearCaptures.writes).toEqual([])
    })
  )

  it.effect("reports unchanged when every requested scalar already matches", () =>
    Effect.gen(function* () {
      const captures = emptyCaptures()
      const params = yield* parseUpdateLeadParams({
        funnel: "funnel-1",
        identifier: "LEAD-1",
        title: "A lead",
        assignee: null,
        status: "Incoming",
        startDate: null,
        dueDate: null
      })
      const result = yield* updateLead(params, resolvers()).pipe(Effect.provide(makeLayer(captures)), withDiagnostics)
      expect(result.updated).toBe(false)
      expect(captures.writes).toEqual([])
    })
  )

  it.effect("clears existing lead and customer descriptions", () =>
    Effect.gen(function* () {
      const captures = emptyCaptures()
      const params = yield* parseUpdateLeadParams({
        funnel: "funnel-1",
        identifier: "LEAD-1",
        description: null,
        customerDescription: null
      })
      const result = yield* updateLead(params, resolvers(person("customer-description"))).pipe(
        Effect.provide(makeLayer(captures)),
        withDiagnostics
      )
      expect(result.updated).toBe(true)
      expect(captures.writes).toEqual(["updateMixin", "updateDoc"])
      expect(captures.documentUpdates).toEqual([{ description: null }])
    })
  )

  it.effect("uploads descriptions when neither markup reference exists", () =>
    Effect.gen(function* () {
      const captures = emptyCaptures()
      const params = yield* parseUpdateLeadParams({
        funnel: "funnel-1",
        identifier: "LEAD-1",
        description: "new lead description",
        customerDescription: "new customer description"
      })
      const result = yield* updateLead(params, resolvers(person(), { ...lead, description: null })).pipe(
        Effect.provide(makeLayer(captures)),
        withDiagnostics
      )
      expect(result.updated).toBe(true)
      expect(captures.writes).toEqual(["uploadMarkup", "uploadMarkup", "createMixin", "updateDoc"])
      expect(captures.markupClasses).toEqual([String(leadClassIds.class.Lead), String(leadClassIds.mixin.Customer)])
    })
  )

  it.effect("keeps identical lead markup and an absent customer mixin clear unchanged", () =>
    Effect.gen(function* () {
      const captures = emptyCaptures()
      const rendered = renderMarkdownWithNativeReferencesForWrite(
        "same lead markup",
        testMarkupUrlConfig,
        "description"
      )
      if (rendered._tag !== "success") return yield* Effect.die(new Error(rendered.reason))
      const params = yield* parseUpdateLeadParams({
        funnel: "funnel-1",
        identifier: "LEAD-1",
        description: "same lead markup",
        customerDescription: null
      })
      const result = yield* updateLead(params, resolvers(person())).pipe(
        Effect.provide(makeLayer(captures, "old customer markup").pipe()),
        withDiagnostics
      )
      expect(result.updated).toBe(true)
      expect(captures.writes).toEqual(["updateMarkup"])

      const sameCaptures = emptyCaptures()
      const sameLayer = HulyClient.testLayer({
        fetchMarkup: () => Effect.succeed(rendered.rendered.markup),
        updateDoc: () => {
          sameCaptures.writes.push("updateDoc")
          return Effect.succeed({})
        }
      })
      const sameResult = yield* updateLead(params, resolvers(person())).pipe(Effect.provide(sameLayer), withDiagnostics)
      expect(sameResult.updated).toBe(false)
      expect(sameCaptures.writes).toEqual([])
    })
  )

  it.effect("updates an organization customer and rejects malformed mixin state before writes", () =>
    Effect.gen(function* () {
      const captures = emptyCaptures()
      const params = yield* parseUpdateLeadParams({
        funnel: "funnel-1",
        identifier: "LEAD-1",
        customerDescription: "organization notes"
      })
      const updated = yield* updateLead(params, resolvers(organization(null))).pipe(
        Effect.provide(makeLayer(captures)),
        withDiagnostics
      )
      expect(updated.updated).toBe(true)
      expect(captures.writes).toEqual(["uploadMarkup", "updateMixin"])

      const malformedCaptures = emptyCaptures()
      const malformed = { ...person(), [leadClassIds.mixin.Customer]: { customerDescription: 42 } }
      const malformedResolvers: Resolvers = { ...resolvers(), findLeadCustomer: () => Effect.succeed(malformed) }
      const error = yield* Effect.flip(
        updateLead(params, malformedResolvers).pipe(Effect.provide(makeLayer(malformedCaptures)), withDiagnostics)
      )
      expect(error._tag).toBe("HulyDataInvalidError")
      expect(malformedCaptures.writes).toEqual([])
    })
  )

  it.effect("rejects malformed native references before writes", () =>
    Effect.gen(function* () {
      const captures = emptyCaptures()
      const params = yield* parseUpdateLeadParams({
        funnel: "funnel-1",
        identifier: "LEAD-1",
        description: "Broken [Doc](https://test.invalid/browse?workspace=test&_id=doc-1)."
      })
      const error = yield* Effect.flip(
        updateLead(params, resolvers()).pipe(Effect.provide(makeLayer(captures)), withDiagnostics)
      )
      expect(error._tag).toBe("HulyError")
      expect(captures.writes).toEqual([])
    })
  )

  it.effect("rejects updates to archived funnels before resolving the lead", () =>
    Effect.gen(function* () {
      const captures = emptyCaptures()
      const params = yield* parseUpdateLeadParams({ funnel: "funnel-1", identifier: "LEAD-1", title: "Changed" })
      const archivedResolvers: Resolvers = {
        ...resolvers(),
        validatedFunnel: () => Effect.succeed({ funnel: { ...sourceFunnel, archived: true }, workflow: [workflow] })
      }
      const error = yield* Effect.flip(
        updateLead(params, archivedResolvers).pipe(Effect.provide(makeLayer(captures)), withDiagnostics)
      )
      expect(error._tag).toBe("LeadUpdateConflictError")
      expect(captures.writes).toEqual([])
    })
  )

  it.effect("rejects update statuses absent from the lead workflow", () =>
    Effect.gen(function* () {
      const captures = emptyCaptures()
      const params = yield* parseUpdateLeadParams({ funnel: "funnel-1", identifier: "LEAD-1", status: "Missing" })
      const invalidStatus = yield* Effect.flip(
        updateLead(params, resolvers()).pipe(Effect.provide(makeLayer(captures)), withDiagnostics)
      )
      expect(invalidStatus._tag).toBe("InvalidStatusError")

      const wrongWorkflowResolvers: Resolvers = {
        ...resolvers(),
        validatedFunnel: () => Effect.succeed({ funnel: sourceFunnel, workflow: [] })
      }
      const wrongWorkflow = yield* Effect.flip(
        updateLead(params, wrongWorkflowResolvers).pipe(Effect.provide(makeLayer(captures)), withDiagnostics)
      )
      expect(wrongWorkflow._tag).toBe("HulyError")
      expect(captures.writes).toEqual([])
    })
  )

  it.effect("moves a lead through the public operation", () =>
    Effect.gen(function* () {
      const captures = emptyCaptures()
      const params = yield* parseMoveLeadParams({
        funnel: "funnel-1",
        identifier: "LEAD-1",
        destinationFunnel: "funnel-2",
        status: "Won"
      })
      const result = yield* moveLead(params, resolvers()).pipe(Effect.provide(makeLayer(captures)), withDiagnostics)
      expect(result).toMatchObject({ destinationFunnel: "funnel-2", status: "Won", moved: true })
      expect(captures.writes).toEqual(["updateDoc"])
    })
  )

  it.effect("does not write when source, destination, status, and task type already match", () =>
    Effect.gen(function* () {
      const captures = emptyCaptures()
      const params = yield* parseMoveLeadParams({
        funnel: "funnel-1",
        identifier: "LEAD-1",
        destinationFunnel: "funnel-1"
      })
      const sameFunnelResolvers: Resolvers = {
        ...resolvers(),
        validatedFunnel: () => Effect.succeed({ funnel: sourceFunnel, workflow: [workflow] })
      }
      const result = yield* moveLead(params, sameFunnelResolvers).pipe(
        Effect.provide(makeLayer(captures)),
        withDiagnostics
      )
      expect(result).toMatchObject({ destinationFunnel: "funnel-1", status: "Incoming", moved: false })
      expect(captures.writes).toEqual([])
    })
  )

  it.effect("updates status without moving between funnels", () =>
    Effect.gen(function* () {
      const captures = emptyCaptures()
      const params = yield* parseMoveLeadParams({
        funnel: "funnel-1",
        identifier: "LEAD-1",
        destinationFunnel: "funnel-1",
        status: "Won"
      })
      const sameFunnelResolvers: Resolvers = {
        ...resolvers(),
        validatedFunnel: () => Effect.succeed({ funnel: sourceFunnel, workflow: [workflow] })
      }
      const result = yield* moveLead(params, sameFunnelResolvers).pipe(
        Effect.provide(makeLayer(captures)),
        withDiagnostics
      )
      expect(result).toMatchObject({ destinationFunnel: "funnel-1", status: "Won", moved: true })
      expect(captures.documentUpdates).toEqual([{ space: sourceFunnel._id, status: wonStatus }])
    })
  )

  it.effect("moves to the sole destination task type when no exact task type exists", () =>
    Effect.gen(function* () {
      const captures = emptyCaptures()
      const replacementTaskType = docRef<TaskType>("lead:taskType:Replacement")
      const replacementWorkflow: FunnelWorkflowTaskType = {
        ...workflow,
        taskType: { ...workflow.taskType, _id: replacementTaskType },
        statuses: [{ id: incomingStatus, name: "Incoming" }]
      }
      const params = yield* parseMoveLeadParams({
        funnel: "funnel-1",
        identifier: "LEAD-1",
        destinationFunnel: "funnel-2"
      })
      const replacementResolvers: Resolvers = {
        ...resolvers(),
        validatedFunnel: (_client, identifier) =>
          Effect.succeed(
            String(identifier) === "funnel-2"
              ? { funnel: destinationFunnel, workflow: [replacementWorkflow] }
              : { funnel: sourceFunnel, workflow: [workflow] }
          )
      }
      const result = yield* moveLead(params, replacementResolvers).pipe(
        Effect.provide(makeLayer(captures)),
        withDiagnostics
      )
      expect(result.moved).toBe(true)
      expect(captures.documentUpdates).toEqual([
        { space: destinationFunnel._id, status: incomingStatus, kind: replacementTaskType }
      ])
    })
  )

  it.effect("rejects archived and ambiguous destination workflows", () =>
    Effect.gen(function* () {
      const captures = emptyCaptures()
      const params = yield* parseMoveLeadParams({
        funnel: "funnel-1",
        identifier: "LEAD-1",
        destinationFunnel: "funnel-2"
      })
      const archived: Resolvers = {
        ...resolvers(),
        validatedFunnel: (_client, identifier) =>
          Effect.succeed({
            funnel: String(identifier) === "funnel-2" ? { ...destinationFunnel, archived: true } : sourceFunnel,
            workflow: [workflow]
          })
      }
      expect(
        (yield* Effect.flip(moveLead(params, archived).pipe(Effect.provide(makeLayer(captures)), withDiagnostics)))._tag
      ).toBe("LeadMoveConflictError")

      const noDestinationWorkflow: Resolvers = {
        ...resolvers(),
        validatedFunnel: (_client, identifier) =>
          Effect.succeed({
            funnel: String(identifier) === "funnel-2" ? destinationFunnel : sourceFunnel,
            workflow: String(identifier) === "funnel-2" ? [] : [workflow]
          })
      }
      expect(
        (yield* Effect.flip(
          moveLead(params, noDestinationWorkflow).pipe(Effect.provide(makeLayer(captures)), withDiagnostics)
        ))._tag
      ).toBe("LeadMoveConflictError")
      expect(captures.writes).toEqual([])
    })
  )

  it.effect("rejects explicit and inherited statuses absent from the destination", () =>
    Effect.gen(function* () {
      const captures = emptyCaptures()
      const destinationWithoutIncoming: FunnelWorkflowTaskType = {
        ...workflow,
        statuses: [{ id: wonStatus, name: "Won" }]
      }
      const destinationResolvers: Resolvers = {
        ...resolvers(),
        validatedFunnel: (_client, identifier) =>
          Effect.succeed({
            funnel: String(identifier) === "funnel-2" ? destinationFunnel : sourceFunnel,
            workflow: String(identifier) === "funnel-2" ? [destinationWithoutIncoming] : [workflow]
          })
      }
      const requestedStatuses: ReadonlyArray<undefined | "Missing"> = [undefined, "Missing"]
      for (const status of requestedStatuses) {
        const params = yield* parseMoveLeadParams({
          funnel: "funnel-1",
          identifier: "LEAD-1",
          destinationFunnel: "funnel-2",
          ...(status === undefined ? {} : { status })
        })
        const error = yield* Effect.flip(
          moveLead(params, destinationResolvers).pipe(Effect.provide(makeLayer(captures)), withDiagnostics)
        )
        expect(error._tag).toBe("LeadMoveConflictError")
      }
      expect(captures.writes).toEqual([])
    })
  )

  it.effect("rejects a lead whose current status is absent from its source workflow", () =>
    Effect.gen(function* () {
      const captures = emptyCaptures()
      const params = yield* parseMoveLeadParams({
        funnel: "funnel-1",
        identifier: "LEAD-1",
        destinationFunnel: "funnel-2"
      })
      const unknownStatusLead = { ...lead, status: WorkflowStatusId.make("lead:status:Unknown") }
      const error = yield* Effect.flip(
        moveLead(params, resolvers(person(), unknownStatusLead)).pipe(
          Effect.provide(makeLayer(captures)),
          withDiagnostics
        )
      )
      expect(error._tag).toBe("HulyError")
      expect(captures.writes).toEqual([])
    })
  )

  it.effect("previews and executes deletion through the public operation", () =>
    Effect.gen(function* () {
      const captures = emptyCaptures()
      const preview = yield* parseDeleteLeadParams({ funnel: "funnel-1", identifier: "LEAD-1" })
      const previewed = yield* deleteLead(preview, resolvers()).pipe(
        Effect.provide(makeLayer(captures)),
        withDiagnostics
      )
      expect(previewed).toMatchObject({ deleted: false, impact: { totalAffected: 0 } })
      expect(captures.writes).toEqual([])

      const execute = yield* parseDeleteLeadParams({
        funnel: "funnel-1",
        identifier: "LEAD-1",
        execute: true,
        expectedComments: 0,
        expectedAttachments: 0,
        expectedLabels: 0
      })
      const deleted = yield* deleteLead(execute, resolvers()).pipe(Effect.provide(makeLayer(captures)), withDiagnostics)
      expect(deleted.deleted).toBe(true)
      expect(captures.writes).toEqual(["removeCollection"])
    })
  )

  it.effect("rejects changed deletion impact and missing collection removal capability", () =>
    Effect.gen(function* () {
      const conflictCaptures = emptyCaptures()
      for (const expectations of [
        { expectedComments: 1, expectedAttachments: 0, expectedLabels: 0 },
        { expectedComments: 0, expectedAttachments: 1, expectedLabels: 0 },
        { expectedComments: 0, expectedAttachments: 0, expectedLabels: 1 }
      ]) {
        const conflict = yield* parseDeleteLeadParams({
          funnel: "funnel-1",
          identifier: "LEAD-1",
          execute: true,
          ...expectations
        })
        const conflictError = yield* Effect.flip(
          deleteLead(conflict, resolvers()).pipe(Effect.provide(emptyLayer(conflictCaptures)), withDiagnostics)
        )
        expect(conflictError._tag).toBe("LeadDeleteConflictError")
      }

      const execute = yield* parseDeleteLeadParams({
        funnel: "funnel-1",
        identifier: "LEAD-1",
        execute: true,
        expectedComments: 0,
        expectedAttachments: 0,
        expectedLabels: 0
      })
      const missingRemoverError = yield* Effect.flip(
        deleteLead(execute, resolvers()).pipe(Effect.provide(emptyLayer(emptyCaptures(), 0, false)), withDiagnostics)
      )
      expect(missingRemoverError._tag).toBe("HulyDataInvalidError")
    })
  )

  it.effect("rejects invalid authoritative relation totals", () =>
    Effect.gen(function* () {
      const preview = yield* parseDeleteLeadParams({ funnel: "funnel-1", identifier: "LEAD-1" })
      const error = yield* Effect.flip(
        deleteLead(preview, resolvers()).pipe(Effect.provide(emptyLayer(emptyCaptures(), -1)), withDiagnostics)
      )
      expect(error._tag).toBe("HulyDataInvalidError")
    })
  )

  it.effect("applies person customer conversion idempotently through the public operation", () =>
    Effect.gen(function* () {
      const captures = emptyCaptures()
      const params = yield* parseMakePersonCustomerParams({ identifier: PersonLocator.make("Prospect,Pat") })
      const applied = yield* makePersonCustomer(params, resolvers(person(), lead, person())).pipe(
        Effect.provide(makeLayer(captures))
      )
      const unchanged = yield* makePersonCustomer(params, resolvers(person(null), lead, person(null))).pipe(
        Effect.provide(makeLayer(captures))
      )
      expect(applied).toEqual({ id: "person-1", applied: true })
      expect(unchanged).toEqual({ id: "person-1", applied: false })
      expect(captures.writes).toEqual(["createMixin"])
    })
  )

  it.effect("recognizes a persisted Customer mixin omitted from the base Person projection", () =>
    Effect.gen(function* () {
      const findOne = mockFn().mockReturnValue(Effect.succeed(person(null)))
      const params = yield* parseMakePersonCustomerParams({ identifier: PersonLocator.make("person-1") })
      const result = yield* makePersonCustomer(params, resolvers()).pipe(
        Effect.provide(HulyClient.testLayer({ findOne })),
        withDiagnostics
      )

      expect(result).toEqual({ id: "person-1", applied: false })
      expect(findOne.mock.calls[0]?.[0]).toBe(leadClassIds.mixin.Customer)
      expect(findOne.mock.calls[0]?.[1]).toEqual({ _id: "person-1" })
    })
  )

  it.effect("reports missing public mutation targets through default resolution", () =>
    Effect.gen(function* () {
      const layer = HulyClient.testLayer({})
      const update = yield* parseUpdateLeadParams({ funnel: "missing", identifier: "LEAD-1", title: "Changed" })
      const move = yield* parseMoveLeadParams({
        funnel: "missing",
        identifier: "LEAD-1",
        destinationFunnel: "also-missing"
      })
      const deletion = yield* parseDeleteLeadParams({ funnel: "missing", identifier: "LEAD-1" })
      const customer = yield* parseMakePersonCustomerParams({ identifier: PersonLocator.make("missing") })

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
})
