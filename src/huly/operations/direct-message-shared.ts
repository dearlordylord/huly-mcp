import type { DirectMessage as HulyDirectMessage } from "@hcengineering/chunter"
import type { Employee as HulyEmployee } from "@hcengineering/contact"
import { type AccountUuid as HulyAccountUuid, type Data, generateId, type Ref, type Space } from "@hcengineering/core"
import { Effect } from "effect"

import { Count, type DirectMessageIdentifier } from "../../domain/schemas/shared.js"
import { isSingle } from "../../utils/assertions.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { DirectMessageIdentifierAmbiguousError, DirectMessageNotFoundError } from "../errors.js"
import { chunter, contact, core } from "../huly-plugins.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

export type FindDirectMessageError =
  | HulyClientError
  | DirectMessageIdentifierAmbiguousError
  | DirectMessageNotFoundError

export const sortedDirectMessageMembers = (
  first: HulyAccountUuid,
  second: HulyAccountUuid
): Array<HulyAccountUuid> => [first, second].sort()

export const hasExactDirectMessageMembers = (
  dm: HulyDirectMessage,
  sortedMembers: ReadonlyArray<HulyAccountUuid>
): boolean => {
  const dmMembers = [...dm.members].sort()
  return dmMembers.length === sortedMembers.length
    && sortedMembers.every((member, index) => dmMembers[index] === member)
}

export const findDirectMessage = (
  identifier: DirectMessageIdentifier
): Effect.Effect<
  { client: HulyClient["Type"]; dm: HulyDirectMessage },
  FindDirectMessageError,
  HulyClient
> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const byId = yield* client.findOne<HulyDirectMessage>(
      chunter.class.DirectMessage,
      hulyQuery<HulyDirectMessage>({ _id: toRef<HulyDirectMessage>(identifier) })
    )

    if (byId !== undefined) {
      if (!byId.members.includes(client.getAccountUuid())) {
        return yield* new DirectMessageNotFoundError({ identifier })
      }
      return { client, dm: byId }
    }

    const employees = yield* client.findAll<HulyEmployee>(
      contact.mixin.Employee,
      hulyQuery<HulyEmployee>({ name: identifier })
    )

    const accountUuid = client.getAccountUuid()
    const accountUuids = [
      ...new Set(
        employees
          .map((employee) => employee.personUuid)
          .filter((uuid) => uuid !== undefined)
          .filter((uuid) => uuid !== accountUuid)
      )
    ]

    if (accountUuids.length === 0) {
      return yield* new DirectMessageNotFoundError({ identifier })
    }

    const directMessages = yield* client.findAll<HulyDirectMessage>(
      chunter.class.DirectMessage,
      hulyQuery<HulyDirectMessage>({ members: accountUuid })
    )

    const memberPairs = accountUuids.map((candidate) => sortedDirectMessageMembers(accountUuid, candidate))
    const matches = directMessages.filter((dm) =>
      memberPairs.some((members) => hasExactDirectMessageMembers(dm, members))
    )

    if (matches.length === 0) {
      return yield* new DirectMessageNotFoundError({ identifier })
    }

    if (matches.length > 1) {
      return yield* new DirectMessageIdentifierAmbiguousError({ identifier, matches: Count.make(matches.length) })
    }

    if (isSingle(matches)) return { client, dm: matches[0] }
    return yield* new DirectMessageNotFoundError({ identifier })
  })

export const createDirectMessageSpace = (
  client: HulyClient["Type"],
  members: ReadonlyArray<HulyAccountUuid>
): Effect.Effect<Ref<HulyDirectMessage>, HulyClientError> =>
  Effect.gen(function*() {
    const dmId: Ref<HulyDirectMessage> = generateId()
    const dmData: Data<HulyDirectMessage> = {
      name: "",
      description: "",
      private: true,
      archived: false,
      members: [...members]
    }

    yield* client.createDoc(
      chunter.class.DirectMessage,
      toRef<Space>(core.space.Space),
      dmData,
      dmId
    )

    return dmId
  })
