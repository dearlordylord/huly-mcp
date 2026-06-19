import type {
  Doc,
  Permission as HulyPermission,
  Ref,
  Role as HulyRole,
  Space,
  SpaceType as HulySpaceType,
  SpaceTypeDescriptor
} from "@hcengineering/core"
import { SortingOrder } from "@hcengineering/core"
import { Effect } from "effect"

import type {
  GetSpaceParams,
  GetSpaceTypeParams,
  ListSpacePermissionsParams,
  ListSpacePermissionsResult,
  ListSpacesParams,
  ListSpacesResult,
  ListSpaceTypesParams,
  ListSpaceTypesResult,
  SpaceTypeDetail
} from "../../domain/schemas.js"
import type { SpaceTypeIdentifier } from "../../domain/schemas/shared.js"
import { AccountUuid, NonEmptyString, ObjectClassName, SpaceTypeId } from "../../domain/schemas/shared.js"
import { SpaceRoleAssignmentsDegradedWarningCode } from "../../domain/schemas/tool-warnings.js"
import { isSingle } from "../../utils/assertions.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { Diagnostics } from "../diagnostics.js"
import type { SpaceTypeIdentifierAmbiguousError, SpaceTypeNotFoundError } from "../errors.js"
import {
  SpaceTypeIdentifierAmbiguousError as SpaceTypeIdentifierAmbiguous,
  SpaceTypeNotFoundError as SpaceTypeNotFound
} from "../errors.js"
import { core } from "../huly-plugins.js"
import { clampLimit, hulyQuery, type StrictDocumentQuery } from "./query-helpers.js"
import { toClassRef, toRef } from "./sdk-boundary.js"
import {
  descriptorId,
  permissionSearchMatches,
  roleSummary,
  spaceTypeSummary,
  toPermissionSummary,
  toSpaceDetail,
  toSpaceSummary
} from "./spaces-projections.js"
import {
  applySpaceFilters,
  findSpace,
  listTotal,
  readSpaceRoleAssignmentEntries,
  roleAssignmentDegradationMessage,
  sortStrings,
  spaceClass,
  type SpaceMutationError
} from "./spaces-shared.js"

type GetSpaceTypeError = HulyClientError | SpaceTypeNotFoundError | SpaceTypeIdentifierAmbiguousError

const findSpaceType = (
  client: HulyClient["Type"],
  identifier: SpaceTypeIdentifier
): Effect.Effect<HulySpaceType, GetSpaceTypeError> =>
  Effect.gen(function*() {
    const byId = yield* client.findOne<HulySpaceType>(
      core.class.SpaceType,
      hulyQuery<HulySpaceType>({ _id: toRef<HulySpaceType>(identifier) })
    )
    if (byId !== undefined) return byId

    const byName = yield* client.findAll<HulySpaceType>(
      core.class.SpaceType,
      hulyQuery<HulySpaceType>({ name: identifier }),
      { limit: 10, sort: { name: SortingOrder.Ascending } }
    )

    if (byName.length === 0) {
      return yield* new SpaceTypeNotFound({ identifier: NonEmptyString.make(identifier) })
    }
    if (byName.length > 1) {
      return yield* new SpaceTypeIdentifierAmbiguous({
        identifier: NonEmptyString.make(identifier),
        matches: byName.map((spaceType) => ({
          id: SpaceTypeId.make(spaceType._id),
          name: NonEmptyString.make(spaceType.name),
          targetClass: ObjectClassName.make(spaceType.targetClass)
        }))
      })
    }
    if (isSingle(byName)) return byName[0]
    return yield* new SpaceTypeNotFound({ identifier: NonEmptyString.make(identifier) })
  })

const permissionsByIds = (
  client: HulyClient["Type"],
  permissionIds: ReadonlyArray<Ref<HulyPermission>>
): Effect.Effect<Map<Ref<HulyPermission>, HulyPermission>, HulyClientError> =>
  Effect.gen(function*() {
    const uniqueIds = sortStrings([...new Set(permissionIds)])
    if (uniqueIds.length === 0) return new Map()
    const permissions = yield* client.findAll<HulyPermission>(
      core.class.Permission,
      hulyQuery<HulyPermission>({ _id: { $in: uniqueIds.map(toRef<HulyPermission>) } }),
      { limit: uniqueIds.length }
    )
    return new Map(permissions.map((permission) => [permission._id, permission]))
  })

export const listSpaces = (
  params: ListSpacesParams
): Effect.Effect<ListSpacesResult, HulyClientError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const query = applySpaceFilters({}, params)
    const limit = clampLimit(params.limit)

    const spaces = yield* client.findAll(
      spaceClass,
      hulyQuery(query),
      { limit, sort: { name: SortingOrder.Ascending }, total: true }
    )

    return {
      spaces: spaces.map(toSpaceSummary),
      total: listTotal(spaces.total)
    }
  })

export const getSpace = (
  params: GetSpaceParams
): Effect.Effect<ReturnType<typeof toSpaceDetail>, SpaceMutationError, HulyClient | Diagnostics> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const diagnostics = yield* Diagnostics
    const space = yield* findSpace(client, params)
    const spaceType = space.type === undefined
      ? undefined
      : yield* client.findOne<HulySpaceType>(
        core.class.SpaceType,
        hulyQuery<HulySpaceType>({ _id: toRef<HulySpaceType>(space.type) })
      )
    const roles = spaceType === undefined
      ? []
      : yield* client.findAll<HulyRole>(
        core.class.Role,
        hulyQuery<HulyRole>({ attachedTo: spaceType._id }),
        { limit: Math.max(spaceType.roles, 1) }
      )
    const validRoleIds = new Set(roles.map((role) => role._id))
    if (spaceType !== undefined) {
      const readResult = readSpaceRoleAssignmentEntries(space, spaceType, validRoleIds)
      if (readResult.degradationReasons.length > 0) {
        yield* diagnostics.warnAgent({
          code: SpaceRoleAssignmentsDegradedWarningCode,
          message: roleAssignmentDegradationMessage(readResult.degradationReasons)
        })
      }
    }
    return toSpaceDetail(space, spaceType, validRoleIds)
  })

export const listSpaceTypes = (
  params: ListSpaceTypesParams
): Effect.Effect<ListSpaceTypesResult, HulyClientError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const query: StrictDocumentQuery<HulySpaceType> = {}
    if (params.targetClass !== undefined) {
      query.targetClass = toClassRef<Space>(params.targetClass)
    }
    const limit = clampLimit(params.limit)

    const spaceTypes = yield* client.findAll<HulySpaceType>(
      core.class.SpaceType,
      hulyQuery(query),
      { limit, sort: { name: SortingOrder.Ascending }, total: true }
    )

    const descriptorIds = sortStrings([...new Set(spaceTypes.map(descriptorId))])
    const descriptors = descriptorIds.length === 0
      ? []
      : yield* client.findAll<SpaceTypeDescriptor>(
        core.class.SpaceTypeDescriptor,
        hulyQuery<SpaceTypeDescriptor>({ _id: { $in: descriptorIds.map(toRef<SpaceTypeDescriptor>) } }),
        { limit: descriptorIds.length }
      )
    const descriptorsById = new Map(descriptors.map((descriptor) => [descriptor._id, descriptor]))

    return {
      spaceTypes: spaceTypes.map((spaceType) => spaceTypeSummary(spaceType, descriptorsById.get(spaceType.descriptor))),
      total: listTotal(spaceTypes.total)
    }
  })

export const getSpaceType = (
  params: GetSpaceTypeParams
): Effect.Effect<SpaceTypeDetail, GetSpaceTypeError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const spaceType = yield* findSpaceType(client, params.spaceType)

    const descriptor = yield* client.findOne<SpaceTypeDescriptor>(
      core.class.SpaceTypeDescriptor,
      hulyQuery<SpaceTypeDescriptor>({ _id: spaceType.descriptor })
    )

    const roles = yield* client.findAll<HulyRole>(
      core.class.Role,
      hulyQuery<HulyRole>({ attachedTo: spaceType._id }),
      { limit: clampLimit(undefined), sort: { name: SortingOrder.Ascending } }
    )

    const permissionIds = sortStrings([
      ...new Set([
        ...(descriptor?.availablePermissions ?? []),
        ...roles.flatMap((role) => role.permissions)
      ])
    ])
    const permissionMap = yield* permissionsByIds(client, permissionIds)

    return {
      id: SpaceTypeId.make(spaceType._id),
      name: spaceType.name,
      shortDescription: spaceType.shortDescription === "" ? undefined : spaceType.shortDescription,
      descriptor: spaceType.descriptor,
      descriptorName: descriptor === undefined ? undefined : String(descriptor.name),
      descriptorDescription: descriptor === undefined ? undefined : String(descriptor.description),
      baseClass: descriptor?.baseClass === undefined ? undefined : ObjectClassName.make(descriptor.baseClass),
      targetClass: ObjectClassName.make(spaceType.targetClass),
      defaultMembers: (spaceType.members ?? []).map((member) => AccountUuid.make(member)),
      autoJoin: spaceType.autoJoin,
      roles: roles.map((role) => roleSummary(role, permissionMap)),
      availablePermissions: [...permissionMap.values()].map(toPermissionSummary)
    }
  })

export const listSpacePermissions = (
  params: ListSpacePermissionsParams
): Effect.Effect<ListSpacePermissionsResult, HulyClientError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const query: StrictDocumentQuery<HulyPermission> = {}
    if (params.scope !== undefined) {
      query.scope = params.scope
    }
    if (params.objectClass !== undefined) {
      query.objectClass = toClassRef<Doc>(params.objectClass)
    }
    const permissions = yield* client.findAll<HulyPermission>(
      core.class.Permission,
      hulyQuery(query),
      { sort: { label: SortingOrder.Ascending } }
    )
    const filtered = permissions.filter((permission) => permissionSearchMatches(permission, params.search))
    const limited = filtered.slice(0, clampLimit(params.limit))

    return {
      permissions: limited.map(toPermissionSummary),
      total: listTotal(filtered.length)
    }
  })
