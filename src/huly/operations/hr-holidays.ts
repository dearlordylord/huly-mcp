import type { Data, DocumentUpdate, Ref } from "@hcengineering/core"
import type { Department, PublicHoliday } from "@hcengineering/hr"
import { Effect } from "effect"

import {
  type CreatePublicHolidayParams,
  type CreatePublicHolidayResult,
  type DeletePublicHolidayParams,
  type DeletePublicHolidayResult,
  DepartmentIdentifier,
  DepartmentPath,
  type HrCalendarDate,
  type GetPublicHolidayParams,
  type ListPublicHolidaysParams,
  type PublicHolidaySummary,
  type UpdatePublicHolidayParams,
  type UpdatePublicHolidayResult
} from "../../domain/schemas.js"
import { HulyClient } from "../client.js"
import {
  DepartmentHierarchyError,
  DepartmentNotFoundError,
  PublicHolidayConflictError,
  PublicHolidayNotFoundError
} from "../errors.js"
import { core, hr } from "../huly-plugins.js"
import { hrCalendarDateFromTzDate, hrTzDateFromCalendarDate } from "./hr-calendar.js"
import { ancestorDepartmentIds, loadDepartmentCatalog, resolveDepartment } from "./hr-departments-shared.js"
import { parsePublicHolidayRecord, type PublicHolidayRecord } from "./hr-holiday-sdk-boundary.js"
import { DEFAULT_HR_PAGE_SIZE, type HrPageSize, loadAllHrDocuments } from "./hr-pagination.js"
import { pageHrRequestResults } from "./hr-request-pagination.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

const loadHolidayRecords = Effect.fn("HrHolidays.loadRecords")(function* (
  client: HulyClient["Service"],
  department?: Ref<Department>,
  pageSize: HrPageSize = DEFAULT_HR_PAGE_SIZE
) {
  const values = yield* loadAllHrDocuments(
    client,
    hr.class.PublicHoliday,
    { ...(department === undefined ? {} : { department }) },
    pageSize
  )
  return yield* Effect.forEach(values, parsePublicHolidayRecord)
})

const resolveHolidayDepartment = Effect.fn("HrHolidays.resolveDepartment")(function* (
  client: HulyClient["Service"],
  identifier: DepartmentIdentifier
) {
  if (identifier !== String(hr.ids.Head)) return yield* resolveDepartment(client, identifier)
  const catalog = yield* loadDepartmentCatalog(client)
  const department = catalog.byId.get(hr.ids.Head)
  if (department === undefined) return yield* new DepartmentNotFoundError({ identifier })
  return { catalog, department }
})

const summarizeHoliday = Effect.fn("HrHolidays.summarize")(function* (
  holiday: PublicHolidayRecord,
  paths: ReadonlyMap<Ref<Department>, DepartmentPath>
): Effect.fn.Return<PublicHolidaySummary, DepartmentHierarchyError> {
  const path =
    holiday.department === String(hr.ids.Head)
      ? DepartmentPath.make("Head")
      : paths.get(toRef<Department>(holiday.department))
  if (path === undefined) {
    return yield* new DepartmentHierarchyError({
      message: `Public holiday '${holiday._id}' references missing department '${holiday.department}'`
    })
  }
  return {
    id: holiday._id,
    title: holiday.title,
    description: holiday.description,
    date: hrCalendarDateFromTzDate(holiday.date),
    department: { id: holiday.department, path },
    ...(holiday.modifiedOn === undefined ? {} : { modifiedOn: holiday.modifiedOn })
  }
})

const resolveHoliday = Effect.fn("HrHolidays.resolveHoliday")(function* (
  client: HulyClient["Service"],
  id: GetPublicHolidayParams["holiday"]
) {
  const raw = yield* client.findOne<PublicHoliday>(
    hr.class.PublicHoliday,
    hulyQuery<PublicHoliday>({ _id: toRef<PublicHoliday>(id) })
  )
  if (raw === undefined) return yield* new PublicHolidayNotFoundError({ holiday: id })
  return yield* parsePublicHolidayRecord(raw)
})

export const listPublicHolidays = Effect.fn("HrHolidays.list")(function* (params: ListPublicHolidaysParams) {
  const client = yield* HulyClient
  const resolved =
    params.department === undefined ? undefined : yield* resolveHolidayDepartment(client, params.department)
  const allowed =
    resolved === undefined
      ? undefined
      : (params.includeInherited ?? false)
        ? ancestorDepartmentIds(resolved.department, resolved.catalog.byId)
        : new Set<Ref<Department>>([resolved.department._id])
  const catalog = resolved?.catalog ?? (yield* loadDepartmentCatalog(client))
  const records = yield* loadHolidayRecords(client)
  const filtered = records.filter((holiday) => {
    const date = hrCalendarDateFromTzDate(holiday.date)
    return (
      (allowed === undefined || allowed.has(toRef<Department>(holiday.department))) &&
      (params.startDate === undefined || date >= params.startDate) &&
      (params.endDate === undefined || date <= params.endDate)
    )
  })
  const summaries = yield* Effect.forEach(filtered, (holiday) => summarizeHoliday(holiday, catalog.pathById))
  const page = pageHrRequestResults(summaries, params.limit, params.offset)
  return {
    holidays: page.values,
    total: page.total,
    offset: page.offset,
    returned: page.returned,
    truncated: page.truncated,
    ...(page.nextOffset === undefined ? {} : { nextOffset: page.nextOffset })
  }
})

export const loadAllPublicHolidaySummaries = Effect.fn("HrHolidays.loadAllSummaries")(function* (
  pageSize: HrPageSize = DEFAULT_HR_PAGE_SIZE
) {
  const client = yield* HulyClient
  const catalog = yield* loadDepartmentCatalog(client)
  const records = yield* loadAllHrDocuments(client, hr.class.PublicHoliday, {}, pageSize)
  return yield* Effect.forEach(yield* Effect.forEach(records, parsePublicHolidayRecord), (holiday) =>
    summarizeHoliday(holiday, catalog.pathById)
  )
})

export const getPublicHoliday = Effect.fn("HrHolidays.get")(function* (params: GetPublicHolidayParams) {
  const client = yield* HulyClient
  const catalog = yield* loadDepartmentCatalog(client)
  return yield* summarizeHoliday(yield* resolveHoliday(client, params.holiday), catalog.pathById)
})

export const publicHolidayDateConflicts = (
  holidays: ReadonlyArray<PublicHolidayRecord>,
  date: HrCalendarDate,
  except?: GetPublicHolidayParams["holiday"]
): boolean => holidays.some((holiday) => holiday._id !== except && hrCalendarDateFromTzDate(holiday.date) === date)

const ensureHolidayDateAvailable = Effect.fn("HrHolidays.ensureDateAvailable")(function* (
  client: HulyClient["Service"],
  department: Department,
  date: CreatePublicHolidayParams["date"],
  except?: GetPublicHolidayParams["holiday"]
) {
  const matches = yield* loadHolidayRecords(client, department._id)
  if (publicHolidayDateConflicts(matches, date, except)) {
    return yield* new PublicHolidayConflictError({ date, department: DepartmentIdentifier.make(department._id) })
  }
})

export const createPublicHoliday = Effect.fn("HrHolidays.create")(function* (params: CreatePublicHolidayParams) {
  const client = yield* HulyClient
  const { catalog, department } = yield* resolveHolidayDepartment(client, params.department)
  yield* ensureHolidayDateAvailable(client, department, params.date)
  const data: Data<PublicHoliday> = {
    title: params.title,
    description: params.description ?? "",
    date: hrTzDateFromCalendarDate(params.date),
    department: department._id
  }
  const id = yield* client.createDoc(hr.class.PublicHoliday, core.space.Workspace, data)
  const holiday = yield* summarizeHoliday(
    yield* parsePublicHolidayRecord({ ...data, _id: id, _class: hr.class.PublicHoliday, space: core.space.Workspace }),
    catalog.pathById
  )
  return { holiday, created: true } satisfies CreatePublicHolidayResult
})

const resolveHolidayUpdateContext = Effect.fn("HrHolidays.resolveUpdateContext")(function* (
  client: HulyClient["Service"],
  current: PublicHolidayRecord,
  identifier: UpdatePublicHolidayParams["department"]
) {
  const resolved = identifier === undefined ? undefined : yield* resolveHolidayDepartment(client, identifier)
  const catalog = resolved?.catalog ?? (yield* loadDepartmentCatalog(client))
  const department = resolved?.department ?? catalog.byId.get(toRef<Department>(current.department))
  if (department === undefined) {
    return yield* new DepartmentHierarchyError({
      message: `Public holiday '${current._id}' references missing department '${current.department}'`
    })
  }
  return { catalog, department, resolved }
})

const holidayUpdateOperations = (
  params: UpdatePublicHolidayParams,
  resolvedDepartment: Department | undefined
): DocumentUpdate<PublicHoliday> => ({
  ...(params.title === undefined ? {} : { title: params.title }),
  ...(params.description === undefined ? {} : { description: params.description }),
  ...(params.date === undefined ? {} : { date: hrTzDateFromCalendarDate(params.date) }),
  ...(resolvedDepartment === undefined ? {} : { department: resolvedDepartment._id })
})

export const updatePublicHoliday = Effect.fn("HrHolidays.update")(function* (params: UpdatePublicHolidayParams) {
  const client = yield* HulyClient
  const current = yield* resolveHoliday(client, params.holiday)
  const { catalog, department, resolved } = yield* resolveHolidayUpdateContext(client, current, params.department)
  const date = params.date ?? hrCalendarDateFromTzDate(current.date)
  yield* ensureHolidayDateAvailable(client, department, date, params.holiday)
  const operations = holidayUpdateOperations(params, resolved?.department)
  yield* client.updateDoc(hr.class.PublicHoliday, core.space.Workspace, toRef<PublicHoliday>(current._id), operations)
  const updated = yield* parsePublicHolidayRecord({ ...current, ...operations })
  return {
    holiday: yield* summarizeHoliday(updated, catalog.pathById),
    updated: true
  } satisfies UpdatePublicHolidayResult
})

export const deletePublicHoliday = Effect.fn("HrHolidays.delete")(function* (params: DeletePublicHolidayParams) {
  const client = yield* HulyClient
  const holiday = yield* resolveHoliday(client, params.holiday)
  yield* client.removeDoc(hr.class.PublicHoliday, core.space.Workspace, toRef<PublicHoliday>(holiday._id))
  return { id: holiday._id, deleted: true } satisfies DeletePublicHolidayResult
})
