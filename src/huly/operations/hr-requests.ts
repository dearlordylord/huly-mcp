import type { Employee } from "@hcengineering/contact"
import type { AttachedData, DocumentUpdate } from "@hcengineering/core"
import { SortingOrder } from "@hcengineering/core"
import type { Request as HulyRequest, RequestType, Staff, TzDate } from "@hcengineering/hr"
import { Effect } from "effect"

import {
  Count,
  DEFAULT_LIMIT,
  HrCalendarDate,
  HrRequestId,
  DepartmentIdentifier,
  type CreateHrRequestParams,
  type DeleteHrRequestParams,
  type GetHrRequestParams,
  HrRequestTypeIdentifier,
  type HrRequestTypeSummary,
  type ListHrRequestsParams,
  type ListHrRequestTypesParams,
  type UpdateHrRequestParams
} from "../../domain/schemas.js"
import { NonEmptyString, NonNegativeInteger, PersonName, Timestamp } from "../../domain/schemas/shared.js"
import { assertAt } from "../../utils/assertions.js"
import { HulyClient, type HulyClientError } from "../client.js"
import {
  DepartmentHierarchyError,
  DepartmentNotFoundError,
  EmployeeNotFoundError,
  HrRequestDateRangeError,
  HrRequestMutationUnsupportedError,
  HrRequestNotFoundError,
  HrRequestTypeIdentifierAmbiguousError,
  HrRequestTypeNotFoundError
} from "../errors.js"
import { core, hr } from "../huly-plugins.js"
import { loadDepartmentCatalog, resolveDepartment, resolveEmployee } from "./hr-departments-shared.js"
import { markupToMarkdownString } from "./markup.js"
import { renderMarkdownPreservingNativeReferences } from "./native-reference-markup.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

const TYPE_MUTATION_REASON = NonEmptyString.make(
  "Request types are model-space documents installed by Huly; no stable supported runtime create/update/delete contract exists."
)
// Default English values from plugins/hr-assets/lang/en.json. The resource ID remains in every result so agents retain
// the authoritative internationalized identity even when a future model adds a label unknown to this server version.
const WELL_KNOWN_LABELS: Readonly<Record<string, string>> = {
  Vacation: "Vacation",
  Sick: "Sick",
  PTO: "PTO",
  PTO2: "PTO/2",
  Remote: "Remote",
  Overtime: "Overtime",
  Overtime2: "Overtime/2"
}
const HUMAN_MONTH_OFFSET = 1
const YEAR_DIGITS = 4
const DATE_PART_DIGITS = 2

const labelTail = (resource: string): NonEmptyString => {
  const tail = resource.slice(resource.lastIndexOf(":") + 1)
  return NonEmptyString.make(WELL_KNOWN_LABELS[tail] ?? tail)
}

export const toHrRequestTypeSummary = (requestType: RequestType): HrRequestTypeSummary => ({
  id: HrRequestTypeIdentifier.make(requestType._id),
  label: labelTail(String(requestType.label)),
  labelResource: NonEmptyString.make(String(requestType.label)),
  value: requestType.value,
  color: requestType.color,
  mutationSupported: false,
  mutationReason: TYPE_MUTATION_REASON
})

const loadRequestTypes = (client: HulyClient["Service"]): Effect.Effect<ReadonlyArray<RequestType>, HulyClientError> =>
  client.findAllInModel<RequestType>(hr.class.RequestType, hulyQuery<RequestType>({}), {
    sort: { _id: SortingOrder.Ascending }
  })

const resolveRequestDepartment = (client: HulyClient["Service"], identifier: DepartmentIdentifier) =>
  identifier === String(hr.ids.Head)
    ? Effect.gen(function* () {
        const department = (yield* loadDepartmentCatalog(client)).byId.get(hr.ids.Head)
        return department ?? (yield* new DepartmentNotFoundError({ identifier }))
      })
    : Effect.map(resolveDepartment(client, identifier), ({ department }) => department)

export const resolveHrRequestType = (
  client: HulyClient["Service"],
  identifier: HrRequestTypeIdentifier
): Effect.Effect<RequestType, HulyClientError | HrRequestTypeNotFoundError | HrRequestTypeIdentifierAmbiguousError> =>
  Effect.gen(function* () {
    return yield* resolveHrRequestTypeFrom(yield* loadRequestTypes(client), identifier)
  })

export const resolveHrRequestTypeFrom = (
  types: ReadonlyArray<RequestType>,
  identifier: HrRequestTypeIdentifier
): Effect.Effect<RequestType, HrRequestTypeNotFoundError | HrRequestTypeIdentifierAmbiguousError> =>
  Effect.gen(function* () {
    const normalized = identifier.trim().toLocaleLowerCase()
    const matches = types.filter((item) =>
      [String(item._id), String(item.label), labelTail(String(item.label))].some(
        (candidate) => candidate.toLocaleLowerCase() === normalized
      )
    )
    const unique = [...new Map(matches.map((item) => [item._id, item])).values()]
    if (unique.length === 1) return assertAt(unique, 0)
    if (unique.length > 1) {
      return yield* new HrRequestTypeIdentifierAmbiguousError({
        requestType: identifier,
        matches: Count.make(unique.length)
      })
    }
    return yield* new HrRequestTypeNotFoundError({ requestType: identifier })
  })

const page = <T>(items: ReadonlyArray<T>, limitInput: number | undefined, offsetInput: number | undefined) => {
  const limit = limitInput ?? DEFAULT_LIMIT
  const offset = offsetInput ?? 0
  const values = items.slice(offset, offset + limit)
  const next = offset + values.length
  return {
    values,
    total: Count.make(items.length),
    offset: NonNegativeInteger.make(offset),
    returned: Count.make(values.length),
    truncated: next < items.length,
    ...(next < items.length ? { nextOffset: NonNegativeInteger.make(next) } : {})
  }
}

export const listHrRequestTypes = (params: ListHrRequestTypesParams) =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const summaries = (yield* loadRequestTypes(client)).map(toHrRequestTypeSummary)
    const query = params.query?.toLocaleLowerCase()
    const filtered =
      query === undefined
        ? summaries
        : summaries.filter((item) =>
            [item.id, item.label, item.labelResource].some((value) => value.toLocaleLowerCase().includes(query))
          )
    const result = page(filtered, params.limit, params.offset)
    return {
      requestTypes: result.values,
      total: result.total,
      offset: result.offset,
      returned: result.returned,
      truncated: result.truncated,
      ...(result.nextOffset === undefined ? {} : { nextOffset: result.nextOffset })
    }
  })

const tzDate = (value: HrCalendarDate): TzDate => {
  const [year = 0, month = 1, day = 0] = value.split("-").map(Number)
  return { year, month: month - HUMAN_MONTH_OFFSET, day, offset: 0 }
}
const calendarDate = (value: TzDate): HrCalendarDate =>
  HrCalendarDate.make(
    `${String(value.year).padStart(YEAR_DIGITS, "0")}-${String(value.month + HUMAN_MONTH_OFFSET).padStart(DATE_PART_DIGITS, "0")}-${String(value.day).padStart(DATE_PART_DIGITS, "0")}`
  )

export const resolveHrRequest = (client: HulyClient["Service"], id: HrRequestId) =>
  Effect.gen(function* () {
    const request = yield* client.findOne<HulyRequest>(
      hr.class.Request,
      hulyQuery<HulyRequest>({ _id: toRef<HulyRequest>(id) })
    )
    return request ?? (yield* new HrRequestNotFoundError({ request: id }))
  })

const employeeName = (employee: Employee): NonEmptyString =>
  NonEmptyString.make(employee.name.trim() === "" ? String(employee._id) : PersonName.make(employee.name))

const summarize = (
  client: HulyClient["Service"],
  request: HulyRequest,
  employee: Employee,
  departmentPath: string,
  requestType: RequestType
) =>
  Effect.gen(function* () {
    const description = yield* markupToMarkdownString(request.description, client.markupUrlConfig, {
      operation: "get_hr_request",
      entity: `HR request '${request._id}' description`
    })
    return {
      id: HrRequestId.make(request._id),
      employee: { id: NonEmptyString.make(employee._id), name: employeeName(employee) },
      department: { id: NonEmptyString.make(request.department), path: NonEmptyString.make(departmentPath) },
      requestType: toHrRequestTypeSummary(requestType),
      startDate: calendarDate(request.tzDate),
      endDate: calendarDate(request.tzDueDate),
      description,
      comments: Count.make(request.comments ?? 0),
      attachments: Count.make(request.attachments ?? 0),
      ...(request.createdOn === undefined ? {} : { createdOn: Timestamp.make(request.createdOn) }),
      ...(request.modifiedOn === undefined ? {} : { modifiedOn: Timestamp.make(request.modifiedOn) })
    }
  })

const summarizeAll = (client: HulyClient["Service"], requests: ReadonlyArray<HulyRequest>) =>
  Effect.gen(function* () {
    const catalog = yield* loadDepartmentCatalog(client)
    const types = new Map((yield* loadRequestTypes(client)).map((item) => [item._id, item]))
    return yield* Effect.forEach(requests, (request) =>
      Effect.gen(function* () {
        const employee = yield* resolveEmployee(client, PersonName.make(String(request.attachedTo)))
        const departmentPath =
          request.department === hr.ids.Head ? NonEmptyString.make("Head") : catalog.pathById.get(request.department)
        if (departmentPath === undefined)
          return yield* new DepartmentHierarchyError({
            message: `HR request '${request._id}' references missing department '${request.department}'`
          })
        const requestType = types.get(request.type)
        if (requestType === undefined)
          return yield* new HrRequestTypeNotFoundError({ requestType: HrRequestTypeIdentifier.make(request.type) })
        return yield* summarize(client, request, employee, departmentPath, requestType)
      })
    )
  })

export const listHrRequests = (params: ListHrRequestsParams) =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const employee = params.employee === undefined ? undefined : yield* resolveEmployee(client, params.employee)
    const department =
      params.department === undefined ? undefined : yield* resolveRequestDepartment(client, params.department)
    const requestType =
      params.requestType === undefined ? undefined : yield* resolveHrRequestType(client, params.requestType)
    const requests = yield* client.findAll<HulyRequest>(
      hr.class.Request,
      hulyQuery<HulyRequest>({
        ...(employee === undefined ? {} : { attachedTo: toRef<Staff>(employee._id) }),
        ...(department === undefined ? {} : { department: department._id }),
        ...(requestType === undefined ? {} : { type: requestType._id })
      }),
      { sort: { modifiedOn: SortingOrder.Descending } }
    )
    const dates = requests.filter(
      (item) =>
        (params.startOnOrAfter === undefined || calendarDate(item.tzDate) >= params.startOnOrAfter) &&
        (params.endOnOrBefore === undefined || calendarDate(item.tzDueDate) <= params.endOnOrBefore)
    )
    const summaries = yield* summarizeAll(client, dates)
    const result = page(summaries, params.limit, params.offset)
    return {
      requests: result.values,
      total: result.total,
      offset: result.offset,
      returned: result.returned,
      truncated: result.truncated,
      ...(result.nextOffset === undefined ? {} : { nextOffset: result.nextOffset })
    }
  })

export const getHrRequest = (params: GetHrRequestParams) =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const summaries = yield* summarizeAll(client, [yield* resolveHrRequest(client, params.request)])
    return assertAt(summaries, 0)
  })

const resolveStaff = (client: HulyClient["Service"], identifier: CreateHrRequestParams["employee"]) =>
  Effect.gen(function* () {
    const employee = yield* resolveEmployee(client, identifier)
    const staff = yield* client.findOne<Staff>(hr.mixin.Staff, hulyQuery<Staff>({ _id: toRef<Staff>(employee._id) }))
    return { employee, staff: staff ?? (yield* new EmployeeNotFoundError({ identifier })) }
  })

const resolveCreateDepartment = (
  client: HulyClient["Service"],
  staff: Staff,
  identifier: CreateHrRequestParams["department"]
) =>
  Effect.gen(function* () {
    if (identifier !== undefined) return yield* resolveRequestDepartment(client, identifier)
    const catalog = yield* loadDepartmentCatalog(client)
    const department = catalog.byId.get(staff.department)
    return (
      department ?? (yield* new DepartmentNotFoundError({ identifier: DepartmentIdentifier.make(staff.department) }))
    )
  })

export const createHrRequest = (params: CreateHrRequestParams) =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const { employee, staff } = yield* resolveStaff(client, params.employee)
    const department = yield* resolveCreateDepartment(client, staff, params.department)
    const requestType = yield* resolveHrRequestType(client, params.requestType)
    const catalog = yield* loadDepartmentCatalog(client)
    const departmentPath =
      department._id === hr.ids.Head ? NonEmptyString.make("Head") : catalog.pathById.get(department._id)
    if (departmentPath === undefined)
      return yield* new DepartmentHierarchyError({
        message: `HR request department '${department._id}' has no resolvable path`
      })
    const rendered = renderMarkdownPreservingNativeReferences(params.description ?? "", client.markupUrlConfig)
    const description = yield* markupToMarkdownString(rendered.markup, client.markupUrlConfig, {
      operation: "create_hr_request",
      entity: "new HR request description"
    })
    const data: AttachedData<HulyRequest> = {
      department: department._id,
      type: requestType._id,
      description: rendered.markup,
      tzDate: tzDate(params.startDate),
      tzDueDate: tzDate(params.endDate)
    }
    const id = yield* client.addCollection(
      hr.class.Request,
      core.space.Workspace,
      toRef<Staff>(employee._id),
      staff._class,
      "requests",
      data
    )
    return {
      request: {
        id: HrRequestId.make(id),
        employee: { id: NonEmptyString.make(employee._id), name: employeeName(employee) },
        department: { id: NonEmptyString.make(department._id), path: departmentPath },
        requestType: toHrRequestTypeSummary(requestType),
        startDate: params.startDate,
        endDate: params.endDate,
        description,
        comments: Count.make(0),
        attachments: Count.make(0)
      },
      created: true
    }
  })

const resolveHrRequestUpdates = (client: HulyClient["Service"], params: UpdateHrRequestParams) =>
  Effect.gen(function* () {
    const department =
      params.department === undefined ? undefined : yield* resolveRequestDepartment(client, params.department)
    const requestType =
      params.requestType === undefined ? undefined : yield* resolveHrRequestType(client, params.requestType)
    return { department, requestType }
  })

const buildHrRequestUpdate = (
  client: HulyClient["Service"],
  params: UpdateHrRequestParams,
  resolved: Effect.Success<ReturnType<typeof resolveHrRequestUpdates>>
): DocumentUpdate<HulyRequest> => ({
  ...(resolved.department === undefined ? {} : { department: resolved.department._id }),
  ...(resolved.requestType === undefined ? {} : { type: resolved.requestType._id }),
  ...(params.startDate === undefined ? {} : { tzDate: tzDate(params.startDate) }),
  ...(params.endDate === undefined ? {} : { tzDueDate: tzDate(params.endDate) }),
  ...(params.description === undefined
    ? {}
    : { description: renderMarkdownPreservingNativeReferences(params.description, client.markupUrlConfig).markup })
})

export const updateHrRequest = (params: UpdateHrRequestParams) =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const current = yield* resolveHrRequest(client, params.request)
    const updateCollection = client.updateCollection
    if (updateCollection === undefined)
      return yield* new HrRequestMutationUnsupportedError({ operation: NonEmptyString.make("update") })
    const startDate = params.startDate ?? calendarDate(current.tzDate)
    const endDate = params.endDate ?? calendarDate(current.tzDueDate)
    if (startDate > endDate) return yield* new HrRequestDateRangeError({ startDate, endDate })
    const operations = buildHrRequestUpdate(client, params, yield* resolveHrRequestUpdates(client, params))
    yield* updateCollection(
      hr.class.Request,
      current.space,
      current._id,
      current.attachedTo,
      current.attachedToClass,
      current.collection,
      operations
    )
    const updated = { ...current, ...operations }
    const summaries = yield* summarizeAll(client, [updated])
    return { request: assertAt(summaries, 0), updated: true }
  })

export const deleteHrRequest = (params: DeleteHrRequestParams) =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const request = yield* resolveHrRequest(client, params.request)
    const removeCollection = client.removeCollection
    if (removeCollection === undefined)
      return yield* new HrRequestMutationUnsupportedError({ operation: NonEmptyString.make("deletion") })
    yield* removeCollection(
      hr.class.Request,
      request.space,
      request._id,
      request.attachedTo,
      request.attachedToClass,
      request.collection
    )
    return { id: HrRequestId.make(request._id), deleted: true }
  })
