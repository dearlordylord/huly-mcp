import { JSONSchema, Schema } from "effect"

import {
  IssueIdentifier,
  LimitParam,
  MilestoneId,
  MilestoneIdentifier,
  MilestoneLabel,
  NonEmptyString,
  ProjectIdentifier,
  Timestamp
} from "./shared.js"

export const MilestoneStatusValues = ["planned", "in-progress", "completed", "canceled"] as const

export const MilestoneStatusSchema = Schema.Literal(...MilestoneStatusValues).annotations({
  title: "MilestoneStatus",
  description: "Milestone status"
})

export type MilestoneStatus = Schema.Schema.Type<typeof MilestoneStatusSchema>

export const MilestoneSummarySchema = Schema.Struct({
  id: MilestoneId,
  label: MilestoneLabel,
  status: MilestoneStatusSchema,
  targetDate: Timestamp,
  modifiedOn: Schema.optional(Timestamp)
}).annotations({
  title: "MilestoneSummary",
  description: "Milestone summary for list operations"
})

export type MilestoneSummary = Schema.Schema.Type<typeof MilestoneSummarySchema>

export const MilestoneSchema = Schema.Struct({
  id: MilestoneId,
  label: MilestoneLabel,
  description: Schema.optional(Schema.String),
  status: MilestoneStatusSchema,
  targetDate: Timestamp,
  project: ProjectIdentifier,
  modifiedOn: Schema.optional(Timestamp),
  createdOn: Schema.optional(Timestamp)
}).annotations({
  title: "Milestone",
  description: "Full milestone with all fields"
})

export type Milestone = Schema.Schema.Type<typeof MilestoneSchema>

export const ListMilestonesParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotations({
    description: "Project identifier (e.g., 'HULY')"
  }),
  limit: Schema.optional(
    LimitParam.annotations({
      description: "Maximum number of milestones to return (default: 50)"
    })
  )
}).annotations({
  title: "ListMilestonesParams",
  description: "Parameters for listing milestones"
})

export type ListMilestonesParams = Schema.Schema.Type<typeof ListMilestonesParamsSchema>

export const GetMilestoneParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotations({
    description: "Project identifier (e.g., 'HULY')"
  }),
  milestone: MilestoneIdentifier.annotations({
    description: "Milestone ID or label"
  })
}).annotations({
  title: "GetMilestoneParams",
  description: "Parameters for getting a single milestone"
})

export type GetMilestoneParams = Schema.Schema.Type<typeof GetMilestoneParamsSchema>

export const CreateMilestoneParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotations({
    description: "Project identifier (e.g., 'HULY')"
  }),
  label: NonEmptyString.annotations({
    description: "Milestone name/label"
  }),
  description: Schema.optional(Schema.String.annotations({
    description: "Milestone description (markdown supported)"
  })),
  targetDate: Timestamp.annotations({
    description: "Target date as Unix timestamp in milliseconds"
  })
}).annotations({
  title: "CreateMilestoneParams",
  description: "Parameters for creating a milestone"
})

export type CreateMilestoneParams = Schema.Schema.Type<typeof CreateMilestoneParamsSchema>

export const UpdateMilestoneParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotations({
    description: "Project identifier (e.g., 'HULY')"
  }),
  milestone: MilestoneIdentifier.annotations({
    description: "Milestone ID or label"
  }),
  label: Schema.optional(NonEmptyString.annotations({
    description: "New milestone name/label"
  })),
  description: Schema.optional(Schema.String.annotations({
    description: "New milestone description (markdown supported)"
  })),
  targetDate: Schema.optional(Timestamp.annotations({
    description: "New target date as Unix timestamp in milliseconds"
  })),
  status: Schema.optional(MilestoneStatusSchema.annotations({
    description: "New milestone status"
  }))
}).annotations({
  title: "UpdateMilestoneParams",
  description: "Parameters for updating a milestone"
})

export type UpdateMilestoneParams = Schema.Schema.Type<typeof UpdateMilestoneParamsSchema>

export const SetIssueMilestoneParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotations({
    description: "Project identifier (e.g., 'HULY')"
  }),
  identifier: IssueIdentifier.annotations({
    description: "Issue identifier (e.g., 'HULY-123')"
  }),
  milestone: Schema.NullOr(MilestoneIdentifier).annotations({
    description: "Milestone ID or label (null to clear)"
  })
}).annotations({
  title: "SetIssueMilestoneParams",
  description: "Parameters for setting milestone on an issue"
})

export type SetIssueMilestoneParams = Schema.Schema.Type<typeof SetIssueMilestoneParamsSchema>

export const DeleteMilestoneParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotations({
    description: "Project identifier (e.g., 'HULY')"
  }),
  milestone: MilestoneIdentifier.annotations({
    description: "Milestone ID or label"
  })
}).annotations({
  title: "DeleteMilestoneParams",
  description: "Parameters for deleting a milestone"
})

export type DeleteMilestoneParams = Schema.Schema.Type<typeof DeleteMilestoneParamsSchema>

export const listMilestonesParamsJsonSchema = JSONSchema.make(ListMilestonesParamsSchema)
export const getMilestoneParamsJsonSchema = JSONSchema.make(GetMilestoneParamsSchema)
export const createMilestoneParamsJsonSchema = JSONSchema.make(CreateMilestoneParamsSchema)
export const updateMilestoneParamsJsonSchema = JSONSchema.make(UpdateMilestoneParamsSchema)
export const setIssueMilestoneParamsJsonSchema = JSONSchema.make(SetIssueMilestoneParamsSchema)
export const deleteMilestoneParamsJsonSchema = JSONSchema.make(DeleteMilestoneParamsSchema)

export const parseMilestone = Schema.decodeUnknown(MilestoneSchema)
export const parseMilestoneSummary = Schema.decodeUnknown(MilestoneSummarySchema)
export const parseListMilestonesParams = Schema.decodeUnknown(ListMilestonesParamsSchema)
export const parseGetMilestoneParams = Schema.decodeUnknown(GetMilestoneParamsSchema)
export const parseCreateMilestoneParams = Schema.decodeUnknown(CreateMilestoneParamsSchema)
export const parseUpdateMilestoneParams = Schema.decodeUnknown(UpdateMilestoneParamsSchema)
export const parseSetIssueMilestoneParams = Schema.decodeUnknown(SetIssueMilestoneParamsSchema)
export const parseDeleteMilestoneParams = Schema.decodeUnknown(DeleteMilestoneParamsSchema)

// --- Result Schemas ---

export const CreateMilestoneResultSchema = Schema.Struct({
  id: MilestoneId,
  label: MilestoneLabel
}).annotations({ title: "CreateMilestoneResult", description: "Result of create milestone operation" })
export type CreateMilestoneResult = Schema.Schema.Type<typeof CreateMilestoneResultSchema>

export const UpdateMilestoneResultSchema = Schema.Struct({
  id: MilestoneId,
  updated: Schema.Boolean
}).annotations({ title: "UpdateMilestoneResult", description: "Result of update milestone operation" })
export type UpdateMilestoneResult = Schema.Schema.Type<typeof UpdateMilestoneResultSchema>

export const SetIssueMilestoneResultSchema = Schema.Struct({
  identifier: IssueIdentifier,
  milestoneSet: Schema.Boolean
}).annotations({ title: "SetIssueMilestoneResult", description: "Result of set issue milestone operation" })
export type SetIssueMilestoneResult = Schema.Schema.Type<typeof SetIssueMilestoneResultSchema>

export const DeleteMilestoneResultSchema = Schema.Struct({
  id: MilestoneId,
  deleted: Schema.Boolean
}).annotations({ title: "DeleteMilestoneResult", description: "Result of delete milestone operation" })
export type DeleteMilestoneResult = Schema.Schema.Type<typeof DeleteMilestoneResultSchema>
