import { describe, it } from "@effect/vitest"
import type { Attachment as HulyAttachment } from "@hcengineering/attachment"
import type { ChatMessage } from "@hcengineering/chunter"
import type {
  AttachedData,
  AttachedDoc,
  Class,
  Data,
  Doc,
  DocumentQuery,
  DocumentUpdate,
  FindOptions,
  Ref,
  Space
} from "@hcengineering/core"
import type { TagElement, TagReference } from "@hcengineering/tags"
import { Effect, Layer } from "effect"
import { expect } from "vitest"

import { AttachmentId, CommentId, NonEmptyString } from "../../../src/domain/schemas/shared.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { FunnelIdentifierAmbiguousError, LeadCommentNotFoundError } from "../../../src/huly/errors-leads.js"
import { attachment, chunter, core, tags } from "../../../src/huly/huly-plugins.js"
import { leadClassIds } from "../../../src/huly/lead-plugin.js"
import {
  addLeadAttachment,
  addLeadComment,
  addLeadLabel,
  deleteLeadAttachment,
  deleteLeadComment,
  getLeadAttachment,
  listLeadAttachments,
  listLeadComments,
  listLeadLabelDefinitions,
  listLeadLabels,
  removeLeadLabel,
  updateLeadAttachment,
  updateLeadComment,
  updateLeadLabel
} from "../../../src/huly/operations/lead-collaboration.js"
import { listRelations } from "../../../src/huly/operations/generic-associations.js"
import { markdownToMarkupString, testMarkupUrlConfig } from "../../../src/huly/operations/markup.js"
import { toRef } from "../../../src/huly/operations/sdk-boundary.js"
import { HulyStorageClient } from "../../../src/huly/storage.js"
import { corePersonId, findResult } from "../../helpers/huly-sdk.js"
import {
  attachmentFileName,
  base64FileData,
  colorCode,
  funnelReference,
  leadIdentifier,
  mimeType,
  tagIdentifier
} from "../../helpers/brands.js"

const funnel = {
  _id: toRef<Doc>("funnel-1"),
  _class: leadClassIds.class.Funnel,
  space: toRef<Space>("space"),
  name: "Sales",
  archived: false,
  type: toRef<Doc>("project-type"),
  modifiedBy: corePersonId("actor"),
  modifiedOn: 10
}

const LEAD_COLLECTION = "leads" as const

const lead = {
  _id: toRef<Doc>("lead-1"),
  _class: leadClassIds.class.Lead,
  space: toRef<Space>("funnel-1"),
  modifiedBy: corePersonId("actor"),
  modifiedOn: 10,
  title: NonEmptyString.make("Deal"),
  identifier: leadIdentifier("LEAD-1"),
  status: toRef("status-1"),
  kind: toRef("lead:taskType:Lead"),
  assignee: null,
  description: null,
  startDate: null,
  dueDate: null,
  attachedTo: toRef<Doc>("customer-1"),
  attachedToClass: toRef<Doc>("contact:class:Person"),
  collection: LEAD_COLLECTION
}

const comment = (): ChatMessage => ({
  _id: toRef<ChatMessage>("comment-1"),
  _class: chunter.class.ChatMessage,
  space: lead.space,
  attachedTo: lead._id,
  attachedToClass: leadClassIds.class.Lead,
  collection: "comments",
  message: markdownToMarkupString("Existing note", testMarkupUrlConfig),
  modifiedBy: corePersonId("actor"),
  modifiedOn: 10,
  createdBy: corePersonId("actor"),
  createdOn: 9
})

const file = (): HulyAttachment => ({
  _id: toRef<HulyAttachment>("attachment-1"),
  _class: attachment.class.Attachment,
  space: lead.space,
  attachedTo: lead._id,
  attachedToClass: leadClassIds.class.Lead,
  collection: "attachments",
  name: "note.txt",
  file: toRef("blob-1"),
  size: 5,
  type: "text/plain",
  lastModified: 10,
  pinned: false,
  modifiedBy: corePersonId("actor"),
  modifiedOn: 10,
  createdBy: corePersonId("actor"),
  createdOn: 9
})

const label = (overrides?: Partial<TagElement>): TagElement => ({
  _id: toRef<TagElement>("label-1"),
  _class: tags.class.TagElement,
  space: core.space.Workspace,
  title: "priority",
  description: "Important",
  targetClass: leadClassIds.class.Lead,
  color: 2,
  category: tags.category.NoCategory,
  refCount: 1,
  modifiedBy: corePersonId("actor"),
  modifiedOn: 10,
  createdBy: corePersonId("actor"),
  createdOn: 9,
  ...overrides
})

const labelRef = (): TagReference => ({
  _id: toRef<TagReference>("label-ref-1"),
  _class: tags.class.TagReference,
  space: lead.space,
  attachedTo: lead._id,
  attachedToClass: leadClassIds.class.Lead,
  collection: "labels",
  tag: label()._id,
  title: "priority",
  color: 2,
  weight: 1,
  modifiedBy: corePersonId("actor"),
  modifiedOn: 10,
  createdBy: corePersonId("actor"),
  createdOn: 9
})

interface State {
  readonly funnels?: ReadonlyArray<typeof funnel>
  readonly comments: ReadonlyArray<ChatMessage>
  readonly attachments: ReadonlyArray<HulyAttachment>
  readonly labels: ReadonlyArray<TagElement>
  readonly references: ReadonlyArray<TagReference>
  readonly added: Array<unknown>
  readonly updated: Array<{ readonly id: string; readonly value: unknown }>
  readonly removed: Array<string>
}

const queryField = (value: unknown, field: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, field) : undefined

const matchesQuery = (doc: Doc, query: unknown): boolean =>
  [
    "_id",
    "name",
    "identifier",
    "space",
    "attachedTo",
    "attachedToClass",
    "collection",
    "targetClass",
    "title",
    "tag"
  ].every((field) => queryField(query, field) === undefined || queryField(doc, field) === queryField(query, field))

const docsForClass = <T extends Doc>(_class: Ref<Class<T>>, docs: ReadonlyArray<Doc>): Array<T> =>
  docs.filter((doc): doc is T => doc._class === _class)

const testLayer = (state: State) => {
  const docs = (): ReadonlyArray<Doc> => [
    ...(state.funnels ?? [funnel]),
    lead,
    ...state.comments,
    ...state.attachments,
    ...state.labels,
    ...state.references
  ]
  const findAll: HulyClientOperations["findAll"] = <T extends Doc>(
    _class: Ref<Class<T>>,
    rawQuery: DocumentQuery<T>,
    options?: FindOptions<T>
  ) => {
    const matches = docsForClass(_class, docs()).filter((doc) => matchesQuery(doc, rawQuery))
    const result = findResult(matches.slice(0, options?.limit))
    result.total = matches.length
    return Effect.succeed(result)
  }

  const findOne: HulyClientOperations["findOne"] = <T extends Doc>(_class: Ref<Class<T>>, rawQuery: DocumentQuery<T>) =>
    Effect.succeed(docsForClass(_class, docs()).find((doc) => matchesQuery(doc, rawQuery)))

  const addCollection: HulyClientOperations["addCollection"] = <T extends Doc, P extends AttachedDoc>(
    _class: Ref<Class<P>>,
    _space: Ref<Space>,
    _attachedTo: Ref<T>,
    _attachedToClass: Ref<Class<T>>,
    _collection: string,
    data: AttachedData<P>,
    id?: Ref<P>
  ) => {
    state.added.push(data)
    return Effect.succeed(id ?? toRef<P>("created-reference"))
  }

  const createDoc: HulyClientOperations["createDoc"] = <T extends Doc>(
    _class: Ref<Class<T>>,
    _space: Ref<Space>,
    data: Data<T>,
    id?: Ref<T>
  ) => {
    state.added.push(data)
    return Effect.succeed(id ?? toRef<T>("created-label"))
  }

  const updateDoc: HulyClientOperations["updateDoc"] = <T extends Doc>(
    _class: Ref<Class<T>>,
    _space: Ref<Space>,
    id: Ref<T>,
    value: DocumentUpdate<T>
  ) => {
    state.updated.push({ id: String(id), value })
    return Effect.succeed({})
  }

  const removeDoc: HulyClientOperations["removeDoc"] = <T extends Doc>(
    _class: Ref<Class<T>>,
    _space: Ref<Space>,
    id: Ref<T>
  ) => {
    state.removed.push(String(id))
    return Effect.succeed({})
  }

  return HulyClient.testLayer({ addCollection, createDoc, findAll, findOne, removeDoc, updateDoc })
}

const state = (overrides: Partial<State> = {}): State => ({
  comments: [],
  attachments: [],
  labels: [],
  references: [],
  added: [],
  updated: [],
  removed: [],
  ...overrides
})

const target = { funnel: funnelReference("Sales"), identifier: leadIdentifier("LEAD-1") }

describe("lead collaboration", () => {
  it.effect("creates, lists, updates, and deletes scoped comments", () => {
    const fixture = state({ comments: [comment()] })
    return Effect.gen(function* () {
      expect((yield* listLeadComments(target)).comments[0]?.body).toBe("Existing note")
      expect((yield* addLeadComment({ ...target, body: NonEmptyString.make("New note") })).changed).toBe(true)
      expect(
        (yield* updateLeadComment({
          ...target,
          commentId: CommentId.make("comment-1"),
          body: NonEmptyString.make("Existing note")
        })).changed
      ).toBe(false)
      expect(
        (yield* updateLeadComment({
          ...target,
          commentId: CommentId.make("comment-1"),
          body: NonEmptyString.make("Changed")
        })).changed
      ).toBe(true)
      expect((yield* deleteLeadComment({ ...target, commentId: CommentId.make("comment-1") })).changed).toBe(true)
      expect(fixture.added).toHaveLength(1)
      expect(fixture.updated).toHaveLength(1)
      expect(fixture.removed).toEqual(["comment-1"])
    }).pipe(Effect.provide(testLayer(fixture)))
  })

  it.effect("rejects a comment outside the resolved lead scope", () => {
    const fixture = state()
    return Effect.gen(function* () {
      const error = yield* Effect.flip(deleteLeadComment({ ...target, commentId: CommentId.make("missing") }))
      expect(error).toBeInstanceOf(LeadCommentNotFoundError)
    }).pipe(Effect.provide(testLayer(fixture)))
  })

  it.effect("rejects an ambiguous exact funnel name before reading collaboration collections", () => {
    const fixture = state({ funnels: [funnel, { ...funnel, _id: toRef<Doc>("funnel-2") }] })
    return Effect.gen(function* () {
      const error = yield* Effect.flip(listLeadComments(target))
      expect(error).toBeInstanceOf(FunnelIdentifierAmbiguousError)
    }).pipe(Effect.provide(testLayer(fixture)))
  })

  it.effect("uploads, lists, gets, updates, and deletes scoped attachments", () => {
    const fixture = state({ attachments: [file()] })
    return Effect.gen(function* () {
      expect((yield* listLeadAttachments(target)).attachments[0]?.name).toBe("note.txt")
      const added = yield* addLeadAttachment({
        ...target,
        filename: attachmentFileName("new.txt"),
        contentType: mimeType("text/plain"),
        data: base64FileData("aGVsbG8=")
      })
      expect(added.blobId).toBe("test-blob-id")
      expect(
        (yield* getLeadAttachment({ ...target, attachmentId: AttachmentId.make("attachment-1") })).attachment.url
      ).toContain("blob-1")
      expect(
        (yield* updateLeadAttachment({ ...target, attachmentId: AttachmentId.make("attachment-1"), pinned: true }))
          .changed
      ).toBe(true)
      expect(
        (yield* deleteLeadAttachment({ ...target, attachmentId: AttachmentId.make("attachment-1") })).changed
      ).toBe(true)
    }).pipe(Effect.provide(Layer.merge(testLayer(fixture), HulyStorageClient.testLayer({}))))
  })

  it.effect("lists definitions and manages native label relations", () => {
    const fixture = state({
      labels: [label(), label({ _id: toRef<TagElement>("label-2"), title: "secondary" })],
      references: [labelRef()]
    })
    return Effect.gen(function* () {
      const definitions = yield* listLeadLabelDefinitions({ limit: 1 })
      expect(definitions.labels[0]?.title).toBe("priority")
      expect(definitions).toMatchObject({ total: 2, truncated: true })
      expect((yield* listLeadLabels(target)).labels[0]).toMatchObject({ title: "priority", weight: 1 })
      expect((yield* addLeadLabel({ ...target, label: tagIdentifier("priority"), weight: 2 })).attached).toBe(false)
      expect((yield* updateLeadLabel({ ...target, label: tagIdentifier("priority"), weight: 3 })).updatedCount).toBe(1)
      expect((yield* removeLeadLabel({ ...target, label: tagIdentifier("priority") })).detachedCount).toBe(1)
      expect(fixture.updated.at(-1)?.value).toEqual({ weight: 3 })
      expect(fixture.removed.at(-1)).toBe("label-ref-1")
    }).pipe(Effect.provide(testLayer(fixture)))
  })

  it.effect("creates missing label definitions and reports absent attached relations", () => {
    const fixture = state()
    return Effect.gen(function* () {
      const added = yield* addLeadLabel({ ...target, label: tagIdentifier("new"), color: colorCode(4) })
      expect(added).toMatchObject({ attached: true, labelCreated: true })
      const existingLabelFixture = state({ labels: [label()] })
      const update = yield* updateLeadLabel({ ...target, label: tagIdentifier("priority"), weight: 8 }).pipe(
        Effect.provide(testLayer(existingLabelFixture))
      )
      const removed = yield* removeLeadLabel({ ...target, label: tagIdentifier("priority") }).pipe(
        Effect.provide(testLayer(existingLabelFixture))
      )
      expect(update).toMatchObject({ updated: false, updatedCount: 0 })
      expect(removed).toMatchObject({ detached: false, detachedCount: 0 })
    }).pipe(Effect.provide(testLayer(fixture)))
  })

  it.effect("resolves a friendly lead endpoint for generic relations", () => {
    const fixture = state()
    return Effect.gen(function* () {
      const result = yield* listRelations({
        source: { kind: "lead", funnel: funnelReference("Sales"), identifier: leadIdentifier("LEAD-1") }
      })
      expect(result).toEqual({ relations: [], total: 0 })
    }).pipe(Effect.provide(testLayer(fixture)))
  })
})
