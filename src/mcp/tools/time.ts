import {
  createWorkSlotParamsJsonSchema,
  CreateWorkSlotResultSchema,
  DetailedTimeReportSchema,
  getDetailedTimeReportParamsJsonSchema,
  getTimeReportParamsJsonSchema,
  listTimeSpendReportsParamsJsonSchema,
  ListTimeSpendReportsResultSchema,
  listWorkSlotsParamsJsonSchema,
  ListWorkSlotsResultSchema,
  logTimeParamsJsonSchema,
  LogTimeResultSchema,
  parseCreateWorkSlotParams,
  parseGetDetailedTimeReportParams,
  parseGetTimeReportParams,
  parseListTimeSpendReportsParams,
  parseListWorkSlotsParams,
  parseLogTimeParams,
  parseStartTimerParams,
  parseStopTimerParams,
  startTimerParamsJsonSchema,
  StartTimerResultSchema,
  stopTimerParamsJsonSchema,
  StopTimerResultSchema,
  TimeReportSummarySchema
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
import { createEncodedToolHandler, type RegisteredTool } from "./registry.js"

const CATEGORY = "time tracking" as const

export const timeTools: ReadonlyArray<RegisteredTool> = [
  {
    name: "log_time",
    description:
      "Log time spent on a Huly issue. Records a time entry with optional description. Time value is in minutes.",
    category: CATEGORY,
    inputSchema: logTimeParamsJsonSchema,
    handler: createEncodedToolHandler(
      "log_time",
      parseLogTimeParams,
      logTime,
      LogTimeResultSchema
    )
  },
  {
    name: "get_time_report",
    description:
      "Get time tracking report for a specific Huly issue. Shows total time, estimation, remaining time, and all time entries.",
    category: CATEGORY,
    inputSchema: getTimeReportParamsJsonSchema,
    handler: createEncodedToolHandler(
      "get_time_report",
      parseGetTimeReportParams,
      getTimeReport,
      TimeReportSummarySchema
    )
  },
  {
    name: "list_time_spend_reports",
    description:
      "List all time entries across issues. Supports filtering by project and date range. Returns entries sorted by date (newest first).",
    category: CATEGORY,
    inputSchema: listTimeSpendReportsParamsJsonSchema,
    handler: createEncodedToolHandler(
      "list_time_spend_reports",
      parseListTimeSpendReportsParams,
      listTimeSpendReports,
      ListTimeSpendReportsResultSchema
    )
  },
  {
    name: "get_detailed_time_report",
    description:
      "Get detailed time breakdown for a project. Shows total time grouped by issue and by employee. Supports date range filtering.",
    category: CATEGORY,
    inputSchema: getDetailedTimeReportParamsJsonSchema,
    handler: createEncodedToolHandler(
      "get_detailed_time_report",
      parseGetDetailedTimeReportParams,
      getDetailedTimeReport,
      DetailedTimeReportSchema
    )
  },
  {
    name: "list_work_slots",
    description:
      "List scheduled work slots. Shows planned time blocks attached to ToDos. Supports filtering by employee and date range.",
    category: CATEGORY,
    inputSchema: listWorkSlotsParamsJsonSchema,
    handler: createEncodedToolHandler(
      "list_work_slots",
      parseListWorkSlotsParams,
      listWorkSlots,
      ListWorkSlotsResultSchema
    )
  },
  {
    name: "create_work_slot",
    description:
      "Create a scheduled work slot when you already have a raw ToDo ID. If you only know the ToDo title, issue, or owner, use schedule_todo instead.",
    category: CATEGORY,
    inputSchema: createWorkSlotParamsJsonSchema,
    handler: createEncodedToolHandler(
      "create_work_slot",
      parseCreateWorkSlotParams,
      createWorkSlot,
      CreateWorkSlotResultSchema
    )
  },
  {
    name: "start_timer",
    description:
      "Start a client-side timer on a Huly issue. Validates the issue exists and returns a start timestamp. Use log_time to record the elapsed time when done.",
    category: CATEGORY,
    inputSchema: startTimerParamsJsonSchema,
    handler: createEncodedToolHandler(
      "start_timer",
      parseStartTimerParams,
      startTimer,
      StartTimerResultSchema
    )
  },
  {
    name: "stop_timer",
    description:
      "Stop a client-side timer on a Huly issue. Returns the stop timestamp. Calculate elapsed time from start/stop timestamps and use log_time to record it.",
    category: CATEGORY,
    inputSchema: stopTimerParamsJsonSchema,
    handler: createEncodedToolHandler(
      "stop_timer",
      parseStopTimerParams,
      stopTimer,
      StopTimerResultSchema
    )
  }
]
