import { listUserStatusesParamsJsonSchema, parseListUserStatusesParams } from "../../domain/schemas.js"
import { ListUserStatusesResultSchema } from "../../domain/schemas/user-statuses.js"
import { listUserStatuses } from "../../huly/operations/user-statuses.js"
import { defineTool, type RegisteredTool } from "./registry.js"
const CATEGORY = "user-statuses" as const
export const userStatusTools: ReadonlyArray<RegisteredTool> = [
  defineTool(
    {
      name: "list_user_statuses",
      description:
        "List Huly user presence records. Returns account UUIDs, online status, and last modified timestamp. Use this to check who is currently connected; presence is maintained by Huly server sessions. Filter by online or account UUID.",
      category: CATEGORY,
      inputSchema: listUserStatusesParamsJsonSchema,
      resultSchema: ListUserStatusesResultSchema
    },
    parseListUserStatusesParams,
    listUserStatuses
  )
]
