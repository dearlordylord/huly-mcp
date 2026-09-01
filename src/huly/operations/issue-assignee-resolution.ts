import type { Channel, Person, SocialIdentity, UserProfile } from "@hcengineering/contact"
import { SocialIdType, type Ref } from "@hcengineering/core"
import { Effect } from "effect"

import { Count, type PersonRefInput } from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import { PersonIdentifierAmbiguousError } from "../errors.js"
import { contact } from "../huly-plugins.js"
import { escapeLikeWildcards, hulyQuery } from "./query-helpers.js"
import { toClassRef, toRef } from "./sdk-boundary.js"

type ResolutionError = HulyClientError | PersonIdentifierAmbiguousError

const uniquePersonIds = (ids: ReadonlyArray<Ref<Person>>): Array<Ref<Person>> => [...new Set(ids)]

const loadPeople = (
  client: HulyClient["Service"],
  personIds: ReadonlyArray<Ref<Person>>
): Effect.Effect<Array<Person>, HulyClientError> => {
  const uniqueIds = uniquePersonIds(personIds)
  return uniqueIds.length === 0
    ? Effect.succeed([])
    : Effect.map(
        client.findAll<Person>(contact.class.Person, hulyQuery<Person>({ _id: { $in: uniqueIds } })),
        (people) => [...new Map(people.map((person) => [person._id, person])).values()]
      )
}

const findExactPeople = Effect.fn("IssueAssigneeResolution.findExactPeople")(function* (
  client: HulyClient["Service"],
  identifier: PersonRefInput
) {
  const [identities, channels, namedPeople, profiles] = yield* Effect.all([
    client.findAll<SocialIdentity>(
      contact.class.SocialIdentity,
      hulyQuery<SocialIdentity>({ type: SocialIdType.EMAIL, value: identifier })
    ),
    client.findAll<Channel>(
      contact.class.Channel,
      hulyQuery<Channel>({ provider: contact.channelProvider.Email, value: identifier })
    ),
    client.findAll<Person>(contact.class.Person, hulyQuery<Person>({ name: identifier })),
    client.findAll<UserProfile>(
      toClassRef<UserProfile>(contact.class.UserProfile),
      hulyQuery<UserProfile>({ title: identifier })
    )
  ])

  return yield* loadPeople(client, [
    ...identities.map((identity) => toRef<Person>(identity.attachedTo)),
    ...channels.map((channel) => toRef<Person>(channel.attachedTo)),
    ...namedPeople.map((person) => person._id),
    ...profiles.map((profile) => profile.person)
  ])
})

const findFuzzyPeople = Effect.fn("IssueAssigneeResolution.findFuzzyPeople")(function* (
  client: HulyClient["Service"],
  identifier: PersonRefInput
) {
  const value = { $like: `%${escapeLikeWildcards(identifier)}%` }
  const [channels, namedPeople] = yield* Effect.all([
    client.findAll<Channel>(
      contact.class.Channel,
      hulyQuery<Channel>({ provider: contact.channelProvider.Email, value })
    ),
    client.findAll<Person>(contact.class.Person, hulyQuery<Person>({ name: value }))
  ])

  return yield* loadPeople(client, [
    ...channels.map((channel) => toRef<Person>(channel.attachedTo)),
    ...namedPeople.map((person) => person._id)
  ])
})

const solePerson = (
  identifier: PersonRefInput,
  people: ReadonlyArray<Person>
): Effect.Effect<Person | undefined, PersonIdentifierAmbiguousError> =>
  people.length > 1
    ? Effect.fail(new PersonIdentifierAmbiguousError({ identifier, matches: Count.make(people.length) }))
    : Effect.succeed(people[0])

export const findIssueAssignee = Effect.fn("IssueAssigneeResolution.findIssueAssignee")(function* (
  client: HulyClient["Service"],
  identifier: PersonRefInput
) {
  const exactPeople = yield* findExactPeople(client, identifier)
  if (exactPeople.length > 0) return yield* solePerson(identifier, exactPeople)
  return yield* solePerson(identifier, yield* findFuzzyPeople(client, identifier))
}) satisfies (
  client: HulyClient["Service"],
  identifier: PersonRefInput
) => Effect.Effect<Person | undefined, ResolutionError>
