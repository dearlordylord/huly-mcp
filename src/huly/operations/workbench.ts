import type { Application, ApplicationNavModel, HiddenApplication } from "@hcengineering/workbench"
import { Effect, Schema } from "effect"

import type {
  ListWorkbenchApplicationsParams,
  ListWorkbenchApplicationsResult,
  WorkbenchApplicationSummary,
  WorkbenchGroupNavigation,
  WorkbenchNavigationSummary,
  WorkbenchSpaceNavigation,
  WorkbenchSpecialNavigation
} from "../../domain/schemas/workbench.js"
import {
  WorkbenchAccountRoleSchema,
  WorkbenchApplicationAlias,
  WorkbenchApplicationId,
  WorkbenchApplicationOrder,
  WorkbenchApplicationPositionSchema,
  WorkbenchApplicationType,
  WorkbenchLabelId,
  WorkbenchNavigationItemId,
  WorkbenchNavigationPosition
} from "../../domain/schemas/workbench.js"
import { Count, ObjectClassName } from "../../domain/schemas/shared.js"
import { WorkbenchNavigationMetadataDegradedWarningCode } from "../../domain/schemas/tool-warnings.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { Diagnostics } from "../diagnostics.js"
import { HulyError, WorkbenchApplicationAliasAmbiguousError } from "../errors.js"
import { core, workbench } from "../huly-plugins.js"
import { clampLimit, escapeLikeWildcards, hulyQuery, type StrictDocumentQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

const SpaceNavigationProjectionSchema = Schema.Struct({
  id: Schema.optional(WorkbenchNavigationItemId),
  label: Schema.optional(WorkbenchLabelId),
  spaceClass: ObjectClassName
})
type SpaceNavigationProjection = Schema.Schema.Type<typeof SpaceNavigationProjectionSchema>

const SpecialNavigationProjectionSchema = Schema.Struct({
  id: WorkbenchNavigationItemId,
  label: WorkbenchLabelId,
  position: Schema.optional(WorkbenchNavigationPosition),
  accessLevel: Schema.optional(WorkbenchAccountRoleSchema),
  spaceClass: Schema.optional(ObjectClassName)
})
type SpecialNavigationProjection = Schema.Schema.Type<typeof SpecialNavigationProjectionSchema>

const GroupNavigationProjectionSchema = Schema.Struct({
  id: WorkbenchNavigationItemId,
  label: Schema.optional(WorkbenchLabelId),
  groupByClass: ObjectClassName
})
type GroupNavigationProjection = Schema.Schema.Type<typeof GroupNavigationProjectionSchema>

const NavigationProjectionSchema = Schema.Struct({
  spaces: Schema.optional(Schema.Array(SpaceNavigationProjectionSchema)),
  specials: Schema.optional(Schema.Array(SpecialNavigationProjectionSchema)),
  groups: Schema.optional(Schema.Array(GroupNavigationProjectionSchema))
})
type NavigationProjection = Schema.Schema.Type<typeof NavigationProjectionSchema>

const ApplicationProjectionSchema = Schema.Struct({
  _id: WorkbenchApplicationId,
  alias: WorkbenchApplicationAlias,
  label: WorkbenchLabelId,
  hidden: Schema.Boolean,
  accessLevel: Schema.optional(WorkbenchAccountRoleSchema),
  position: Schema.optional(WorkbenchApplicationPositionSchema),
  order: Schema.optional(WorkbenchApplicationOrder),
  type: Schema.optional(WorkbenchApplicationType),
  navigatorModel: Schema.optional(NavigationProjectionSchema)
})
type ApplicationProjection = Schema.Schema.Type<typeof ApplicationProjectionSchema>

const NavigationExtensionProjectionSchema = Schema.Struct({
  extends: WorkbenchApplicationId,
  ...NavigationProjectionSchema.fields
})
type NavigationExtensionProjection = Schema.Schema.Type<typeof NavigationExtensionProjectionSchema>

const HiddenApplicationProjectionSchema = Schema.Struct({ attachedTo: WorkbenchApplicationId })
type HiddenApplicationProjection = Schema.Schema.Type<typeof HiddenApplicationProjectionSchema>

type WorkbenchApplicationsError = HulyClientError | HulyError | WorkbenchApplicationAliasAmbiguousError

const SORT_BEFORE = -1
const SORT_EQUAL = 0
const SORT_AFTER = 1
type SortComparison = typeof SORT_BEFORE | typeof SORT_EQUAL | typeof SORT_AFTER

const parseApplication = (input: unknown): Effect.Effect<ApplicationProjection, HulyError> =>
  Schema.decodeUnknown(ApplicationProjectionSchema)(input).pipe(
    Effect.mapError(
      (cause) => new HulyError({ message: "Huly returned malformed Workbench application metadata.", cause })
    )
  )

const parseNavigationExtension = (input: unknown): Effect.Effect<NavigationExtensionProjection, HulyError> =>
  Schema.decodeUnknown(NavigationExtensionProjectionSchema)(input).pipe(
    Effect.mapError(
      (cause) => new HulyError({ message: "Huly returned malformed Workbench navigation metadata.", cause })
    )
  )

const parseHiddenApplication = (input: unknown): Effect.Effect<HiddenApplicationProjection, HulyError> =>
  Schema.decodeUnknown(HiddenApplicationProjectionSchema)(input).pipe(
    Effect.mapError(
      (cause) => new HulyError({ message: "Huly returned malformed caller Workbench preference metadata.", cause })
    )
  )

const spaceNavigation = (item: SpaceNavigationProjection): ReadonlyArray<WorkbenchSpaceNavigation> =>
  item.id === undefined
    ? []
    : [{ id: item.id, ...(item.label === undefined ? {} : { labelId: item.label }), spaceClass: item.spaceClass }]

const specialNavigation = (item: SpecialNavigationProjection): WorkbenchSpecialNavigation => ({
  id: item.id,
  labelId: item.label,
  ...(item.position === undefined ? {} : { position: item.position }),
  ...(item.accessLevel === undefined ? {} : { accessLevel: item.accessLevel }),
  ...(item.spaceClass === undefined ? {} : { spaceClass: item.spaceClass })
})

const groupNavigation = (item: GroupNavigationProjection): WorkbenchGroupNavigation => ({
  id: item.id,
  ...(item.label === undefined ? {} : { labelId: item.label }),
  groupByClass: item.groupByClass
})

const combineNavigation = (parts: ReadonlyArray<NavigationProjection | undefined>): WorkbenchNavigationSummary => ({
  spaces: parts.flatMap((part) => (part?.spaces ?? []).flatMap(spaceNavigation)),
  specials: parts.flatMap((part) => (part?.specials ?? []).map(specialNavigation)),
  groups: parts.flatMap((part) => (part?.groups ?? []).map(groupNavigation))
})

const countNavigationItemsWithoutIds = (parts: ReadonlyArray<NavigationProjection | undefined>): Count =>
  Count.make(parts.reduce((count, part) => count + (part?.spaces ?? []).filter(({ id }) => id === undefined).length, 0))

const compareApplicationAliases = (
  left: WorkbenchApplicationAlias,
  right: WorkbenchApplicationAlias
): SortComparison => (left === right ? SORT_EQUAL : left < right ? SORT_BEFORE : SORT_AFTER)

const applicationSummary = (
  application: ApplicationProjection,
  extensions: ReadonlyArray<NavigationExtensionProjection>,
  hiddenApplicationIds: ReadonlySet<WorkbenchApplicationId>
): WorkbenchApplicationSummary => ({
  id: application._id,
  alias: application.alias,
  labelId: application.label,
  hidden: application.hidden,
  hiddenByPreference: hiddenApplicationIds.has(application._id),
  ...(application.accessLevel === undefined ? {} : { accessLevel: application.accessLevel }),
  ...(application.position === undefined ? {} : { position: application.position }),
  ...(application.order === undefined ? {} : { order: application.order }),
  ...(application.type === undefined ? {} : { type: application.type }),
  navigation: combineNavigation([
    application.navigatorModel,
    ...extensions.filter((extension) => extension.extends === application._id)
  ])
})

const filterApplications = (
  applications: ReadonlyArray<ApplicationProjection>,
  params: ListWorkbenchApplicationsParams
): Effect.Effect<Array<ApplicationProjection>, WorkbenchApplicationAliasAmbiguousError> =>
  Effect.gen(function* () {
    const aliasSearch = params.aliasSearch
    const filtered =
      params.alias === undefined
        ? aliasSearch === undefined
          ? [...applications]
          : applications.filter((application) => application.alias.toLowerCase().includes(aliasSearch.toLowerCase()))
        : applications.filter((application) => application.alias === params.alias)
    if (params.alias !== undefined && filtered.length > 1) {
      return yield* new WorkbenchApplicationAliasAmbiguousError({
        alias: params.alias,
        matches: Count.make(filtered.length)
      })
    }
    return filtered.sort(
      (left, right) =>
        (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER) ||
        compareApplicationAliases(left.alias, right.alias)
    )
  })

export const listWorkbenchApplications = (
  params: ListWorkbenchApplicationsParams
): Effect.Effect<ListWorkbenchApplicationsResult, WorkbenchApplicationsError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const diagnostics = yield* Diagnostics
    const query: StrictDocumentQuery<Application> = {
      ...(params.alias === undefined ? {} : { alias: params.alias }),
      ...(params.aliasSearch === undefined ? {} : { alias: { $like: `%${escapeLikeWildcards(params.aliasSearch)}%` } })
    }
    const rawApplications = yield* client.findAllInModel<Application>(workbench.class.Application, hulyQuery(query))
    const parsedApplications = yield* Effect.forEach(rawApplications, parseApplication)
    const filteredApplications = yield* filterApplications(parsedApplications, params)
    const selectedApplications = filteredApplications.slice(0, clampLimit(params.limit))
    const applicationIds = selectedApplications.map((application) => application._id)
    const rawExtensions =
      applicationIds.length === 0
        ? []
        : yield* client.findAllInModel<ApplicationNavModel>(
            workbench.class.ApplicationNavModel,
            hulyQuery<ApplicationNavModel>({ extends: { $in: applicationIds.map(toRef<Application>) } })
          )
    const rawHiddenPreferences =
      applicationIds.length === 0
        ? []
        : yield* client.findAll<HiddenApplication>(
            workbench.class.HiddenApplication,
            hulyQuery<HiddenApplication>({
              attachedTo: { $in: applicationIds.map(toRef<Application>) },
              space: core.space.Workspace,
              createdBy: client.getPrimarySocialId()
            })
          )
    const extensions = yield* Effect.forEach(rawExtensions, parseNavigationExtension)
    const hiddenPreferences = yield* Effect.forEach(rawHiddenPreferences, parseHiddenApplication)
    const omittedNavigationItems = countNavigationItemsWithoutIds([
      ...selectedApplications.map(({ navigatorModel }) => navigatorModel),
      ...extensions
    ])
    if (omittedNavigationItems > 0) {
      yield* diagnostics.warnAgent({
        code: WorkbenchNavigationMetadataDegradedWarningCode,
        message: `Skipped ${omittedNavigationItems} Workbench space navigation declaration${omittedNavigationItems === 1 ? "" : "s"} without a stable id.`
      })
    }
    const hiddenApplicationIds = new Set(hiddenPreferences.map((preference) => preference.attachedTo))
    return {
      applications: selectedApplications.map((application) =>
        applicationSummary(application, extensions, hiddenApplicationIds)
      ),
      total: Count.make(filteredApplications.length)
    }
  })
