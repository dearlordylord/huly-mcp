import { AccessLevel, type Calendar as HulyCalendar } from "@hcengineering/calendar"
import type { Channel, Person } from "@hcengineering/contact"
import {
  type AttachedData,
  type DocumentUpdate,
  generateId,
  type PersonId as CorePersonId,
  type Ref,
  SortingOrder,
  type WithLookup
} from "@hcengineering/core"
import {
  type Issue as HulyIssue,
  type Project as HulyProject,
  type TimeSpendReport as HulyTimeSpendReport
} from "@hcengineering/tracker"
import { Effect } from "effect"

import type {
  CreateWorkSlotParams,
  DetailedTimeReport,
  GetDetailedTimeReportParams,
  GetTimeReportParams,
  ListTimeSpendReportsParams,
  ListWorkSlotsParams,
  LogTimeParams,
  StartTimerParams,
  StopTimerParams,
  TimeReportSummary,
  TimeSpendReport,
  WorkSlot
} from "../../domain/schemas.js"
import { IssueIdentifier, PersonName, TimeSpendReportId, TodoId } from "../../domain/schemas/shared.js"
import { isExistent } from "../../utils/assertions.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type { IssueNotFoundError } from "../errors.js"
import { ProjectNotFoundError } from "../errors.js"
import { withLookup } from "./query-helpers.js"
import { findProject, findProjectAndIssue, toRef, zeroAsUnset } from "./shared.js"

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports -- CJS interop
const tracker = require("@hcengineering/tracker").default as typeof import("@hcengineering/tracker").default
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports -- CJS interop
const contact = require("@hcengineering/contact").default as typeof import("@hcengineering/contact").default
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports -- CJS interop
const time = require("@hcengineering/time").default as typeof import("@hcengineering/time").default

// SDK: Data<WorkSlot> requires calendar/user but server populates from auth context.
const serverPopulatedCalendar = toRef<HulyCalendar>("")
const serverPopulatedPersonId: CorePersonId = "" as CorePersonId

export type LogTimeError = HulyClientError | ProjectNotFoundError | IssueNotFoundError
export type GetTimeReportError = HulyClientError | ProjectNotFoundError | IssueNotFoundError
export type ListTimeSpendReportsError = HulyClientError | ProjectNotFoundError
export type GetDetailedTimeReportError = HulyClientError | ProjectNotFoundError
export type ListWorkSlotsError = HulyClientError
export type CreateWorkSlotError = HulyClientError
export type StartTimerError = HulyClientError | ProjectNotFoundError | IssueNotFoundError
export type StopTimerError = HulyClientError | ProjectNotFoundError | IssueNotFoundError

export interface LogTimeResult {
  reportId: string
  identifier: string
}

export const logTime = (
  params: LogTimeParams
): Effect.Effect<LogTimeResult, LogTimeError, HulyClient> =>
  Effect.gen(function*() {
    const { client, issue, project } = yield* findProjectAndIssue({
      project: params.project,
      identifier: params.identifier
    })

    const reportId: Ref<HulyTimeSpendReport> = generateId()

    // Huly API expects employee as null for anonymous reports (will be set to current user by server)
    const reportData: AttachedData<HulyTimeSpendReport> = {
      employee: null,
      date: Date.now(),
      value: params.value,
      description: params.description ?? ""
    }

    yield* client.addCollection(
      tracker.class.TimeSpendReport,
      project._id,
      issue._id,
      tracker.class.Issue,
      "reports",
      reportData,
      reportId
    )

    // Huly API: must manually update issue aggregates when adding time reports
    const updateOps: DocumentUpdate<HulyIssue> = {
      $inc: { reportedTime: params.value, reports: 1 }
    }
    if (issue.remainingTime > 0) {
      const newRemaining = Math.max(0, issue.remainingTime - params.value)
      updateOps.remainingTime = newRemaining
    }
    yield* client.updateDoc(
      tracker.class.Issue,
      project._id,
      issue._id,
      updateOps
    )

    return { reportId, identifier: IssueIdentifier.make(issue.identifier) }
  })

export const getTimeReport = (
  params: GetTimeReportParams
): Effect.Effect<TimeReportSummary, GetTimeReportError, HulyClient> =>
  Effect.gen(function*() {
    const { client, issue } = yield* findProjectAndIssue({
      project: params.project,
      identifier: params.identifier
    })

    const reports = yield* client.findAll<HulyTimeSpendReport>(
      tracker.class.TimeSpendReport,
      { attachedTo: issue._id },
      { sort: { date: SortingOrder.Descending } }
    )

    const employeeIds = [
      ...new Set(
        reports.map(r => r.employee).filter(isExistent)
      )
    ]

    const persons = employeeIds.length > 0
      ? yield* client.findAll<Person>(
        contact.class.Person,
        { _id: { $in: employeeIds } }
      )
      : []

    const personMap = new Map(persons.map(p => [p._id, p.name]))

    const timeReports: Array<TimeSpendReport> = reports.map(r => ({
      id: TimeSpendReportId.make(r._id),
      identifier: IssueIdentifier.make(issue.identifier),
      employee: r.employee && personMap.has(r.employee)
        ? PersonName.make(personMap.get(r.employee)!)
        : undefined,
      date: r.date,
      value: r.value,
      description: r.description
    }))

    return {
      identifier: IssueIdentifier.make(issue.identifier),
      totalTime: issue.reportedTime,
      estimation: zeroAsUnset(issue.estimation),
      remainingTime: zeroAsUnset(issue.remainingTime),
      reports: timeReports
    }
  })

export const listTimeSpendReports = (
  params: ListTimeSpendReportsParams
): Effect.Effect<Array<TimeSpendReport>, ListTimeSpendReportsError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const query: Record<string, unknown> = {}

    if (params.project !== undefined) {
      const project = yield* client.findOne<HulyProject>(
        tracker.class.Project,
        { identifier: params.project }
      )
      if (project === undefined) {
        return yield* new ProjectNotFoundError({ identifier: params.project })
      }
      query.space = project._id
    }

    if (params.from !== undefined || params.to !== undefined) {
      const dateFilter: Record<string, number> = {}
      if (params.from !== undefined) dateFilter.$gte = params.from
      if (params.to !== undefined) dateFilter.$lte = params.to
      query.date = dateFilter
    }

    const limit = Math.min(params.limit ?? 50, 200)

    type TimeSpendReportWithLookup = WithLookup<HulyTimeSpendReport> & {
      $lookup?: {
        attachedTo?: HulyIssue
        employee?: Person
      }
    }

    const reports = yield* client.findAll<TimeSpendReportWithLookup>(
      tracker.class.TimeSpendReport,
      query,
      withLookup<TimeSpendReportWithLookup>(
        { limit, sort: { date: SortingOrder.Descending } },
        {
          attachedTo: tracker.class.Issue,
          employee: contact.class.Person
        }
      )
    )

    return reports.map(r => ({
      id: TimeSpendReportId.make(r._id),
      identifier: IssueIdentifier.make(r.$lookup?.attachedTo?.identifier ?? "Unknown"),
      employee: r.$lookup?.employee?.name !== undefined ? PersonName.make(r.$lookup.employee.name) : undefined,
      date: r.date,
      value: r.value,
      description: r.description
    }))
  })

export const getDetailedTimeReport = (
  params: GetDetailedTimeReportParams
): Effect.Effect<DetailedTimeReport, GetDetailedTimeReportError, HulyClient> =>
  Effect.gen(function*() {
    const { client, project } = yield* findProject(params.project)

    const query: Record<string, unknown> = { space: project._id }

    if (params.from !== undefined || params.to !== undefined) {
      const dateFilter: Record<string, number> = {}
      if (params.from !== undefined) dateFilter.$gte = params.from
      if (params.to !== undefined) dateFilter.$lte = params.to
      query.date = dateFilter
    }

    type TimeSpendReportWithLookup = WithLookup<HulyTimeSpendReport> & {
      $lookup?: {
        attachedTo?: HulyIssue
        employee?: Person
      }
    }

    const reports = yield* client.findAll<TimeSpendReportWithLookup>(
      tracker.class.TimeSpendReport,
      query,
      withLookup<TimeSpendReportWithLookup>(
        { sort: { date: SortingOrder.Descending } },
        {
          attachedTo: tracker.class.Issue,
          employee: contact.class.Person
        }
      )
    )

    const byIssueMap = new Map<string, {
      identifier: IssueIdentifier
      issueTitle: string
      totalTime: number
      reports: Array<TimeSpendReport>
    }>()

    const byEmployeeMap = new Map<string, { employeeName: string | undefined; totalTime: number }>()

    let totalTime = 0

    for (const r of reports) {
      totalTime += r.value

      const issueKey = r.attachedTo
      const issue = r.$lookup?.attachedTo
      const existing = byIssueMap.get(issueKey) ?? {
        identifier: IssueIdentifier.make(issue?.identifier ?? "Unknown"),
        issueTitle: issue?.title ?? "Unknown",
        totalTime: 0,
        reports: []
      }
      existing.totalTime += r.value
      existing.reports.push({
        id: TimeSpendReportId.make(r._id),
        identifier: IssueIdentifier.make(issue?.identifier ?? "Unknown"),
        employee: r.$lookup?.employee?.name !== undefined ? PersonName.make(r.$lookup.employee.name) : undefined,
        date: r.date,
        value: r.value,
        description: r.description
      })
      byIssueMap.set(issueKey, existing)

      const empKey = r.employee ? r.employee : "__unassigned__"
      const empExisting = byEmployeeMap.get(empKey) ?? {
        employeeName: r.$lookup?.employee?.name,
        totalTime: 0
      }
      empExisting.totalTime += r.value
      byEmployeeMap.set(empKey, empExisting)
    }

    return {
      project: params.project,
      totalTime,
      byIssue: Array.from(byIssueMap.values()),
      byEmployee: Array.from(byEmployeeMap.values())
    }
  })

export const listWorkSlots = (
  params: ListWorkSlotsParams
): Effect.Effect<Array<WorkSlot>, ListWorkSlotsError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const query: Record<string, unknown> = {}

    if (params.employeeId !== undefined) {
      const person = yield* client.findOne<Person>(
        contact.class.Person,
        { _id: toRef<Person>(params.employeeId) }
      )
      if (person === undefined) {
        const channels = yield* client.findAll<Channel>(
          contact.class.Channel,
          { value: params.employeeId }
        )
        if (channels.length > 0) {
          const channel = channels[0]
          query.user = channel.attachedTo
        }
      } else {
        query.user = person._id
      }
    }

    if (params.from !== undefined || params.to !== undefined) {
      const dateFilter: Record<string, number> = {}
      if (params.from !== undefined) dateFilter.$gte = params.from
      if (params.to !== undefined) dateFilter.$lte = params.to
      query.date = dateFilter
    }

    const limit = Math.min(params.limit ?? 50, 200)

    /* eslint-disable @typescript-eslint/consistent-type-imports -- inline type for generic */
    type HulyWorkSlot = import("@hcengineering/time").WorkSlot
    /* eslint-enable @typescript-eslint/consistent-type-imports */

    const slots = yield* client.findAll<HulyWorkSlot>(
      time.class.WorkSlot,
      query,
      { limit, sort: { date: SortingOrder.Descending } }
    )

    return slots.map(s => ({
      id: s._id,
      todoId: TodoId.make(s.attachedTo),
      date: s.date,
      dueDate: s.dueDate,
      title: s.title
    }))
  })

export interface CreateWorkSlotResult {
  slotId: string
}

export const createWorkSlot = (
  params: CreateWorkSlotParams
): Effect.Effect<CreateWorkSlotResult, CreateWorkSlotError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    /* eslint-disable @typescript-eslint/consistent-type-imports -- inline type for generic */
    type HulyWorkSlot = import("@hcengineering/time").WorkSlot
    type HulyToDo = import("@hcengineering/time").ToDo
    /* eslint-enable @typescript-eslint/consistent-type-imports */

    const slotId: Ref<HulyWorkSlot> = generateId()

    // Huly API: WorkSlot requires all calendar event fields even for simple slots.
    // Empty string casts are used because server will populate calendar/user from auth context.
    // This matches the pattern used in calendar.ts for Event creation.
    const slotData: AttachedData<HulyWorkSlot> = {
      date: params.date,
      dueDate: params.dueDate,
      title: "",
      description: "",
      allDay: false,
      participants: [],
      access: AccessLevel.Owner,
      reminders: [],
      visibility: "public" as const,
      eventId: "",
      calendar: serverPopulatedCalendar,
      user: serverPopulatedPersonId,
      blockTime: false
    }

    yield* client.addCollection(
      time.class.WorkSlot,
      time.space.ToDos,
      toRef<HulyToDo>(params.todoId),
      time.class.ToDo,
      "workslots",
      slotData,
      slotId
    )

    return { slotId }
  })

export interface StartTimerResult {
  identifier: string
  startedAt: number
}

/**
 * Start a timer on an issue.
 *
 * NOTE: This is a client-side timer placeholder. Huly does not have a native
 * timer API, so this only validates the issue exists and returns a start timestamp.
 * The client is expected to track the timer and call logTime when stopping.
 */
export const startTimer = (
  params: StartTimerParams
): Effect.Effect<StartTimerResult, StartTimerError, HulyClient> =>
  Effect.gen(function*() {
    const { issue } = yield* findProjectAndIssue({
      project: params.project,
      identifier: params.identifier
    })

    const startedAt = Date.now()

    return {
      identifier: issue.identifier,
      startedAt
    }
  })

export interface StopTimerResult {
  identifier: string
  stoppedAt: number
  reportId?: string
}

/**
 * Stop a timer on an issue.
 *
 * NOTE: This is a client-side timer placeholder. Huly does not have a native
 * timer API, so this only validates the issue exists and returns a stop timestamp.
 * The client should calculate elapsed time and call logTime to record it.
 */
export const stopTimer = (
  params: StopTimerParams
): Effect.Effect<StopTimerResult, StopTimerError, HulyClient> =>
  Effect.gen(function*() {
    const { issue } = yield* findProjectAndIssue({
      project: params.project,
      identifier: params.identifier
    })

    const stoppedAt = Date.now()

    return {
      identifier: issue.identifier,
      stoppedAt
    }
  })
