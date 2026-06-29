import {
  FilteredViewDetailSchema,
  getFilteredViewParamsJsonSchema,
  listFilteredViewsParamsJsonSchema,
  ListFilteredViewsResultSchema,
  listViewletsParamsJsonSchema,
  ListViewletsResultSchema,
  parseGetFilteredViewParams,
  parseListFilteredViewsParams,
  parseListViewletsParams
} from "../../domain/schemas.js"
import { getFilteredView, listFilteredViews, listViewlets } from "../../huly/operations/views.js"
import { defineTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "views" as const

export const viewTools = [
  defineTool(
    {
      name: "list_filtered_views",
      description:
        "List saved filtered views from @hcengineering/view. Use attachedTo to scope by raw app/resource string such as board:app:Board; omit attachedTo to discover saved views across modules. Reports own/shared visibility from the current account's users membership.",
      category: CATEGORY,
      inputSchema: listFilteredViewsParamsJsonSchema,
      resultSchema: ListFilteredViewsResultSchema
    },
    parseListFilteredViewsParams,
    listFilteredViews
  ),
  defineTool(
    {
      name: "get_filtered_view",
      description:
        "Get one saved filtered view by FilteredView _id or exact name. Pass attachedTo, such as board:app:Board, when an exact name may exist in more than one module. Read-only; no saved-view writes are performed.",
      category: CATEGORY,
      inputSchema: getFilteredViewParamsJsonSchema,
      resultSchema: FilteredViewDetailSchema
    },
    parseGetFilteredViewParams,
    getFilteredView
  ),
  defineTool(
    {
      name: "list_viewlets",
      description:
        "List viewlets from @hcengineering/view model metadata. Use attachTo with a Huly class id such as board:class:Card to scope by rendered document class; use list_huly_classes when you need class ids. The optional viewlet locator accepts a Viewlet _id, exact title, exact variant, or descriptor _id; descriptor ids may return multiple viewlets. Includes descriptor metadata and matching ViewletPreference configs.",
      category: CATEGORY,
      inputSchema: listViewletsParamsJsonSchema,
      resultSchema: ListViewletsResultSchema
    },
    parseListViewletsParams,
    listViewlets
  )
] as const satisfies ReadonlyArray<RegisteredTool>
