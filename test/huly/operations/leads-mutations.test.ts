import { describe, it } from "@effect/vitest"
import type { Class, Doc, DocumentQuery, FindOptions, Ref } from "@hcengineering/core"
import type { TaskType } from "@hcengineering/task"
import { Effect, Schema } from "effect"
import { expect } from "vitest"

import { FunnelReference, LeadIdentifier } from "../../../src/domain/schemas/leads.js"
import { LeadMutationDocumentSchema, type LeadPersonDocument } from "../../../src/domain/schemas/leads-mutations.js"
import { PersonLocator } from "../../../src/domain/schemas/hr-departments.js"
import {
  BlobId,
  Count,
  DocId,
  NonEmptyString,
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
import { deletionImpact } from "../../../src/huly/operations/leads-mutations.js"
import {
  currentStatus,
  statusByName,
  uniquePersonMatch,
  updateLeadDescription,
  type HulyLead
} from "../../../src/huly/operations/leads-mutations-shared.js"
import type { FunnelWorkflowTaskType, HulyFunnel } from "../../../src/huly/operations/funnels-shared.js"
import { attachment, chunter, contact, core, tags, task } from "../../../src/huly/huly-plugins.js"
import { testMarkupUrlConfig } from "../../../src/huly/operations/markup.js"
import { renderMarkdownWithNativeReferencesForWrite } from "../../../src/huly/operations/native-reference-markup.js"
import { toClassRef } from "../../../src/huly/operations/sdk-boundary.js"
import { corePersonId, docRef, findResult, spaceRef, statusRef } from "../../helpers/huly-sdk.js"

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

describe("Lead mutation functional helpers", () => {
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
})
