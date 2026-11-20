import { it } from "@effect/vitest"
import { Effect } from "effect"
import { expect } from "vitest"

import { DocId, NonEmptyString } from "../../src/domain/schemas/shared.js"
import { PersonMergeSnapshotStaleError } from "../../src/huly/errors.js"
import { tracker } from "../../src/huly/huly-plugins.js"
import {
  inspectNativePersonReferences,
  migrateNativePersonReferences
} from "../../src/huly/person-reference-migration.js"
import { docRef } from "../helpers/huly-sdk.js"
import {
  githubIssueMixin,
  makePersonReferenceClient,
  reviewerMixin,
  sourcePerson,
  survivorPerson
} from "../helpers/person-reference-client.js"

it.effect("counts and migrates an inherited assignee once on a GitHub issue", () =>
  Effect.gen(function* () {
    const { addIssue, client, storage, writes } = makePersonReferenceClient()
    const githubFields = { repository: "repository", url: "https://example.invalid/issues/1", githubNumber: 1 }
    addIssue(DocId.make("issue-1"), { assignee: sourcePerson, [githubIssueMixin]: githubFields })

    const impacts = yield* inspectNativePersonReferences(client, sourcePerson)
    expect(impacts).toMatchObject([
      { ownerClass: tracker.class.Issue, concreteClass: tracker.class.Issue, field: "assignee", count: 1 }
    ])
    yield* migrateNativePersonReferences(client, impacts, sourcePerson, survivorPerson)

    const updated = storage.getObject(docRef("issue-1"))
    expect(Reflect.get(updated, NonEmptyString.make("assignee"))).toBe(survivorPerson)
    expect(Reflect.get(updated, githubIssueMixin)).toEqual(githubFields)
    expect(writes).toHaveLength(1)
  })
)

it.effect("keeps same-name references in the document and different mixins distinct", () =>
  Effect.gen(function* () {
    const { addIssue, addReference, client, storage, writes } = makePersonReferenceClient()
    addReference(githubIssueMixin, NonEmptyString.make("assignee"))
    addReference(reviewerMixin, NonEmptyString.make("assignee"))
    addIssue(DocId.make("issue-1"), {
      assignee: sourcePerson,
      [githubIssueMixin]: { assignee: sourcePerson },
      [reviewerMixin]: { assignee: sourcePerson }
    })

    const impacts = yield* inspectNativePersonReferences(client, sourcePerson)
    expect(impacts.map(({ count, ownerClass }) => ({ count, ownerClass }))).toEqual([
      { ownerClass: tracker.class.Issue, count: 1 },
      { ownerClass: githubIssueMixin, count: 1 },
      { ownerClass: reviewerMixin, count: 1 }
    ])
    yield* migrateNativePersonReferences(client, impacts, sourcePerson, survivorPerson)
    const updated = storage.getObject(docRef("issue-1"))
    expect(Reflect.get(updated, NonEmptyString.make("assignee"))).toBe(survivorPerson)
    expect(Reflect.get(updated, githubIssueMixin)).toEqual({ assignee: survivorPerson })
    expect(Reflect.get(updated, reviewerMixin)).toEqual({ assignee: survivorPerson })
    expect(writes).toHaveLength(3)
  })
)

it.effect("rejects mixin array snapshot churn before any write and migrates an unchanged snapshot", () =>
  Effect.gen(function* () {
    const { addIssue, addReference, client, storage, writes } = makePersonReferenceClient()
    addReference(reviewerMixin, NonEmptyString.make("reviewers"), true)
    addIssue(DocId.make("issue-1"), { [reviewerMixin]: { reviewers: [sourcePerson, survivorPerson] } })
    addIssue(DocId.make("issue-2"), { [reviewerMixin]: { reviewers: [sourcePerson, "other-person"] } })

    const impacts = yield* inspectNativePersonReferences(client, sourcePerson)
    expect(impacts).toMatchObject([{ ownerClass: reviewerMixin, field: "reviewers", kind: "array", count: 2 }])
    addIssue(DocId.make("issue-2"), { [reviewerMixin]: { reviewers: [sourcePerson, "changed-person"] } })
    const error = yield* Effect.flip(migrateNativePersonReferences(client, impacts, sourcePerson, survivorPerson))
    expect(error).toBeInstanceOf(PersonMergeSnapshotStaleError)
    expect(writes).toEqual([])

    addIssue(DocId.make("issue-2"), { [reviewerMixin]: { reviewers: [sourcePerson, "other-person"] } })
    yield* migrateNativePersonReferences(client, impacts, sourcePerson, survivorPerson)
    expect(Reflect.get(storage.getObject(docRef("issue-1")), reviewerMixin)).toEqual({ reviewers: [survivorPerson] })
    expect(Reflect.get(storage.getObject(docRef("issue-2")), reviewerMixin)).toEqual({
      reviewers: [survivorPerson, "other-person"]
    })
    expect(writes).toHaveLength(2)
  })
)

it.effect("migrates a mixin-owned reference without changing the document field of the same name", () =>
  Effect.gen(function* () {
    const { addIssue, addReference, client, storage } = makePersonReferenceClient()
    addReference(reviewerMixin, NonEmptyString.make("assignee"))
    addIssue(DocId.make("issue-1"), {
      assignee: survivorPerson,
      [reviewerMixin]: { assignee: sourcePerson, note: "keep" }
    })

    const impacts = yield* inspectNativePersonReferences(client, sourcePerson)
    expect(impacts).toMatchObject([
      { ownerClass: reviewerMixin, concreteClass: tracker.class.Issue, field: "assignee", count: 1 }
    ])
    yield* migrateNativePersonReferences(client, impacts, sourcePerson, survivorPerson)

    const updated = storage.getObject(docRef("issue-1"))
    expect(Reflect.get(updated, NonEmptyString.make("assignee"))).toBe(survivorPerson)
    expect(Reflect.get(updated, reviewerMixin)).toEqual({ assignee: survivorPerson, note: "keep" })
  })
)
