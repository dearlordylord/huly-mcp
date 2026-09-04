import { describe, it } from "@effect/vitest"
import { AvatarType, type Person } from "@hcengineering/contact"
import type { Blob, Doc } from "@hcengineering/core"
import type { TaskType } from "@hcengineering/task"
import { Effect } from "effect"
import { expect } from "vitest"

import { LeadIdentifier } from "../../../src/domain/schemas/leads.js"
import { StatusName } from "../../../src/domain/schemas/shared.js"
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
import { contact, core, task } from "../../../src/huly/huly-plugins.js"
import { testMarkupUrlConfig } from "../../../src/huly/operations/markup.js"
import { renderMarkdownWithNativeReferencesForWrite } from "../../../src/huly/operations/native-reference-markup.js"
import { toClassRef } from "../../../src/huly/operations/sdk-boundary.js"
import { corePersonId, docRef, spaceRef, statusRef } from "../../helpers/huly-sdk.js"

const leadStatus = statusRef("lead:status:Incoming")
const leadTaskType = docRef<TaskType>("lead:taskType:Lead")
const lead: HulyLead = {
  _id: docRef<HulyLead>("lead-1"),
  _class: toClassRef<HulyLead>(leadClassIds.class.Lead),
  space: spaceRef("funnel-1"),
  modifiedBy: corePersonId("user-1"),
  modifiedOn: 0,
  attachedTo: docRef<Doc>("person-1"),
  attachedToClass: toClassRef<Doc>(contact.class.Person),
  collection: "leads",
  title: "A lead",
  identifier: LeadIdentifier.make("LEAD-1"),
  status: leadStatus,
  kind: leadTaskType,
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
  modifiedOn: 0,
  name: id,
  avatarType: AvatarType.COLOR
})

const workflow: FunnelWorkflowTaskType = {
  taskType: {
    _id: leadTaskType,
    _class: task.class.TaskType,
    space: core.space.Model,
    modifiedBy: corePersonId("user-1"),
    modifiedOn: 0,
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
  it("calculates deletion impact from known native counters", () => {
    const impacted = deletionImpact({ ...lead, comments: 2, attachments: 3 })
    expect(impacted).toEqual({ comments: 2, attachments: 3, totalAffected: 5 })
  })

  it("treats missing counters as zero", () => {
    expect(deletionImpact(lead)).toEqual({ comments: 0, attachments: 0, totalAffected: 0 })
  })

  it.effect("resolves a workflow status by normalized display name", () =>
    Effect.gen(function* () {
      const resolved = yield* statusByName(workflow.statuses, " incoming ", "funnel-1")
      expect(resolved).toBe(leadStatus)
    })
  )

  it.effect("rejects missing and duplicate workflow status names", () =>
    Effect.gen(function* () {
      const missing = yield* Effect.flip(statusByName(workflow.statuses, "Won", "funnel-1"))
      const duplicate = yield* Effect.flip(
        statusByName(
          [...workflow.statuses, { id: statusRef("lead:status:Incoming-2"), name: "Incoming" }],
          "Incoming",
          "funnel-1"
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
      expect(error.matches).toBe(2)
    })
  )

  it.effect("resolves the current status from the configured workflow", () =>
    Effect.gen(function* () {
      const resolved = yield* currentStatus(
        workflow,
        { ...lead, status: leadStatus },
        {
          _id: docRef("funnel-1"),
          _class: toClassRef<HulyFunnel>(leadClassIds.class.Funnel),
          space: spaceRef("workspace"),
          modifiedBy: corePersonId("user-1"),
          modifiedOn: 0,
          name: "Sales",
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
      const existing = yield* updateLeadDescription(client, { ...lead, description: docRef<Blob>("markup-ref") }, null)
      const absent = yield* updateLeadDescription(client, lead, null)

      expect(existing).toEqual({ operations: { description: null }, changed: true })
      expect(absent).toEqual({ operations: {}, changed: false })
    })
  )

  it.effect("does not write an existing description when native markup is unchanged", () =>
    Effect.gen(function* () {
      const rendered = renderMarkdownWithNativeReferencesForWrite("same", testMarkupUrlConfig, "description")
      if (rendered._tag !== "success") return yield* Effect.dieMessage(rendered.reason)
      const client = yield* HulyClient.pipe(
        Effect.provide(HulyClient.testLayer({ fetchMarkup: () => Effect.succeed(rendered.rendered.markup) }))
      )
      const result = yield* updateLeadDescription(client, { ...lead, description: docRef<Blob>("markup-ref") }, "same")

      expect(result).toEqual({ operations: {}, changed: false })
    })
  )
})
