import { JSONSchema, Schema } from "effect"

import { LimitParam, ListTotal, NonEmptyString, Timestamp } from "./shared.js"

export const UserStatusId = NonEmptyString.pipe(Schema.brand("UserStatusId"))
export type UserStatusId = Schema.Schema.Type<typeof UserStatusId>

export const UserStatusAccountUuid = NonEmptyString.pipe(Schema.brand("UserStatusAccountUuid"))
export type UserStatusAccountUuid = Schema.Schema.Type<typeof UserStatusAccountUuid>

export const UserStatusSummarySchema = Schema.Struct({
  id: UserStatusId,
  user: UserStatusAccountUuid,
  online: Schema.Boolean,
  modifiedOn: Timestamp
})
export type UserStatusSummary = Schema.Schema.Type<typeof UserStatusSummarySchema>

export const ListUserStatusesParamsSchema = Schema.Struct({
  online: Schema.optional(Schema.Boolean.annotations({
    description: "Optional presence filter. Use true for currently connected users, false for offline records."
  })),
  user: Schema.optional(UserStatusAccountUuid.annotations({
    description: "Optional Huly account UUID filter. Pass the exact account UUID from a user status row."
  })),
  limit: Schema.optional(LimitParam.annotations({
    description: "Maximum number of user status records to return (default: 50, maximum: 200)."
  }))
}).annotations({
  title: "ListUserStatusesParams",
  description: "Parameters for listing Huly user presence records."
})
export type ListUserStatusesParams = Schema.Schema.Type<typeof ListUserStatusesParamsSchema>

export const ListUserStatusesResultSchema = Schema.Struct({
  statuses: Schema.Array(UserStatusSummarySchema),
  total: ListTotal
})
export type ListUserStatusesResult = Schema.Schema.Type<typeof ListUserStatusesResultSchema>

export const listUserStatusesParamsJsonSchema = JSONSchema.make(ListUserStatusesParamsSchema)

export const parseListUserStatusesParams = Schema.decodeUnknown(ListUserStatusesParamsSchema)
