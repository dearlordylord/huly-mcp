import {
  DetailedTimeReportSchema,
  getDetailedTimeReportParamsJsonSchema,
  getTimeReportParamsJsonSchema,
  listTimeSpendReportsParamsJsonSchema,
  listWorkSlotsParamsJsonSchema,
  logTimeParamsJsonSchema,
  parseGetDetailedTimeReportParams,
  parseGetTimeReportParams,
  parseListTimeSpendReportsParams,
  parseListWorkSlotsParams,
  parseLogTimeParams,
  parseStartTimerParams,
  parseStopTimerParams,
  startTimerParamsJsonSchema,
  stopTimerParamsJsonSchema,
  TimeReportSummarySchema
} from "../../domain/schemas.js"
import {
  ListTimeSpendReportsResultSchema,
  ListWorkSlotsResultSchema,
  LogTimeResultSchema,
  StartTimerResultSchema,
  StopTimerResultSchema
} from "../../domain/schemas/time.js"
import {
  getDetailedTimeReport,
  getTimeReport,
  listTimeSpendReports,
  listWorkSlots,
  logTime,
  startTimer,
  stopTimer
} from "../../huly/operations/time.js"
import { defineTool, type RegisteredTool } from "./registry.js"
const CATEGORY = "time tracking" as const
export const timeTools: ReadonlyArray<RegisteredTool> = [
  defineTool(
    {
      name: "log_time",
      description:
        "Log time spent on a Huly issue. Records a time entry with optional description. Time value is in minutes.",
      category: CATEGORY,
      inputSchema: logTimeParamsJsonSchema,
      resultSchema: LogTimeResultSchema
    },
    parseLogTimeParams,
    logTime
  ),
  defineTool(
    {
      name: "get_time_report",
      description:
        "Get time tracking report for a specific Huly issue. Shows total time, estimation, remaining time, and all time entries.",
      category: CATEGORY,
      inputSchema: getTimeReportParamsJsonSchema,
      resultSchema: TimeReportSummarySchema
    },
    parseGetTimeReportParams,
    getTimeReport
  ),
  defineTool(
    {
      name: "list_time_spend_reports",
      description:
        "List all time entries across issues. Supports filtering by project and date range. Returns entries sorted by date (newest first).",
      category: CATEGORY,
      inputSchema: listTimeSpendReportsParamsJsonSchema,
      resultSchema: ListTimeSpendReportsResultSchema
    },
    parseListTimeSpendReportsParams,
    listTimeSpendReports
  ),
  defineTool(
    {
      name: "get_detailed_time_report",
      description:
        "Get detailed time breakdown for a project. Shows total time grouped by issue and by employee. Supports date range filtering.",
      category: CATEGORY,
      inputSchema: getDetailedTimeReportParamsJsonSchema,
      resultSchema: DetailedTimeReportSchema
    },
    parseGetDetailedTimeReportParams,
    getDetailedTimeReport
  ),
  defineTool(
    {
      name: "list_work_slots",
      description:
        "List scheduled work slots created by schedule_todo, Huly UI, or other clients. Shows planned time blocks attached to ToDos. Supports filtering by employee and date range.",
      category: CATEGORY,
      inputSchema: listWorkSlotsParamsJsonSchema,
      resultSchema: ListWorkSlotsResultSchema
    },
    parseListWorkSlotsParams,
    listWorkSlots
  ),
  defineTool(
    {
      name: "start_timer",
      description:
        "Start a client-side timer on a Huly issue. Validates the issue exists and returns a start timestamp. Use log_time to record the elapsed time when done.",
      category: CATEGORY,
      inputSchema: startTimerParamsJsonSchema,
      resultSchema: StartTimerResultSchema
    },
    parseStartTimerParams,
    startTimer
  ),
  defineTool(
    {
      name: "stop_timer",
      description:
        "Stop a client-side timer on a Huly issue. Returns the stop timestamp. Calculate elapsed time from start/stop timestamps and use log_time to record it.",
      category: CATEGORY,
      inputSchema: stopTimerParamsJsonSchema,
      resultSchema: StopTimerResultSchema
    },
    parseStopTimerParams,
    stopTimer
  )
]
