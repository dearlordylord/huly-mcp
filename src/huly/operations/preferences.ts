import type { Ref, Space } from "@hcengineering/core"
import { SortingOrder } from "@hcengineering/core"
import type { SpacePreference as HulySpacePreference } from "@hcengineering/preference"
import { Effect } from "effect"

import type {
  GetSpacePreferenceParams,
  GetSpacePreferenceResult,
  ListSpacePreferencesParams,
  ListSpacePreferencesResult,
  SpacePreference
} from "../../domain/schemas/preferences.js"
import { SpacePreferenceId } from "../../domain/schemas/preferences.js"
import { ObjectClassName, SpaceId } from "../../domain/schemas/shared.js"
import { SpacePreferenceMetadataDegradedWarningCode } from "../../domain/schemas/tool-warnings.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { Diagnostics } from "../diagnostics.js"
import type { SpaceIdentifierAmbiguousError, SpaceNotFoundError } from "../errors.js"
import { preference } from "../huly-plugins.js"
import { clampLimit, hulyQuery, type StrictDocumentQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"
import { toSpaceSummary } from "./spaces-projections.js"
import { findSpace, type GenericSpace, listTotal, spaceClass } from "./spaces-shared.js"

type SpacePreferenceError = HulyClientError | SpaceNotFoundError | SpaceIdentifierAmbiguousError

type SpacePreferenceProjection = Pick<HulySpacePreference, "_class" | "_id" | "attachedTo">

const spaceRef = (id: string): Ref<Space> => toRef<Space>(SpaceId.make(id))

const spaceMapById = (
  client: HulyClient["Type"],
  ids: ReadonlyArray<Ref<Space>>
): Effect.Effect<ReadonlyMap<string, GenericSpace>, HulyClientError> =>
  Effect.gen(function*() {
    const uniqueIds = [...new Set(ids.map(String))]
    if (uniqueIds.length === 0) return new Map<string, GenericSpace>()

    const spaces = yield* client.findAll<GenericSpace>(
      spaceClass,
      hulyQuery<GenericSpace>({ _id: { $in: uniqueIds.map((id) => toRef<GenericSpace>(SpaceId.make(id))) } }),
      { limit: uniqueIds.length }
    )

    return new Map(spaces.map((space) => [space._id, space]))
  })

const preferenceResult = (
  item: SpacePreferenceProjection,
  attachedSpace: GenericSpace | undefined
): SpacePreference => ({
  preferenceId: SpacePreferenceId.make(item._id),
  attachedTo: SpaceId.make(item.attachedTo),
  ...(attachedSpace === undefined ? {} : { attachedSpace: toSpaceSummary(attachedSpace) }),
  class: ObjectClassName.make(item._class)
})

const warnMissingAttachedSpaces = (
  diagnostics: Diagnostics["Type"],
  items: ReadonlyArray<SpacePreferenceProjection>,
  spacesById: ReadonlyMap<string, GenericSpace>
): Effect.Effect<void> => {
  const missingIds = [...new Set(items.map((item) => String(item.attachedTo)).filter((id) => !spacesById.has(id)))]
    .sort()
  if (missingIds.length === 0) return Effect.void

  return diagnostics.warnAgent({
    code: SpacePreferenceMetadataDegradedWarningCode,
    message:
      `Some SpacePreference attached space metadata was omitted because ${missingIds.length} attached space id(s) could not be resolved: ${
        missingIds.join(", ")
      }. Results still include raw attachedTo space IDs.`
  })
}

const listQuery = (
  targetSpace: GenericSpace | undefined
): StrictDocumentQuery<HulySpacePreference> =>
  targetSpace === undefined ? {} : { attachedTo: spaceRef(targetSpace._id) }

export const listSpacePreferences = (
  params: ListSpacePreferencesParams
): Effect.Effect<ListSpacePreferencesResult, SpacePreferenceError, HulyClient | Diagnostics> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const diagnostics = yield* Diagnostics
    const targetSpace = params.space === undefined
      ? undefined
      : yield* findSpace(client, {
        space: params.space,
        ...(params.includeArchived === undefined ? {} : { includeArchived: params.includeArchived }),
        ...(params.class === undefined ? {} : { class: params.class }),
        ...(params.type === undefined ? {} : { type: params.type })
      })

    const preferences = yield* client.findAll<HulySpacePreference>(
      preference.class.SpacePreference,
      hulyQuery(listQuery(targetSpace)),
      { limit: clampLimit(params.limit), sort: { modifiedOn: SortingOrder.Descending }, total: true }
    )
    const spacesById = yield* spaceMapById(client, preferences.map((item) => item.attachedTo))
    yield* warnMissingAttachedSpaces(diagnostics, preferences, spacesById)

    return {
      preferences: preferences.map((item) => preferenceResult(item, spacesById.get(item.attachedTo))),
      total: listTotal(preferences.total)
    }
  })

export const getSpacePreference = (
  params: GetSpacePreferenceParams
): Effect.Effect<GetSpacePreferenceResult, SpacePreferenceError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const targetSpace = yield* findSpace(client, params)
    const item = yield* client.findOne<HulySpacePreference>(
      preference.class.SpacePreference,
      hulyQuery<HulySpacePreference>({ attachedTo: spaceRef(targetSpace._id) })
    )

    if (item === undefined) {
      return {
        present: false,
        attachedTo: SpaceId.make(targetSpace._id),
        attachedSpace: toSpaceSummary(targetSpace)
      }
    }

    return {
      present: true,
      preference: preferenceResult(item, targetSpace)
    }
  })
