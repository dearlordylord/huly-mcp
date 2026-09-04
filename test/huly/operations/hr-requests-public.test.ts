import type { Attachment } from "@hcengineering/attachment"
import type { ChatMessage } from "@hcengineering/chunter"
import { AvatarType, type Employee, type Person } from "@hcengineering/contact"
import {
  type AttachedData,
  type AttachedDoc,
  type Class,
  type Doc,
  type DocumentQuery,
  type DocumentUpdate,
  type FindOptions,
  type Ref,
  type Space,
  toFindResult
} from "@hcengineering/core"
import type { Department, Request as HulyRequest, RequestType, Staff } from "@hcengineering/hr"
import type { IntlString } from "@hcengineering/platform"
import { Effect, Layer, Schema } from "effect"
import { TestClock } from "effect/testing"
import { describe, expect, it } from "vitest"

import {
  DepartmentIdentifier,
  HrCalendarDate,
  HrRequestId,
  HrRequestTypeIdentifier,
  parseAddHrRequestAttachmentParams,
  PersonLocator
} from "../../../src/domain/schemas.js"
import { AttachmentId, CommentId } from "../../../src/domain/schemas/shared.js"
import {
  DepartmentHierarchyError,
  DepartmentNotFoundError,
  EmployeeNotFoundError,
  HrRequestDateRangeError,
  HrRequestMutationUnsupportedError,
  HrRequestNotFoundError,
  HrRequestTypeNotFoundError
} from "../../../src/huly/errors.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { attachment, chunter, contact, core, hr } from "../../../src/huly/huly-plugins.js"
import { HulyStorageClient } from "../../../src/huly/storage.js"
import {
  addHrRequestAttachment,
  addHrRequestComment,
  deleteHrRequestAttachment,
  deleteHrRequestComment,
  getHrRequestAttachment,
  listHrRequestAttachments,
  listHrRequestComments,
  updateHrRequestAttachment,
  updateHrRequestComment
} from "../../../src/huly/operations/hr-request-media.js"
import {
  createHrRequest,
  deleteHrRequest,
  getHrRequest,
  listHrRequests,
  listHrRequestTypes,
  updateHrRequest
} from "../../../src/huly/operations/hr-requests.js"
import { markdownToMarkupString, testMarkupUrlConfig } from "../../../src/huly/operations/markup.js"
import { corePersonId, docRef } from "../../helpers/huly-sdk.js"

interface Calls {
  readonly additions: Array<{ readonly collection: string; readonly data: unknown }>
  readonly updates: Array<{ readonly collection: string; readonly operations: unknown }>
  readonly documentUpdates: Array<{ readonly id: string; readonly operations: unknown }>
  readonly removals: Array<{ readonly collection: string; readonly id: string }>
}

interface Fixture {
  readonly departments: ReadonlyArray<Department>
  readonly person: Person
  readonly employee: Employee
  readonly staff: Staff
  readonly requestTypes: ReadonlyArray<RequestType>
  readonly requests: ReadonlyArray<HulyRequest>
  readonly comments: ReadonlyArray<ChatMessage>
  readonly attachments: ReadonlyArray<Attachment>
  readonly calls: Calls
}

const intlString = Schema.decodeUnknownSync(
  Schema.declare((input): input is IntlString => typeof input === "string" && input.length > 0)
)

const decodeDoc = <T extends Doc>(input: unknown): T =>
  Schema.decodeUnknownSync(
    Schema.declare(
      (value): value is T =>
        typeof value === "object" && value !== null && typeof Reflect.get(value, "_id") === "string"
    )
  )(input)

const makeDepartment = (id: string, name: string, parent = hr.ids.Head): Department => ({
  _id: docRef<Department>(id),
  _class: hr.class.Department,
  space: core.space.Workspace,
  name,
  description: "",
  parent,
  teamLead: null,
  managers: [],
  members: [],
  modifiedBy: corePersonId("actor"),
  modifiedOn: 1
})

const makeRequestType = (id: string, label: string): RequestType => ({
  _id: docRef<RequestType>(id),
  _class: hr.class.RequestType,
  space: core.space.Model,
  label: intlString(`hr:string:${label}`),
  icon: hr.icon.PTO,
  value: -1,
  color: 2,
  modifiedBy: corePersonId("actor"),
  modifiedOn: 1
})

const fixture = (): Fixture => {
  const person: Person = {
    _id: docRef<Person>("employee-1"),
    _class: contact.class.Person,
    space: contact.space.Contacts,
    name: "Alice,Agent",
    avatarType: AvatarType.COLOR,
    modifiedBy: corePersonId("actor"),
    modifiedOn: 1
  }
  const employee: Employee = {
    _id: docRef<Employee>(person._id),
    _class: contact.mixin.Employee,
    space: contact.space.Contacts,
    name: person.name,
    avatarType: AvatarType.COLOR,
    modifiedBy: corePersonId("actor"),
    modifiedOn: 1,
    active: true
  }
  const staff: Staff = {
    ...employee,
    _id: docRef<Staff>(employee._id),
    department: docRef<Department>("department-product")
  }
  const pto = makeRequestType("type-pto", "PTO")
  const request: HulyRequest = {
    _id: docRef<HulyRequest>("request-1"),
    _class: hr.class.Request,
    space: core.space.Workspace,
    attachedTo: staff._id,
    attachedToClass: contact.mixin.Employee,
    collection: "requests",
    department: staff.department,
    type: pto._id,
    description: "",
    tzDate: { year: 2026, month: 8, day: 4, offset: 0 },
    tzDueDate: { year: 2026, month: 8, day: 5, offset: 0 },
    comments: 1,
    attachments: 2,
    modifiedBy: corePersonId("actor"),
    modifiedOn: 3,
    createdOn: 2
  }
  const comment = decodeDoc<ChatMessage>({
    _id: "comment-1",
    _class: chunter.class.ChatMessage,
    space: core.space.Workspace,
    attachedTo: request._id,
    attachedToClass: hr.class.Request,
    collection: "comments",
    message: markdownToMarkupString("Initial", testMarkupUrlConfig),
    createdOn: 2,
    modifiedBy: "actor",
    modifiedOn: 3
  })
  const media = decodeDoc<Attachment>({
    _id: "attachment-1",
    _class: attachment.class.Attachment,
    space: core.space.Workspace,
    attachedTo: request._id,
    attachedToClass: hr.class.Request,
    collection: "attachments",
    name: "request.txt",
    file: "blob-1",
    type: "text/plain",
    size: 7,
    lastModified: 3,
    modifiedBy: "actor",
    modifiedOn: 3
  })
  return {
    departments: [makeDepartment(String(hr.ids.Head), "Head"), makeDepartment("department-product", "Product")],
    person,
    employee,
    staff,
    requestTypes: [pto, makeRequestType("type-remote", "Remote")],
    requests: [request],
    comments: [comment, { ...comment, _id: docRef<ChatMessage>("comment-2") }],
    attachments: [media, { ...media, _id: docRef<Attachment>("attachment-2") }],
    calls: { additions: [], updates: [], documentUpdates: [], removals: [] }
  }
}

const queryValue = (query: unknown, key: string): unknown =>
  typeof query === "object" && query !== null ? Reflect.get(query, key) : undefined

const matches = (doc: Doc, query: unknown): boolean =>
  ["_id", "attachedTo", "attachedToClass", "collection", "department", "type"].every((key) => {
    const expected = queryValue(query, key)
    return expected === undefined || Reflect.get(doc, key) === expected
  })

const decodeDocs = <T extends Doc>(input: unknown): Array<T> => [
  ...Schema.decodeUnknownSync(
    Schema.Array(
      Schema.declare(
        (value): value is T =>
          typeof value === "object" && value !== null && typeof Reflect.get(value, "_id") === "string"
      )
    )
  )(input)
]

interface Capabilities {
  readonly updateCollection?: boolean
  readonly removeCollection?: boolean
  readonly staff?: boolean
}

const layerFor = (state: Fixture, capabilities: Capabilities = {}) => {
  const documentsFor = <T extends Doc>(classRef: Ref<Class<T>>): Array<T> => {
    const className = String(classRef)
    let selected: ReadonlyArray<Doc> = []
    if (className === String(hr.class.Department)) selected = state.departments
    else if (className === String(hr.class.Request)) selected = state.requests
    else if (className === String(chunter.class.ChatMessage)) selected = state.comments
    else if (className === String(attachment.class.Attachment)) selected = state.attachments
    else if (className === String(contact.class.Person)) selected = [state.person]
    else if (className === String(contact.mixin.Employee)) selected = [state.employee]
    else if (className === String(hr.mixin.Staff)) selected = capabilities.staff === false ? [] : [state.staff]
    // Routing by the requested Huly class establishes the SDK generic; the schema keeps fixture values at the boundary.
    return decodeDocs<T>(selected)
  }
  const findAll: HulyClientOperations["findAll"] = <T extends Doc>(
    classRef: Ref<Class<T>>,
    query: DocumentQuery<T>,
    _options?: FindOptions<T>
  ) => {
    const matchesQuery = documentsFor(classRef).filter((doc) => matches(doc, query))
    const rows = _options?.limit === undefined ? matchesQuery : matchesQuery.slice(0, _options.limit)
    return Effect.succeed(toFindResult(rows, matchesQuery.length))
  }
  const findOne: HulyClientOperations["findOne"] = <T extends Doc>(classRef: Ref<Class<T>>, query: DocumentQuery<T>) =>
    Effect.map(findAll(classRef, query), (rows) => rows[0])
  const findAllInModel: HulyClientOperations["findAllInModel"] = <T extends Doc>(_classRef: Ref<Class<T>>) =>
    Effect.succeed(toFindResult(decodeDocs<T>(state.requestTypes), state.requestTypes.length))
  const addCollection: HulyClientOperations["addCollection"] = <T extends Doc, P extends AttachedDoc>(
    _classRef: Ref<Class<P>>,
    _space: Ref<Space>,
    _attachedTo: Ref<T>,
    _attachedToClass: Ref<Class<T>>,
    collection: string,
    data: AttachedData<P>,
    id?: Ref<P>
  ) => {
    state.calls.additions.push({ collection, data })
    return Effect.succeed(id ?? docRef<P>("request-created"))
  }
  const updateCollection: NonNullable<HulyClientOperations["updateCollection"]> = <
    T extends Doc,
    P extends AttachedDoc
  >(
    _classRef: Ref<Class<P>>,
    _space: Ref<Space>,
    _id: Ref<P>,
    attachedTo: Ref<T>,
    _attachedToClass: Ref<Class<T>>,
    collection: string,
    operations: DocumentUpdate<P>
  ) => {
    state.calls.updates.push({ collection, operations })
    return Effect.succeed(attachedTo)
  }
  const removeCollection: NonNullable<HulyClientOperations["removeCollection"]> = <
    T extends Doc,
    P extends AttachedDoc
  >(
    _classRef: Ref<Class<P>>,
    _space: Ref<Space>,
    id: Ref<P>,
    attachedTo: Ref<T>,
    _attachedToClass: Ref<Class<T>>,
    collection: string
  ) => {
    state.calls.removals.push({ collection, id: String(id) })
    return Effect.succeed(attachedTo)
  }
  const updateDoc: HulyClientOperations["updateDoc"] = <T extends Doc>(
    _classRef: Ref<Class<T>>,
    _space: Ref<Space>,
    id: Ref<T>,
    operations: DocumentUpdate<T>
  ) => {
    state.calls.documentUpdates.push({ id: String(id), operations })
    return Effect.succeed({})
  }
  const removeDoc: HulyClientOperations["removeDoc"] = <T extends Doc>(
    classRef: Ref<Class<T>>,
    _space: Ref<Space>,
    id: Ref<T>
  ) => {
    state.calls.removals.push({
      collection: String(classRef) === String(chunter.class.ChatMessage) ? "comments" : "document",
      id: String(id)
    })
    return Effect.succeed({})
  }
  return HulyClient.testLayer({
    findAll,
    findOne,
    findAllInModel,
    addCollection,
    ...(capabilities.updateCollection === false ? {} : { updateCollection }),
    ...(capabilities.removeCollection === false ? {} : { removeCollection }),
    updateDoc,
    removeDoc
  })
}

const run = <A, E>(effect: Effect.Effect<A, E, HulyClient>, state: Fixture): A =>
  Effect.runSync(effect.pipe(Effect.provide(Layer.merge(layerFor(state), TestClock.layer()))))

const runWithStorage = <A, E>(effect: Effect.Effect<A, E, HulyClient | HulyStorageClient>, state: Fixture): A =>
  Effect.runSync(
    effect.pipe(Effect.provide(Layer.mergeAll(layerFor(state), HulyStorageClient.testLayer({}), TestClock.layer())))
  )

describe("HR request public operations", () => {
  it("discovers and pages human-readable request types", () => {
    const state = fixture()
    const first = run(listHrRequestTypes({ limit: 1 }), state)
    expect(first).toMatchObject({ total: 2, returned: 1, truncated: true, nextOffset: 1 })
    expect(first.requestTypes[0]).toMatchObject({ id: "type-pto", label: "PTO", labelResource: "hr:string:PTO" })
    expect(run(listHrRequestTypes({ query: "remote" }), state).requestTypes).toHaveLength(1)
    expect(run(listHrRequestTypes({ limit: 1, offset: 1 }), state)).toMatchObject({ returned: 1, truncated: false })
  })

  it("lists and gets requests with projected employee, department, type, dates, and counts", () => {
    const state = fixture()
    const employee = PersonLocator.make("employee-1")
    const result = run(
      listHrRequests({
        employee,
        department: DepartmentIdentifier.make("Product"),
        requestType: HrRequestTypeIdentifier.make("PTO"),
        startOnOrAfter: HrCalendarDate.make("2026-09-04"),
        limit: 1
      }),
      state
    )
    expect(result).toMatchObject({ total: 1, returned: 1, truncated: false })
    expect(result.requests[0]).toMatchObject({
      id: "request-1",
      employee: { id: "employee-1", name: "Alice,Agent" },
      department: { id: "department-product", path: "Product" },
      requestType: { id: "type-pto", label: "PTO" },
      startDate: "2026-09-04",
      endDate: "2026-09-05",
      comments: 1,
      attachments: 2
    })
    expect(run(getHrRequest({ request: HrRequestId.make("request-1") }), state).id).toBe("request-1")
    expect(run(listHrRequests({ endOnOrBefore: HrCalendarDate.make("2026-09-04") }), state).requests).toHaveLength(0)
  })

  it("projects Head and absent optional metadata, and emits typed referential errors", () => {
    const base = fixture()
    const request = base.requests[0]
    if (request === undefined) throw new Error("fixture request missing")
    const sparse = decodeDoc<HulyRequest>({
      _id: request._id,
      _class: request._class,
      space: request.space,
      attachedTo: base.employee._id,
      attachedToClass: request.attachedToClass,
      collection: request.collection,
      department: hr.ids.Head,
      type: request.type,
      description: request.description,
      tzDate: request.tzDate,
      tzDueDate: request.tzDueDate,
      modifiedBy: request.modifiedBy
    })
    const headState: Fixture = {
      ...base,
      person: { ...base.person, name: "" },
      employee: { ...base.employee, name: "" },
      staff: { ...base.staff, name: "" },
      requests: [sparse, { ...sparse, _id: docRef<HulyRequest>("request-2") }]
    }
    expect(run(listHrRequests({ limit: 1 }), headState)).toMatchObject({
      truncated: true,
      nextOffset: 1,
      requests: [{ employee: { name: "employee-1" }, department: { path: "Head" }, comments: 0, attachments: 0 }]
    })

    const missingDepartment: Fixture = {
      ...base,
      requests: [{ ...request, department: docRef<Department>("department-missing") }]
    }
    expect(
      Effect.runSync(
        Effect.flip(
          getHrRequest({ request: HrRequestId.make("request-1") }).pipe(Effect.provide(layerFor(missingDepartment)))
        )
      )
    ).toBeInstanceOf(DepartmentHierarchyError)
    const missingType: Fixture = { ...base, requests: [{ ...request, type: docRef<RequestType>("type-missing") }] }
    expect(
      Effect.runSync(
        Effect.flip(
          getHrRequest({ request: HrRequestId.make("request-1") }).pipe(Effect.provide(layerFor(missingType)))
        )
      )
    ).toBeInstanceOf(HrRequestTypeNotFoundError)
    expect(
      Effect.runSync(
        Effect.flip(getHrRequest({ request: HrRequestId.make("request-absent") }).pipe(Effect.provide(layerFor(base))))
      )
    ).toBeInstanceOf(HrRequestNotFoundError)
  })

  it("rejects employees without Staff data and Staff departments absent from the catalog", () => {
    const state = fixture()
    const create = createHrRequest({
      employee: PersonLocator.make("employee-1"),
      requestType: HrRequestTypeIdentifier.make("PTO"),
      startDate: HrCalendarDate.make("2026-09-06"),
      endDate: HrCalendarDate.make("2026-09-07")
    })
    expect(
      Effect.runSync(
        Effect.flip(create.pipe(Effect.provide(Layer.merge(layerFor(state, { staff: false }), TestClock.layer()))))
      )
    ).toBeInstanceOf(EmployeeNotFoundError)
    const missingDepartment: Fixture = {
      ...state,
      staff: { ...state.staff, department: docRef<Department>("department-missing") }
    }
    expect(
      Effect.runSync(
        Effect.flip(create.pipe(Effect.provide(Layer.merge(layerFor(missingDepartment), TestClock.layer()))))
      )
    ).toBeInstanceOf(DepartmentNotFoundError)
    const missingHead: Fixture = {
      ...state,
      departments: state.departments.filter((department) => department._id !== hr.ids.Head)
    }
    expect(
      Effect.runSync(
        Effect.flip(
          createHrRequest({
            employee: PersonLocator.make("employee-1"),
            department: DepartmentIdentifier.make(String(hr.ids.Head)),
            requestType: HrRequestTypeIdentifier.make("PTO"),
            startDate: HrCalendarDate.make("2026-09-06"),
            endDate: HrCalendarDate.make("2026-09-07")
          }).pipe(Effect.provide(Layer.merge(layerFor(missingHead), TestClock.layer())))
        )
      )
    ).toBeInstanceOf(DepartmentNotFoundError)
  })

  it("creates without reading the new request and uses attached-collection update/delete", () => {
    const state = fixture()
    const created = run(
      createHrRequest({
        employee: PersonLocator.make("employee-1"),
        requestType: HrRequestTypeIdentifier.make("PTO"),
        startDate: HrCalendarDate.make("2026-09-06"),
        endDate: HrCalendarDate.make("2026-09-07"),
        description: "**Planned**"
      }),
      state
    )
    expect(created).toMatchObject({
      request: { id: "request-created", department: { path: "Product" }, description: "**Planned**" },
      created: true
    })
    expect(state.calls.additions).toHaveLength(1)

    const explicit = run(
      createHrRequest({
        employee: PersonLocator.make("employee-1"),
        department: DepartmentIdentifier.make(String(hr.ids.Head)),
        requestType: HrRequestTypeIdentifier.make("type-pto"),
        startDate: HrCalendarDate.make("2026-09-08"),
        endDate: HrCalendarDate.make("2026-09-08")
      }),
      state
    )
    expect(explicit.request).toMatchObject({ department: { path: "Head" }, description: "" })

    const updated = run(updateHrRequest({ request: HrRequestId.make("request-1"), description: "Updated" }), state)
    expect(updated.updated).toBe(true)
    expect(state.calls.updates).toEqual([{ collection: "requests", operations: expect.any(Object) }])
    expect(run(deleteHrRequest({ request: HrRequestId.make("request-1") }), state).deleted).toBe(true)
    expect(state.calls.removals).toEqual([{ collection: "requests", id: "request-1" }])
  })

  it("updates every supported request field and reports absent attached-collection capabilities", () => {
    const state = fixture()
    const result = run(
      updateHrRequest({
        request: HrRequestId.make("request-1"),
        department: DepartmentIdentifier.make(String(hr.ids.Head)),
        requestType: HrRequestTypeIdentifier.make("Remote"),
        startDate: HrCalendarDate.make("2026-09-01"),
        endDate: HrCalendarDate.make("2026-09-02")
      }),
      state
    )
    expect(result.request).toMatchObject({
      department: { path: "Head" },
      requestType: { label: "Remote" },
      startDate: "2026-09-01",
      endDate: "2026-09-02"
    })

    const withoutUpdate = Effect.runSync(
      Effect.flip(
        updateHrRequest({ request: HrRequestId.make("request-1"), description: "blocked" }).pipe(
          Effect.provide(Layer.merge(layerFor(state, { updateCollection: false }), TestClock.layer()))
        )
      )
    )
    expect(withoutUpdate).toBeInstanceOf(HrRequestMutationUnsupportedError)
    const withoutDelete = Effect.runSync(
      Effect.flip(
        deleteHrRequest({ request: HrRequestId.make("request-1") }).pipe(
          Effect.provide(Layer.merge(layerFor(state, { removeCollection: false }), TestClock.layer()))
        )
      )
    )
    expect(withoutDelete).toBeInstanceOf(HrRequestMutationUnsupportedError)
    const withoutAttachmentDelete = Effect.runSync(
      Effect.flip(
        deleteHrRequestAttachment({
          request: HrRequestId.make("request-1"),
          attachmentId: AttachmentId.make("attachment-1")
        }).pipe(Effect.provide(Layer.merge(layerFor(state, { removeCollection: false }), TestClock.layer())))
      )
    )
    expect(withoutAttachmentDelete).toBeInstanceOf(HrRequestMutationUnsupportedError)
  })

  it("rejects a partial update whose effective dates reverse the stored range", () => {
    const state = fixture()
    const error = Effect.runSync(
      Effect.flip(
        updateHrRequest({ request: HrRequestId.make("request-1"), startDate: HrCalendarDate.make("2026-09-06") }).pipe(
          Effect.provide(Layer.merge(layerFor(state), TestClock.layer()))
        )
      )
    )
    expect(error).toBeInstanceOf(HrRequestDateRangeError)
    expect(state.calls.updates).toHaveLength(0)
  })

  it("scopes comments and attachments to the friendly request target", () => {
    const state = fixture()
    const request = HrRequestId.make("request-1")
    expect(run(listHrRequestComments({ request, limit: 1 }), state)).toMatchObject({
      request,
      total: 2,
      truncated: true,
      continuationUnsupportedReason: expect.stringContaining("increase limit"),
      comments: [{ id: "comment-1" }]
    })
    expect(run(listHrRequestComments({ request, limit: 10 }), state)).toMatchObject({ truncated: false })
    expect(run(addHrRequestComment({ request, body: "Added" }), state).commentId).not.toBe("")
    expect(
      run(updateHrRequestComment({ request, commentId: CommentId.make("comment-1"), body: "Updated" }), state).updated
    ).toBe(true)
    expect(run(deleteHrRequestComment({ request, commentId: CommentId.make("comment-1") }), state).deleted).toBe(true)

    expect(run(listHrRequestAttachments({ request, limit: 1 }), state)).toMatchObject({
      request,
      total: 2,
      truncated: true,
      continuationUnsupportedReason: expect.stringContaining("increase limit"),
      attachments: [{ id: "attachment-1", name: "request.txt" }]
    })
    expect(run(listHrRequestAttachments({ request, limit: 10 }), state)).toMatchObject({ truncated: false })
    expect(
      runWithStorage(getHrRequestAttachment({ request, attachmentId: AttachmentId.make("attachment-1") }), state)
        .attachment.url
    ).toContain("blob-1")
    const addParams = Effect.runSync(
      parseAddHrRequestAttachmentParams({ request, filename: "added.txt", contentType: "text/plain", data: "YWRkZWQ=" })
    )
    expect(runWithStorage(addHrRequestAttachment(addParams), state).attachmentId).not.toBe("")
    expect(
      run(updateHrRequestAttachment({ request, attachmentId: AttachmentId.make("attachment-1"), pinned: true }), state)
        .updated
    ).toBe(true)
    expect(
      run(deleteHrRequestAttachment({ request, attachmentId: AttachmentId.make("attachment-1") }), state).deleted
    ).toBe(true)
    expect(state.calls.documentUpdates).toEqual(
      expect.arrayContaining([{ id: "attachment-1", operations: { pinned: true } }])
    )
    expect(state.calls.removals).toEqual(
      expect.arrayContaining([
        { collection: "comments", id: "comment-1" },
        { collection: "attachments", id: "attachment-1" }
      ])
    )
  })
})
