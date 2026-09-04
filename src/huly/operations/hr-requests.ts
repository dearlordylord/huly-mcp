import type { Employee } from "@hcengineering/contact"
import type { AttachedData, Class, DocumentUpdate, Space } from "@hcengineering/core"
import { SortingOrder } from "@hcengineering/core"
import type { Department, Request as HulyRequest, RequestType, Staff } from "@hcengineering/hr"
import { Effect } from "effect"

import {
  Count,
  type HrLocale,
  HrRequestId,
  DepartmentIdentifier,
  type CreateHrRequestParams,
  type CreateHrRequestResult,
  type DeleteHrRequestParams,
  type DeleteHrRequestResult,
  type GetHrRequestParams,
  HrRequestTypeIdentifier,
  type HrRequestTypeSummary,
  type ListHrRequestsParams,
  type ListHrRequestTypesParams,
  type UpdateHrRequestParams,
  type UpdateHrRequestResult,
  DepartmentId,
  DepartmentPath,
  NonEmptyString,
  PersonId,
  PersonLocator,
  Timestamp
} from "../../domain/schemas.js"
import { assertAt } from "../../utils/assertions.js"
import { HulyClient, type HulyClientError } from "../client.js"
import {
  DepartmentHierarchyError,
  DepartmentNotFoundError,
  EmployeeNotFoundError,
  HrStaffNotFoundError,
  HrRequestDateRangeError,
  HulyDataInvalidError,
  HrRequestMutationUnsupportedError,
  HrRequestNotFoundError,
  HrRequestTypeIdentifierAmbiguousError,
  HrRequestTypeNotFoundError
} from "../errors.js"
import { contact, core, hr } from "../huly-plugins.js"
import { loadDepartmentCatalog, resolveDepartment, resolveEmployee } from "./hr-departments-shared.js"
import { hrCalendarDateFromTzDate, hrTzDateFromCalendarDate } from "./hr-calendar.js"
import { pageHrRequestResults } from "./hr-request-pagination.js"
import { loadAllHrDocuments } from "./hr-pagination.js"
import { markupToMarkdownString } from "./markup.js"
import { renderMarkdownPreservingNativeReferences } from "./native-reference-markup.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"
import {
  parseHrRequestRecord,
  parseHrRequestEmployeeRecord,
  parseHrRequestTypeRecord,
  parseHrStaffRecord,
  type HrRequestRecord,
  type HrRequestEmployeeRecord,
  type HrRequestTypeRecord,
  type HrStaffRecord
} from "./hr-request-sdk-boundary.js"
import {
  allHrRequestTypeLabels,
  normalizeRequestTypeLocator,
  translateHrRequestTypeLabel
} from "./hr-request-translations.js"

const TYPE_MUTATION_REASON = NonEmptyString.make(
  "Request types are model-space documents installed by Huly; no stable supported runtime create/update/delete contract exists."
)

export const toHrRequestTypeSummary = (requestType: HrRequestTypeRecord, locale: HrLocale = "en") =>
  Effect.map(
    translateHrRequestTypeLabel(requestType.label, locale),
    (label): HrRequestTypeSummary => ({
      id: requestType._id,
      label,
      labelLocale: locale,
      labelResource: requestType.label,
      value: requestType.value,
      color: requestType.color,
      mutationSupported: false,
      mutationReason: TYPE_MUTATION_REASON
    })
  )

const loadRequestTypes = (client: HulyClient["Service"]) =>
  Effect.flatMap(
    client.findAllInModel<RequestType>(hr.class.RequestType, hulyQuery<RequestType>({}), {
      sort: { _id: SortingOrder.Ascending }
    }),
    (types) => Effect.forEach(types, parseHrRequestTypeRecord)
  )

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
): Effect.Effect<
  HrRequestTypeRecord,
  HulyClientError | HulyDataInvalidError | HrRequestTypeNotFoundError | HrRequestTypeIdentifierAmbiguousError
> =>
  Effect.gen(function* () {
    return yield* resolveHrRequestTypeFrom(yield* loadRequestTypes(client), identifier)
  })

export const resolveHrRequestTypeFrom = (
  types: ReadonlyArray<HrRequestTypeRecord>,
  identifier: HrRequestTypeIdentifier
): Effect.Effect<
  HrRequestTypeRecord,
  HulyDataInvalidError | HrRequestTypeNotFoundError | HrRequestTypeIdentifierAmbiguousError
> =>
  Effect.gen(function* () {
    const normalized = normalizeRequestTypeLocator(identifier)
    const idMatches = types.filter((item) => item._id.toLocaleLowerCase() === normalized)
    if (idMatches.length === 1) return assertAt(idMatches, 0)
    if (idMatches.length > 1)
      return yield* new HulyDataInvalidError({
        operation: "resolveHrRequestType",
        entity: `duplicate request-type ID '${identifier}'`
      })
    const localized = yield* Effect.forEach(types, (item) =>
      Effect.map(allHrRequestTypeLabels(item.label), (labels) => ({ item, labels }))
    )
    const matches = localized
      .filter(({ item, labels }) =>
        [item.label, ...labels].some((candidate) => candidate.toLocaleLowerCase() === normalized)
      )
      .map(({ item }) => item)
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

export const listHrRequestTypes = (params: ListHrRequestTypesParams) =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const locale = params.locale ?? "en"
    const summaries = yield* Effect.forEach(yield* loadRequestTypes(client), (type) =>
      toHrRequestTypeSummary(type, locale)
    )
    const query = params.query?.toLocaleLowerCase()
    const filtered =
      query === undefined
        ? summaries
        : summaries.filter((item) =>
            [item.id, item.label, item.labelResource].some((value) => value.toLocaleLowerCase().includes(query))
          )
    const result = pageHrRequestResults(filtered, params.limit, params.offset)
    return {
      requestTypes: result.values,
      total: result.total,
      offset: result.offset,
      returned: result.returned,
      truncated: result.truncated,
      ...(result.nextOffset === undefined ? {} : { nextOffset: result.nextOffset })
    }
  })

export const resolveHrRequest = (client: HulyClient["Service"], id: HrRequestId) =>
  Effect.gen(function* () {
    const request = yield* client.findOne<HulyRequest>(
      hr.class.Request,
      hulyQuery<HulyRequest>({ _id: toRef<HulyRequest>(id) })
    )
    if (request === undefined) return yield* new HrRequestNotFoundError({ request: id })
    return yield* parseHrRequestRecord(request)
  })

const resolveRequestEmployee = (client: HulyClient["Service"], employeeId: PersonId) =>
  Effect.gen(function* () {
    const employee = yield* client.findOne<Employee>(
      contact.mixin.Employee,
      hulyQuery<Employee>({ _id: toRef<Employee>(employeeId) })
    )
    if (employee === undefined) return yield* new EmployeeNotFoundError({ identifier: PersonLocator.make(employeeId) })
    return yield* parseHrRequestEmployeeRecord(employee)
  })

const summarize = (
  client: HulyClient["Service"],
  request: HrRequestRecord,
  employee: HrRequestEmployeeRecord,
  departmentPath: DepartmentPath,
  requestType: HrRequestTypeRecord
) =>
  Effect.gen(function* () {
    const description = yield* markupToMarkdownString(request.description, client.markupUrlConfig, {
      operation: "get_hr_request",
      entity: `HR request '${request._id}' description`
    })
    const typeSummary = yield* toHrRequestTypeSummary(requestType)
    return {
      id: HrRequestId.make(request._id),
      employee: { id: employee._id, name: employee.name },
      department: { id: DepartmentId.make(request.department), path: departmentPath },
      requestType: typeSummary,
      startDate: hrCalendarDateFromTzDate(request.tzDate),
      endDate: hrCalendarDateFromTzDate(request.tzDueDate),
      description,
      comments: Count.make(request.comments ?? 0),
      attachments: Count.make(request.attachments ?? 0),
      ...(request.createdOn === undefined ? {} : { createdOn: Timestamp.make(request.createdOn) }),
      ...(request.modifiedOn === undefined ? {} : { modifiedOn: Timestamp.make(request.modifiedOn) })
    }
  })

const summarizeAll = (client: HulyClient["Service"], requests: ReadonlyArray<HrRequestRecord>) =>
  Effect.gen(function* () {
    const catalog = yield* loadDepartmentCatalog(client)
    const types = new Map((yield* loadRequestTypes(client)).map((item) => [item._id, item]))
    return yield* Effect.forEach(requests, (request) =>
      Effect.gen(function* () {
        const employee = yield* resolveRequestEmployee(client, request.attachedTo)
        const departmentPath =
          String(request.department) === String(hr.ids.Head)
            ? DepartmentPath.make("Head")
            : catalog.pathById.get(toRef<Department>(request.department))
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

export const loadAllHrRequestSummaries = Effect.fn("HrRequests.loadAllSummaries")(function* (
  params: Omit<ListHrRequestsParams, "limit" | "offset">,
  scanPageSize?: number
) {
  const client = yield* HulyClient
  const employee = params.employee === undefined ? undefined : yield* resolveEmployee(client, params.employee)
  const department =
    params.department === undefined ? undefined : yield* resolveRequestDepartment(client, params.department)
  const requestType =
    params.requestType === undefined ? undefined : yield* resolveHrRequestType(client, params.requestType)
  const rawRequests = yield* loadAllHrDocuments(
    client,
    hr.class.Request,
    {
      ...(employee === undefined ? {} : { attachedTo: toRef<Staff>(employee._id) }),
      ...(department === undefined ? {} : { department: department._id }),
      ...(requestType === undefined ? {} : { type: toRef<RequestType>(requestType._id) })
    },
    scanPageSize
  )
  const requests = yield* Effect.forEach(rawRequests, parseHrRequestRecord)
  const dates = requests.filter(
    (item) =>
      (params.startOnOrAfter === undefined || hrCalendarDateFromTzDate(item.tzDate) >= params.startOnOrAfter) &&
      (params.endOnOrBefore === undefined || hrCalendarDateFromTzDate(item.tzDueDate) <= params.endOnOrBefore)
  )
  return yield* summarizeAll(client, dates)
})

export const listHrRequests = Effect.fn("HrRequests.list")(function* (params: ListHrRequestsParams) {
  const summaries = yield* loadAllHrRequestSummaries(params)
  const result = pageHrRequestResults(summaries, params.limit, params.offset)
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
    if (staff === undefined) return yield* new HrStaffNotFoundError({ employee: PersonId.make(employee._id) })
    return { employee: yield* parseHrRequestEmployeeRecord(employee), staff: yield* parseHrStaffRecord(staff) }
  })

const resolveCreateDepartment = (
  client: HulyClient["Service"],
  staff: HrStaffRecord,
  identifier: CreateHrRequestParams["department"]
) =>
  Effect.gen(function* () {
    if (identifier !== undefined) return yield* resolveRequestDepartment(client, identifier)
    if (staff.department === undefined)
      return yield* new HulyDataInvalidError({
        operation: "createHrRequest",
        entity: `Staff record '${staff._id}' department`
      })
    const catalog = yield* loadDepartmentCatalog(client)
    const department = catalog.byId.get(toRef<Department>(staff.department))
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
      department._id === hr.ids.Head ? DepartmentPath.make("Head") : catalog.pathById.get(department._id)
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
      type: toRef<RequestType>(requestType._id),
      description: rendered.markup,
      tzDate: hrTzDateFromCalendarDate(params.startDate),
      tzDueDate: hrTzDateFromCalendarDate(params.endDate)
    }
    const id = yield* client.addCollection(
      hr.class.Request,
      core.space.Workspace,
      toRef<Staff>(employee._id),
      toRef<Class<Staff>>(staff._class),
      "requests",
      data
    )
    const result: CreateHrRequestResult = {
      request: {
        id: HrRequestId.make(id),
        employee: { id: employee._id, name: employee.name },
        department: { id: DepartmentId.make(department._id), path: departmentPath },
        requestType: yield* toHrRequestTypeSummary(requestType),
        startDate: params.startDate,
        endDate: params.endDate,
        description,
        comments: Count.make(0),
        attachments: Count.make(0)
      },
      created: true
    }
    return result
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
  ...(resolved.requestType === undefined ? {} : { type: toRef<RequestType>(resolved.requestType._id) }),
  ...(params.startDate === undefined ? {} : { tzDate: hrTzDateFromCalendarDate(params.startDate) }),
  ...(params.endDate === undefined ? {} : { tzDueDate: hrTzDateFromCalendarDate(params.endDate) }),
  ...(params.description === undefined
    ? {}
    : { description: renderMarkdownPreservingNativeReferences(params.description, client.markupUrlConfig).markup })
})

export const updateHrRequest = (params: UpdateHrRequestParams) =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const current = yield* resolveHrRequest(client, params.request)
    const updateCollection = client.updateCollection
    if (updateCollection === undefined) return yield* new HrRequestMutationUnsupportedError({ operation: "update" })
    const startDate = params.startDate ?? hrCalendarDateFromTzDate(current.tzDate)
    const endDate = params.endDate ?? hrCalendarDateFromTzDate(current.tzDueDate)
    if (startDate > endDate) return yield* new HrRequestDateRangeError({ startDate, endDate })
    const operations = buildHrRequestUpdate(client, params, yield* resolveHrRequestUpdates(client, params))
    yield* updateCollection(
      hr.class.Request,
      toRef<Space>(current.space),
      toRef<HulyRequest>(current._id),
      toRef<Staff>(current.attachedTo),
      toRef<Class<Staff>>(current.attachedToClass),
      current.collection,
      operations
    )
    const updated = yield* parseHrRequestRecord({ ...current, ...operations })
    const summaries = yield* summarizeAll(client, [updated])
    const result: UpdateHrRequestResult = { request: assertAt(summaries, 0), updated: true }
    return result
  })

export const deleteHrRequest = (params: DeleteHrRequestParams) =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const request = yield* resolveHrRequest(client, params.request)
    const removeCollection = client.removeCollection
    if (removeCollection === undefined) return yield* new HrRequestMutationUnsupportedError({ operation: "deletion" })
    yield* removeCollection(
      hr.class.Request,
      toRef<Space>(request.space),
      toRef<HulyRequest>(request._id),
      toRef<Staff>(request.attachedTo),
      toRef<Class<Staff>>(request.attachedToClass),
      request.collection
    )
    const result: DeleteHrRequestResult = { id: HrRequestId.make(request._id), deleted: true }
    return result
  })
