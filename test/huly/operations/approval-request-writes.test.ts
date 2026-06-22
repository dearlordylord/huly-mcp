import { describe, it } from "@effect/vitest"
import type { Channel, Employee as HulyEmployee, Person as HulyPerson, SocialIdentity } from "@hcengineering/contact"
import { AvatarType } from "@hcengineering/contact"
import type {
  AttachedData,
  AttachedDoc,
  Class,
  Doc,
  DocumentQuery,
  DocumentUpdate,
  FindOptions,
  PersonId as HulyPersonId,
  Ref,
  Space,
  Tx
} from "@hcengineering/core"
import { SocialIdType, toFindResult } from "@hcengineering/core"
import type { Request as HulyApprovalRequest } from "@hcengineering/request"
import { RequestStatus as HulyRequestStatus } from "@hcengineering/request"
import { Effect, Exit } from "effect"
import { expect } from "vitest"

import { ApprovalRequestCollection, ApprovalRequestId } from "../../../src/domain/schemas/approval-requests.js"
import { DocId, ObjectClassName, PositiveInteger, SpaceId } from "../../../src/domain/schemas/shared.js"
import type { HulyClientOperations } from "../../../src/huly/client.js"
import { HulyClient } from "../../../src/huly/client.js"
import {
  ApprovalRequestApproverNotRequestedError,
  ApprovalRequestCancelUnauthorizedError,
  ApprovalRequestInvalidApprovalThresholdError,
  ApprovalRequestMutationUnsupportedError,
  ApprovalRequestNotActiveError,
  ApprovalRequestNotFoundError,
  ApprovalRequestTargetNotFoundError,
  PersonNotFoundError
} from "../../../src/huly/errors.js"
import { chunter, contact, core, request as requestPlugin } from "../../../src/huly/huly-plugins.js"
import {
  addApprovalRequest,
  addApprovalRequestComment,
  approveApprovalRequest,
  cancelApprovalRequest,
  rejectApprovalRequest
} from "../../../src/huly/operations/approval-request-writes.js"
import { toAccountUuid, toClassRef, toRef, toSocialIdentityRef } from "../../../src/huly/operations/sdk-boundary.js"
import { assertAt } from "../../../src/utils/assertions.js"
import { corePersonId } from "../../helpers/huly-sdk.js"

type QueryRecord = Readonly<Record<string, unknown>>
type DocRecord = Readonly<Record<string, unknown>>

interface AddCapture {
  readonly classId: string
  readonly space: string
  readonly attachedTo: string
  readonly attachedToClass: string
  readonly collection: string
  readonly attributes: unknown
  readonly id: string | undefined
}

interface UpdateCapture {
  readonly classId: string
  readonly objectId: string
  readonly operations: unknown
}

interface MixinCapture {
  readonly objectId: string
  readonly mixin: string
}

interface Captures {
  readonly adds: Array<AddCapture>
  readonly updates: Array<UpdateCapture>
  readonly mixins: Array<MixinCapture>
}

interface WriteLayerConfig {
  readonly requests?: ReadonlyArray<HulyApprovalRequest>
  readonly people?: ReadonlyArray<HulyPerson>
  readonly employees?: ReadonlyArray<HulyEmployee>
  readonly channels?: ReadonlyArray<Channel>
  readonly socialIdentities?: ReadonlyArray<SocialIdentity>
  readonly accountSocialIds?: ReadonlyArray<HulyPersonId>
  readonly targetDocs?: ReadonlyArray<Doc>
  readonly captures?: Captures
  readonly omitUpdateCollection?: boolean
}

interface WriteLayerData {
  readonly requests: ReadonlyArray<HulyApprovalRequest>
  readonly people: ReadonlyArray<HulyPerson>
  readonly employees: ReadonlyArray<HulyEmployee>
  readonly channels: ReadonlyArray<Channel>
  readonly socialIdentities: ReadonlyArray<SocialIdentity>
  readonly targetDocs: ReadonlyArray<Doc>
}

const actor: HulyPersonId = corePersonId("person-social-1")
const otherActor: HulyPersonId = corePersonId("person-social-2")

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

const makeBaseFields = (modifiedBy: HulyPersonId = actor) => ({
  space: core.space.Workspace,
  modifiedBy,
  modifiedOn: 1,
  createdBy: modifiedBy,
  createdOn: 1
})

const makeTx = (id: string = "tx-1"): Tx => ({
  _id: toRef<Tx>(id),
  _class: core.class.Tx,
  ...makeBaseFields(),
  space: core.space.Tx,
  objectSpace: core.space.Workspace
})

const makeTarget = (): Doc => ({
  _id: toRef<Doc>("issue-1"),
  _class: toClassRef<Doc>("tracker:class:Issue"),
  ...makeBaseFields()
})

const makePerson = (id: string, name: string): HulyPerson => ({
  _id: toRef<HulyPerson>(id),
  _class: contact.class.Person,
  ...makeBaseFields(),
  name,
  avatarType: AvatarType.COLOR
})

const makeEmployee = (id: string, name: string): HulyEmployee => ({
  _id: toRef<HulyEmployee>(id),
  _class: contact.mixin.Employee,
  ...makeBaseFields(),
  name,
  avatarType: AvatarType.COLOR,
  active: true,
  personUuid: toAccountUuid("00000000-0000-4000-8000-000000000001")
})

const makeSocialIdentity = (
  id: HulyPersonId,
  personId: string,
  value: string = "jane@example.com"
): SocialIdentity => ({
  _id: toSocialIdentityRef(id),
  _class: contact.class.SocialIdentity,
  ...makeBaseFields(),
  attachedTo: toRef<HulyPerson>(personId),
  attachedToClass: contact.class.Person,
  collection: "socialIds",
  type: SocialIdType.EMAIL,
  value,
  key: value
})

const makeChannel = (personId: string, email: string): Channel => ({
  _id: toRef<Channel>(`channel-${personId}`),
  _class: contact.class.Channel,
  ...makeBaseFields(),
  attachedTo: toRef<Doc>(personId),
  attachedToClass: contact.class.Person,
  collection: "channels",
  provider: contact.channelProvider.Email,
  value: email
})

const makeRequest = (overrides: Partial<HulyApprovalRequest> = {}): HulyApprovalRequest => ({
  _id: toRef<HulyApprovalRequest>("request-1"),
  _class: requestPlugin.class.Request,
  ...makeBaseFields(),
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

const withoutCreator = (request: HulyApprovalRequest): HulyApprovalRequest => {
  const { createdBy: _createdBy, ...requestWithoutCreator } = request
  return requestWithoutCreator
}

const docsForClass = (
  classId: unknown,
  data: WriteLayerData
): ReadonlyArray<Doc> => {
  if (classId === requestPlugin.class.Request) return data.requests
  if (classId === contact.class.Person) return data.people
  if (classId === contact.mixin.Employee) return data.employees
  if (classId === contact.class.Channel) return data.channels
  if (classId === contact.class.SocialIdentity) return data.socialIdentities
  if (classId === "tracker:class:Issue") return data.targetDocs
  return []
}

const docsAs = <T extends Doc>(docs: ReadonlyArray<Doc>): Array<T> => {
  // The fake client dispatches by SDK class ref. That runtime branch is the type witness for T.
  return docs as Array<T>
}

const testLayer = (config: WriteLayerConfig = {}) => {
  const currentEmployee = makeEmployee("person-1", "Doe,Jane")
  const data = {
    requests: config.requests ?? [makeRequest()],
    people: config.people ?? [makePerson("person-1", "Doe,Jane"), makePerson("person-2", "Smith,Ann")],
    employees: config.employees ?? [currentEmployee],
    channels: config.channels ?? [makeChannel("person-2", "ann@example.com")],
    socialIdentities: config.socialIdentities ?? [makeSocialIdentity(actor, "person-1")],
    targetDocs: config.targetDocs ?? [makeTarget()]
  }

  const findAll: HulyClientOperations["findAll"] = <T extends Doc>(
    classId: Ref<Class<T>>,
    query: DocumentQuery<T>,
    options?: FindOptions<T>
  ) => {
    const matched = docsForClass(classId, data).filter((doc) => matchesQuery(doc, recordFromPort(query)))
    const limited = options?.limit === undefined ? matched : matched.slice(0, options.limit)
    return Effect.succeed(toFindResult(docsAs<T>(limited), matched.length))
  }

  const findOne: HulyClientOperations["findOne"] = <T extends Doc>(
    classId: Ref<Class<T>>,
    query: DocumentQuery<T>
  ) => {
    const matched = docsForClass(classId, data).find((doc) => matchesQuery(doc, recordFromPort(query)))
    // The class-ref dispatch above is the runtime witness for T in this fake client.
    return Effect.succeed(matched as T | undefined)
  }

  const addCollection: HulyClientOperations["addCollection"] = <T extends Doc, P extends AttachedDoc>(
    classId: Ref<Class<P>>,
    space: Ref<Space>,
    attachedTo: Ref<T>,
    attachedToClass: Ref<Class<T>>,
    collection: string,
    attributes: AttachedData<P>,
    id?: Ref<P>
  ) => {
    config.captures?.adds.push({
      classId: String(classId),
      space: String(space),
      attachedTo: String(attachedTo),
      attachedToClass: String(attachedToClass),
      collection,
      attributes,
      id: id === undefined ? undefined : String(id)
    })
    return Effect.succeed(id ?? toRef<P>("generated-id"))
  }

  const updateCollection: NonNullable<HulyClientOperations["updateCollection"]> = <
    T extends Doc,
    P extends AttachedDoc
  >(
    classId: Ref<Class<P>>,
    _space: Ref<Space>,
    objectId: Ref<P>,
    _attachedTo: Ref<T>,
    _attachedToClass: Ref<Class<T>>,
    _collection: string,
    operations: DocumentUpdate<P>
  ) => {
    config.captures?.updates.push({
      classId: String(classId),
      objectId: String(objectId),
      operations
    })
    return Effect.succeed(toRef<T>("parent-id"))
  }

  const createMixin: HulyClientOperations["createMixin"] = (objectId, _objectClass, _objectSpace, mixin) => {
    config.captures?.mixins.push({ objectId: String(objectId), mixin: String(mixin) })
    return Effect.succeed({})
  }

  return HulyClient.testLayer({
    getPrimarySocialId: () => actor,
    getSocialIds: () => config.accountSocialIds ?? [actor],
    findAll,
    findOne,
    addCollection,
    ...(config.omitUpdateCollection === true ? {} : { updateCollection }),
    createMixin
  })
}

const emptyCaptures = (): Captures => ({ adds: [], updates: [], mixins: [] })

describe("approval request write operations", () => {
  it.effect("creates approval requests with resolved target space and requested people", () =>
    Effect.gen(function*() {
      const captures = emptyCaptures()
      const result = yield* addApprovalRequest({
        attachedTo: DocId.make("issue-1"),
        attachedToClass: ObjectClassName.make("tracker:class:Issue"),
        requested: ["person-1", "ann@example.com", "person-1"],
        requiredApprovesCount: PositiveInteger.make(2),
        tx: makeTx("approve-tx")
      }).pipe(Effect.provide(testLayer({ captures })))

      expect(result).toMatchObject({ action: "created", changed: true, status: "Active" })
      const added = assertAt(captures.adds, 0)
      expect(added).toMatchObject({
        classId: requestPlugin.class.Request,
        space: core.space.Workspace,
        attachedTo: "issue-1",
        attachedToClass: "tracker:class:Issue",
        collection: "requests"
      })
      expect(added.attributes).toMatchObject({
        requested: ["person-1", "person-2"],
        approved: [],
        requiredApprovesCount: PositiveInteger.make(2),
        status: HulyRequestStatus.Active,
        tx: expect.objectContaining({ _id: "approve-tx" })
      })
    }))

  it.effect("creates approval requests with explicit space, collection, rejected tx, and default threshold", () =>
    Effect.gen(function*() {
      const captures = emptyCaptures()
      const result = yield* addApprovalRequest({
        attachedTo: DocId.make("issue-1"),
        attachedToClass: ObjectClassName.make("tracker:class:Issue"),
        space: SpaceId.make("project-space"),
        collection: ApprovalRequestCollection.make("approvals"),
        requested: ["Smith,Ann"],
        tx: makeTx("approve-tx"),
        rejectedTx: makeTx("reject-tx")
      }).pipe(Effect.provide(testLayer({ captures, targetDocs: [] })))

      expect(result).toMatchObject({ action: "created", changed: true, status: "Active" })
      const added = assertAt(captures.adds, 0)
      expect(added).toMatchObject({
        classId: requestPlugin.class.Request,
        space: "project-space",
        attachedTo: "issue-1",
        attachedToClass: "tracker:class:Issue",
        collection: "approvals"
      })
      expect(added.attributes).toMatchObject({
        requested: ["person-2"],
        approved: [],
        requiredApprovesCount: 1,
        status: HulyRequestStatus.Active,
        tx: expect.objectContaining({ _id: "approve-tx" }),
        rejectedTx: expect.objectContaining({ _id: "reject-tx" })
      })
    }))

  it.effect("rejects invalid approval thresholds after requested people are de-duplicated", () =>
    Effect.gen(function*() {
      const exit = yield* addApprovalRequest({
        attachedTo: DocId.make("issue-1"),
        attachedToClass: ObjectClassName.make("tracker:class:Issue"),
        requested: ["person-1", "person-1"],
        requiredApprovesCount: PositiveInteger.make(2),
        tx: makeTx()
      }).pipe(Effect.provide(testLayer()), Effect.exit)

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        expect(exit.cause.toString()).toContain(ApprovalRequestInvalidApprovalThresholdError.name)
      }
    }))

  it.effect("fails create when a requested person cannot be resolved", () =>
    Effect.gen(function*() {
      const exit = yield* addApprovalRequest({
        attachedTo: DocId.make("issue-1"),
        attachedToClass: ObjectClassName.make("tracker:class:Issue"),
        requested: ["missing@example.com"],
        tx: makeTx()
      }).pipe(Effect.provide(testLayer()), Effect.exit)

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        expect(exit.cause.toString()).toContain(PersonNotFoundError.name)
      }
    }))

  it.effect("fails create when the target document cannot be resolved", () =>
    Effect.gen(function*() {
      const exit = yield* addApprovalRequest({
        attachedTo: DocId.make("missing-issue"),
        attachedToClass: ObjectClassName.make("tracker:class:Issue"),
        requested: ["person-1"],
        tx: makeTx()
      }).pipe(Effect.provide(testLayer({ targetDocs: [] })), Effect.exit)

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        expect(exit.cause.toString()).toContain(ApprovalRequestTargetNotFoundError.name)
      }
    }))

  it.effect("adds plain comments without decision mixins", () =>
    Effect.gen(function*() {
      const captures = emptyCaptures()
      const result = yield* addApprovalRequestComment({
        request: ApprovalRequestId.make("request-1"),
        body: "Looks reasonable"
      }).pipe(Effect.provide(testLayer({ captures })))

      expect(result).toMatchObject({ action: "comment_added", changed: true, comment: expect.any(String) })
      expect(assertAt(captures.adds, 0)).toMatchObject({
        classId: chunter.class.ChatMessage,
        attachedTo: "request-1",
        attachedToClass: requestPlugin.class.Request,
        collection: "comments"
      })
      expect(captures.mixins).toEqual([])
    }))

  it.effect("fails comments when the approval request cannot be found", () =>
    Effect.gen(function*() {
      const exit = yield* addApprovalRequestComment({
        request: ApprovalRequestId.make("missing-request"),
        body: "Where did it go?"
      }).pipe(Effect.provide(testLayer()), Effect.exit)

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        expect(exit.cause.toString()).toContain(ApprovalRequestNotFoundError.name)
      }
    }))

  it.effect("approves as the current employee and creates a decision comment", () =>
    Effect.gen(function*() {
      const captures = emptyCaptures()
      const result = yield* approveApprovalRequest({
        request: ApprovalRequestId.make("request-1"),
        comment: "Approved"
      }).pipe(Effect.provide(testLayer({ captures })))

      expect(result).toMatchObject({ action: "approved", changed: true, comment: expect.any(String) })
      expect(captures.adds).toHaveLength(1)
      expect(captures.mixins).toEqual([
        expect.objectContaining({ mixin: requestPlugin.mixin.RequestDecisionComment })
      ])
      expect(assertAt(captures.updates, 0).operations).toMatchObject({
        $push: { approved: "person-1" }
      })
    }))

  it.effect("approves without an optional decision comment", () =>
    Effect.gen(function*() {
      const captures = emptyCaptures()
      const result = yield* approveApprovalRequest({
        request: ApprovalRequestId.make("request-1")
      }).pipe(Effect.provide(testLayer({ captures })))

      expect(result).toEqual({
        request: "request-1",
        action: "approved",
        changed: true
      })
      expect(captures.adds).toEqual([])
      expect(captures.mixins).toEqual([])
      expect(assertAt(captures.updates, 0).operations).toMatchObject({
        $push: { approved: "person-1" }
      })
    }))

  it.effect("returns changed=false when the current employee already approved", () =>
    Effect.gen(function*() {
      const captures = emptyCaptures()
      const result = yield* approveApprovalRequest({
        request: ApprovalRequestId.make("request-1")
      }).pipe(
        Effect.provide(testLayer({
          captures,
          requests: [makeRequest({ approved: [toRef<HulyPerson>("person-1")] })]
        }))
      )

      expect(result).toEqual({
        request: "request-1",
        action: "approved",
        changed: false,
        status: "Active"
      })
      expect(captures.updates).toEqual([])
      expect(captures.adds).toEqual([])
    }))

  it.effect("fails approval when the current employee is not requested", () =>
    Effect.gen(function*() {
      const exit = yield* approveApprovalRequest({
        request: ApprovalRequestId.make("request-1")
      }).pipe(
        Effect.provide(testLayer({
          requests: [makeRequest({ requested: [toRef<HulyPerson>("person-2")] })]
        })),
        Effect.exit
      )

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        expect(exit.cause.toString()).toContain(ApprovalRequestApproverNotRequestedError.name)
      }
    }))

  it.effect("fails rejection when the current employee is not requested", () =>
    Effect.gen(function*() {
      const exit = yield* rejectApprovalRequest({
        request: ApprovalRequestId.make("request-1"),
        comment: "Needs changes"
      }).pipe(
        Effect.provide(testLayer({
          requests: [makeRequest({ requested: [toRef<HulyPerson>("person-2")] })]
        })),
        Effect.exit
      )

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        expect(exit.cause.toString()).toContain(ApprovalRequestApproverNotRequestedError.name)
      }
    }))

  it.effect("fails approval when the current actor cannot be resolved to an employee", () =>
    Effect.gen(function*() {
      const missingIdentity = yield* approveApprovalRequest({
        request: ApprovalRequestId.make("request-1")
      }).pipe(
        Effect.provide(testLayer({ socialIdentities: [] })),
        Effect.exit
      )

      expect(Exit.isFailure(missingIdentity)).toBe(true)
      if (Exit.isFailure(missingIdentity)) {
        expect(missingIdentity.cause.toString()).toContain(PersonNotFoundError.name)
      }

      const missingEmployee = yield* approveApprovalRequest({
        request: ApprovalRequestId.make("request-1")
      }).pipe(
        Effect.provide(testLayer({ employees: [] })),
        Effect.exit
      )

      expect(Exit.isFailure(missingEmployee)).toBe(true)
      if (Exit.isFailure(missingEmployee)) {
        expect(missingEmployee.cause.toString()).toContain(PersonNotFoundError.name)
      }
    }))

  it.effect("fails active mutations when the request is not active", () =>
    Effect.gen(function*() {
      const exit = yield* approveApprovalRequest({
        request: ApprovalRequestId.make("request-1")
      }).pipe(
        Effect.provide(testLayer({
          requests: [makeRequest({ status: HulyRequestStatus.Cancelled })]
        })),
        Effect.exit
      )

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        expect(exit.cause.toString()).toContain(ApprovalRequestNotActiveError.name)
      }
    }))

  it.effect("fails active mutations when collection updates are unavailable", () =>
    Effect.gen(function*() {
      const captures = emptyCaptures()
      const exit = yield* approveApprovalRequest({
        request: ApprovalRequestId.make("request-1"),
        comment: "Approved"
      }).pipe(
        Effect.provide(testLayer({ captures, omitUpdateCollection: true })),
        Effect.exit
      )

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        expect(exit.cause.toString()).toContain(ApprovalRequestMutationUnsupportedError.name)
      }
      expect(captures.adds).toEqual([])
      expect(captures.mixins).toEqual([])
    }))

  it.effect("rejects with a decision comment and cancels creator-owned active requests", () =>
    Effect.gen(function*() {
      const rejectCaptures = emptyCaptures()
      const rejected = yield* rejectApprovalRequest({
        request: ApprovalRequestId.make("request-1"),
        comment: "Needs changes"
      }).pipe(Effect.provide(testLayer({ captures: rejectCaptures })))

      expect(rejected).toMatchObject({ action: "rejected", changed: true, status: "Rejected" })
      expect(assertAt(rejectCaptures.updates, 0).operations).toMatchObject({
        rejected: "person-1",
        status: HulyRequestStatus.Rejected
      })
      expect(rejectCaptures.mixins).toHaveLength(1)

      const cancelCaptures = emptyCaptures()
      const cancelled = yield* cancelApprovalRequest({
        request: ApprovalRequestId.make("request-1")
      }).pipe(Effect.provide(testLayer({ captures: cancelCaptures })))

      expect(cancelled).toEqual({
        request: "request-1",
        action: "cancelled",
        changed: true,
        status: "Cancelled"
      })
      expect(assertAt(cancelCaptures.updates, 0).operations).toMatchObject({ status: HulyRequestStatus.Cancelled })
    }))

  it.effect("cancels requests created by the current account id", () =>
    Effect.gen(function*() {
      const captures = emptyCaptures()
      const result = yield* cancelApprovalRequest({
        request: ApprovalRequestId.make("request-1")
      }).pipe(
        Effect.provide(testLayer({
          captures,
          requests: [makeRequest({ createdBy: corePersonId("00000000-0000-4000-8000-000000000000") })]
        }))
      )

      expect(result).toEqual({
        request: "request-1",
        action: "cancelled",
        changed: true,
        status: "Cancelled"
      })
      expect(assertAt(captures.updates, 0).operations).toMatchObject({ status: HulyRequestStatus.Cancelled })
    }))

  it.effect("cancels requests created by the current employee person id", () =>
    Effect.gen(function*() {
      const captures = emptyCaptures()
      const result = yield* cancelApprovalRequest({
        request: ApprovalRequestId.make("request-1")
      }).pipe(
        Effect.provide(testLayer({
          captures,
          requests: [makeRequest({ createdBy: corePersonId("person-1") })]
        }))
      )

      expect(result).toEqual({
        request: "request-1",
        action: "cancelled",
        changed: true,
        status: "Cancelled"
      })
      expect(assertAt(captures.updates, 0).operations).toMatchObject({ status: HulyRequestStatus.Cancelled })
    }))

  it.effect("cancels requests created by a secondary social id for the current account", () =>
    Effect.gen(function*() {
      const captures = emptyCaptures()
      const result = yield* cancelApprovalRequest({
        request: ApprovalRequestId.make("request-1")
      }).pipe(
        Effect.provide(testLayer({
          accountSocialIds: [actor, otherActor],
          captures,
          requests: [makeRequest({ createdBy: otherActor })]
        }))
      )

      expect(result).toEqual({
        request: "request-1",
        action: "cancelled",
        changed: true,
        status: "Cancelled"
      })
      expect(assertAt(captures.updates, 0).operations).toMatchObject({ status: HulyRequestStatus.Cancelled })
    }))

  it.effect("fails cancel when the current actor is not the creator", () =>
    Effect.gen(function*() {
      const exit = yield* cancelApprovalRequest({
        request: ApprovalRequestId.make("request-1")
      }).pipe(
        Effect.provide(testLayer({ requests: [makeRequest({ createdBy: otherActor })] })),
        Effect.exit
      )

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        expect(exit.cause.toString()).toContain(ApprovalRequestCancelUnauthorizedError.name)
      }
    }))

  it.effect("fails cancel when the creator is unknown", () =>
    Effect.gen(function*() {
      const exit = yield* cancelApprovalRequest({
        request: ApprovalRequestId.make("request-1")
      }).pipe(
        Effect.provide(testLayer({ requests: [withoutCreator(makeRequest())] })),
        Effect.exit
      )

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        expect(exit.cause.toString()).toContain("an unknown creator")
      }
    }))
})
