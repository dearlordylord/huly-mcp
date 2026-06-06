import type {
  AccountUuid as HulyAccountUuid,
  DocumentUpdate,
  Space,
  SpaceType as HulySpaceType,
  TypedSpace
} from "@hcengineering/core"
import { SortingOrder } from "@hcengineering/core"
import { Effect } from "effect"

import type { SpaceClassFilter, SpaceIdentifier, SpaceTypeId } from "../../domain/schemas/shared.js"
import {
  ListTotal,
  NonEmptyString,
  ObjectClassName,
  SpaceId,
  SpaceTypeId as SpaceTypeIdSchema
} from "../../domain/schemas/shared.js"
import type { SpaceMemberIdentifier } from "../../domain/schemas/spaces.js"
import type { HulyClient, HulyClientError } from "../client.js"
import type {
  NoUpdateFieldsError,
  PersonIdentifierAmbiguousError,
  PersonNotAnEmployeeError,
  PersonNotFoundError,
  SpaceIdentifierAmbiguousError,
  SpaceNotFoundError
} from "../errors.js"
import {
  SpaceIdentifierAmbiguousError as SpaceIdentifierAmbiguous,
  SpaceNotFoundError as SpaceNotFound
} from "../errors.js"
import { core } from "../huly-plugins.js"
import { resolveEmployeeAccountUuid } from "./contacts-shared.js"
import { hulyQuery, type StrictDocumentQuery } from "./query-helpers.js"
import { toAccountUuid, toClassRef, toRef } from "./sdk-boundary.js"

export type GenericSpace = Space & Partial<Pick<TypedSpace, "type" | "restricted">>

export type SpaceMutationError =
  | HulyClientError
  | SpaceNotFoundError
  | SpaceIdentifierAmbiguousError

export type SpaceMemberMutationError =
  | SpaceMutationError
  | PersonIdentifierAmbiguousError
  | PersonNotFoundError
  | PersonNotAnEmployeeError

export type UpdateSpaceError = SpaceMutationError | NoUpdateFieldsError

const ACCOUNT_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const spaceClass = toClassRef<GenericSpace>(core.class.Space)

export const sortStrings = <T extends string>(values: ReadonlyArray<T>): Array<T> => [...values].sort()

const uniqueSorted = <T extends string>(values: ReadonlyArray<T>): Array<T> => sortStrings([...new Set(values)])

export const listTotal = (value: number): ListTotal => ListTotal.make(value)

export const mergeUniqueSortedAccountUuids = (
  current: ReadonlyArray<HulyAccountUuid>,
  additions: ReadonlyArray<HulyAccountUuid>
): Array<HulyAccountUuid> => uniqueSorted([...current, ...additions])

export const removeAccountUuids = (
  current: ReadonlyArray<HulyAccountUuid>,
  removals: ReadonlyArray<HulyAccountUuid>
): Array<HulyAccountUuid> => {
  const removeSet = new Set(removals)
  return uniqueSorted(current.filter((value) => !removeSet.has(value)))
}

export const arraysEqual = <T extends string>(left: ReadonlyArray<T>, right: ReadonlyArray<T>): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index])

export const optionalString = (value: string | undefined): string | undefined =>
  value === undefined || value === "" ? undefined : value

export const optionalObjectClassName = (value: string | undefined): ObjectClassName | undefined =>
  value === undefined || value === "" ? undefined : ObjectClassName.make(value)

export const applySpaceFilters = (
  query: StrictDocumentQuery<GenericSpace>,
  filters: {
    readonly includeArchived?: boolean | undefined
    readonly class?: SpaceClassFilter | undefined
    readonly type?: SpaceTypeId | undefined
  }
): StrictDocumentQuery<GenericSpace> => {
  const next: StrictDocumentQuery<GenericSpace> = { ...query }
  if (!filters.includeArchived) {
    next.archived = false
  }
  if (filters.class !== undefined) {
    next._class = toClassRef<GenericSpace>(filters.class)
  }
  if (filters.type !== undefined) {
    next.type = toRef<HulySpaceType>(filters.type)
  }
  return next
}

export const findSpace = (
  client: HulyClient["Type"],
  params: {
    readonly space: SpaceIdentifier
    readonly includeArchived?: boolean | undefined
    readonly class?: SpaceClassFilter | undefined
    readonly type?: SpaceTypeId | undefined
  }
): Effect.Effect<GenericSpace, SpaceMutationError> =>
  Effect.gen(function*() {
    const byId = yield* client.findOne<GenericSpace>(
      spaceClass,
      hulyQuery<GenericSpace>({ _id: toRef<GenericSpace>(params.space) })
    )

    if (byId !== undefined) return byId

    const matches = yield* client.findAll<GenericSpace>(
      spaceClass,
      hulyQuery(applySpaceFilters(hulyQuery<GenericSpace>({ name: params.space }), params)),
      { limit: 10, sort: { name: SortingOrder.Ascending } }
    )

    if (matches.length === 0) {
      return yield* new SpaceNotFound({ identifier: NonEmptyString.make(params.space) })
    }
    if (matches.length > 1) {
      return yield* new SpaceIdentifierAmbiguous({
        identifier: NonEmptyString.make(params.space),
        matches: matches.map((space) => ({
          id: SpaceId.make(space._id),
          name: NonEmptyString.make(space.name),
          class: ObjectClassName.make(space._class),
          type: space.type === undefined ? undefined : SpaceTypeIdSchema.make(space.type)
        }))
      })
    }
    return matches[0]
  })

export const updateSpaceDoc = (
  client: HulyClient["Type"],
  space: GenericSpace,
  operations: DocumentUpdate<GenericSpace>
): Effect.Effect<void, HulyClientError> =>
  client.updateDoc(
    toClassRef<GenericSpace>(space._class),
    toRef<Space>(space.space),
    toRef<GenericSpace>(space._id),
    operations
  ).pipe(Effect.asVoid)

export const resolveMembers = (
  client: HulyClient["Type"],
  members: ReadonlyArray<SpaceMemberIdentifier>
): Effect.Effect<
  Array<HulyAccountUuid>,
  SpaceMemberMutationError
> =>
  Effect.forEach(members, (member) =>
    ACCOUNT_UUID_RE.test(member)
      ? Effect.succeed(toAccountUuid(member))
      : resolveEmployeeAccountUuid(client, member)).pipe(Effect.map(uniqueSorted))
