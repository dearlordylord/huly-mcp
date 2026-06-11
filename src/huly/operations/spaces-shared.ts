import type {
  AccountUuid as HulyAccountUuid,
  DocumentUpdate,
  Ref,
  Role,
  RolesAssignment,
  Space,
  SpaceType as HulySpaceType,
  TypedSpace
} from "@hcengineering/core"
import { SortingOrder } from "@hcengineering/core"
import { Effect, Schema } from "effect"

import type { SpaceClassFilter, SpaceIdentifier, SpaceTypeId } from "../../domain/schemas/shared.js"
import {
  AccountUuid,
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
import { listTotal } from "./counts.js"
import { hulyQuery, type StrictDocumentQuery } from "./query-helpers.js"
import { toAccountUuid, toClassRef, toMixinRef, toRef } from "./sdk-boundary.js"

export type GenericSpace = Space & Partial<Pick<TypedSpace, "type" | "restricted">>
export type SpaceRoleAssignmentsMixin = GenericSpace & RolesAssignment
export type SpaceRoleAssignments = Readonly<Record<Ref<Role>, ReadonlyArray<HulyAccountUuid>>>

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

export const spaceClass = toClassRef<GenericSpace>(core.class.Space)

export const sortStrings = <T extends string>(values: ReadonlyArray<T>): Array<T> => [...values].sort()

const uniqueSorted = <T extends string>(values: ReadonlyArray<T>): Array<T> => sortStrings([...new Set(values)])

export { listTotal }

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

const isObjectRecord = (value: unknown): value is object => typeof value === "object" && value !== null

const spaceRoleAssignmentSource = (space: GenericSpace, spaceType: HulySpaceType): unknown =>
  Object.entries(space).find(([key]) => key === spaceType.targetClass)?.[1]

export const spaceRoleAssignmentEntries = (
  space: GenericSpace,
  spaceType: HulySpaceType
): ReadonlyArray<readonly [Ref<Role>, ReadonlyArray<HulyAccountUuid>]> => {
  const source = spaceRoleAssignmentSource(space, spaceType)
  if (!isObjectRecord(source)) return []

  return Object.entries(source).flatMap(([roleId, members]) =>
    Array.isArray(members)
      ? [[
        toRef<Role>(roleId),
        sortStrings(members.filter((member): member is string => typeof member === "string")).map(toAccountUuid)
      ]]
      : []
  )
}

export const spaceRoleAssignments = (space: GenericSpace, spaceType: HulySpaceType): SpaceRoleAssignments =>
  Object.fromEntries(spaceRoleAssignmentEntries(space, spaceType))

export const hasSpaceRoleAssignmentMixin = (space: GenericSpace, spaceType: HulySpaceType): boolean =>
  isObjectRecord(spaceRoleAssignmentSource(space, spaceType))

export const spaceRoleAssignmentsMixin = (spaceType: HulySpaceType) =>
  toMixinRef<SpaceRoleAssignmentsMixin>(spaceType.targetClass)

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
    Schema.is(AccountUuid)(member)
      ? Effect.succeed(toAccountUuid(member))
      : resolveEmployeeAccountUuid(client, member)).pipe(Effect.map(uniqueSorted))
