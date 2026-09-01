import type { Person, UserProfile } from "@hcengineering/contact"
import { Effect } from "effect"

import { Count, type PersonRefInput } from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import { PersonIdentifierAmbiguousError } from "../errors.js"
import { contact } from "../huly-plugins.js"
import {
  findPeopleByExactName,
  findPeopleByNameSearch,
  findPersonIdsByEmailChannelSearch,
  findPersonIdsByExactEmailSources,
  loadPeopleByIds
} from "./contacts-shared.js"
import { hulyQuery } from "./query-helpers.js"
import { toClassRef } from "./sdk-boundary.js"

type ResolutionError = HulyClientError | PersonIdentifierAmbiguousError

const findExactPeople = Effect.fn("IssueAssigneeResolution.findExactPeople")(function* (
  client: HulyClient["Service"],
  identifier: PersonRefInput
) {
  const [emailPersonIds, namedPeople, profiles] = yield* Effect.all([
    findPersonIdsByExactEmailSources(client, identifier),
    findPeopleByExactName(client, identifier),
    client.findAll<UserProfile>(
      toClassRef<UserProfile>(contact.class.UserProfile),
      hulyQuery<UserProfile>({ title: identifier })
    )
  ])

  return yield* loadPeopleByIds(client, [
    ...emailPersonIds,
    ...namedPeople.map((person) => person._id),
    ...profiles.map((profile) => profile.person)
  ])
})

const findFuzzyPeople = Effect.fn("IssueAssigneeResolution.findFuzzyPeople")(function* (
  client: HulyClient["Service"],
  identifier: PersonRefInput
) {
  const [emailPersonIds, namedPeople] = yield* Effect.all([
    findPersonIdsByEmailChannelSearch(client, identifier),
    findPeopleByNameSearch(client, identifier)
  ])

  return yield* loadPeopleByIds(client, [...emailPersonIds, ...namedPeople.map((person) => person._id)])
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
