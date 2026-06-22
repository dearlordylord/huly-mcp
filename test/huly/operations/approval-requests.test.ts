import { describe, it } from "@effect/vitest"
import type { Channel, Person as HulyPerson } from "@hcengineering/contact"
import { AvatarType } from "@hcengineering/contact"
import type { Class, Doc, DocumentQuery, FindOptions, PersonId as HulyPersonId, Ref, Tx } from "@hcengineering/core"
import { SortingOrder, toFindResult } from "@hcengineering/core"
import type { Request as HulyApprovalRequest } from "@hcengineering/request"
import { RequestStatus as HulyRequestStatus } from "@hcengineering/request"
import { Effect, Exit } from "effect"
import { expect } from "vitest"

import { ApprovalRequestId } from "../../../src/domain/schemas/approval-requests.js"
import { DocId, ObjectClassName } from "../../../src/domain/schemas/shared.js"
import {
  ApprovalRequestCountMetadataDegradedWarningCode,
  ApprovalRequestPersonMetadataDegradedWarningCode
} from "../../../src/domain/schemas/tool-warnings.js"
import type { ToolWarning } from "../../../src/domain/schemas/tool-warnings.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { Diagnostics, makeDiagnosticsScope } from "../../../src/huly/diagnostics.js"
import { ApprovalRequestNotFoundError } from "../../../src/huly/errors.js"
import { contact, core, request as requestPlugin } from "../../../src/huly/huly-plugins.js"
import { getApprovalRequest, listApprovalRequests } from "../../../src/huly/operations/approval-requests.js"
import { toClassRef, toRef } from "../../../src/huly/operations/sdk-boundary.js"
import { assertAt } from "../../../src/utils/assertions.js"
import { corePersonId } from "../../helpers/huly-sdk.js"

type QueryRecord = Readonly<Record<string, unknown>>
type DocRecord = Readonly<Record<string, unknown>>

interface CapturedFindAll {
  readonly classId: string
  readonly query: QueryRecord
  readonly options: FindOptions<Doc> | undefined
}

interface FixtureConfig {
  readonly requests?: ReadonlyArray<HulyApprovalRequest>
  readonly people?: ReadonlyArray<HulyPerson>
  readonly channels?: ReadonlyArray<Channel>
  readonly captures?: Array<CapturedFindAll>
}

const actor: HulyPersonId = corePersonId("person-social-1")

const recordFromPort = (value: unknown): QueryRecord => {
  // Huly SDK query payloads are plain objects at the fake-client boundary.
  return value as QueryRecord
}

const docRecord = (doc: Doc): DocRecord => {
  // Test fixtures are plain Huly docs, and this fake client indexes fields dynamically by query key.
  // eslint-disable-next-line no-restricted-syntax -- test-only structural matcher
  return doc as unknown as DocRecord
}

const hasInOperator = (value: unknown): value is { readonly $in: ReadonlyArray<unknown> } =>
  typeof value === "object" && value !== null && "$in" in value && Array.isArray(value.$in)

const matchesQuery = (doc: Doc, query: QueryRecord): boolean => {
  const source = docRecord(doc)
  return Object.entries(query).every(([key, expected]) =>
    hasInOperator(expected) ? expected.$in.includes(source[key]) : source[key] === expected
  )
}

const makeTx = (overrides: Partial<Tx> = {}): Tx => ({
  _id: toRef<Tx>("tx-1"),
  _class: core.class.Tx,
  space: core.space.Tx,
  modifiedBy: actor,
  modifiedOn: 1,
  createdBy: actor,
  createdOn: 1,
  objectSpace: core.space.Workspace,
  ...overrides
})

const makeRequest = (overrides: Partial<HulyApprovalRequest> = {}): HulyApprovalRequest => ({
  _id: toRef<HulyApprovalRequest>("request-1"),
  _class: requestPlugin.class.Request,
  space: core.space.Workspace,
  modifiedBy: actor,
  modifiedOn: 20,
  createdBy: actor,
  createdOn: 10,
  attachedTo: toRef<Doc>("issue-1"),
  attachedToClass: toClassRef<Doc>("tracker:class:Issue"),
  collection: "requests",
  requested: [toRef<HulyPerson>("person-1")],
  approved: [],
  requiredApprovesCount: 1,
  status: HulyRequestStatus.Active,
  tx: makeTx(),
  ...overrides
})

const makePerson = (id: string, name: string): HulyPerson => ({
  _id: toRef<HulyPerson>(id),
  _class: contact.class.Person,
  space: core.space.Workspace,
  modifiedBy: actor,
  modifiedOn: 1,
  createdBy: actor,
  createdOn: 1,
  name,
  avatarType: AvatarType.COLOR
})

const makeChannel = (personId: string, email: string): Channel => ({
  _id: toRef<Channel>(`channel-${personId}`),
  _class: contact.class.Channel,
  space: core.space.Workspace,
  modifiedBy: actor,
  modifiedOn: 1,
  createdBy: actor,
  createdOn: 1,
  attachedTo: toRef<Doc>(personId),
  attachedToClass: contact.class.Person,
  collection: "channels",
  provider: contact.channelProvider.Email,
  value: email
})

const docsForClass = (
  classId: unknown,
  requests: ReadonlyArray<HulyApprovalRequest>,
  people: ReadonlyArray<HulyPerson>,
  channels: ReadonlyArray<Channel>
): ReadonlyArray<Doc> => {
  if (classId === requestPlugin.class.Request) return requests
  if (classId === contact.class.Person) return people
  if (classId === contact.class.Channel) return channels
  return []
}

const applySortAndLimit = <T extends Doc>(docs: ReadonlyArray<T>, options?: FindOptions<T>): Array<T> => {
  const sorted = options?.sort?.modifiedOn === SortingOrder.Descending
    ? [...docs].sort((left, right) => right.modifiedOn - left.modifiedOn)
    : [...docs]
  return options?.limit === undefined ? sorted : sorted.slice(0, options.limit)
}

const testLayer = (config: FixtureConfig = {}) => {
  const requests = config.requests ?? [makeRequest()]
  const people = config.people ?? [makePerson("person-1", "Doe,Jane")]
  const channels = config.channels ?? [makeChannel("person-1", "jane@example.com")]

  const findAll: HulyClientOperations["findAll"] = (<T extends Doc>(
    classId: Ref<Class<T>>,
    query: DocumentQuery<T>,
    options?: FindOptions<T>
  ) => {
    const queryRecord = recordFromPort(query)
    config.captures?.push({
      classId: String(classId),
      query: queryRecord,
      // The captured options are never invoked; this retyping keeps the capture collection class-agnostic.
      options: options as FindOptions<Doc> | undefined
    })
    const matched = docsForClass(classId, requests, people, channels).filter((doc) => matchesQuery(doc, queryRecord))
    const limited = applySortAndLimit(matched, options)

    // The class branch above selects the fixture array that corresponds to T; brands are erased at runtime.

    return Effect.succeed(toFindResult(limited as Array<T>, matched.length))
  }) as HulyClientOperations["findAll"]

  const findOne: HulyClientOperations["findOne"] = (<T extends Doc>(
    classId: Ref<Class<T>>,
    query: DocumentQuery<T>
  ) => {
    const matched = docsForClass(classId, requests, people, channels).find((doc) =>
      matchesQuery(doc, recordFromPort(query))
    )

    // The class branch above selects the fixture array that corresponds to T; brands are erased at runtime.

    return Effect.succeed(matched as T | undefined)
  }) as HulyClientOperations["findOne"]

  return HulyClient.testLayer({ findAll, findOne })
}

const withWarnings = <A, E, R>(
  effect: Effect.Effect<A, E, R | Diagnostics>
): Effect.Effect<{ readonly value: A; readonly warnings: ReadonlyArray<ToolWarning> }, E, R> =>
  Effect.gen(function*() {
    const diagnostics = yield* makeDiagnosticsScope
    const value = yield* effect.pipe(Effect.provideService(Diagnostics, diagnostics.service))
    const warnings = yield* diagnostics.drainWarnings
    return { value, warnings }
  })

describe("approval request operations", () => {
  it.effect("lists approval requests with filters, limit, total, and person metadata", () =>
    Effect.gen(function*() {
      const captures: Array<CapturedFindAll> = []
      const older = makeRequest({ _id: toRef<HulyApprovalRequest>("request-old"), modifiedOn: 10 })
      const newer = makeRequest({ _id: toRef<HulyApprovalRequest>("request-new"), modifiedOn: 30 })
      const otherStatus = makeRequest({
        _id: toRef<HulyApprovalRequest>("request-rejected"),
        status: HulyRequestStatus.Rejected
      })

      const { value, warnings } = yield* listApprovalRequests({
        status: "Active",
        attachedTo: DocId.make("issue-1"),
        attachedToClass: ObjectClassName.make("tracker:class:Issue"),
        limit: 1
      }).pipe(
        withWarnings,
        Effect.provide(testLayer({ captures, requests: [older, newer, otherStatus] }))
      )

      expect(warnings).toEqual([])
      expect(value.total).toBe(2)
      expect(value.requests.map((item) => item.id)).toEqual(["request-new"])
      expect(value.requests[0]?.requested[0]).toMatchObject({
        id: "person-1",
        name: "Doe,Jane",
        email: "jane@example.com",
        url: "https://test.huly.local/workbench/test-workspace/contact/person-1"
      })
      const requestCapture = captures.find((capture) => capture.classId === requestPlugin.class.Request)
      expect(requestCapture?.query).toMatchObject({
        status: HulyRequestStatus.Active,
        attachedTo: "issue-1",
        attachedToClass: "tracker:class:Issue"
      })
      expect(requestCapture?.options).toMatchObject({ limit: 1, total: true })
    }))

  it.effect("maps non-active approval request statuses through filters and results", () =>
    Effect.gen(function*() {
      const statusCases = [
        { input: "Completed" as const, sdk: HulyRequestStatus.Completed },
        { input: "Rejected" as const, sdk: HulyRequestStatus.Rejected },
        { input: "Cancelled" as const, sdk: HulyRequestStatus.Cancelled }
      ]

      for (const statusCase of statusCases) {
        const captures: Array<CapturedFindAll> = []
        const { value } = yield* listApprovalRequests({ status: statusCase.input }).pipe(
          withWarnings,
          Effect.provide(testLayer({
            captures,
            requests: [
              makeRequest({ _id: toRef<HulyApprovalRequest>(`request-${statusCase.input}`), status: statusCase.sdk })
            ]
          }))
        )

        expect(value.requests[0]?.status).toBe(statusCase.input)
        const requestCapture = captures.find((capture) => capture.classId === requestPlugin.class.Request)
        expect(requestCapture?.query).toMatchObject({ status: statusCase.sdk })
      }
    }))

  it.effect("gets approval request details with approved, rejected, approval dates, and tx payloads", () =>
    Effect.gen(function*() {
      const item = makeRequest({
        approved: [toRef<HulyPerson>("person-2")],
        approvedDates: [1700000000000],
        rejected: toRef<HulyPerson>("person-3"),
        comments: 2,
        tx: makeTx({ _id: toRef<Tx>("tx-main"), meta: { reason: "approve" } }),
        rejectedTx: makeTx({ _id: toRef<Tx>("tx-reject"), meta: { reason: "reject" } })
      })
      const layer = testLayer({
        requests: [item],
        people: [
          makePerson("person-1", "Requester"),
          makePerson("person-2", "Approver"),
          makePerson("person-3", "Rejecter")
        ],
        channels: [
          makeChannel("person-1", "requester@example.com"),
          makeChannel("person-2", "approver@example.com"),
          makeChannel("person-3", "rejecter@example.com")
        ]
      })

      const { value, warnings } = yield* getApprovalRequest({ request: ApprovalRequestId.make("request-1") }).pipe(
        withWarnings,
        Effect.provide(layer)
      )

      expect(warnings).toEqual([])
      expect(value.approved[0]?.name).toBe("Approver")
      expect(value.rejected?.email).toBe("rejecter@example.com")
      expect(value.approvedDates).toEqual([1700000000000])
      expect(value.comments).toBe(2)
      expect(value.tx).toMatchObject({ _id: "tx-main", meta: { reason: "approve" } })
      expect(value.rejectedTx).toMatchObject({ _id: "tx-reject", meta: { reason: "reject" } })
    }))

  it.effect("gets approval request details without optional email, approval dates, or rejected tx", () =>
    Effect.gen(function*() {
      const { value, warnings } = yield* getApprovalRequest({ request: ApprovalRequestId.make("request-1") }).pipe(
        withWarnings,
        Effect.provide(testLayer({ channels: [] }))
      )

      expect(warnings).toEqual([])
      expect(value.requested[0]).toEqual({
        id: "person-1",
        name: "Doe,Jane",
        url: "https://test.huly.local/workbench/test-workspace/contact/person-1"
      })
      expect(value.approvedDates).toBeUndefined()
      expect(value.rejectedTx).toBeUndefined()
    }))

  it.effect("lists approval requests with no person references or created timestamp", () =>
    Effect.gen(function*() {
      const captures: Array<CapturedFindAll> = []
      const { createdOn: _createdOn, ...requestWithoutCreatedOn } = makeRequest({
        approved: [],
        requested: []
      })

      const { value, warnings } = yield* listApprovalRequests({}).pipe(
        withWarnings,
        Effect.provide(testLayer({ captures, requests: [requestWithoutCreatedOn] }))
      )

      expect(warnings).toEqual([])
      expect(value.requests[0]?.requested).toEqual([])
      expect(value.requests[0]?.approved).toEqual([])
      expect(value.requests[0]?.createdOn).toBeUndefined()
      expect(captures.some((capture) => capture.classId === contact.class.Person)).toBe(false)
    }))

  it.effect("warns and preserves id-only refs when person metadata cannot be hydrated", () =>
    Effect.gen(function*() {
      const missing = makeRequest({ requested: [toRef<HulyPerson>("missing-person")] })

      const { value, warnings } = yield* listApprovalRequests({}).pipe(
        withWarnings,
        Effect.provide(testLayer({ requests: [missing], people: [], channels: [] }))
      )

      expect(assertAt(warnings, 0).code).toBe(ApprovalRequestPersonMetadataDegradedWarningCode)
      expect(value.requests[0]?.requested).toEqual([{ id: "missing-person" }])
    }))

  it.effect("warns when corrupt negative count fields are returned as zero", () =>
    Effect.gen(function*() {
      const corrupt = makeRequest({ comments: -3, requiredApprovesCount: -1 })

      const { value, warnings } = yield* listApprovalRequests({}).pipe(
        withWarnings,
        Effect.provide(testLayer({ requests: [corrupt] }))
      )

      expect(value.requests[0]?.requiredApprovesCount).toBe(0)
      expect(value.requests[0]?.comments).toBe(0)
      expect(warnings.map((warning) => warning.code)).toEqual([
        ApprovalRequestCountMetadataDegradedWarningCode,
        ApprovalRequestCountMetadataDegradedWarningCode
      ])
      expect(assertAt(warnings, 0).message).toContain("requiredApprovesCount")
      expect(assertAt(warnings, 1).message).toContain("comments")
    }))

  it.effect("fails getApprovalRequest with a typed not-found error", () =>
    Effect.gen(function*() {
      const exit = yield* getApprovalRequest({ request: ApprovalRequestId.make("missing-request") }).pipe(
        withWarnings,
        Effect.provide(testLayer({ requests: [] })),
        Effect.exit
      )

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        expect(exit.cause.toString()).toContain(ApprovalRequestNotFoundError.name)
      }
    }))
})
