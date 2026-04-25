import { JSONSchema, Schema } from "effect"

import type { PersonName, PositiveNumber, Timestamp as TimestampBrand } from "./shared.js"
import {
  IssueIdentifier,
  LimitParam,
  NonEmptyString,
  ProjectIdentifier,
  TimeSpendReportId,
  Timestamp,
  TodoId,
  WorkSlotId
} from "./shared.js"

// No codec needed — internal type, not used for runtime validation
export interface TimeSpendReport {
  readonly id: TimeSpendReportId
  readonly identifier?: IssueIdentifier | undefined
  readonly employee?: PersonName | undefined
  readonly date?: number | null | undefined
  readonly value: number
  readonly description: string
}

export interface TimeReportSummary {
  readonly identifier?: IssueIdentifier | undefined
  readonly totalTime: number
  readonly estimation?: PositiveNumber | undefined
  readonly remainingTime?: PositiveNumber | undefined
  readonly reports: ReadonlyArray<TimeSpendReport>
}

export interface WorkSlot {
  readonly id: WorkSlotId
  readonly todoId: TodoId
  readonly date: TimestampBrand
  readonly dueDate: TimestampBrand
  readonly title?: string | undefined
}
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
      description: "Maximum number of entries to return (default: 50)"
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
      description: "Maximum number of slots to return (default: 50)"
    })
  )
}).annotations({
  title: "ListWorkSlotsParams",
  description: "Parameters for listing work slots"
})

export type ListWorkSlotsParams = Schema.Schema.Type<typeof ListWorkSlotsParamsSchema>

export const CreateWorkSlotParamsSchema = Schema.Struct({
  todoId: TodoId.annotations({
    description: "ToDo ID to attach the work slot to"
  }),
  date: Timestamp.annotations({
    description: "Start date timestamp"
  }),
  dueDate: Timestamp.annotations({
    description: "End date timestamp"
  })
}).annotations({
  title: "CreateWorkSlotParams",
  description: "Parameters for creating a work slot"
})

export type CreateWorkSlotParams = Schema.Schema.Type<typeof CreateWorkSlotParamsSchema>

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

// No codec needed — internal type, not used for runtime validation
export interface DetailedTimeReport {
  readonly project: ProjectIdentifier
  readonly totalTime: number
  readonly byIssue: ReadonlyArray<{
    readonly identifier: IssueIdentifier | undefined
    readonly issueTitle: string
    readonly totalTime: number
    readonly reports: ReadonlyArray<TimeSpendReport>
  }>
  readonly byEmployee: ReadonlyArray<{
    readonly employeeName: PersonName | undefined
    readonly totalTime: number
  }>
}
export const logTimeParamsJsonSchema = JSONSchema.make(LogTimeParamsSchema)
export const getTimeReportParamsJsonSchema = JSONSchema.make(GetTimeReportParamsSchema)
export const listTimeSpendReportsParamsJsonSchema = JSONSchema.make(ListTimeSpendReportsParamsSchema)
export const getDetailedTimeReportParamsJsonSchema = JSONSchema.make(GetDetailedTimeReportParamsSchema)
export const listWorkSlotsParamsJsonSchema = JSONSchema.make(ListWorkSlotsParamsSchema)
export const createWorkSlotParamsJsonSchema = JSONSchema.make(CreateWorkSlotParamsSchema)
export const startTimerParamsJsonSchema = JSONSchema.make(StartTimerParamsSchema)
export const stopTimerParamsJsonSchema = JSONSchema.make(StopTimerParamsSchema)

export const parseLogTimeParams = Schema.decodeUnknown(LogTimeParamsSchema)
export const parseGetTimeReportParams = Schema.decodeUnknown(GetTimeReportParamsSchema)
export const parseListTimeSpendReportsParams = Schema.decodeUnknown(ListTimeSpendReportsParamsSchema)
export const parseGetDetailedTimeReportParams = Schema.decodeUnknown(GetDetailedTimeReportParamsSchema)
export const parseListWorkSlotsParams = Schema.decodeUnknown(ListWorkSlotsParamsSchema)
export const parseCreateWorkSlotParams = Schema.decodeUnknown(CreateWorkSlotParamsSchema)
export const parseStartTimerParams = Schema.decodeUnknown(StartTimerParamsSchema)
export const parseStopTimerParams = Schema.decodeUnknown(StopTimerParamsSchema)

// No codec needed — internal type, not used for runtime validation
export interface LogTimeResult {
  readonly reportId: TimeSpendReportId
  readonly identifier: IssueIdentifier
}

export interface CreateWorkSlotResult {
  readonly slotId: WorkSlotId
}

export interface StartTimerResult {
  readonly identifier: IssueIdentifier
  readonly startedAt: TimestampBrand
}

export interface StopTimerResult {
  readonly identifier: IssueIdentifier
  readonly stoppedAt: TimestampBrand
  readonly reportId?: TimeSpendReportId | undefined
}

export const TimeSpendReportWireSchema = Schema.Struct({
  id: TimeSpendReportId,
  identifier: Schema.optional(IssueIdentifier),
  employee: Schema.optional(NonEmptyString),
  date: Schema.optional(Schema.NullOr(Timestamp)),
  value: Schema.Number,
  description: Schema.String
})

export const TimeReportSummarySchema = Schema.Struct({
  identifier: Schema.optional(IssueIdentifier),
  totalTime: Schema.Number,
  estimation: Schema.optional(Schema.Number.pipe(Schema.positive())),
  remainingTime: Schema.optional(Schema.Number.pipe(Schema.positive())),
  reports: Schema.Array(TimeSpendReportWireSchema)
})

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

export const LogTimeResultSchema = Schema.Struct({
  reportId: TimeSpendReportId,
  identifier: IssueIdentifier
})

export const CreateWorkSlotResultSchema = Schema.Struct({
  slotId: WorkSlotId
})

export const StartTimerResultSchema = Schema.Struct({
  identifier: IssueIdentifier,
  startedAt: Timestamp
})

export const StopTimerResultSchema = Schema.Struct({
  identifier: IssueIdentifier,
  stoppedAt: Timestamp,
  reportId: Schema.optional(TimeSpendReportId)
})

export const ListTimeSpendReportsResultSchema = Schema.Array(TimeSpendReportWireSchema)
export const ListWorkSlotsResultSchema = Schema.Array(WorkSlotWireSchema)
