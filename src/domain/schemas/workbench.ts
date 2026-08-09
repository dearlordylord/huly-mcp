import { JSONSchema, Schema } from "effect"

import {
  Count,
  DEFAULT_LIMIT,
  DocId,
  hasMutuallyExclusiveFields,
  LimitParam,
  mutuallyExclusiveFieldsMessage,
  NonEmptyString,
  ObjectClassName,
  withMutuallyExclusiveFields
} from "./shared.js"

export const WorkbenchApplicationId = DocId.pipe(Schema.brand("WorkbenchApplicationId"))
export type WorkbenchApplicationId = Schema.Schema.Type<typeof WorkbenchApplicationId>
export const WorkbenchApplicationAlias = NonEmptyString.pipe(Schema.brand("WorkbenchApplicationAlias"))
export type WorkbenchApplicationAlias = Schema.Schema.Type<typeof WorkbenchApplicationAlias>
export const WorkbenchApplicationAliasSearch = NonEmptyString.pipe(Schema.brand("WorkbenchApplicationAliasSearch"))
export type WorkbenchApplicationAliasSearch = Schema.Schema.Type<typeof WorkbenchApplicationAliasSearch>
export const WorkbenchLabelId = NonEmptyString.pipe(Schema.brand("WorkbenchLabelId"))
export type WorkbenchLabelId = Schema.Schema.Type<typeof WorkbenchLabelId>
export const WorkbenchNavigationItemId = NonEmptyString.pipe(Schema.brand("WorkbenchNavigationItemId"))
export type WorkbenchNavigationItemId = Schema.Schema.Type<typeof WorkbenchNavigationItemId>
export const WorkbenchNavigationPosition = NonEmptyString.pipe(Schema.brand("WorkbenchNavigationPosition"))
export type WorkbenchNavigationPosition = Schema.Schema.Type<typeof WorkbenchNavigationPosition>
export const WorkbenchApplicationType = Schema.String.pipe(Schema.brand("WorkbenchApplicationType"))
export type WorkbenchApplicationType = Schema.Schema.Type<typeof WorkbenchApplicationType>
export const WorkbenchApplicationOrder = Schema.Number.pipe(Schema.int(), Schema.brand("WorkbenchApplicationOrder"))
export type WorkbenchApplicationOrder = Schema.Schema.Type<typeof WorkbenchApplicationOrder>

export const WorkbenchAccountRoleSchema = Schema.Literal(
  "READONLYGUEST",
  "DocGuest",
  "GUEST",
  "USER",
  "MAINTAINER",
  "OWNER",
  "ADMIN"
)
export type WorkbenchAccountRole = Schema.Schema.Type<typeof WorkbenchAccountRoleSchema>

export const WorkbenchApplicationPositionSchema = Schema.Literal("top", "mid", "bottom")
export type WorkbenchApplicationPosition = Schema.Schema.Type<typeof WorkbenchApplicationPositionSchema>

const aliasFiltersAreExclusive = (params: { readonly alias?: unknown; readonly aliasSearch?: unknown }) =>
  !hasMutuallyExclusiveFields(params, ["alias", "aliasSearch"]) ||
  mutuallyExclusiveFieldsMessage(["alias", "aliasSearch"])

export const ListWorkbenchApplicationsParamsSchema = Schema.Struct({
  alias: Schema.optional(
    WorkbenchApplicationAlias.annotations({
      description: "Exact application URL alias. Duplicate exact aliases are rejected as ambiguous."
    })
  ),
  aliasSearch: Schema.optional(
    WorkbenchApplicationAliasSearch.annotations({
      description: "Case-insensitive application alias substring. Mutually exclusive with alias."
    })
  ),
  limit: Schema.optional(
    LimitParam.annotations({ description: `Maximum applications to return (default: ${DEFAULT_LIMIT}).` })
  )
})
  .pipe(Schema.filter(aliasFiltersAreExclusive))
  .annotations({
    title: "ListWorkbenchApplicationsParams",
    description: "Optional alias filters for read-only Workbench application model discovery."
  })
export type ListWorkbenchApplicationsParams = Schema.Schema.Type<typeof ListWorkbenchApplicationsParamsSchema>

export const WorkbenchSpaceNavigationSchema = Schema.Struct({
  id: WorkbenchNavigationItemId,
  labelId: Schema.optionalWith(WorkbenchLabelId, { exact: true }),
  spaceClass: ObjectClassName
})
export type WorkbenchSpaceNavigation = Schema.Schema.Type<typeof WorkbenchSpaceNavigationSchema>

export const WorkbenchSpecialNavigationSchema = Schema.Struct({
  id: WorkbenchNavigationItemId,
  labelId: WorkbenchLabelId,
  position: Schema.optionalWith(WorkbenchNavigationPosition, { exact: true }),
  accessLevel: Schema.optionalWith(WorkbenchAccountRoleSchema, { exact: true }),
  spaceClass: Schema.optionalWith(ObjectClassName, { exact: true })
})
export type WorkbenchSpecialNavigation = Schema.Schema.Type<typeof WorkbenchSpecialNavigationSchema>

export const WorkbenchGroupNavigationSchema = Schema.Struct({
  id: WorkbenchNavigationItemId,
  labelId: Schema.optionalWith(WorkbenchLabelId, { exact: true }),
  groupByClass: ObjectClassName
})
export type WorkbenchGroupNavigation = Schema.Schema.Type<typeof WorkbenchGroupNavigationSchema>

export const WorkbenchNavigationSummarySchema = Schema.Struct({
  spaces: Schema.Array(WorkbenchSpaceNavigationSchema),
  specials: Schema.Array(WorkbenchSpecialNavigationSchema),
  groups: Schema.Array(WorkbenchGroupNavigationSchema)
})
export type WorkbenchNavigationSummary = Schema.Schema.Type<typeof WorkbenchNavigationSummarySchema>

export const WorkbenchApplicationSummarySchema = Schema.Struct({
  id: WorkbenchApplicationId,
  alias: WorkbenchApplicationAlias,
  labelId: WorkbenchLabelId.annotations({
    description: "Untranslated Huly IntlString resource ID; this is not fabricated display text."
  }),
  hidden: Schema.Boolean.annotations({ description: "Static model declaration flag." }),
  hiddenByPreference: Schema.Boolean.annotations({
    description: "Whether the authenticated account has a caller-owned HiddenApplication preference."
  }),
  accessLevel: Schema.optionalWith(WorkbenchAccountRoleSchema, { exact: true }),
  position: Schema.optionalWith(WorkbenchApplicationPositionSchema, { exact: true }),
  order: Schema.optionalWith(WorkbenchApplicationOrder, { exact: true }),
  type: Schema.optionalWith(WorkbenchApplicationType, { exact: true }),
  navigation: WorkbenchNavigationSummarySchema
})
export type WorkbenchApplicationSummary = Schema.Schema.Type<typeof WorkbenchApplicationSummarySchema>

export const ListWorkbenchApplicationsResultSchema = Schema.Struct({
  applications: Schema.Array(WorkbenchApplicationSummarySchema),
  total: Count
}).annotations({
  title: "ListWorkbenchApplicationsResult",
  description:
    "Workbench application and navigation model declarations. Presence does not prove plugin, provider, worker, API, role, or effective browser visibility."
})
export type ListWorkbenchApplicationsResult = Schema.Schema.Type<typeof ListWorkbenchApplicationsResultSchema>

export const listWorkbenchApplicationsParamsJsonSchema = withMutuallyExclusiveFields(
  JSONSchema.make(ListWorkbenchApplicationsParamsSchema),
  ["alias", "aliasSearch"]
)
export const parseListWorkbenchApplicationsParams = Schema.decodeUnknown(ListWorkbenchApplicationsParamsSchema)
