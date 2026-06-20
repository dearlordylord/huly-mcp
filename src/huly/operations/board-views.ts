import type { CommonBoardPreference, MenuPage } from "@hcengineering/board"
import { SortingOrder } from "@hcengineering/core"
import type { FilteredView, Viewlet, ViewletDescriptor, ViewletPreference } from "@hcengineering/view"
import { Effect } from "effect"

import type {
  BoardCommonPreferenceResult,
  BoardSavedViewDetail,
  BoardSavedViewSummary,
  BoardViewletSummary,
  GetBoardSavedViewParams,
  ListBoardMenuPagesParams,
  ListBoardMenuPagesResult,
  ListBoardSavedViewsParams,
  ListBoardSavedViewsResult,
  ListBoardViewletsParams,
  ListBoardViewletsResult
} from "../../domain/schemas.js"
import {
  BoardCommonPreferenceId,
  BoardMenuPageId,
  BoardSavedViewId,
  BoardViewletDescriptorId,
  BoardViewletId,
  BoardViewletPreferenceId,
  Count
} from "../../domain/schemas.js"
import type {
  BoardMenuPageIdentifier,
  BoardSavedViewIdentifier,
  BoardViewletIdentifier
} from "../../domain/schemas/board-views.js"
import { HulyClient, type HulyClientError } from "../client.js"
import {
  BoardMenuPageIdentifierAmbiguousError,
  BoardMenuPageNotFoundError,
  BoardSavedViewIdentifierAmbiguousError,
  BoardSavedViewNotFoundError,
  BoardViewletIdentifierAmbiguousError,
  BoardViewletNotFoundError
} from "../errors.js"
import { board, view } from "../huly-plugins.js"
import { clampLimit, escapeLikeWildcards, hulyQuery, type StrictDocumentQuery } from "./query-helpers.js"

type BoardMenuPageError = HulyClientError | BoardMenuPageNotFoundError | BoardMenuPageIdentifierAmbiguousError
type BoardSavedViewError = HulyClientError | BoardSavedViewNotFoundError | BoardSavedViewIdentifierAmbiguousError
type BoardViewletError = HulyClientError | BoardViewletNotFoundError | BoardViewletIdentifierAmbiguousError

const boardApp = String(board.app.Board)

const boardMenuPageAliases = new Map([
  ["main", String(board.menuPageId.Main)],
  ["archive", String(board.menuPageId.Archive)]
])

const viewletIdField = (viewletId: string | null | undefined) =>
  viewletId === undefined || viewletId === null ? {} : { viewletId: BoardViewletId.make(viewletId) }

const stringField = <K extends string>(key: K, value: string | undefined) =>
  value === undefined || value.trim() === "" ? {} : { [key]: value }

const visibilityFor = (savedView: FilteredView, account: string): "own" | "shared" =>
  savedView.users.includes(account) ? "own" : "shared"

const filterByVisibility = (
  savedViews: ReadonlyArray<FilteredView>,
  visibility: "own" | "shared" | "all" | undefined,
  account: string
): Array<FilteredView> =>
  visibility === undefined || visibility === "all"
    ? [...savedViews]
    : savedViews.filter((savedView) => visibilityFor(savedView, account) === visibility)

const toMenuPageSummary = (page: MenuPage) => ({
  id: BoardMenuPageId.make(page._id),
  pageId: page.pageId,
  label: page.label,
  component: page.component
})

const toSavedViewSummary = (savedView: FilteredView, account: string): BoardSavedViewSummary => ({
  id: BoardSavedViewId.make(savedView._id),
  name: savedView.name,
  visibility: visibilityFor(savedView, account),
  ...(savedView.sharable === undefined ? {} : { sharable: savedView.sharable }),
  users: Count.make(savedView.users.length),
  ...viewletIdField(savedView.viewletId)
})

const toSavedViewDetail = (savedView: FilteredView, account: string): BoardSavedViewDetail => ({
  id: BoardSavedViewId.make(savedView._id),
  name: savedView.name,
  visibility: visibilityFor(savedView, account),
  attachedTo: savedView.attachedTo,
  location: savedView.location,
  filters: savedView.filters,
  ...(savedView.viewOptions === undefined ? {} : { viewOptions: savedView.viewOptions }),
  ...(savedView.filterClass === undefined ? {} : { filterClass: String(savedView.filterClass) }),
  ...viewletIdField(savedView.viewletId),
  ...(savedView.sharable === undefined ? {} : { sharable: savedView.sharable }),
  users: Count.make(savedView.users.length),
  createdBy: String(savedView.createdBy)
})

const resolveMenuPages = (
  pages: ReadonlyArray<MenuPage>,
  identifier: BoardMenuPageIdentifier | undefined
): Effect.Effect<Array<MenuPage>, BoardMenuPageError> =>
  Effect.gen(function*() {
    if (identifier === undefined) return [...pages]
    const value = String(identifier)
    const pageId = boardMenuPageAliases.get(value.toLowerCase()) ?? value
    const byId = pages.filter((page) => page._id === value)
    if (byId.length > 0) return byId
    const matches = pages.filter((page) => page.pageId === pageId || page.label === value)
    if (matches.length === 1) return matches
    if (matches.length > 1) {
      return yield* new BoardMenuPageIdentifierAmbiguousError({ identifier: value, matches: matches.length })
    }
    return yield* new BoardMenuPageNotFoundError({ identifier: value })
  })

const resolveSavedView = (
  savedViews: ReadonlyArray<FilteredView>,
  identifier: BoardSavedViewIdentifier
): Effect.Effect<FilteredView, BoardSavedViewError> =>
  Effect.gen(function*() {
    const value = String(identifier)
    const byId = savedViews.filter((savedView) => savedView._id === value)
    const byIdMatch = byId[0]
    if (byIdMatch !== undefined) return byIdMatch
    const matches = savedViews.filter((savedView) => savedView.name === value)
    const first = matches[0]
    if (matches.length === 1 && first !== undefined) return first
    if (matches.length > 1) {
      return yield* new BoardSavedViewIdentifierAmbiguousError({ identifier: value, matches: matches.length })
    }
    return yield* new BoardSavedViewNotFoundError({ identifier: value })
  })

const resolveViewlets = (
  viewlets: ReadonlyArray<Viewlet>,
  identifier: BoardViewletIdentifier | undefined
): Effect.Effect<Array<Viewlet>, BoardViewletError> =>
  Effect.gen(function*() {
    if (identifier === undefined) return [...viewlets]
    const value = String(identifier)
    const byId = viewlets.filter((item) => item._id === value)
    if (byId.length > 0) return byId
    const matches = viewlets.filter((item) =>
      item.title === value || item.variant === value || item.descriptor === value
    )
    if (matches.length === 1) return matches
    if (matches.length > 1) {
      return yield* new BoardViewletIdentifierAmbiguousError({ identifier: value, matches: matches.length })
    }
    return yield* new BoardViewletNotFoundError({ identifier: value })
  })

const descriptorSummary = (descriptor: ViewletDescriptor) => ({
  id: BoardViewletDescriptorId.make(descriptor._id),
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
): BoardViewletSummary => ({
  id: BoardViewletId.make(item._id),
  attachTo: String(item.attachTo),
  descriptor: BoardViewletDescriptorId.make(item.descriptor),
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
    id: BoardViewletPreferenceId.make(preference._id),
    attachedTo: BoardViewletId.make(preference.attachedTo),
    config: [...preference.config]
  }))
})

export const listBoardMenuPages = (
  params: ListBoardMenuPagesParams
): Effect.Effect<ListBoardMenuPagesResult, BoardMenuPageError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const pages = yield* client.findAllInModel<MenuPage>(board.class.MenuPage, hulyQuery<MenuPage>({}))
    const resolved = yield* resolveMenuPages(pages, params.page)
    const limited = resolved.slice(0, clampLimit(params.limit))
    return { pages: limited.map(toMenuPageSummary), total: Count.make(resolved.length) }
  })

export const listBoardSavedViews = (
  params: ListBoardSavedViewsParams
): Effect.Effect<ListBoardSavedViewsResult, HulyClientError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const account = client.getAccountUuid()
    const nameSearch = params.nameSearch?.trim() ?? ""
    const query: StrictDocumentQuery<FilteredView> = {
      attachedTo: boardApp,
      ...(nameSearch === "" ? {} : { name: { $like: `%${escapeLikeWildcards(nameSearch)}%` } })
    }
    const savedViews = yield* client.findAll<FilteredView>(
      view.class.FilteredView,
      hulyQuery(query),
      { sort: { modifiedOn: SortingOrder.Descending }, total: true }
    )
    const visible = filterByVisibility(savedViews, params.visibility, account)
    const limited = visible.slice(0, clampLimit(params.limit))
    return {
      savedViews: limited.map((savedView) => toSavedViewSummary(savedView, account)),
      total: Count.make(Math.max(0, visible.length))
    }
  })

export const getBoardSavedView = (
  params: GetBoardSavedViewParams
): Effect.Effect<BoardSavedViewDetail, BoardSavedViewError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const savedViews = yield* client.findAll<FilteredView>(
      view.class.FilteredView,
      hulyQuery<FilteredView>({ attachedTo: boardApp })
    )
    const savedView = yield* resolveSavedView(savedViews, params.savedView)
    return toSavedViewDetail(savedView, client.getAccountUuid())
  })

export const listBoardViewlets = (
  params: ListBoardViewletsParams
): Effect.Effect<ListBoardViewletsResult, BoardViewletError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const allViewlets = yield* client.findAllInModel<Viewlet>(
      view.class.Viewlet,
      hulyQuery<Viewlet>({ attachTo: board.class.Card })
    )
    const resolved = yield* resolveViewlets(allViewlets, params.viewlet)
    const limited = resolved.slice(0, clampLimit(params.limit))
    const descriptorIds = [...new Set(limited.map((item) => item.descriptor))]
    const descriptors = descriptorIds.length === 0
      ? []
      : yield* client.findAllInModel<ViewletDescriptor>(
        view.class.ViewletDescriptor,
        hulyQuery<ViewletDescriptor>({ _id: { $in: descriptorIds } })
      )
    const preferences = limited.length === 0
      ? []
      : yield* client.findAll<ViewletPreference>(
        view.class.ViewletPreference,
        hulyQuery<ViewletPreference>({ attachedTo: { $in: limited.map((item) => item._id) } })
      )
    const descriptorsById = new Map(descriptors.map((descriptor) => [descriptor._id, descriptor]))
    const preferencesFor = (viewletId: Viewlet["_id"]) =>
      preferences.filter((preference) => preference.attachedTo === viewletId)

    return {
      viewlets: limited.map((item) =>
        toViewletSummary(item, descriptorsById.get(item.descriptor), preferencesFor(item._id))
      ),
      total: Count.make(resolved.length)
    }
  })

export const getBoardCommonPreference = (): Effect.Effect<BoardCommonPreferenceResult, HulyClientError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const preference = yield* client.findOne<CommonBoardPreference>(
      board.class.CommonBoardPreference,
      hulyQuery<CommonBoardPreference>({ attachedTo: boardApp })
    )
    if (preference === undefined) return { present: false, attachedTo: boardApp }
    return {
      present: true,
      attachedTo: preference.attachedTo,
      id: BoardCommonPreferenceId.make(preference._id),
      raw: preference
    }
  })
