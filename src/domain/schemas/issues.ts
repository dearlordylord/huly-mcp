import { Effect, Schema, SchemaGetter, SchemaIssue } from "effect"

import { normalizeForComparison } from "../../utils/normalize.js"
import { clearableText } from "./clearable.js"
import { toDraft07JsonSchema } from "./json-schema.js"
import {
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  ColorCode,
  ComponentIdentifier,
  Count,
  DEFAULT_COLOR_INDEX,
  DEFAULT_LIMIT,
  Email,
  enumValuesDescription,
  hasAtLeastOneDefined,
  IssueId,
  IssueIdentifier,
  LimitParam,
  MAX_COLOR_INDEX,
  MilestoneId,
  MilestoneIdentifier,
  MilestoneLabel,
  NonEmptyString,
  PersonId,
  PersonName,
  PersonRefInput,
  ProjectIdentifier,
  StatusName,
  Timestamp,
  withAtLeastOneRequired
} from "./shared.js"
import {
  type KnownStatusCategoryValue,
  KnownStatusCategoryValueSchema,
  StatusCategoryValues,
  TaskTypeRefSchema
} from "./task-management.js"
import { PositiveTimeHours, timeHoursDescription } from "./time.js"

export type IssueStatusCategoryFilter = KnownStatusCategoryValue

export const IssuePriorityValues = ["urgent", "high", "medium", "low", "no-priority"] as const

const IssuePriorityLiteral = Schema.Literals(IssuePriorityValues)

const normalizedPriorityLookup = new Map(IssuePriorityValues.map((v) => [normalizeForComparison(v), v] as const))

export const IssuePrioritySchema = Schema.String.pipe(
  Schema.decodeTo(IssuePriorityLiteral, {
    decode: SchemaGetter.transformOrFail((input, options) => {
      const match = normalizedPriorityLookup.get(normalizeForComparison(input))
      return match !== undefined
        ? Effect.succeed(match)
        : Effect.fail(
            new SchemaIssue.InvalidValue(
              { message: `Expected one of: ${enumValuesDescription(IssuePriorityValues)}` },
              input,
              options
            )
          )
    }),
    encode: SchemaGetter.passthrough()
  })
).annotate({
  title: "IssuePriority",
  description: `Issue priority level: ${enumValuesDescription(IssuePriorityValues)}`,
  jsonSchema: { type: "string", enum: [...IssuePriorityValues] }
})

export type IssuePriority = Schema.Schema.Type<typeof IssuePrioritySchema>
export const DEFAULT_ISSUE_PRIORITY: IssuePriority = "no-priority"

export const LabelSchema = Schema.Struct({
  title: NonEmptyString.annotate({ description: "Human-readable label title." }),
  color: Schema.optional(
    ColorCode.annotate({ description: "Huly palette color when the attached label reference contains a valid color." })
  )
}).annotate({
  title: "Label",
  description: "Human-readable issue label summary projected from a Huly label attachment."
})

export type Label = Schema.Schema.Type<typeof LabelSchema>

export const PersonRefSchema = Schema.Struct({
  id: PersonId.annotate({ description: "Stable Huly Person ID, never a SocialIdentity ID." }),
  name: Schema.optionalKey(PersonName),
  email: Schema.optionalKey(Email)
}).annotate({ title: "PersonRef", description: "Stable person reference with optional readable identity metadata." })

export type PersonRef = Schema.Schema.Type<typeof PersonRefSchema>

export const IssueMilestoneRefSchema = Schema.Struct({ id: MilestoneId, label: MilestoneLabel }).annotate({
  title: "IssueMilestoneRef",
  description: "Stable ID and human-readable label for the issue's assigned milestone."
})

export type IssueMilestoneRef = Schema.Schema.Type<typeof IssueMilestoneRefSchema>

const IssueIdOutputSchema = IssueId.annotate({
  description:
    "Raw Huly issue _id. For raw objectId/objectClass tools, pair this with objectClass 'tracker:class:Issue'. Prefer friendly issue locators when a tool provides them."
})

export const IssueSummarySchema = Schema.Struct({
  issueId: IssueIdOutputSchema,
  identifier: IssueIdentifier,
  // String, not NonEmptyString: Huly allows storing issues with empty titles
  title: Schema.String,
  status: StatusName,
  priority: Schema.optional(IssuePrioritySchema),
  assignee: Schema.optional(PersonName),
  creator: Schema.optionalKey(PersonRefSchema),
  parentIssue: Schema.optional(IssueIdentifier),
  subIssues: Schema.optional(Count),
  labels: Schema.Array(LabelSchema).annotate({
    description:
      "Attached labels sorted by title. Empty when no usable label attachments exist; duplicate titles are collapsed case-insensitively, preferring a reference with a valid color."
  }),
  milestone: Schema.optionalKey(IssueMilestoneRefSchema),
  modifiedOn: Schema.optional(Timestamp)
}).annotate({ title: "IssueSummary", description: "Issue summary for list operations" })

export type IssueSummary = Schema.Schema.Type<typeof IssueSummarySchema>

export const IssueSchema = Schema.Struct({
  issueId: IssueIdOutputSchema,
  identifier: IssueIdentifier,
  // String, not NonEmptyString: Huly allows storing issues with empty titles
  title: Schema.String,
  description: Schema.optional(Schema.String),
  status: StatusName,
  priority: Schema.optional(IssuePrioritySchema),
  assignee: Schema.optional(PersonName),
  assigneeRef: Schema.optional(PersonRefSchema),
  creator: Schema.optionalKey(PersonRefSchema),
  labels: Schema.Array(LabelSchema).annotate({
    description:
      "Attached labels sorted by title. Empty when no usable label attachments exist; duplicate titles are collapsed case-insensitively, preferring a reference with a valid color."
  }),
  milestone: Schema.optionalKey(IssueMilestoneRefSchema),
  project: ProjectIdentifier,
  parentIssue: Schema.optional(IssueIdentifier),
  subIssues: Schema.optional(Count),
  modifiedOn: Schema.optional(Timestamp),
  createdOn: Schema.optional(Timestamp),
  dueDate: Schema.optional(Schema.NullOr(Timestamp)),
  estimation: Schema.optional(PositiveTimeHours.annotate({ description: timeHoursDescription("Issue estimation") }))
}).annotate({ title: "Issue", description: "Full issue with all fields" })

export type Issue = Schema.Schema.Type<typeof IssueSchema>

const ListIssuesParamsBase = Schema.Struct({
  project: ProjectIdentifier.annotate({ description: "Project identifier (e.g., 'HULY')" }),
  status: Schema.optional(
    StatusName.annotate({ description: "Filter by exact workflow status name. Does not accept category aliases." })
  ),
  statusCategory: Schema.optional(
    KnownStatusCategoryValueSchema.annotate({
      description: `Filter by Huly SDK task.statusCategory key: ${enumValuesDescription(
        StatusCategoryValues
      )}. Use status for exact project-specific status names.`
    })
  ),
  assignee: Schema.optional(
    PersonRefInput.annotate({
      description: "Filter by assignee email, Person display name, or exact agent UserProfile title"
    })
  ),
  creator: Schema.optional(
    PersonRefInput.annotate({
      description:
        "Filter by creator using a raw Person ID, exact email address, or exact display name. Ambiguous exact display names are rejected; unknown people return an empty list."
    })
  ),
  parentIssue: Schema.optional(
    IssueIdentifier.annotate({ description: "Filter to children of this parent issue (e.g., 'HULY-42')" })
  ),
  titleSearch: Schema.optional(
    Schema.String.annotate({
      description: "Search issues by title substring (case-insensitive). Mutually exclusive with titleRegex."
    })
  ),
  titleRegex: Schema.optional(
    Schema.String.annotate({
      description:
        "Filter issues by title using Huly $regex. On the supported Postgres backend this is SQL SIMILAR TO, not JavaScript RegExp; matching is case-sensitive and the pattern must match the whole title: use '%' for any string (e.g., '%BUG%' contains, 'BUG%' prefix). Mutually exclusive with titleSearch; use titleSearch for simple substring matching."
    })
  ),
  descriptionSearch: Schema.optional(
    Schema.String.annotate({ description: "Search issues by description content (fulltext search)" })
  ),
  component: Schema.optional(ComponentIdentifier.annotate({ description: "Filter by component ID or label" })),
  label: Schema.optional(
    NonEmptyString.annotate({
      description:
        "Filter by an attached human-readable label title. Matching is exact after trimming and case-insensitive; duplicate attachments do not duplicate issues."
    })
  ),
  milestone: Schema.optional(MilestoneIdentifier).annotate({
    description:
      "Milestone ID or exact project-scoped label after trimming and case-insensitive matching. Mutually exclusive with hasMilestone."
  }),
  hasMilestone: Schema.optional(
    Schema.Boolean.annotate({
      description:
        "Filter by milestone presence. true = only scheduled issues, false = only issues without a milestone."
    })
  ),
  hasAssignee: Schema.optional(
    Schema.Boolean.annotate({
      description: "Filter by assignee presence. true = only assigned issues, false = only unassigned issues."
    })
  ),
  hasDueDate: Schema.optional(
    Schema.Boolean.annotate({
      description: "Filter by due date presence. true = only issues with a due date, false = only issues without."
    })
  ),
  hasComponent: Schema.optional(
    Schema.Boolean.annotate({
      description: "Filter by component presence. true = only issues with a component, false = only issues without."
    })
  ),
  isTopLevel: Schema.optional(
    Schema.Boolean.annotate({
      description: "When true, only return top-level issues (not sub-issues). false or omitted returns all issues."
    })
  ),
  limit: Schema.optional(
    LimitParam.annotate({ description: `Maximum number of issues to return (default: ${DEFAULT_LIMIT})` })
  )
})

type ListIssuesParamsBase = Schema.Schema.Type<typeof ListIssuesParamsBase>

interface ExclusiveListIssueFields {
  readonly left: keyof ListIssuesParamsBase
  readonly right: keyof ListIssuesParamsBase
  readonly message: string
}

const EXCLUSIVE_LIST_ISSUE_FIELDS: ReadonlyArray<ExclusiveListIssueFields> = [
  {
    left: "titleSearch",
    right: "titleRegex",
    message: "Cannot provide both 'titleSearch' and 'titleRegex'. Use one or the other."
  },
  {
    left: "status",
    right: "statusCategory",
    message:
      "Cannot provide both 'status' and 'statusCategory'. Use status for exact workflow status names or statusCategory for Huly workflow categories."
  },
  {
    left: "assignee",
    right: "hasAssignee",
    message: "Cannot provide both 'assignee' and 'hasAssignee'. Use one or the other."
  },
  {
    left: "component",
    right: "hasComponent",
    message: "Cannot provide both 'component' and 'hasComponent'. Use one or the other."
  },
  {
    left: "milestone",
    right: "hasMilestone",
    message: "Cannot provide both 'milestone' and 'hasMilestone'. Use one or the other."
  }
]

const exclusiveListIssueFieldsError = (params: ListIssuesParamsBase): string | undefined =>
  EXCLUSIVE_LIST_ISSUE_FIELDS.find(({ left, right }) => params[left] !== undefined && params[right] !== undefined)
    ?.message

const parentScopeError = (params: ListIssuesParamsBase): string | undefined =>
  params.parentIssue !== undefined && params.isTopLevel === true
    ? "Cannot provide both 'parentIssue' and 'isTopLevel: true'. parentIssue requests children; isTopLevel requests parentless issues."
    : undefined

const listIssuesValidationError = (params: ListIssuesParamsBase): string | undefined =>
  exclusiveListIssueFieldsError(params) ?? parentScopeError(params)

export const ListIssuesParamsSchema = ListIssuesParamsBase.pipe(
  Schema.check(Schema.makeFilter(listIssuesValidationError)),
  Schema.brand("ParsedListIssuesParams")
).annotate({ title: "ListIssuesParams", description: "Parameters for listing issues" })

export type ListIssuesParams = Schema.Schema.Type<typeof ListIssuesParamsSchema>
export type ListIssuesInput = Schema.Codec.Encoded<typeof ListIssuesParamsSchema>

export const GetIssueParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotate({ description: "Project identifier (e.g., 'HULY')" }),
  identifier: IssueIdentifier.annotate({ description: "Issue identifier (e.g., 'HULY-123')" })
}).annotate({ title: "GetIssueParams", description: "Parameters for getting a single issue" })

export type GetIssueParams = Schema.Schema.Type<typeof GetIssueParamsSchema>

export const CreateIssueParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotate({ description: "Project identifier (e.g., 'HULY')" }),
  title: NonEmptyString.annotate({ description: "Issue title" }),
  description: Schema.optional(
    Schema.String.annotate({
      description:
        "Issue description in markdown. Markdown links to current-workspace Huly browse URLs with _class, _id, and label become native Huly references. External URLs and other-workspace browse URLs stay normal links."
    })
  ),
  priority: Schema.optional(
    IssuePrioritySchema.annotate({ description: "Issue priority (urgent, high, medium, low, no-priority)" })
  ),
  assignee: Schema.optional(
    PersonRefInput.annotate({ description: "Assignee email, Person display name, or exact agent UserProfile title" })
  ),
  status: Schema.optional(
    StatusName.annotate({ description: "Initial status (uses project default if not specified)" })
  ),
  taskType: Schema.optional(
    TaskTypeRefSchema.annotate({
      description:
        "Issue/task type ID or display name. Resolved within the target project's project type; use list_task_types or get_project_type to discover valid values. If omitted, creates the default Issue type."
    })
  ),
  parentIssue: Schema.optional(
    IssueIdentifier.annotate({
      description:
        "Parent issue identifier (e.g., 'HULY-42') to create as a sub-issue. Omit to create a native top-level issue."
    })
  ),
  dueDate: Schema.optional(
    Schema.NullOr(Timestamp).annotate({
      description: "Due date as Unix timestamp in milliseconds (e.g., 1719792000000 for 2024-07-01), or null to clear"
    })
  ),
  estimation: Schema.optional(PositiveTimeHours.annotate({ description: timeHoursDescription("Time estimation") }))
}).annotate({ title: "CreateIssueParams", description: "Parameters for creating an issue" })

export type CreateIssueParams = Schema.Schema.Type<typeof CreateIssueParamsSchema>

export const UPDATE_ISSUE_FIELDS = [
  "title",
  "description",
  "priority",
  "assignee",
  "status",
  "taskType",
  "dueDate",
  "estimation"
] as const satisfies ReadonlyArray<
  "title" | "description" | "priority" | "assignee" | "status" | "taskType" | "dueDate" | "estimation"
>

export const UpdateIssueParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotate({ description: "Project identifier (e.g., 'HULY')" }),
  identifier: IssueIdentifier.annotate({ description: "Issue identifier (e.g., 'HULY-123')" }),
  title: Schema.optional(NonEmptyString.annotate({ description: "New issue title" })),
  description: Schema.optional(
    clearableText(
      "New issue description in markdown. Markdown links to current-workspace Huly browse URLs with _class, _id, and label become native Huly references. External URLs and other-workspace browse URLs stay normal links."
    )
  ),
  priority: Schema.optional(IssuePrioritySchema.annotate({ description: "New issue priority" })),
  assignee: Schema.optional(
    Schema.NullOr(PersonRefInput).annotate({
      description: "New assignee email, Person display name, or exact agent UserProfile title (null to unassign)"
    })
  ),
  status: Schema.optional(StatusName.annotate({ description: "New status" })),
  taskType: Schema.optional(
    TaskTypeRefSchema.annotate({
      description:
        "New issue/task type ID or display name. Resolved within the target project's project type; status is preserved only if valid for that task type. Use list_task_types or get_project_type to discover valid values."
    })
  ),
  dueDate: Schema.optional(
    Schema.NullOr(Timestamp).annotate({
      description: "Due date as Unix timestamp in milliseconds (e.g., 1719792000000 for 2024-07-01), or null to clear"
    })
  ),
  estimation: Schema.optional(
    Schema.NullOr(PositiveTimeHours).annotate({
      description: `${timeHoursDescription("Time estimation")} Use null to clear.`
    })
  )
})
  .pipe(
    Schema.check(
      Schema.makeFilter((params) =>
        hasAtLeastOneDefined(params, UPDATE_ISSUE_FIELDS)
          ? undefined
          : atLeastOneUpdateFieldMessage(UPDATE_ISSUE_FIELDS)
      )
    )
  )
  .annotate({
    title: "UpdateIssueParams",
    description: `Parameters for updating an issue. ${atLeastOneUpdateFieldMessage(UPDATE_ISSUE_FIELDS)}`
  })

export type UpdateIssueParams = Schema.Schema.Type<typeof UpdateIssueParamsSchema>
assertUpdateFields<UpdateIssueParams>()(["project", "identifier"], UPDATE_ISSUE_FIELDS)

export const AddLabelParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotate({ description: "Project identifier (e.g., 'HULY')" }),
  identifier: IssueIdentifier.annotate({ description: "Issue identifier (e.g., 'HULY-123')" }),
  label: NonEmptyString.annotate({ description: "Label name to add" }),
  color: Schema.optional(
    ColorCode.annotate({
      description: `Huly platform color palette index from 0 through ${MAX_COLOR_INDEX} (default: ${DEFAULT_COLOR_INDEX})`
    })
  )
}).annotate({ title: "AddLabelParams", description: "Parameters for adding a label to an issue" })

export type AddLabelParams = Schema.Schema.Type<typeof AddLabelParamsSchema>

export const DeleteIssueParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotate({ description: "Project identifier (e.g., 'HULY')" }),
  identifier: IssueIdentifier.annotate({ description: "Issue identifier (e.g., 'HULY-123')" })
}).annotate({ title: "DeleteIssueParams", description: "Parameters for deleting an issue" })

export type DeleteIssueParams = Schema.Schema.Type<typeof DeleteIssueParamsSchema>

export const RemoveLabelParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotate({ description: "Project identifier (e.g., 'HULY')" }),
  identifier: IssueIdentifier.annotate({ description: "Issue identifier (e.g., 'HULY-123')" }),
  label: NonEmptyString.annotate({ description: "Label name to remove" })
}).annotate({ title: "RemoveLabelParams", description: "Parameters for removing a label from an issue" })

export type RemoveLabelParams = Schema.Schema.Type<typeof RemoveLabelParamsSchema>

export const MoveIssueParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotate({ description: "Project identifier (e.g., 'HULY')" }),
  identifier: IssueIdentifier.annotate({ description: "Issue to move (e.g., 'HULY-123')" }),
  newParent: Schema.NullOr(IssueIdentifier).annotate({
    description: "New parent issue identifier, or null to restore the native top-level issue shape"
  })
}).annotate({ title: "MoveIssueParams", description: "Parameters for moving an issue to a new parent or to top-level" })

export type MoveIssueParams = Schema.Schema.Type<typeof MoveIssueParamsSchema>

export const listIssuesParamsJsonSchema = toDraft07JsonSchema(ListIssuesParamsSchema)
export const getIssueParamsJsonSchema = toDraft07JsonSchema(GetIssueParamsSchema)
export const createIssueParamsJsonSchema = toDraft07JsonSchema(CreateIssueParamsSchema)
export const updateIssueParamsJsonSchema = withAtLeastOneRequired(
  toDraft07JsonSchema(UpdateIssueParamsSchema),
  UPDATE_ISSUE_FIELDS
)
export const addLabelParamsJsonSchema = toDraft07JsonSchema(AddLabelParamsSchema)
export const removeLabelParamsJsonSchema = toDraft07JsonSchema(RemoveLabelParamsSchema)
export const deleteIssueParamsJsonSchema = toDraft07JsonSchema(DeleteIssueParamsSchema)
export const moveIssueParamsJsonSchema = toDraft07JsonSchema(MoveIssueParamsSchema)

export const parseIssue = Schema.decodeUnknownEffect(IssueSchema)
export const parseIssueSummary = Schema.decodeUnknownEffect(IssueSummarySchema)
export const parseListIssuesParams = Schema.decodeUnknownEffect(ListIssuesParamsSchema)
export const parseGetIssueParams = Schema.decodeUnknownEffect(GetIssueParamsSchema)
export const parseCreateIssueParams = Schema.decodeUnknownEffect(CreateIssueParamsSchema)
export const parseUpdateIssueParams = Schema.decodeUnknownEffect(UpdateIssueParamsSchema)
export const parseAddLabelParams = Schema.decodeUnknownEffect(AddLabelParamsSchema)
export const parseRemoveLabelParams = Schema.decodeUnknownEffect(RemoveLabelParamsSchema)
export const parseDeleteIssueParams = Schema.decodeUnknownEffect(DeleteIssueParamsSchema)
export const parseMoveIssueParams = Schema.decodeUnknownEffect(MoveIssueParamsSchema)
