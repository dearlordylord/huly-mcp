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
import { assertAt } from "../../utils/assertions.js"
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
  SpaceNotFoundError as SpaceNotFound,
  SpaceRoleAssignmentsMalformedError
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

const RoleAssignmentStorageSchema = Schema.Record({ key: Schema.String, value: Schema.Array(AccountUuid) })

type SpaceRoleAssignmentEntry = readonly [Ref<Role>, ReadonlyArray<HulyAccountUuid>]

interface SpaceRoleAssignmentStorageSource {
  readonly present: boolean
  readonly value: unknown
}

interface SpaceRoleAssignmentReadResult {
  readonly entries: ReadonlyArray<SpaceRoleAssignmentEntry>
  readonly degradationReasons: ReadonlyArray<string>
}

const isRecordObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const validStoredAccountUuid = (value: unknown): HulyAccountUuid | undefined => {
  const decoded = Schema.decodeUnknownEither(AccountUuid)(value)
  return decoded._tag === "Right" ? toAccountUuid(NonEmptyString.make(decoded.right)) : undefined
}

const parsedSpaceRoleAssignmentEntry = (
  roleId: string,
  members: ReadonlyArray<HulyAccountUuid>
): { readonly _tag: "entry"; readonly entry: SpaceRoleAssignmentEntry } => ({
  _tag: "entry",
  entry: [
    toRef<Role>(roleId),
    sortStrings(members).map(toAccountUuid)
  ]
})

// Huly stores typed-space role assignments on a dynamic mixin whose property
// name is SpaceType.targetClass. Schema can validate the extracted value, but
// the lookup itself must stay runtime-keyed. Missing means no assignment mixin;
// present-but-malformed is degraded on reads and rejected on writes.
const spaceRoleAssignmentSource = (space: GenericSpace, spaceType: HulySpaceType): SpaceRoleAssignmentStorageSource =>
  Object.prototype.hasOwnProperty.call(space, spaceType.targetClass)
    ? { present: true, value: Object.entries(space).find(([key]) => key === spaceType.targetClass)?.[1] }
    : { present: false, value: undefined }

const roleAssignmentsMalformedError = (
  space: GenericSpace,
  spaceType: HulySpaceType,
  reason: string
): SpaceRoleAssignmentsMalformedError =>
  new SpaceRoleAssignmentsMalformedError({
    space: SpaceId.make(space._id),
    spaceType: SpaceTypeIdSchema.make(spaceType._id),
    targetClass: ObjectClassName.make(spaceType.targetClass),
    reason: NonEmptyString.make(reason)
  })

export const readSpaceRoleAssignmentEntries = (
  space: GenericSpace,
  spaceType: HulySpaceType,
  validRoleIds: ReadonlySet<Ref<Role>>
): SpaceRoleAssignmentReadResult => {
  const source = spaceRoleAssignmentSource(space, spaceType)
  if (!source.present) return { entries: [], degradationReasons: [] }
  if (!isRecordObject(source.value)) {
    return {
      entries: [],
      degradationReasons: [`role assignment mixin ${spaceType.targetClass} is not an object`]
    }
  }

  const parsed = Object.entries(source.value).flatMap(([roleId, members]) => {
    if (!validRoleIds.has(toRef<Role>(roleId))) {
      return [{
        _tag: "dropped" as const,
        reason: `role assignment '${roleId}' is not defined on space type ${spaceType._id}`
      }]
    }
    if (!Array.isArray(members)) {
      return [{ _tag: "dropped" as const, reason: `role assignment '${roleId}' members are not an array` }]
    }

    const accountUuids = members.flatMap((member) => {
      const accountUuid = validStoredAccountUuid(member)
      return accountUuid === undefined ? [] : [accountUuid]
    })
    const invalidMemberCount = members.length - accountUuids.length
    return [
      ...(invalidMemberCount > 0
        ? [{
          _tag: "dropped" as const,
          reason: `role assignment '${roleId}' has ${invalidMemberCount} malformed account UUID value(s)`
        }]
        : []),
      parsedSpaceRoleAssignmentEntry(roleId, accountUuids)
    ]
  })

  return {
    entries: parsed.flatMap((item) => item._tag === "entry" ? [item.entry] : []),
    degradationReasons: parsed.flatMap((item) => item._tag === "dropped" ? [item.reason] : [])
  }
}

export const spaceRoleAssignmentEntries = (
  space: GenericSpace,
  spaceType: HulySpaceType,
  validRoleIds: ReadonlySet<Ref<Role>>
): ReadonlyArray<SpaceRoleAssignmentEntry> => readSpaceRoleAssignmentEntries(space, spaceType, validRoleIds).entries

export const hasSpaceRoleAssignmentMixin = (space: GenericSpace, spaceType: HulySpaceType): boolean =>
  spaceRoleAssignmentSource(space, spaceType).present

export const strictSpaceRoleAssignments = (
  space: GenericSpace,
  spaceType: HulySpaceType,
  validRoleIds: ReadonlySet<Ref<Role>>
): Effect.Effect<SpaceRoleAssignments, SpaceRoleAssignmentsMalformedError> =>
  Effect.gen(function*() {
    const source = spaceRoleAssignmentSource(space, spaceType)
    if (!source.present) return {}

    const decoded = Schema.decodeUnknownEither(RoleAssignmentStorageSchema)(source.value)
    if (decoded._tag === "Left") {
      return yield* roleAssignmentsMalformedError(
        space,
        spaceType,
        `expected an object whose keys are role ids and values are arrays of account UUIDs`
      )
    }

    const unknownRoleIds = Object.keys(decoded.right).filter((roleId) => !validRoleIds.has(toRef<Role>(roleId)))
    if (unknownRoleIds.length > 0) {
      return yield* roleAssignmentsMalformedError(
        space,
        spaceType,
        `unknown role assignment key(s): ${unknownRoleIds.join(", ")}`
      )
    }

    return Object.fromEntries(
      Object.entries(decoded.right).map(([roleId, members]) => [
        toRef<Role>(roleId),
        members.map((member) => toAccountUuid(NonEmptyString.make(member)))
      ])
    )
  })

export const roleAssignmentDegradationMessage = (reasons: ReadonlyArray<string>): string =>
  `Some typed-space role assignment data was omitted because existing Huly storage is malformed: ${
    reasons.join("; ")
  }. Read results include only valid role assignments; role-member write tools will refuse to modify this space until the stored role assignment data is repaired.`

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
    return assertAt(matches, 0)
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
