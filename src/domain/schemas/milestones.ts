import { JSONSchema, Schema } from "effect"

import { clearableText } from "./clearable.js"
import {
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  DEFAULT_LIMIT,
  enumValuesDescription,
  hasAtLeastOneDefined,
  IssueIdentifier,
  LimitParam,
  MilestoneId,
  MilestoneIdentifier,
  MilestoneLabel,
  ProjectIdentifier,
  Timestamp,
  withAtLeastOneRequired
} from "./shared.js"

export const MilestoneStatusValues = ["planned", "in-progress", "completed", "canceled"] as const

export const MilestoneStatusSchema = Schema.Literal(...MilestoneStatusValues).annotations({
  title: "MilestoneStatus",
  description: `Milestone status: ${enumValuesDescription(MilestoneStatusValues)}`
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
      description: `Maximum number of milestones to return (default: ${DEFAULT_LIMIT})`
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
  label: MilestoneLabel.annotations({
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

export const UPDATE_MILESTONE_FIELDS = [
  "label",
  "description",
  "targetDate",
  "status"
] as const satisfies ReadonlyArray<"label" | "description" | "targetDate" | "status">

export const UpdateMilestoneParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotations({
    description: "Project identifier (e.g., 'HULY')"
  }),
  milestone: MilestoneIdentifier.annotations({
    description: "Milestone ID or label"
  }),
  label: Schema.optional(MilestoneLabel.annotations({
    description: "New milestone name/label"
  })),
  description: Schema.optional(clearableText("New milestone description (markdown supported).")),
  targetDate: Schema.optional(Timestamp.annotations({
    description: "New target date as Unix timestamp in milliseconds"
  })),
  status: Schema.optional(MilestoneStatusSchema.annotations({
    description: "New milestone status"
  }))
}).pipe(
  Schema.filter((params) =>
    hasAtLeastOneDefined(params, UPDATE_MILESTONE_FIELDS)
      ? undefined
      : atLeastOneUpdateFieldMessage(UPDATE_MILESTONE_FIELDS)
  )
).annotations({
  title: "UpdateMilestoneParams",
  description: `Parameters for updating a milestone. ${atLeastOneUpdateFieldMessage(UPDATE_MILESTONE_FIELDS)}`
})

export type UpdateMilestoneParams = Schema.Schema.Type<typeof UpdateMilestoneParamsSchema>
assertUpdateFields<UpdateMilestoneParams>()(["project", "milestone"], UPDATE_MILESTONE_FIELDS)

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
export const updateMilestoneParamsJsonSchema = withAtLeastOneRequired(
  JSONSchema.make(UpdateMilestoneParamsSchema),
  UPDATE_MILESTONE_FIELDS
)
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
export const CreateMilestoneResultSchema = Schema.Struct({
  id: MilestoneId,
  label: MilestoneLabel
})
export type CreateMilestoneResult = Schema.Schema.Type<typeof CreateMilestoneResultSchema>
export const UpdateMilestoneResultSchema = Schema.Struct({
  id: MilestoneId,
  updated: Schema.Boolean
})
export type UpdateMilestoneResult = Schema.Schema.Type<typeof UpdateMilestoneResultSchema>
export const SetIssueMilestoneResultSchema = Schema.Struct({
  identifier: IssueIdentifier,
  milestoneSet: Schema.Boolean
})
export type SetIssueMilestoneResult = Schema.Schema.Type<typeof SetIssueMilestoneResultSchema>
export const DeleteMilestoneResultSchema = Schema.Struct({
  id: MilestoneId,
  deleted: Schema.Boolean
})
export type DeleteMilestoneResult = Schema.Schema.Type<typeof DeleteMilestoneResultSchema>

export const ListMilestonesResultSchema = Schema.Array(MilestoneSummarySchema)
export const GetMilestoneResultSchema = MilestoneSchema
