/* eslint-disable no-restricted-syntax -- test fixtures build Huly SDK docs whose nominal types are not structurally compatible with plain object literals, and branded refs have no runtime constructors */
import { describe, it } from "@effect/vitest"
import type { ThreadMessage as HulyThreadMessage } from "@hcengineering/chunter"
import type { Person, SocialIdentity } from "@hcengineering/contact"
import { type MarkupBlobRef, type PersonId, type Ref, toFindResult } from "@hcengineering/core"
import type { Document as HulyDocument, Teamspace as HulyTeamspace } from "@hcengineering/document"
import { Effect } from "effect"
import { expect } from "vitest"

import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { chunter, contact, documentPlugin } from "../../../src/huly/huly-plugins.js"
import { listInlineComments } from "../../../src/huly/operations/documents-inline-comments.js"
import { INLINE_COMMENT_MARK_TYPE } from "../../../src/huly/operations/inline-comment-mark.js"
import { documentIdentifier, teamspaceIdentifier } from "../../helpers/brands.js"

const TEAMSPACE_ID = "teamspace-1" as Ref<HulyTeamspace>

const makeTeamspace = (): HulyTeamspace =>
  ({
    _id: TEAMSPACE_ID,
    _class: documentPlugin.class.Teamspace,
    name: "Docs",
    archived: false,
    modifiedOn: 0,
    createdOn: 0
  }) as unknown as HulyTeamspace

const makeDocument = (overrides?: Partial<HulyDocument>): HulyDocument =>
  ({
    _id: "doc-1" as Ref<HulyDocument>,
    _class: documentPlugin.class.Document,
    space: TEAMSPACE_ID,
    title: "Spec",
    content: "content-blob" as MarkupBlobRef,
    modifiedOn: 0,
    createdOn: 0,
    ...overrides
  }) as unknown as HulyDocument

const markupText = (text: string): string =>
  JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] })

const markupWithThread = (threadId: string, text: string): string =>
  JSON.stringify({
    type: "doc",
    content: [{
      type: "paragraph",
      content: [{ type: "text", text, marks: [{ type: INLINE_COMMENT_MARK_TYPE, attrs: { thread: threadId } }] }]
    }]
  })

const makeReply = (id: string, thread: string, createdBy: string | undefined, message: string): HulyThreadMessage =>
  ({
    _id: id as Ref<HulyThreadMessage>,
    _class: chunter.class.ThreadMessage,
    attachedTo: thread,
    message,
    createdOn: 1000,
    ...(createdBy === undefined ? {} : { createdBy: createdBy as PersonId })
  }) as unknown as HulyThreadMessage

interface InlineMock {
  teamspaces?: ReadonlyArray<HulyTeamspace>
  documents?: ReadonlyArray<HulyDocument>
  markup?: string
  replies?: ReadonlyArray<HulyThreadMessage>
  socialIdentities?: ReadonlyArray<SocialIdentity>
  persons?: ReadonlyArray<Person>
}

const buildLayer = (m: InlineMock) => {
  const teamspaces = m.teamspaces ?? [makeTeamspace()]
  const documents = m.documents ?? []

  const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
    const q = query as Record<string, unknown>
    if (_class === documentPlugin.class.Teamspace) {
      return Effect.succeed(teamspaces.find((ts) => ts.name === q.name || ts._id === q._id))
    }
    if (_class === documentPlugin.class.Document) {
      return Effect.succeed(
        documents.find((d) => (d.space === q.space && d.title === q.title) || (d.space === q.space && d._id === q._id))
      )
    }
    return Effect.succeed(undefined)
  }) as HulyClientOperations["findOne"]

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown) => {
    if (_class === chunter.class.ThreadMessage) return Effect.succeed(toFindResult([...(m.replies ?? [])]))
    if (_class === contact.class.SocialIdentity) return Effect.succeed(toFindResult([...(m.socialIdentities ?? [])]))
    if (_class === contact.class.Person) return Effect.succeed(toFindResult([...(m.persons ?? [])]))
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]

  const fetchMarkupImpl: HulyClientOperations["fetchMarkup"] =
    (() => Effect.succeed(m.markup ?? "")) as HulyClientOperations["fetchMarkup"]

  return HulyClient.testLayer({ findOne: findOneImpl, findAll: findAllImpl, fetchMarkup: fetchMarkupImpl })
}

const PARAMS = { teamspace: teamspaceIdentifier("Docs"), document: documentIdentifier("Spec") }

describe("listInlineComments", () => {
  it.effect("fails when the teamspace is not found", () =>
    Effect.gen(function*() {
      const err = yield* Effect.flip(
        listInlineComments(PARAMS).pipe(Effect.provide(buildLayer({ teamspaces: [] })))
      )
      expect(err._tag).toBe("TeamspaceNotFoundError")
    }))

  it.effect("fails when the document is not found", () =>
    Effect.gen(function*() {
      const err = yield* Effect.flip(
        listInlineComments(PARAMS).pipe(Effect.provide(buildLayer({ documents: [] })))
      )
      expect(err._tag).toBe("DocumentNotFoundError")
    }))

  it.effect("returns empty when the document has no content", () =>
    Effect.gen(function*() {
      const result = yield* listInlineComments(PARAMS).pipe(
        Effect.provide(buildLayer({ documents: [makeDocument({ content: null })] }))
      )
      expect(result).toEqual({ comments: [], total: 0 })
    }))

  it.effect("returns empty when the content has no inline comment marks", () =>
    Effect.gen(function*() {
      const result = yield* listInlineComments(PARAMS).pipe(
        Effect.provide(buildLayer({ documents: [makeDocument()], markup: markupText("plain text") }))
      )
      expect(result).toEqual({ comments: [], total: 0 })
    }))

  it.effect("returns comment threads without replies when includeReplies is omitted", () =>
    Effect.gen(function*() {
      const result = yield* listInlineComments(PARAMS).pipe(
        Effect.provide(buildLayer({ documents: [makeDocument()], markup: markupWithThread("thread-1", "commented") }))
      )
      expect(result.total).toBe(1)
      expect(result.comments[0]).toEqual({ threadId: "thread-1", text: "commented" })
    }))

  it.effect("includes replies with resolved and unresolved sender names", () =>
    Effect.gen(function*() {
      const result = yield* listInlineComments({ ...PARAMS, includeReplies: true }).pipe(
        Effect.provide(buildLayer({
          documents: [makeDocument()],
          markup: markupWithThread("thread-1", "commented"),
          replies: [
            makeReply("reply-1", "thread-1", "social-1", markupText("Looks good")),
            makeReply("reply-2", "thread-1", undefined, markupText("Anonymous"))
          ],
          socialIdentities: [
            ({ _id: "social-1" as Ref<SocialIdentity>, attachedTo: "person-1" }) as unknown as SocialIdentity
          ],
          persons: [({ _id: "person-1", name: "Alice" }) as unknown as Person]
        }))
      )

      expect(result.total).toBe(1)
      const comment = result.comments[0]
      expect(comment.threadId).toBe("thread-1")
      expect(comment.replies).toHaveLength(2)
      expect(comment.replies?.[0]).toMatchObject({ id: "reply-1", sender: "Alice" })
      expect(comment.replies?.[0]?.body).toContain("Looks good")
      expect(comment.replies?.[1]).toMatchObject({ id: "reply-2", sender: undefined })
    }))

  it.effect("includes an empty replies array when includeReplies is set but none exist", () =>
    Effect.gen(function*() {
      const result = yield* listInlineComments({ ...PARAMS, includeReplies: true }).pipe(
        Effect.provide(buildLayer({
          documents: [makeDocument()],
          markup: markupWithThread("thread-1", "commented"),
          replies: []
        }))
      )
      expect(result.comments[0]?.replies).toEqual([])
    }))
})
