import { AccessLevel } from "@hcengineering/calendar"
import type { Channel, Person } from "@hcengineering/contact"
import { type AttachedData, type DocumentUpdate, generateId, type Ref, SortingOrder } from "@hcengineering/core"
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
import { HulyClient, type HulyClientError } from "../client.js"
import { IssueNotFoundError, ProjectNotFoundError } from "../errors.js"

// eslint-disable-next-line @typescript-eslint/no-require-imports
const tracker = require("@hcengineering/tracker").default as typeof import("@hcengineering/tracker").default
// eslint-disable-next-line @typescript-eslint/no-require-imports
const contact = require("@hcengineering/contact").default as typeof import("@hcengineering/contact").default
// eslint-disable-next-line @typescript-eslint/no-require-imports
const time = require("@hcengineering/time").default as typeof import("@hcengineering/time").default

export type LogTimeError = HulyClientError | ProjectNotFoundError | IssueNotFoundError
export type GetTimeReportError = HulyClientError | ProjectNotFoundError | IssueNotFoundError
export type ListTimeSpendReportsError = HulyClientError | ProjectNotFoundError
export type GetDetailedTimeReportError = HulyClientError | ProjectNotFoundError
export type ListWorkSlotsError = HulyClientError
export type CreateWorkSlotError = HulyClientError
export type StartTimerError = HulyClientError | ProjectNotFoundError | IssueNotFoundError
export type StopTimerError = HulyClientError | ProjectNotFoundError | IssueNotFoundError

const parseIssueIdentifier = (
  identifier: string | number,
  projectIdentifier: string
): { fullIdentifier: string; number: number | null } => {
  const idStr = String(identifier).trim()
  const match = idStr.match(/^([A-Z]+)-(\d+)$/i)
  if (match) {
    return {
      fullIdentifier: `${match[1].toUpperCase()}-${match[2]}`,
      number: parseInt(match[2], 10)
    }
  }
  const numMatch = idStr.match(/^\d+$/)
  if (numMatch) {
    const num = parseInt(idStr, 10)
    return {
      fullIdentifier: `${projectIdentifier.toUpperCase()}-${num}`,
      number: num
    }
  }
  return { fullIdentifier: idStr, number: null }
}

const findProject = (
  projectIdentifier: string
): Effect.Effect<
  { client: HulyClient["Type"]; project: HulyProject },
  ProjectNotFoundError | HulyClientError,
  HulyClient
> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const project = yield* client.findOne<HulyProject>(
      tracker.class.Project,
      { identifier: projectIdentifier }
    )
    if (project === undefined) {
      return yield* new ProjectNotFoundError({ identifier: projectIdentifier })
    }
    return { client, project }
  })

const findProjectAndIssue = (
  params: { project: string; identifier: string }
): Effect.Effect<
  { client: HulyClient["Type"]; project: HulyProject; issue: HulyIssue },
  ProjectNotFoundError | IssueNotFoundError | HulyClientError,
  HulyClient
> =>
  Effect.gen(function*() {
    const { client, project } = yield* findProject(params.project)
    const { fullIdentifier, number } = parseIssueIdentifier(
      params.identifier,
      params.project
    )
    let issue = yield* client.findOne<HulyIssue>(
      tracker.class.Issue,
      { space: project._id, identifier: fullIdentifier }
    )
    if (issue === undefined && number !== null) {
      issue = yield* client.findOne<HulyIssue>(
        tracker.class.Issue,
        { space: project._id, number }
      )
    }
    if (issue === undefined) {
      return yield* new IssueNotFoundError({
        identifier: params.identifier,
        project: params.project
      })
    }
    return { client, project, issue }
  })

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

    return { reportId: String(reportId), identifier: issue.identifier }
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
        reports.filter(r => r.employee !== null).map(r => r.employee!)
      )
    ]

    const persons = employeeIds.length > 0
      ? yield* client.findAll<Person>(
        contact.class.Person,
        { _id: { $in: employeeIds } }
      )
      : []

    const personMap = new Map(persons.map(p => [String(p._id), p.name]))

    const timeReports: Array<TimeSpendReport> = reports.map(r => ({
      id: String(r._id),
      identifier: issue.identifier,
      employee: r.employee ? personMap.get(String(r.employee)) : undefined,
      date: r.date,
      value: r.value,
      description: r.description
    }))

    return {
      identifier: issue.identifier,
      totalTime: issue.reportedTime,
      estimation: issue.estimation > 0 ? issue.estimation : undefined,
      remainingTime: issue.remainingTime > 0 ? issue.remainingTime : undefined,
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

    const reports = yield* client.findAll<HulyTimeSpendReport>(
      tracker.class.TimeSpendReport,
      query,
      { limit, sort: { date: SortingOrder.Descending } }
    )

    const issueIds = [...new Set(reports.map(r => r.attachedTo))]
    const issues = issueIds.length > 0
      ? yield* client.findAll<HulyIssue>(
        tracker.class.Issue,
        { _id: { $in: issueIds } }
      )
      : []
    const issueMap = new Map(issues.map(i => [String(i._id), i.identifier]))

    const employeeIds = [
      ...new Set(
        reports.filter(r => r.employee !== null).map(r => r.employee!)
      )
    ]
    const persons = employeeIds.length > 0
      ? yield* client.findAll<Person>(
        contact.class.Person,
        { _id: { $in: employeeIds } }
      )
      : []
    const personMap = new Map(persons.map(p => [String(p._id), p.name]))

    return reports.map(r => ({
      id: String(r._id),
      identifier: issueMap.get(String(r.attachedTo)) ?? "Unknown",
      employee: r.employee ? personMap.get(String(r.employee)) : undefined,
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

    const reports = yield* client.findAll<HulyTimeSpendReport>(
      tracker.class.TimeSpendReport,
      query,
      { sort: { date: SortingOrder.Descending } }
    )

    const issueIds = [...new Set(reports.map(r => r.attachedTo))]
    const issues = issueIds.length > 0
      ? yield* client.findAll<HulyIssue>(
        tracker.class.Issue,
        { _id: { $in: issueIds } }
      )
      : []
    const issueMap = new Map(issues.map(i => [String(i._id), i]))

    const employeeIds = [
      ...new Set(
        reports.filter(r => r.employee !== null).map(r => r.employee!)
      )
    ]
    const persons = employeeIds.length > 0
      ? yield* client.findAll<Person>(
        contact.class.Person,
        { _id: { $in: employeeIds } }
      )
      : []
    const personMap = new Map(persons.map(p => [String(p._id), p.name]))

    const byIssueMap = new Map<string, {
      identifier: string
      issueTitle: string
      totalTime: number
      reports: Array<TimeSpendReport>
    }>()

    const byEmployeeMap = new Map<string, { employeeName: string | undefined; totalTime: number }>()

    let totalTime = 0

    for (const r of reports) {
      totalTime += r.value

      const issueKey = String(r.attachedTo)
      const issue = issueMap.get(issueKey)
      const existing = byIssueMap.get(issueKey) ?? {
        identifier: issue?.identifier ?? "Unknown",
        issueTitle: issue?.title ?? "Unknown",
        totalTime: 0,
        reports: []
      }
      existing.totalTime += r.value
      existing.reports.push({
        id: String(r._id),
        identifier: issue?.identifier ?? "Unknown",
        employee: r.employee ? personMap.get(String(r.employee)) : undefined,
        date: r.date,
        value: r.value,
        description: r.description
      })
      byIssueMap.set(issueKey, existing)

      const empKey = r.employee ? String(r.employee) : "__unassigned__"
      const empExisting = byEmployeeMap.get(empKey) ?? {
        employeeName: r.employee ? personMap.get(String(r.employee)) : undefined,
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
      // Huly API: Person._id is a branded string, cast required from user input
      const person = yield* client.findOne<Person>(
        contact.class.Person,
        { _id: params.employeeId as Ref<Person> }
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

    type HulyWorkSlot = import("@hcengineering/time").WorkSlot

    const slots = yield* client.findAll<HulyWorkSlot>(
      time.class.WorkSlot,
      query,
      { limit, sort: { date: SortingOrder.Descending } }
    )

    return slots.map(s => ({
      id: String(s._id),
      todoId: String(s.attachedTo),
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

    type HulyWorkSlot = import("@hcengineering/time").WorkSlot
    type HulyToDo = import("@hcengineering/time").ToDo

    const slotId: Ref<HulyWorkSlot> = generateId()

    // Huly API: WorkSlot requires all calendar event fields even for simple slots.
    // Null casts are required because server will populate calendar/user from context.
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
      calendar: null as unknown as Ref<import("@hcengineering/calendar").Calendar>,
      user: null as unknown as import("@hcengineering/core").PersonId,
      blockTime: false
    }

    // Huly API: todoId is a branded Ref string, cast required from user input
    yield* client.addCollection(
      time.class.WorkSlot,
      time.space.ToDos,
      params.todoId as Ref<HulyToDo>,
      time.class.ToDo,
      "workslots",
      slotData,
      slotId
    )

    return { slotId: String(slotId) }
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
