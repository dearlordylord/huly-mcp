import type {
  AccountProfile,
  WorkspaceMemberInfo,
  WorkspacePersonAdministrationProjectionData,
  WorkspaceSocialIdentity
} from "./person-administration-boundaries.js"

const fieldClassifications = [
  { field: "birthday", classification: "exposed", reason: "Stored directly on Contact Person." },
  { field: "avatar", classification: "exposed", reason: "Provider, blob, color, and external URL metadata." },
  { field: "socialIds", classification: "derived", reason: "Read from attached SocialIdentity documents." },
  {
    field: "channelActivity",
    classification: "derived",
    reason: "Read from attached Channel counters and timestamps."
  },
  { field: "contactStatus", classification: "derived", reason: "Read from attached Contact Status documents." },
  { field: "workspaceMembership", classification: "derived", reason: "Joined by global person UUID." },
  {
    field: "workspaceMemberStatus",
    classification: "unsupported",
    reason: "The pinned Huly contact SDK does not export WorkspaceMemberStatus, so it cannot be queried safely."
  },
  { field: "profile", classification: "derived", reason: "Read from Huly's account profile service by person UUID." },
  {
    field: "profileCardId",
    classification: "exposed",
    reason: "Native Contact Person reference to the workspace UserProfile card."
  },
  {
    field: "socialIdentityMutation",
    classification: "unsupported",
    reason: "Only Huly-native account-authoritative projection repair is supported; arbitrary identity edits are not."
  },
  {
    field: "arbitraryPersonProfileMutation",
    classification: "unsupported",
    reason: "Huly's account contract only permits setMyProfile for the authenticated user."
  }
] as const

interface PersonAdministrationProjectionInput extends WorkspacePersonAdministrationProjectionData {
  readonly identities: ReadonlyArray<WorkspaceSocialIdentity>
  readonly members: ReadonlyArray<WorkspaceMemberInfo>
  readonly profile: AccountProfile | null
}

const avatarProjection = (person: PersonAdministrationProjectionInput["person"]) => ({
  type: person.avatarType,
  ...(person.avatar === undefined || person.avatar === null ? {} : { blobId: person.avatar }),
  ...(person.avatarProps?.color === undefined ? {} : { color: person.avatarProps.color }),
  ...(person.avatarProps?.url === undefined ? {} : { externalUrl: person.avatarProps.url })
})

const profileIdentityProjection = (profile: AccountProfile) => ({
  firstName: profile.firstName,
  lastName: profile.lastName,
  isPublic: profile.isPublic
})

const profileLocationProjection = (profile: AccountProfile) => ({
  ...(profile.city === undefined || profile.city === null ? {} : { city: profile.city }),
  ...(profile.country === undefined || profile.country === null ? {} : { country: profile.country }),
  ...(profile.website === undefined || profile.website === null ? {} : { website: profile.website })
})

const profileDetailsProjection = (profile: AccountProfile) => ({
  ...(profile.bio === undefined || profile.bio === null ? {} : { bio: profile.bio }),
  ...(profile.socialLinks === undefined || profile.socialLinks === null ? {} : { socialLinks: profile.socialLinks })
})

const profileProjection = (profile: AccountProfile) => ({
  ...profileIdentityProjection(profile),
  ...profileLocationProjection(profile),
  ...profileDetailsProjection(profile)
})

const identityProjection = (identity: WorkspaceSocialIdentity) => ({
  id: identity._id,
  type: identity.type,
  value: identity.value,
  key: identity.key,
  ...(identity.displayValue === undefined ? {} : { displayValue: identity.displayValue }),
  ...(identity.verifiedOn === undefined ? {} : { verifiedOn: identity.verifiedOn }),
  isDeleted: identity.isDeleted === true
})

const channelProjection = (channel: PersonAdministrationProjectionInput["channels"][number]) => ({
  channelId: channel._id,
  ...(channel.items === undefined ? {} : { items: channel.items }),
  ...(channel.lastMessage === undefined ? {} : { lastMessage: channel.lastMessage })
})

const workspaceMemberProjection = (
  employee: PersonAdministrationProjectionInput["employee"],
  member: WorkspaceMemberInfo | undefined
) => ({
  member: member !== undefined,
  ...(employee?.active === undefined ? {} : { active: employee.active }),
  ...(member === undefined ? {} : { role: member.role })
})

const personMetadataProjection = (
  person: PersonAdministrationProjectionInput["person"],
  personUuid: PersonAdministrationProjectionInput["person"]["personUuid"]
) => ({
  personId: person._id,
  ...(personUuid === undefined ? {} : { personUuid }),
  ...(person.birthday === undefined ? {} : { birthday: person.birthday }),
  avatar: avatarProjection(person),
  ...(person.profile === undefined ? {} : { profileCardId: person.profile })
})

export const makePersonAdministrationProjection = (input: PersonAdministrationProjectionInput): unknown => {
  const personUuid = input.employee?.personUuid ?? input.person.personUuid
  const member = personUuid === undefined ? undefined : input.members.find((entry) => entry.person === personUuid)
  return {
    ...personMetadataProjection(input.person, personUuid),
    contactStatuses: input.statuses
      .map((status) => ({ name: status.name, dueDate: status.dueDate }))
      .sort((left, right) => left.dueDate - right.dueDate || left.name.localeCompare(right.name)),
    workspaceMember: workspaceMemberProjection(input.employee, member),
    socialIdentities: input.identities
      .map(identityProjection)
      .sort((left, right) => left.type.localeCompare(right.type) || left.key.localeCompare(right.key)),
    ...(input.profile === null ? {} : { profile: profileProjection(input.profile) }),
    channelActivity: input.channels
      .map(channelProjection)
      .sort((left, right) => left.channelId.localeCompare(right.channelId)),
    fieldClassifications: [...fieldClassifications]
  }
}
