import { type Doc, SortingOrder } from "@hcengineering/core"

import type { FilteredView, Viewlet, ViewletDescriptor, ViewletPreference } from "@hcengineering/view"
import { Effect } from "effect"

import {
  type FilteredViewDetail,
  type FilteredViewIdentifier,
  type FilteredViewSummary,
  type GetFilteredViewParams,
  type ListFilteredViewsParams,
  type ListFilteredViewsResult,
  type ListViewletsParams,
  type ListViewletsResult,
  type ViewletIdentifier,
  type ViewletSummary,
  FilteredViewId,
  ViewletDescriptorId,
  ViewletId,
  ViewletPreferenceId
} from "../../domain/schemas/views.js"
import { Count, ObjectClassName, PersonId } from "../../domain/schemas/shared.js"

import { ViewletDescriptorMetadataDegradedWarningCode } from "../../domain/schemas/tool-warnings.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { Diagnostics } from "../diagnostics.js"
import {
  FilteredViewIdentifierAmbiguousError,
  FilteredViewNotFoundError,
  ViewletIdentifierAmbiguousError,
  ViewletNotFoundError
} from "../errors.js"
import { view } from "../huly-plugins.js"
import { clampLimit, escapeLikeWildcards, hulyQuery, type StrictDocumentQuery } from "./query-helpers.js"
import { toClassRef } from "./sdk-boundary.js"

type FilteredViewError = HulyClientError | FilteredViewNotFoundError | FilteredViewIdentifierAmbiguousError
type ViewletError = HulyClientError | ViewletNotFoundError | ViewletIdentifierAmbiguousError

const viewletIdField = (viewletId: string | null | undefined) =>
  viewletId === undefined || viewletId === null ? {} : { viewletId: ViewletId.make(viewletId) }

const stringField = <K extends string>(key: K, value: string | undefined) =>
  value === undefined || value.trim() === "" ? {} : { [key]: value }

const visibilityFor = (filteredView: FilteredView, account: string): "own" | "shared" =>
  filteredView.users.includes(account) ? "own" : "shared"

const filterByVisibility = (
  filteredViews: ReadonlyArray<FilteredView>,
  visibility: "own" | "shared" | "all" | undefined,
  account: string
): Array<FilteredView> =>
  visibility === undefined || visibility === "all"
    ? [...filteredViews]
    : filteredViews.filter((filteredView) => visibilityFor(filteredView, account) === visibility)

const toFilteredViewSummary = (filteredView: FilteredView, account: string): FilteredViewSummary => ({
  id: FilteredViewId.make(filteredView._id),
  name: filteredView.name,
  attachedTo: filteredView.attachedTo,
  visibility: visibilityFor(filteredView, account),
  ...(filteredView.sharable === undefined ? {} : { sharable: filteredView.sharable }),
  users: Count.make(filteredView.users.length),
  ...viewletIdField(filteredView.viewletId)
})

const toFilteredViewDetail = (filteredView: FilteredView, account: string): FilteredViewDetail => ({
  id: FilteredViewId.make(filteredView._id),
  name: filteredView.name,
  visibility: visibilityFor(filteredView, account),
  attachedTo: filteredView.attachedTo,
  location: filteredView.location,
  filters: filteredView.filters,
  ...(filteredView.viewOptions === undefined ? {} : { viewOptions: filteredView.viewOptions }),
  ...(filteredView.filterClass === undefined
    ? {}
    : { filterClass: ObjectClassName.make(String(filteredView.filterClass)) }),
  ...viewletIdField(filteredView.viewletId),
  ...(filteredView.sharable === undefined ? {} : { sharable: filteredView.sharable }),
  users: Count.make(filteredView.users.length),
  createdBy: PersonId.make(String(filteredView.createdBy))
})

const resolveFilteredView = (
  filteredViews: ReadonlyArray<FilteredView>,
  identifier: FilteredViewIdentifier
): Effect.Effect<FilteredView, FilteredViewError> =>
  Effect.gen(function* () {
    const value = String(identifier)
    const byId = filteredViews.filter((filteredView) => filteredView._id === value)
    const byIdMatch = byId[0]
    if (byIdMatch !== undefined) return byIdMatch
    const matches = filteredViews.filter((filteredView) => filteredView.name === value)
    const first = matches[0]
    if (matches.length === 1 && first !== undefined) return first
    if (matches.length > 1) {
      return yield* new FilteredViewIdentifierAmbiguousError({ identifier: value, matches: matches.length })
    }
    return yield* new FilteredViewNotFoundError({ identifier: value })
  })

const resolveViewlets = (
  viewlets: ReadonlyArray<Viewlet>,
  identifier: ViewletIdentifier | undefined
): Effect.Effect<Array<Viewlet>, ViewletError> =>
  Effect.gen(function* () {
    if (identifier === undefined) return [...viewlets]
    const value = String(identifier)
    const byId = viewlets.filter((item) => item._id === value)
    if (byId.length > 0) return byId
    const descriptorMatches = viewlets.filter((item) => item.descriptor === value)
    if (descriptorMatches.length > 0) return descriptorMatches
    const matches = viewlets.filter((item) => item.title === value || item.variant === value)
    if (matches.length === 1) return matches
    if (matches.length > 1) {
      return yield* new ViewletIdentifierAmbiguousError({ identifier: value, matches: matches.length })
    }
    return yield* new ViewletNotFoundError({ identifier: value })
  })

const descriptorSummary = (descriptor: ViewletDescriptor) => ({
  id: ViewletDescriptorId.make(descriptor._id),
  ...stringField("label", descriptor.label),
  ...(descriptor.icon === undefined ? {} : { icon: String(descriptor.icon) }),
  ...(descriptor.color === undefined ? {} : { color: descriptor.color }),
  ...(descriptor.hidden === undefined ? {} : { hidden: descriptor.hidden }),
  ...(descriptor.readonly === undefined ? {} : { readonly: descriptor.readonly }),
  component: descriptor.component
})

const toViewletSummary = (
  item: Viewlet,
  descriptor: ViewletDescriptor | undefined,
  preferences: ReadonlyArray<ViewletPreference>
): ViewletSummary => ({
  id: ViewletId.make(item._id),
  attachTo: ObjectClassName.make(String(item.attachTo)),
  descriptor: ViewletDescriptorId.make(item.descriptor),
  ...stringField("title", item.title),
  ...stringField("variant", item.variant),
  ...(item.baseQuery === undefined ? {} : { baseQuery: item.baseQuery }),
  ...(item.options === undefined ? {} : { options: item.options }),
  config: [...item.config],
  ...(item.configOptions === undefined ? {} : { configOptions: item.configOptions }),
  ...(item.viewOptions === undefined ? {} : { viewOptions: item.viewOptions }),
  ...(item.masterDetailOptions === undefined ? {} : { masterDetailOptions: item.masterDetailOptions }),
  ...(item.props === undefined ? {} : { props: item.props }),
  ...(descriptor === undefined ? {} : { descriptorInfo: descriptorSummary(descriptor) }),
  preferences: preferences.map((preference) => ({
    id: ViewletPreferenceId.make(preference._id),
    attachedTo: ViewletId.make(preference.attachedTo),
    config: [...preference.config]
  }))
})

const missingDescriptorIds = (
  viewlets: ReadonlyArray<Viewlet>,
  descriptorsById: ReadonlyMap<ViewletDescriptor["_id"], ViewletDescriptor>
): Array<ViewletDescriptor["_id"]> =>
  [...new Set(viewlets.map((viewlet) => viewlet.descriptor))].filter(
    (descriptorId) => !descriptorsById.has(descriptorId)
  )

const warnMissingDescriptorMetadata = (
  diagnostics: Diagnostics["Service"],
  ids: ReadonlyArray<ViewletDescriptor["_id"]>
): Effect.Effect<void> =>
  ids.length === 0
    ? Effect.void
    : diagnostics.warnAgent({
        code: ViewletDescriptorMetadataDegradedWarningCode,
        message: `Huly did not return descriptor metadata for ${ids.length} viewlet descriptor ref(s): ${ids.join(
          ", "
        )}. The affected viewlets omit descriptorInfo; use descriptor ids, titles, and variants instead of inferring label or component metadata.`
      })

export const listFilteredViews = (
  params: ListFilteredViewsParams
): Effect.Effect<ListFilteredViewsResult, HulyClientError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const account = client.getAccountUuid()
    const nameSearch = params.nameSearch?.trim() ?? ""
    const query: StrictDocumentQuery<FilteredView> = {
      ...(params.attachedTo === undefined ? {} : { attachedTo: params.attachedTo }),
      ...(nameSearch === "" ? {} : { name: { $like: `%${escapeLikeWildcards(nameSearch)}%` } })
    }
    const filteredViews = yield* client.findAll<FilteredView>(view.class.FilteredView, hulyQuery(query), {
      sort: { modifiedOn: SortingOrder.Descending },
      total: true
    })
    const visible = filterByVisibility(filteredViews, params.visibility, account)
    const limited = visible.slice(0, clampLimit(params.limit))
    return {
      filteredViews: limited.map((filteredView) => toFilteredViewSummary(filteredView, account)),
      total: Count.make(Math.max(0, visible.length))
    }
  })

export const getFilteredView = (
  params: GetFilteredViewParams
): Effect.Effect<FilteredViewDetail, FilteredViewError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const query: StrictDocumentQuery<FilteredView> = {
      ...(params.attachedTo === undefined ? {} : { attachedTo: params.attachedTo })
    }
    const filteredViews = yield* client.findAll<FilteredView>(view.class.FilteredView, hulyQuery(query))
    const filteredView = yield* resolveFilteredView(filteredViews, params.filteredView)
    return toFilteredViewDetail(filteredView, client.getAccountUuid())
  })

export const listViewlets = (
  params: ListViewletsParams
): Effect.Effect<ListViewletsResult, ViewletError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const diagnostics = yield* Diagnostics
    const query: StrictDocumentQuery<Viewlet> = {
      ...(params.attachTo === undefined ? {} : { attachTo: toClassRef<Doc>(params.attachTo) })
    }
    const allViewlets = yield* client.findAllInModel<Viewlet>(view.class.Viewlet, hulyQuery(query))
    const resolved = yield* resolveViewlets(allViewlets, params.viewlet)
    const limited = resolved.slice(0, clampLimit(params.limit))
    const descriptorIds = [...new Set(limited.map((item) => item.descriptor))]
    const descriptors =
      descriptorIds.length === 0
        ? []
        : yield* client.findAllInModel<ViewletDescriptor>(
            view.class.ViewletDescriptor,
            hulyQuery<ViewletDescriptor>({ _id: { $in: descriptorIds } })
          )
    const preferences =
      limited.length === 0
        ? []
        : yield* client.findAll<ViewletPreference>(
            view.class.ViewletPreference,
            hulyQuery<ViewletPreference>({ attachedTo: { $in: limited.map((item) => item._id) } })
          )
    const descriptorsById = new Map(descriptors.map((descriptor) => [descriptor._id, descriptor]))
    yield* warnMissingDescriptorMetadata(diagnostics, missingDescriptorIds(limited, descriptorsById))
    const preferencesFor = (viewletId: Viewlet["_id"]) =>
      preferences.filter((preference) => preference.attachedTo === viewletId)

    return {
      viewlets: limited.map((item) =>
        toViewletSummary(item, descriptorsById.get(item.descriptor), preferencesFor(item._id))
      ),
      total: Count.make(resolved.length)
    }
  })
