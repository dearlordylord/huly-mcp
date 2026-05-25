import { describe, it } from "@effect/vitest"
import type { Class, Doc, DocumentQuery, FindOptions, PersonId, Ref, UserStatus } from "@hcengineering/core"
import { SortingOrder, toFindResult } from "@hcengineering/core"
import { Effect } from "effect"
import { expect } from "vitest"

import { UserStatusAccountUuid } from "../../../src/domain/schemas/user-statuses.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { core } from "../../../src/huly/huly-plugins.js"
import { listUserStatuses } from "../../../src/huly/operations/user-statuses.js"

/* eslint-disable no-restricted-syntax -- Huly SDK phantom brands and generic test-client dispatch need casts in fixtures */

const personId = "person-1" as PersonId
const userStatusId = "user-status-1" as Ref<UserStatus>
const accountUuid = "11111111-1111-4111-8111-111111111111" as UserStatus["user"]

const makeUserStatus = (overrides?: Partial<UserStatus>): UserStatus => ({
  _id: userStatusId,
  _class: core.class.UserStatus,
  space: core.space.Workspace,
  modifiedOn: 1700000000000,
  modifiedBy: personId,
  online: true,
  user: accountUuid,
  ...overrides
})

type CapturedFindAll = {
  query?: DocumentQuery<UserStatus>
  options?: FindOptions<UserStatus>
}

const createLayer = (
  statuses: ReadonlyArray<UserStatus> = [makeUserStatus()],
  captured: CapturedFindAll = {}
) => {
  const findAll: HulyClientOperations["findAll"] = (<T extends Doc>(
    _class: Ref<Class<T>>,
    query: DocumentQuery<T>,
    options?: FindOptions<T>
  ) => {
    expect(_class).toBe(core.class.UserStatus)
    captured.query = query as DocumentQuery<UserStatus>
    captured.options = options as FindOptions<UserStatus>
    return Effect.succeed(toFindResult([...statuses] as unknown as Array<T>))
  }) as HulyClientOperations["findAll"]

  return HulyClient.testLayer({ findAll })
}

describe("user status operations", () => {
  it.effect("lists user statuses with empty query by default", () =>
    Effect.gen(function*() {
      const captured: CapturedFindAll = {}
      const result = yield* listUserStatuses({}).pipe(Effect.provide(createLayer([makeUserStatus()], captured)))

      expect(captured.query).toEqual({})
      expect(result).toEqual({
        statuses: [{
          id: userStatusId,
          user: accountUuid,
          online: true,
          modifiedOn: 1700000000000
        }],
        total: 1
      })
    }))

  it.effect("includes online filter", () =>
    Effect.gen(function*() {
      const captured: CapturedFindAll = {}
      yield* listUserStatuses({ online: false }).pipe(Effect.provide(createLayer([], captured)))

      expect(captured.query).toEqual({ online: false })
    }))

  it.effect("includes user filter", () =>
    Effect.gen(function*() {
      const captured: CapturedFindAll = {}
      yield* listUserStatuses({ user: UserStatusAccountUuid.make(accountUuid) }).pipe(
        Effect.provide(createLayer([], captured))
      )

      expect(captured.query).toEqual({ user: accountUuid })
    }))

  it.effect("clamps limit and requests newest modified records first", () =>
    Effect.gen(function*() {
      const captured: CapturedFindAll = {}
      yield* listUserStatuses({ limit: 500 }).pipe(Effect.provide(createLayer([], captured)))

      expect(captured.options?.limit).toBe(200)
      expect(captured.options?.sort).toEqual({ modifiedOn: SortingOrder.Descending })
    }))

  it.effect("maps SDK docs to result summaries", () =>
    Effect.gen(function*() {
      const offlineStatus = makeUserStatus({
        _id: "user-status-2" as Ref<UserStatus>,
        user: "22222222-2222-4222-8222-222222222222" as UserStatus["user"],
        online: false,
        modifiedOn: 1700000000100
      })

      const result = yield* listUserStatuses({}).pipe(
        Effect.provide(createLayer([makeUserStatus(), offlineStatus]))
      )

      expect(result.statuses).toEqual([
        {
          id: userStatusId,
          user: accountUuid,
          online: true,
          modifiedOn: 1700000000000
        },
        {
          id: "user-status-2",
          user: "22222222-2222-4222-8222-222222222222",
          online: false,
          modifiedOn: 1700000000100
        }
      ])
      expect(result.total).toBe(2)
    }))
})
