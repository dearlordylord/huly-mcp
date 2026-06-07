import type { UserStatus } from "@hcengineering/core"
import { SortingOrder } from "@hcengineering/core"
import { Effect } from "effect"

import {
  type ListUserStatusesParams,
  type ListUserStatusesResult,
  ListUserStatusesResultSchema,
  Timestamp,
  UserStatusAccountUuid,
  UserStatusId
} from "../../domain/schemas.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { core } from "../huly-plugins.js"
import { listTotal } from "./counts.js"
import { clampLimit, hulyQuery, type StrictDocumentQuery } from "./query-helpers.js"
import { toAccountUuid } from "./sdk-boundary.js"

const userStatusSummary = (status: UserStatus) => ({
  id: UserStatusId.make(status._id),
  user: UserStatusAccountUuid.make(status.user),
  online: status.online,
  modifiedOn: Timestamp.make(status.modifiedOn)
})

export const listUserStatuses = (
  params: ListUserStatusesParams
): Effect.Effect<ListUserStatusesResult, HulyClientError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const onlineQuery = params.online === undefined ? {} : { online: params.online }
    const userQuery = params.user === undefined ? {} : { user: toAccountUuid(params.user) }
    const query: StrictDocumentQuery<UserStatus> = { ...onlineQuery, ...userQuery }

    const statuses = yield* client.findAll<UserStatus>(
      core.class.UserStatus,
      hulyQuery(query),
      {
        limit: clampLimit(params.limit),
        sort: { modifiedOn: SortingOrder.Descending }
      }
    )

    return ListUserStatusesResultSchema.make({
      statuses: statuses.map(userStatusSummary),
      total: listTotal(statuses.length)
    })
  })
