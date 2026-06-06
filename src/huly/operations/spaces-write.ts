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
import { requireUpdateFields } from "./update-guards.js"

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

export const updateSpace = (
  params: UpdateSpaceParams
): Effect.Effect<UpdateSpaceResult, UpdateSpaceError, HulyClient> =>
  Effect.gen(function*() {
    yield* requireUpdateFields("update_space", params, UPDATE_SPACE_FIELDS)
    const client = yield* HulyClient
    const space = yield* findSpace(client, params)

    const operations: DocumentUpdate<GenericSpace> = {}
    if (params.name !== undefined) operations.name = params.name
    if (params.description !== undefined) operations.description = params.description
    if (params.private !== undefined) operations.private = params.private
    if (params.archived !== undefined) operations.archived = params.archived
    if (params.autoJoin !== undefined) operations.autoJoin = params.autoJoin

    yield* updateSpaceDoc(client, space, operations)
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
