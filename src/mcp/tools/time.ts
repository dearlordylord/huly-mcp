import {
  createWorkSlotParamsJsonSchema,
  getDetailedTimeReportParamsJsonSchema,
  getTimeReportParamsJsonSchema,
  listTimeSpendReportsParamsJsonSchema,
  listWorkSlotsParamsJsonSchema,
  logTimeParamsJsonSchema,
  parseCreateWorkSlotParams,
  parseGetDetailedTimeReportParams,
  parseGetTimeReportParams,
  parseListTimeSpendReportsParams,
  parseListWorkSlotsParams,
  parseLogTimeParams,
  parseStartTimerParams,
  parseStopTimerParams,
  startTimerParamsJsonSchema,
  stopTimerParamsJsonSchema
} from "../../domain/schemas.js"
import {
  createWorkSlot,
  getDetailedTimeReport,
  getTimeReport,
  listTimeSpendReports,
  listWorkSlots,
  logTime,
  startTimer,
  stopTimer
} from "../../huly/operations/time.js"
import { createToolHandler, type RegisteredTool } from "./registry.js"

const CATEGORY = "Time Tracking" as const

export const timeTools: ReadonlyArray<RegisteredTool> = [
  {
    name: "log_time",
    description:
      "Log time spent on a Huly issue. Records a time entry with optional description. Time value is in minutes.",
    category: CATEGORY,
    inputSchema: logTimeParamsJsonSchema,
    handler: createToolHandler(
      "log_time",
      parseLogTimeParams,
      (params) => logTime(params)
    )
  },
  {
    name: "get_time_report",
    description:
      "Get time tracking report for a specific Huly issue. Shows total time, estimation, remaining time, and all time entries.",
    category: CATEGORY,
    inputSchema: getTimeReportParamsJsonSchema,
    handler: createToolHandler(
      "get_time_report",
      parseGetTimeReportParams,
      (params) => getTimeReport(params)
    )
  },
  {
    name: "list_time_spend_reports",
    description:
      "List all time entries across issues. Supports filtering by project and date range. Returns entries sorted by date (newest first).",
    category: CATEGORY,
    inputSchema: listTimeSpendReportsParamsJsonSchema,
    handler: createToolHandler(
      "list_time_spend_reports",
      parseListTimeSpendReportsParams,
      (params) => listTimeSpendReports(params)
    )
  },
  {
    name: "get_detailed_time_report",
    description:
      "Get detailed time breakdown for a project. Shows total time grouped by issue and by employee. Supports date range filtering.",
    category: CATEGORY,
    inputSchema: getDetailedTimeReportParamsJsonSchema,
    handler: createToolHandler(
      "get_detailed_time_report",
      parseGetDetailedTimeReportParams,
      (params) => getDetailedTimeReport(params)
    )
  },
  {
    name: "list_work_slots",
    description:
      "List scheduled work slots. Shows planned time blocks attached to ToDos. Supports filtering by employee and date range.",
    category: CATEGORY,
    inputSchema: listWorkSlotsParamsJsonSchema,
    handler: createToolHandler(
      "list_work_slots",
      parseListWorkSlotsParams,
      (params) => listWorkSlots(params)
    )
  },
  {
    name: "create_work_slot",
    description: "Create a scheduled work slot. Attaches a time block to a ToDo for planning purposes.",
    category: CATEGORY,
    inputSchema: createWorkSlotParamsJsonSchema,
    handler: createToolHandler(
      "create_work_slot",
      parseCreateWorkSlotParams,
      (params) => createWorkSlot(params)
    )
  },
  {
    name: "start_timer",
    description:
      "Start a client-side timer on a Huly issue. Validates the issue exists and returns a start timestamp. Use log_time to record the elapsed time when done.",
    category: CATEGORY,
    inputSchema: startTimerParamsJsonSchema,
    handler: createToolHandler(
      "start_timer",
      parseStartTimerParams,
      (params) => startTimer(params)
    )
  },
  {
    name: "stop_timer",
    description:
      "Stop a client-side timer on a Huly issue. Returns the stop timestamp. Calculate elapsed time from start/stop timestamps and use log_time to record it.",
    category: CATEGORY,
    inputSchema: stopTimerParamsJsonSchema,
    handler: createToolHandler(
      "stop_timer",
      parseStopTimerParams,
      (params) => stopTimer(params)
    )
  }
]
