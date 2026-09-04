import type { Channel, Employee, Person, SocialIdentity, Status } from "@hcengineering/contact"
import type { WorkspaceMemberInfo } from "@hcengineering/core"

import { SocialIdentityId } from "../../domain/schemas/person-administration.js"
import {
  BlobId,
  ChannelId,
  Count,
  NonEmptyString,
  PersonId,
  PersonUuid,
  Timestamp,
  UrlString
} from "../../domain/schemas/shared.js"
import type { WorkspaceClientUserProfile } from "../workspace-client.js"

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

interface PersonAdministrationProjectionInput {
  readonly person: Person
  readonly identities: ReadonlyArray<SocialIdentity>
  readonly statuses: ReadonlyArray<Status>
  readonly channels: ReadonlyArray<Channel>
  readonly employee: Employee | undefined
  readonly members: ReadonlyArray<WorkspaceMemberInfo>
  readonly profile: WorkspaceClientUserProfile | null
}

const avatarProjection = (person: Person) => ({
  type: person.avatarType,
  ...(person.avatar === undefined || person.avatar === null ? {} : { blobId: BlobId.make(person.avatar) }),
  ...(person.avatarProps?.color === undefined ? {} : { color: NonEmptyString.make(person.avatarProps.color) }),
  ...(person.avatarProps?.url === undefined ? {} : { externalUrl: UrlString.make(person.avatarProps.url) })
})

const profileIdentityProjection = (profile: WorkspaceClientUserProfile) => ({
  firstName: profile.firstName,
  lastName: profile.lastName,
  isPublic: profile.isPublic
})

const profileLocationProjection = (profile: WorkspaceClientUserProfile) => ({
  ...(profile.city === undefined || profile.city === null ? {} : { city: profile.city }),
  ...(profile.country === undefined || profile.country === null ? {} : { country: profile.country }),
  ...(profile.website === undefined || profile.website === null ? {} : { website: profile.website })
})

const profileDetailsProjection = (profile: WorkspaceClientUserProfile) => ({
  ...(profile.bio === undefined || profile.bio === null ? {} : { bio: profile.bio }),
  ...(profile.socialLinks === undefined || profile.socialLinks === null ? {} : { socialLinks: profile.socialLinks })
})

const profileProjection = (profile: WorkspaceClientUserProfile) => ({
  ...profileIdentityProjection(profile),
  ...profileLocationProjection(profile),
  ...profileDetailsProjection(profile)
})

const identityProjection = (identity: SocialIdentity) => ({
  id: SocialIdentityId.make(identity._id),
  type: identity.type,
  value: identity.value,
  key: identity.key,
  ...(identity.displayValue === undefined ? {} : { displayValue: identity.displayValue }),
  ...(identity.verifiedOn === undefined ? {} : { verifiedOn: identity.verifiedOn }),
  isDeleted: identity.isDeleted === true
})

const channelProjection = (channel: Channel) => ({
  channelId: ChannelId.make(channel._id),
  ...(channel.items === undefined ? {} : { items: Count.make(channel.items) }),
  ...(channel.lastMessage === undefined ? {} : { lastMessage: Timestamp.make(channel.lastMessage) })
})

const workspaceMemberProjection = (employee: Employee | undefined, member: WorkspaceMemberInfo | undefined) => ({
  member: member !== undefined,
  ...(employee === undefined ? {} : { active: employee.active }),
  ...(member === undefined ? {} : { role: NonEmptyString.make(member.role) })
})

const personMetadataProjection = (person: Person, personUuid: Person["personUuid"]) => ({
  personId: PersonId.make(person._id),
  ...(personUuid === undefined ? {} : { personUuid: PersonUuid.make(personUuid) }),
  ...(person.birthday === undefined
    ? {}
    : { birthday: person.birthday === null ? null : Timestamp.make(person.birthday) }),
  avatar: avatarProjection(person),
  ...(person.profile === undefined ? {} : { profileCardId: NonEmptyString.make(person.profile) })
})

export const makePersonAdministrationProjection = (input: PersonAdministrationProjectionInput): unknown => {
  const personUuid = input.employee?.personUuid ?? input.person.personUuid
  const member = personUuid === undefined ? undefined : input.members.find((entry) => entry.person === personUuid)
  return {
    ...personMetadataProjection(input.person, personUuid),
    contactStatuses: input.statuses
      .map((status) => ({ name: NonEmptyString.make(status.name), dueDate: Timestamp.make(status.dueDate) }))
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
