import { describe, it } from "@effect/vitest"
import { AvatarType, type Person } from "@hcengineering/contact"
import type { Class, Doc, Ref } from "@hcengineering/core"
import type { TaskType } from "@hcengineering/task"
import { Effect } from "effect"
import { expect } from "vitest"

import { FunnelReference, LeadIdentifier } from "../../../src/domain/schemas/leads.js"
import { Count, DocId, NonEmptyString, StatusName, Timestamp } from "../../../src/domain/schemas/shared.js"
import { HulyClient } from "../../../src/huly/client.js"
import { leadClassIds } from "../../../src/huly/lead-plugin.js"
import { deletionImpact, leadCollectionTarget } from "../../../src/huly/operations/leads-mutations.js"
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

const leadStatus = statusRef("lead:status:Incoming")
const leadTaskType = docRef<TaskType>("lead:taskType:Lead")
const lead: HulyLead = {
  _id: DocId.make("lead-1"),
  _class: DocId.make(leadClassIds.class.Lead),
  space: DocId.make("funnel-1"),
  attachedTo: DocId.make("person-1"),
  attachedToClass: DocId.make(contact.class.Person),
  collection: "leads",
  title: NonEmptyString.make("A lead"),
  identifier: LeadIdentifier.make("LEAD-1"),
  status: DocId.make(leadStatus),
  kind: DocId.make(leadTaskType),
  assignee: null,
  description: null,
  startDate: null,
  dueDate: null
}

const person = (id: string): Person => ({
  _id: docRef<Person>(id),
  _class: contact.class.Person,
  space: contact.space.Contacts,
  modifiedBy: corePersonId("user-1"),
  modifiedOn: Timestamp.make(0),
  name: id,
  avatarType: AvatarType.COLOR
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
      const client = yield* HulyClient.pipe(
        Effect.provide(
          HulyClient.testLayer({
            findAll: <T extends Doc>(documentClass: Ref<Class<T>>) => {
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
      if (error._tag === "HulyDataInvalidError") expect(error.entity).toContain("comment relation count")
    })
  )

  it.effect("requires AttachedDoc collection metadata before lead deletion", () =>
    Effect.gen(function* () {
      const target = yield* leadCollectionTarget(lead)
      const error = yield* Effect.flip(leadCollectionTarget({ ...lead, attachedTo: undefined }))

      expect(target.collection).toBe("leads")
      expect(target.attachedTo).toBe(lead.attachedTo)
      expect(error._tag).toBe("HulyDataInvalidError")
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
        uniquePersonMatch("shared@example.com", [person("person-by-id"), person("person-by-email")])
      )
      expect(error._tag).toBe("PersonIdentifierAmbiguousError")
      if (error._tag === "PersonIdentifierAmbiguousError") expect(error.matches).toBe(2)
    })
  )

  it.effect("rejects duplicate exact email matches", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(uniquePersonMatch("duplicate@example.com", [person("first"), person("second")]))
      expect(error._tag).toBe("PersonIdentifierAmbiguousError")
      if (error._tag === "PersonIdentifierAmbiguousError") expect(error.matches).toBe(2)
    })
  )

  it.effect("resolves the current status from the configured workflow", () =>
    Effect.gen(function* () {
      const resolved = yield* currentStatus(
        workflow,
        { ...lead, status: DocId.make(leadStatus) },
        {
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
      )
      expect(resolved).toEqual({ id: leadStatus, name: StatusName.make("Incoming") })
    })
  )

  it.effect("models explicit description clear separately from an existing value", () =>
    Effect.gen(function* () {
      const client = yield* HulyClient.pipe(Effect.provide(HulyClient.testLayer({})))
      const existing = yield* updateLeadDescription(client, { ...lead, description: DocId.make("markup-ref") }, null)
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
      const result = yield* updateLeadDescription(client, { ...lead, description: DocId.make("markup-ref") }, "same")

      expect(result).toEqual({ operations: {}, changed: false })
    })
  )
})
