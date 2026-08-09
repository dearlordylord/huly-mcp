/* eslint-disable no-restricted-syntax -- Huly SDK test fixtures and the generic client port require nominal-ref bridges at this isolated test boundary. */
import { describe, it } from "@effect/vitest"
import type { Card as HulyCard, MasterTag } from "@hcengineering/card"
import type { Doc, FindOptions, Ref, Space } from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import { Effect, Either, Exit, Schema } from "effect"
import { expect } from "vitest"

import {
  ListMailThreadsParamsSchema,
  ListMailThreadsResultSchema,
  MAIL_THREAD_SUBJECT_LIMIT
} from "../../../src/domain/schemas/mail.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { cardPlugin, core, mail } from "../../../src/huly/huly-plugins.js"
import { listMailThreads } from "../../../src/huly/operations/mail.js"
import type { GenericSpace } from "../../../src/huly/operations/spaces-shared.js"
import { corePersonId, docRef, spaceRef } from "../../helpers/huly-sdk.js"

const person = corePersonId("mail-test-person")
const cardClass = docRef<MasterTag>("chat:masterTag:Thread")

const makeSpace = (id: string, name: string): GenericSpace => ({
  _id: docRef<GenericSpace>(id),
  _class: core.class.Space,
  space: core.space.Space,
  name,
  description: "",
  private: true,
  members: [],
  archived: false,
  modifiedBy: person,
  modifiedOn: 1,
  createdBy: person,
  createdOn: 1
})

const makeCard = (
  id: string,
  space: Ref<Space>,
  title: string,
  modifiedOn: number,
  parent?: Ref<HulyCard>
): HulyCard => ({
  _id: docRef<HulyCard>(id),
  _class: cardClass,
  space,
  title,
  content: docRef("content-blob"),
  blobs: {},
  parentInfo: [],
  ...(parent === undefined ? { parent: null } : { parent }),
  rank: "0|aaa",
  modifiedBy: person,
  modifiedOn,
  createdBy: person,
  createdOn: modifiedOn - 1
})

interface TestState {
  readonly spaces: ReadonlyArray<GenericSpace>
  readonly threads: ReadonlyArray<HulyCard>
  readonly subjects: ReadonlyArray<HulyCard>
  readonly calls?: Array<{ readonly classRef: unknown; readonly query: Record<string, unknown> }>
}

const valueMatches = (actual: unknown, expected: unknown): boolean => {
  if (typeof expected !== "object" || expected === null) return actual === expected
  if ("$like" in expected) {
    const pattern = Reflect.get(expected, "$like")
    if (typeof actual !== "string" || typeof pattern !== "string") return false
    const needle = pattern.slice(1, -1).replace(/\\([%_\\])/g, "$1")
    return actual.toLocaleLowerCase().includes(needle.toLocaleLowerCase())
  }
  if ("$in" in expected) {
    const candidates = Reflect.get(expected, "$in")
    return Array.isArray(candidates) && candidates.includes(actual)
  }
  return false
}

const matchesQuery = (doc: object, query: Record<string, unknown>): boolean =>
  Object.entries(query).every(([key, expected]) => valueMatches(Reflect.get(doc, key), expected))

const applyOptions = <T extends Doc>(docs: ReadonlyArray<T>, options?: FindOptions<T>): Array<T> => {
  const sorted =
    options?.sort?.modifiedOn === -1 ? [...docs].sort((left, right) => right.modifiedOn - left.modifiedOn) : [...docs]
  return sorted.slice(0, options?.limit)
}

const layer = (state: TestState): ReturnType<typeof HulyClient.testLayer> => {
  const docsForClass = (classRef: unknown): ReadonlyArray<Doc> =>
    classRef === mail.tag.MailThread
      ? state.threads
      : classRef === cardPlugin.class.Card
        ? state.subjects
        : classRef === core.class.Space
          ? state.spaces
          : []

  const findAll: HulyClientOperations["findAll"] = ((
    classRef: unknown,
    query: Record<string, unknown>,
    options?: FindOptions<Doc>
  ) => {
    state.calls?.push({ classRef, query })
    return Effect.succeed(
      toFindResult(
        applyOptions(
          docsForClass(classRef).filter((doc) => matchesQuery(doc, query)),
          options
        )
      )
    )
  }) as HulyClientOperations["findAll"]

  const findOne: HulyClientOperations["findOne"] = ((classRef: unknown, query: Record<string, unknown>) =>
    Effect.succeed(docsForClass(classRef).find((doc) => matchesQuery(doc, query)))) as HulyClientOperations["findOne"]

  return HulyClient.testLayer({ findAll, findOne })
}

const decodeParams = Schema.decodeUnknownSync(ListMailThreadsParamsSchema)
const run = (input: unknown, state: TestState) =>
  listMailThreads(decodeParams(input)).pipe(Effect.provide(layer(state)))

// Intentionally bypass the SDK's Card type to exercise malformed data crossing the external Huly boundary.
const malformedCard = (input: unknown): HulyCard => input as HulyCard

describe("Mail thread metadata discovery", () => {
  it("owns a bounded, human-oriented input and metadata-only output schema", () => {
    const decodeInput = Schema.decodeUnknownEither(ListMailThreadsParamsSchema)
    const decodeOutput = Schema.decodeUnknownEither(ListMailThreadsResultSchema)

    expect(Either.isRight(decodeInput({ space: "Product", channelTitleSearch: "alerts", limit: 200 }))).toBe(true)
    expect(Either.isLeft(decodeInput({ channelTitleSearch: "   " }))).toBe(true)
    expect(Either.isLeft(decodeInput({ limit: 201 }))).toBe(true)
    expect(
      Either.isRight(
        decodeOutput({
          threads: [
            {
              id: "thread-1",
              channelTitle: "alerts@example.com",
              space: { id: "space-1", name: "Product" },
              subjects: [{ id: "subject-1", subject: "Build complete" }]
            }
          ]
        })
      )
    ).toBe(true)
  })

  it("loads the published MailThread tag through the plugin boundary", () => {
    expect(String(mail.tag.MailThread)).toBe("mail:tag:MailThread")
  })

  it.effect("supports exact and case-insensitive substring channel-title searches", () =>
    Effect.gen(function* () {
      const space = makeSpace("space-1", "Product")
      const exact = yield* run(
        { channelTitleSearch: "Alerts@Example.com" },
        {
          spaces: [space],
          threads: [
            makeCard("thread-1", space._id, "alerts@example.com", 3),
            makeCard("thread-2", space._id, "billing@example.com", 2)
          ],
          subjects: []
        }
      )
      const substring = yield* run(
        { channelTitleSearch: "AMPLE" },
        { spaces: [space], threads: [makeCard("thread-1", space._id, "alerts@example.com", 3)], subjects: [] }
      )

      expect(exact.threads.map((thread) => thread.id)).toEqual(["thread-1"])
      expect(substring.threads.map((thread) => thread.id)).toEqual(["thread-1"])
    })
  )

  it.effect("resolves a space name or ID and rejects ambiguous names", () =>
    Effect.gen(function* () {
      const first = makeSpace("space-1", "Shared")
      const second = makeSpace("space-2", "Shared")
      const thread = makeCard("thread-1", first._id, "alerts@example.com", 3)

      const byId = yield* run({ space: "space-1" }, { spaces: [first], threads: [thread], subjects: [] })
      expect(byId.threads[0]?.space).toEqual({ id: "space-1", name: "Shared" })

      const ambiguous = yield* Effect.exit(
        run({ space: "Shared" }, { spaces: [first, second], threads: [thread], subjects: [] })
      )
      expect(Exit.isFailure(ambiguous)).toBe(true)
      if (Exit.isFailure(ambiguous)) expect(String(ambiguous.cause)).toContain("SpaceIdentifierAmbiguousError")
    })
  )

  it.effect("returns an empty threads array when the workspace has no Mail thread cards", () =>
    Effect.gen(function* () {
      const result = yield* run({}, { spaces: [], threads: [], subjects: [] })
      expect(result).toEqual({ threads: [] })
    })
  )

  it.effect("omits timestamps that Huly does not return", () =>
    Effect.gen(function* () {
      const space = makeSpace("space-1", "Product")
      const thread = malformedCard({
        ...makeCard("thread-1", space._id, "alerts@example.com", 3),
        createdOn: undefined,
        modifiedOn: undefined
      })
      const subject = malformedCard({
        ...makeCard("subject-1", space._id, "Build complete", 2, thread._id),
        createdOn: undefined,
        modifiedOn: undefined
      })

      const result = yield* run({}, { spaces: [space], threads: [thread], subjects: [subject] })

      expect(result).toEqual({
        threads: [
          {
            id: "thread-1",
            channelTitle: "alerts@example.com",
            space: { id: "space-1", name: "Product" },
            subjects: [{ id: "subject-1", subject: "Build complete" }]
          }
        ]
      })
    })
  )

  it.effect("fails safely when a Mail thread references an unresolved space", () =>
    Effect.gen(function* () {
      const thread = makeCard("thread-1", spaceRef("missing-space"), "alerts@example.com", 3)
      const exit = yield* Effect.exit(run({}, { spaces: [], threads: [thread], subjects: [] }))

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) expect(String(exit.cause)).toContain("could not be resolved")
    })
  )

  it.effect("fails safely when Huly returns malformed Mail thread space metadata", () =>
    Effect.gen(function* () {
      const space = makeSpace("space-1", "Product")
      Reflect.set(space, "name", 42)
      const thread = makeCard("thread-1", space._id, "alerts@example.com", 3)
      const exit = yield* Effect.exit(run({}, { spaces: [space], threads: [thread], subjects: [] }))

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) expect(String(exit.cause)).toContain("malformed Mail thread space metadata")
    })
  )

  it.effect("returns newest channels and bounded newest child subjects in one result", () =>
    Effect.gen(function* () {
      const calls: Array<{ readonly classRef: unknown; readonly query: Record<string, unknown> }> = []
      const space = makeSpace("space-1", "Product")
      const oldThread = makeCard("thread-old", space._id, "old@example.com", 1)
      const newestThread = makeCard("thread-new", space._id, "new@example.com", 20)
      const subjects = Array.from({ length: MAIL_THREAD_SUBJECT_LIMIT + 2 }, (_, index) =>
        makeCard(`subject-${index}`, space._id, `Subject ${index}`, index + 2, newestThread._id)
      )

      const result = yield* run({ limit: 1 }, { spaces: [space], threads: [oldThread, newestThread], subjects, calls })

      expect(result.threads).toHaveLength(1)
      expect(result.threads[0]).toEqual({
        id: "thread-new",
        channelTitle: "new@example.com",
        space: { id: "space-1", name: "Product" },
        createdOn: 19,
        modifiedOn: 20,
        subjects: Array.from({ length: MAIL_THREAD_SUBJECT_LIMIT }, (_, index) => ({
          id: `subject-${MAIL_THREAD_SUBJECT_LIMIT + 1 - index}`,
          subject: `Subject ${MAIL_THREAD_SUBJECT_LIMIT + 1 - index}`,
          createdOn: MAIL_THREAD_SUBJECT_LIMIT + 2 - index,
          modifiedOn: MAIL_THREAD_SUBJECT_LIMIT + 3 - index
        }))
      })
      expect(calls.some((call) => call.classRef === mail.tag.MailThread)).toBe(true)
      expect(
        calls.some((call) => call.classRef === cardPlugin.class.Card && call.query["parent"] === newestThread._id)
      ).toBe(true)
    })
  )

  it.effect("fails safely when Huly returns malformed Mail card metadata", () =>
    Effect.gen(function* () {
      const malformed = malformedCard({ ...makeCard("thread-1", spaceRef("space-1"), "title", 2), title: 42 })
      const exit = yield* Effect.exit(run({}, { spaces: [], threads: [malformed], subjects: [] }))

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) expect(String(exit.cause)).toContain("HulyError")
    })
  )
})
