import { Schema } from "effect"

import {
  IssueIdentifier,
  LimitParam,
  makeJsonSchema,
  NonEmptyString,
  PersonName,
  ProjectIdentifier,
  TimeSpendReportId,
  Timestamp,
  TodoId
} from "./shared.js"

export const TimeSpendReportSchema = Schema.Struct({
  id: TimeSpendReportId,
  identifier: IssueIdentifier.annotations({ description: "Issue identifier (e.g., 'HULY-123')" }),
  employee: Schema.optional(PersonName),
  date: Schema.optional(Schema.NullOr(Timestamp)),
  value: Schema.Number.annotations({ description: "Time spent in minutes" }),
  description: Schema.String
}).annotations({
  title: "TimeSpendReport",
  description: "Time tracking entry for an issue"
})

export type TimeSpendReport = Schema.Schema.Type<typeof TimeSpendReportSchema>

export const TimeReportSummarySchema = Schema.Struct({
  identifier: IssueIdentifier.annotations({ description: "Issue identifier (e.g., 'HULY-123')" }),
  totalTime: Schema.Number.annotations({ description: "Total time in minutes" }),
  estimation: Schema.optional(Schema.Number.annotations({ description: "Estimated time in minutes" })),
  remainingTime: Schema.optional(Schema.Number.annotations({ description: "Remaining time in minutes" })),
  reports: Schema.Array(TimeSpendReportSchema)
}).annotations({
  title: "TimeReportSummary",
  description: "Time report summary for an issue"
})

export type TimeReportSummary = Schema.Schema.Type<typeof TimeReportSummarySchema>

export const WorkSlotSchema = Schema.Struct({
  id: NonEmptyString,
  todoId: TodoId,
  date: Timestamp.annotations({ description: "Start date timestamp" }),
  dueDate: Timestamp.annotations({ description: "End date timestamp" }),
  title: Schema.optional(Schema.String)
}).annotations({
  title: "WorkSlot",
  description: "A scheduled work slot"
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

export const DetailedTimeReportSchema = Schema.Struct({
  project: ProjectIdentifier,
  totalTime: Schema.Number.annotations({ description: "Total time in minutes" }),
  byIssue: Schema.Array(Schema.Struct({
    identifier: IssueIdentifier.annotations({ description: "Issue identifier (e.g., 'HULY-123')" }),
    issueTitle: Schema.String,
    totalTime: Schema.Number,
    reports: Schema.Array(TimeSpendReportSchema)
  })),
  byEmployee: Schema.Array(Schema.Struct({
    employeeName: Schema.optional(Schema.String),
    totalTime: Schema.Number
  }))
}).annotations({
  title: "DetailedTimeReport",
  description: "Detailed time breakdown for a project"
})

export type DetailedTimeReport = Schema.Schema.Type<typeof DetailedTimeReportSchema>

export const logTimeParamsJsonSchema = makeJsonSchema(LogTimeParamsSchema)
export const getTimeReportParamsJsonSchema = makeJsonSchema(GetTimeReportParamsSchema)
export const listTimeSpendReportsParamsJsonSchema = makeJsonSchema(ListTimeSpendReportsParamsSchema)
export const getDetailedTimeReportParamsJsonSchema = makeJsonSchema(GetDetailedTimeReportParamsSchema)
export const listWorkSlotsParamsJsonSchema = makeJsonSchema(ListWorkSlotsParamsSchema)
export const createWorkSlotParamsJsonSchema = makeJsonSchema(CreateWorkSlotParamsSchema)
export const startTimerParamsJsonSchema = makeJsonSchema(StartTimerParamsSchema)
export const stopTimerParamsJsonSchema = makeJsonSchema(StopTimerParamsSchema)

export const parseLogTimeParams = Schema.decodeUnknown(LogTimeParamsSchema)
export const parseGetTimeReportParams = Schema.decodeUnknown(GetTimeReportParamsSchema)
export const parseListTimeSpendReportsParams = Schema.decodeUnknown(ListTimeSpendReportsParamsSchema)
export const parseGetDetailedTimeReportParams = Schema.decodeUnknown(GetDetailedTimeReportParamsSchema)
export const parseListWorkSlotsParams = Schema.decodeUnknown(ListWorkSlotsParamsSchema)
export const parseCreateWorkSlotParams = Schema.decodeUnknown(CreateWorkSlotParamsSchema)
export const parseStartTimerParams = Schema.decodeUnknown(StartTimerParamsSchema)
export const parseStopTimerParams = Schema.decodeUnknown(StopTimerParamsSchema)
