import { JSONSchema, Schema } from "effect"

import {
  DEFAULT_LIMIT,
  IssueIdentifier,
  LimitParam,
  NonEmptyString,
  ProjectIdentifier,
  TimeSpendReportId,
  Timestamp,
  Timestamp as TimestampBrand,
  TodoId,
  WorkSlotId
} from "./shared.js"
export const TimeSpendReportSchema = Schema.Struct({
  id: TimeSpendReportId,
  identifier: Schema.optional(IssueIdentifier),
  employee: Schema.optional(NonEmptyString),
  date: Schema.optional(Schema.NullOr(Timestamp)),
  value: Schema.Number,
  description: Schema.String
})
export type TimeSpendReport = Schema.Schema.Type<typeof TimeSpendReportSchema>
export const WorkSlotSchema = Schema.Struct({
  id: WorkSlotId,
  todoId: TodoId,
  date: TimestampBrand,
  dueDate: TimestampBrand,
  title: Schema.optional(Schema.String)
})
export type WorkSlot = Schema.Schema.Type<typeof WorkSlotSchema>
export const LogTimeParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotations({
    description: "Project identifier (e.g., 'HULY')"
  }),
  identifier: IssueIdentifier.annotations({
    description: "Issue identifier (e.g., 'HULY-123' or just '123')"
  }),
  value: Schema.Number.pipe(
    Schema.positive()
  ).annotations({
    description: "Time spent in minutes"
  }),
  description: Schema.optional(Schema.String.annotations({
    description: "Description of work done"
  }))
}).annotations({
  title: "LogTimeParams",
  description: "Parameters for logging time on an issue"
})

export type LogTimeParams = Schema.Schema.Type<typeof LogTimeParamsSchema>

export const GetTimeReportParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotations({
    description: "Project identifier (e.g., 'HULY')"
  }),
  identifier: IssueIdentifier.annotations({
    description: "Issue identifier (e.g., 'HULY-123' or just '123')"
  })
}).annotations({
  title: "GetTimeReportParams",
  description: "Parameters for getting time report for an issue"
})

export type GetTimeReportParams = Schema.Schema.Type<typeof GetTimeReportParamsSchema>

export const ListTimeSpendReportsParamsSchema = Schema.Struct({
  project: Schema.optional(ProjectIdentifier.annotations({
    description: "Filter by project identifier"
  })),
  from: Schema.optional(Timestamp.annotations({
    description: "Filter entries from this timestamp"
  })),
  to: Schema.optional(Timestamp.annotations({
    description: "Filter entries until this timestamp"
  })),
  limit: Schema.optional(
    LimitParam.annotations({
      description: `Maximum number of entries to return (default: ${DEFAULT_LIMIT})`
    })
  )
}).annotations({
  title: "ListTimeSpendReportsParams",
  description: "Parameters for listing time spend reports"
})

export type ListTimeSpendReportsParams = Schema.Schema.Type<typeof ListTimeSpendReportsParamsSchema>

export const GetDetailedTimeReportParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotations({
    description: "Project identifier (e.g., 'HULY')"
  }),
  from: Schema.optional(Timestamp.annotations({
    description: "Filter entries from this timestamp"
  })),
  to: Schema.optional(Timestamp.annotations({
    description: "Filter entries until this timestamp"
  }))
}).annotations({
  title: "GetDetailedTimeReportParams",
  description: "Parameters for getting detailed time breakdown"
})

export type GetDetailedTimeReportParams = Schema.Schema.Type<typeof GetDetailedTimeReportParamsSchema>

export const ListWorkSlotsParamsSchema = Schema.Struct({
  employeeId: Schema.optional(NonEmptyString.annotations({
    description: "Filter by employee ID or email"
  })),
  from: Schema.optional(Timestamp.annotations({
    description: "Filter slots from this timestamp"
  })),
  to: Schema.optional(Timestamp.annotations({
    description: "Filter slots until this timestamp"
  })),
  limit: Schema.optional(
    LimitParam.annotations({
      description: `Maximum number of slots to return (default: ${DEFAULT_LIMIT})`
    })
  )
}).annotations({
  title: "ListWorkSlotsParams",
  description: "Parameters for listing work slots"
})

export type ListWorkSlotsParams = Schema.Schema.Type<typeof ListWorkSlotsParamsSchema>

export const StartTimerParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotations({
    description: "Project identifier (e.g., 'HULY')"
  }),
  identifier: IssueIdentifier.annotations({
    description: "Issue identifier (e.g., 'HULY-123' or just '123')"
  })
}).annotations({
  title: "StartTimerParams",
  description: "Parameters for starting a timer on an issue"
})

export type StartTimerParams = Schema.Schema.Type<typeof StartTimerParamsSchema>

export const StopTimerParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotations({
    description: "Project identifier (e.g., 'HULY')"
  }),
  identifier: IssueIdentifier.annotations({
    description: "Issue identifier (e.g., 'HULY-123' or just '123')"
  })
}).annotations({
  title: "StopTimerParams",
  description: "Parameters for stopping a timer on an issue"
})

export type StopTimerParams = Schema.Schema.Type<typeof StopTimerParamsSchema>
export const logTimeParamsJsonSchema = JSONSchema.make(LogTimeParamsSchema)
export const getTimeReportParamsJsonSchema = JSONSchema.make(GetTimeReportParamsSchema)
export const listTimeSpendReportsParamsJsonSchema = JSONSchema.make(ListTimeSpendReportsParamsSchema)
export const getDetailedTimeReportParamsJsonSchema = JSONSchema.make(GetDetailedTimeReportParamsSchema)
export const listWorkSlotsParamsJsonSchema = JSONSchema.make(ListWorkSlotsParamsSchema)
export const startTimerParamsJsonSchema = JSONSchema.make(StartTimerParamsSchema)
export const stopTimerParamsJsonSchema = JSONSchema.make(StopTimerParamsSchema)

export const parseLogTimeParams = Schema.decodeUnknown(LogTimeParamsSchema)
export const parseGetTimeReportParams = Schema.decodeUnknown(GetTimeReportParamsSchema)
export const parseListTimeSpendReportsParams = Schema.decodeUnknown(ListTimeSpendReportsParamsSchema)
export const parseGetDetailedTimeReportParams = Schema.decodeUnknown(GetDetailedTimeReportParamsSchema)
export const parseListWorkSlotsParams = Schema.decodeUnknown(ListWorkSlotsParamsSchema)
export const parseStartTimerParams = Schema.decodeUnknown(StartTimerParamsSchema)
export const parseStopTimerParams = Schema.decodeUnknown(StopTimerParamsSchema)

export const TimeSpendReportWireSchema = TimeSpendReportSchema

export const TimeReportSummarySchema = Schema.Struct({
  identifier: Schema.optional(IssueIdentifier),
  totalTime: Schema.Number,
  estimation: Schema.optional(Schema.Number.pipe(Schema.positive())),
  remainingTime: Schema.optional(Schema.Number.pipe(Schema.positive())),
  reports: Schema.Array(TimeSpendReportWireSchema)
})
export type TimeReportSummary = Schema.Schema.Type<typeof TimeReportSummarySchema>

export const WorkSlotWireSchema = Schema.Struct({
  id: WorkSlotId,
  todoId: TodoId,
  date: Timestamp,
  dueDate: Timestamp,
  title: Schema.optional(Schema.String)
})

export const DetailedTimeReportSchema = Schema.Struct({
  project: ProjectIdentifier,
  totalTime: Schema.Number,
  byIssue: Schema.Array(
    Schema.Struct({
      identifier: Schema.optional(IssueIdentifier),
      issueTitle: Schema.String,
      totalTime: Schema.Number,
      reports: Schema.Array(TimeSpendReportWireSchema)
    })
  ),
  byEmployee: Schema.Array(
    Schema.Struct({
      employeeName: Schema.optional(NonEmptyString),
      totalTime: Schema.Number
    })
  )
})
export type DetailedTimeReport = Schema.Schema.Type<typeof DetailedTimeReportSchema>

export const LogTimeResultSchema = Schema.Struct({
  reportId: TimeSpendReportId,
  identifier: IssueIdentifier
})
export type LogTimeResult = Schema.Schema.Type<typeof LogTimeResultSchema>

export const StartTimerResultSchema = Schema.Struct({
  identifier: IssueIdentifier,
  startedAt: Timestamp
})
export type StartTimerResult = Schema.Schema.Type<typeof StartTimerResultSchema>

export const StopTimerResultSchema = Schema.Struct({
  identifier: IssueIdentifier,
  stoppedAt: Timestamp,
  reportId: Schema.optional(TimeSpendReportId)
})
export type StopTimerResult = Schema.Schema.Type<typeof StopTimerResultSchema>

export const ListTimeSpendReportsResultSchema = Schema.Array(TimeSpendReportSchema)
export const ListWorkSlotsResultSchema = Schema.Array(WorkSlotWireSchema)
