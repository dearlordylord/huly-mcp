import type {
  Permission as HulyPermission,
  Ref,
  Role as HulyRole,
  RolesAssignment,
  SpaceType as HulySpaceType,
  SpaceTypeDescriptor
} from "@hcengineering/core"

import type {
  SpaceDetail,
  SpacePermissionSummary,
  SpaceRoleAssignment,
  SpaceRoleSummary,
  SpaceSummary,
  SpaceTypeSummary
} from "../../domain/schemas.js"
import {
  AccountUuid,
  Count,
  ObjectClassName,
  PermissionId,
  RoleId,
  SpaceId,
  SpaceTypeId
} from "../../domain/schemas/shared.js"
import type { GenericSpace } from "./spaces-shared.js"
import { optionalObjectClassName, optionalString } from "./spaces-shared.js"

type SpaceWithRoles = GenericSpace & {
  readonly roles?: RolesAssignment
}

export const toPermissionSummary = (permission: HulyPermission): SpacePermissionSummary => ({
  id: PermissionId.make(permission._id),
  label: String(permission.label),
  description: optionalString(permission.description === undefined ? undefined : String(permission.description)),
  scope: permission.scope,
  objectClass: optionalObjectClassName(permission.objectClass),
  txClass: optionalObjectClassName(permission.txClass),
  forbid: permission.forbid
})

export const descriptorId = (spaceType: HulySpaceType): Ref<SpaceTypeDescriptor> => spaceType.descriptor

export const toSpaceSummary = (space: GenericSpace): SpaceSummary => ({
  id: SpaceId.make(space._id),
  name: space.name,
  description: optionalString(space.description),
  class: ObjectClassName.make(space._class),
  type: space.type === undefined ? undefined : SpaceTypeId.make(space.type),
  private: space.private,
  archived: space.archived,
  autoJoin: space.autoJoin,
  membersCount: Count.make(space.members.length),
  ownersCount: Count.make(space.owners?.length ?? 0)
})

const roleAssignments = (space: SpaceWithRoles): Array<SpaceRoleAssignment> | undefined => {
  if (space.roles === undefined) return undefined
  return Object.entries(space.roles).map(([roleId, members]) => ({
    roleId: RoleId.make(roleId),
    members: (members ?? []).map((member) => AccountUuid.make(member))
  }))
}

export const toSpaceDetail = (space: SpaceWithRoles): SpaceDetail => ({
  id: SpaceId.make(space._id),
  name: space.name,
  description: space.description,
  class: ObjectClassName.make(space._class),
  type: space.type === undefined ? undefined : SpaceTypeId.make(space.type),
  private: space.private,
  archived: space.archived,
  autoJoin: space.autoJoin,
  members: space.members.map((member) => AccountUuid.make(member)),
  owners: (space.owners ?? []).map((owner) => AccountUuid.make(owner)),
  roleAssignments: roleAssignments(space)
})

export const spaceTypeSummary = (
  spaceType: HulySpaceType,
  descriptor: SpaceTypeDescriptor | undefined
): SpaceTypeSummary => ({
  id: SpaceTypeId.make(spaceType._id),
  name: spaceType.name,
  shortDescription: optionalString(spaceType.shortDescription),
  descriptor: spaceType.descriptor,
  baseClass: optionalObjectClassName(descriptor?.baseClass),
  targetClass: ObjectClassName.make(spaceType.targetClass),
  defaultMembers: (spaceType.members ?? []).map((member) => AccountUuid.make(member)),
  autoJoin: spaceType.autoJoin,
  rolesCount: Count.make(spaceType.roles)
})

export const roleSummary = (
  role: HulyRole,
  permissionsById: ReadonlyMap<Ref<HulyPermission>, HulyPermission>
): SpaceRoleSummary => ({
  id: RoleId.make(role._id),
  name: role.name,
  permissions: role.permissions.map((permission) => PermissionId.make(permission)),
  permissionLabels: role.permissions
    .map((permissionId) => permissionsById.get(permissionId))
    .filter((permission) => permission !== undefined)
    .map((permission) => String(permission.label))
})

export const permissionSearchMatches = (permission: HulyPermission, search: string | undefined): boolean => {
  if (search === undefined) return true
  const lower = search.toLowerCase()
  return [
    permission._id,
    String(permission.label),
    permission.description === undefined ? "" : String(permission.description)
  ].some((value) => value.toLowerCase().includes(lower))
}
