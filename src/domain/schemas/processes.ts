import { JSONSchema, Schema } from "effect"

import { CardId, LimitParam, MasterTagId, NonEmptyString, Timestamp } from "./shared.js"

export const ProcessId = NonEmptyString.pipe(Schema.brand("ProcessId"))
export type ProcessId = Schema.Schema.Type<typeof ProcessId>

export const ProcessIdentifier = NonEmptyString.pipe(Schema.brand("ProcessIdentifier"))
export type ProcessIdentifier = Schema.Schema.Type<typeof ProcessIdentifier>

export const ProcessExecutionId = NonEmptyString.pipe(Schema.brand("ProcessExecutionId"))
export type ProcessExecutionId = Schema.Schema.Type<typeof ProcessExecutionId>

export const ProcessStateId = NonEmptyString.pipe(Schema.brand("ProcessStateId"))
export type ProcessStateId = Schema.Schema.Type<typeof ProcessStateId>

export const ProcessCardIdentifier = NonEmptyString.pipe(Schema.brand("ProcessCardIdentifier"))
export type ProcessCardIdentifier = Schema.Schema.Type<typeof ProcessCardIdentifier>

export const ProcessMasterTagIdentifier = NonEmptyString.pipe(Schema.brand("ProcessMasterTagIdentifier"))
export type ProcessMasterTagIdentifier = Schema.Schema.Type<typeof ProcessMasterTagIdentifier>

export const ProcessExecutionStatusSchema = Schema.Literal("active", "done", "cancelled")
export type ProcessExecutionStatus = Schema.Schema.Type<typeof ProcessExecutionStatusSchema>

export const ProcessCandidateSchema = Schema.Struct({
  id: ProcessId,
  name: NonEmptyString,
  masterTagId: MasterTagId,
  masterTagName: Schema.optional(NonEmptyString)
})
export type ProcessCandidate = Schema.Schema.Type<typeof ProcessCandidateSchema>

export const ProcessSummarySchema = Schema.Struct({
  id: ProcessId,
  name: NonEmptyString,
  description: Schema.optional(Schema.String),
  masterTagId: MasterTagId,
  masterTagName: Schema.optional(NonEmptyString),
  autoStart: Schema.Boolean,
  automationOnly: Schema.Boolean,
  parallelExecutionForbidden: Schema.Boolean,
  stateCount: Schema.NonNegativeInt,
  transitionCount: Schema.NonNegativeInt
})
export type ProcessSummary = Schema.Schema.Type<typeof ProcessSummarySchema>

export const ProcessStateSummarySchema = Schema.Struct({
  id: ProcessStateId,
  title: NonEmptyString
})
export type ProcessStateSummary = Schema.Schema.Type<typeof ProcessStateSummarySchema>

export const ProcessTransitionSummarySchema = Schema.Struct({
  id: NonEmptyString,
  fromStateId: Schema.optional(ProcessStateId),
  fromStateTitle: Schema.optional(NonEmptyString),
  toStateId: ProcessStateId,
  toStateTitle: Schema.optional(NonEmptyString),
  triggerId: NonEmptyString,
  actionCount: Schema.NonNegativeInt
})
export type ProcessTransitionSummary = Schema.Schema.Type<typeof ProcessTransitionSummarySchema>

export const ProcessDetailSchema = ProcessSummarySchema.pipe(
  Schema.extend(Schema.Struct({
    initialStateId: Schema.optional(ProcessStateId),
    states: Schema.Array(ProcessStateSummarySchema),
    transitions: Schema.Array(ProcessTransitionSummarySchema)
  }))
)
export type ProcessDetail = Schema.Schema.Type<typeof ProcessDetailSchema>

export const ProcessExecutionSummarySchema = Schema.Struct({
  id: ProcessExecutionId,
  processId: ProcessId,
  processName: Schema.optional(NonEmptyString),
  cardId: CardId,
  cardTitle: Schema.optional(NonEmptyString),
  currentStateId: ProcessStateId,
  currentStateTitle: Schema.optional(NonEmptyString),
  status: ProcessExecutionStatusSchema,
  errorCount: Schema.NonNegativeInt,
  hasError: Schema.Boolean,
  hasParent: Schema.Boolean,
  parentExecutionId: Schema.optional(ProcessExecutionId),
  modifiedOn: Schema.optional(Timestamp)
})
export type ProcessExecutionSummary = Schema.Schema.Type<typeof ProcessExecutionSummarySchema>

export const ListProcessesParamsSchema = Schema.Struct({
  masterTag: Schema.optional(ProcessMasterTagIdentifier.annotations({
    description:
      "Optional master tag/card type ID or display label. Use this when you only want workflows attached to one Huly card/document type."
  })),
  limit: Schema.optional(LimitParam.annotations({
    description: "Maximum number of process definitions to return (default: 50, maximum: 200)."
  }))
}).annotations({
  title: "ListProcessesParams",
  description: "Parameters for listing Huly Process workflow definitions."
})
export type ListProcessesParams = Schema.Schema.Type<typeof ListProcessesParamsSchema>

export const GetProcessParamsSchema = Schema.Struct({
  process: ProcessIdentifier.annotations({
    description:
      "Process/workflow ID or exact display name. Ambiguous names fail with candidate IDs instead of guessing."
  })
}).annotations({
  title: "GetProcessParams",
  description: "Parameters for retrieving one Huly Process workflow definition."
})
export type GetProcessParams = Schema.Schema.Type<typeof GetProcessParamsSchema>

export const ListExecutionsParamsSchema = Schema.Struct({
  process: Schema.optional(ProcessIdentifier.annotations({
    description:
      "Optional process/workflow ID or exact display name. Ambiguous names fail with candidate IDs instead of guessing."
  })),
  card: Schema.optional(ProcessCardIdentifier.annotations({
    description:
      "Optional card/document ID or exact title. If a title matches multiple cards, the call fails with candidates."
  })),
  status: Schema.optional(ProcessExecutionStatusSchema.annotations({
    description: "Optional execution status filter: active, done, or cancelled."
  })),
  limit: Schema.optional(LimitParam.annotations({
    description: "Maximum number of executions to return (default: 50, maximum: 200)."
  }))
}).annotations({
  title: "ListExecutionsParams",
  description: "Parameters for listing read-only Huly Process workflow executions."
})
export type ListExecutionsParams = Schema.Schema.Type<typeof ListExecutionsParamsSchema>

export const ListProcessesResultSchema = Schema.Struct({
  processes: Schema.Array(ProcessSummarySchema),
  total: Schema.NonNegativeInt
})
export type ListProcessesResult = Schema.Schema.Type<typeof ListProcessesResultSchema>

export const ListExecutionsResultSchema = Schema.Struct({
  executions: Schema.Array(ProcessExecutionSummarySchema),
  total: Schema.NonNegativeInt
})
export type ListExecutionsResult = Schema.Schema.Type<typeof ListExecutionsResultSchema>

export const listProcessesParamsJsonSchema = JSONSchema.make(ListProcessesParamsSchema)
export const getProcessParamsJsonSchema = JSONSchema.make(GetProcessParamsSchema)
export const listExecutionsParamsJsonSchema = JSONSchema.make(ListExecutionsParamsSchema)

export const parseListProcessesParams = Schema.decodeUnknown(ListProcessesParamsSchema)
export const parseGetProcessParams = Schema.decodeUnknown(GetProcessParamsSchema)
export const parseListExecutionsParams = Schema.decodeUnknown(ListExecutionsParamsSchema)
