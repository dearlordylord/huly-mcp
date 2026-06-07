import type { AccountUuid as HulyAccountUuid, DocumentUpdate } from "@hcengineering/core"
import { Effect } from "effect"

import type {
  SetSpaceOwnersParams,
  SetSpaceOwnersResult,
  SpaceMemberMutationParams,
  SpaceMemberMutationResult,
  UpdateSpaceParams,
  UpdateSpaceResult
} from "../../domain/schemas.js"
import { UPDATE_SPACE_FIELDS } from "../../domain/schemas.js"
import { AccountUuid, SpaceId } from "../../domain/schemas/shared.js"
import { HulyClient } from "../client.js"
import { toAccountUuid } from "./sdk-boundary.js"
import {
  arraysEqual,
  findSpace,
  type GenericSpace,
  mergeUniqueSortedAccountUuids,
  removeAccountUuids,
  resolveMembers,
  sortStrings,
  type SpaceMemberMutationError,
  updateSpaceDoc,
  type UpdateSpaceError
} from "./spaces-shared.js"
import { type DirectUpdateEntry, mergeUpdateEntries, requireUpdateFields } from "./update-guards.js"

type MemberListMutation = (
  currentMembers: ReadonlyArray<HulyAccountUuid>,
  resolvedMembers: ReadonlyArray<HulyAccountUuid>
) => ReadonlyArray<HulyAccountUuid>

const mutateSpaceMembers = (
  params: SpaceMemberMutationParams,
  mutateMembers: MemberListMutation
): Effect.Effect<SpaceMemberMutationResult, SpaceMemberMutationError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const space = yield* findSpace(client, params)
    const resolvedMembers = yield* resolveMembers(client, params.members)
    const nextMembers = mutateMembers(space.members, resolvedMembers).map(toAccountUuid)
    const changed = !arraysEqual(sortStrings(space.members), nextMembers)
    if (changed) {
      yield* updateSpaceDoc(client, space, { members: nextMembers })
    }
    return { id: SpaceId.make(space._id), members: nextMembers.map((member) => AccountUuid.make(member)), changed }
  })

type UpdateSpaceField = typeof UPDATE_SPACE_FIELDS[number]

type UpdateSpaceEntries = {
  readonly [Field in UpdateSpaceField]: DirectUpdateEntry<UpdateSpaceField, DocumentUpdate<GenericSpace>, Field>
}

const buildUpdateSpaceOperations = (params: UpdateSpaceParams): DocumentUpdate<GenericSpace> => {
  const updateEntries = {
    name: params.name === undefined ? {} : { name: params.name },
    description: params.description === undefined ? {} : { description: params.description },
    private: params.private === undefined ? {} : { private: params.private },
    archived: params.archived === undefined ? {} : { archived: params.archived },
    autoJoin: params.autoJoin === undefined ? {} : { autoJoin: params.autoJoin }
  } satisfies UpdateSpaceEntries

  return mergeUpdateEntries(Object.values(updateEntries))
}

export const updateSpace = (
  params: UpdateSpaceParams
): Effect.Effect<UpdateSpaceResult, UpdateSpaceError, HulyClient> =>
  Effect.gen(function*() {
    yield* requireUpdateFields("update_space", params, UPDATE_SPACE_FIELDS)
    const client = yield* HulyClient
    const space = yield* findSpace(client, params)

    yield* updateSpaceDoc(client, space, buildUpdateSpaceOperations(params))
    return { id: SpaceId.make(space._id), updated: true }
  })

export const addSpaceMembers = (
  params: SpaceMemberMutationParams
): Effect.Effect<SpaceMemberMutationResult, SpaceMemberMutationError, HulyClient> =>
  mutateSpaceMembers(params, mergeUniqueSortedAccountUuids)

export const removeSpaceMembers = (
  params: SpaceMemberMutationParams
): Effect.Effect<SpaceMemberMutationResult, SpaceMemberMutationError, HulyClient> =>
  mutateSpaceMembers(params, removeAccountUuids)

export const setSpaceOwners = (
  params: SetSpaceOwnersParams
): Effect.Effect<SetSpaceOwnersResult, SpaceMemberMutationError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const space = yield* findSpace(client, params)
    const owners = (yield* resolveMembers(client, params.owners)).map(toAccountUuid)
    const ensureMembers = params.ensureMembers ?? true
    const nextMembers = ensureMembers
      ? mergeUniqueSortedAccountUuids(space.members, owners)
      : sortStrings(space.members)
    const currentOwners = sortStrings(space.owners ?? []).map(toAccountUuid)
    const changedOwners = !arraysEqual(currentOwners, owners)
    const changedMembers = !arraysEqual(sortStrings(space.members), nextMembers)

    if (changedOwners || changedMembers) {
      yield* updateSpaceDoc(client, space, {
        owners,
        ...(changedMembers ? { members: nextMembers } : {})
      })
    }

    return {
      id: SpaceId.make(space._id),
      owners: owners.map((owner) => AccountUuid.make(owner)),
      members: nextMembers.map((member) => AccountUuid.make(member)),
      changed: changedOwners || changedMembers
    }
  })
