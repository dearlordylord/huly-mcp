import type { Person, UserProfile } from "@hcengineering/contact"
import { Effect, Option } from "effect"

import { Count, type PersonRefInput } from "../../domain/schemas/shared.js"
import { getOneOrNoneEffect } from "../../utils/assertions.js"
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

const oneAssigneeOrNone = (
  identifier: PersonRefInput,
  people: ReadonlyArray<Person>
): Effect.Effect<Option.Option<Person>, PersonIdentifierAmbiguousError> =>
  getOneOrNoneEffect(
    people,
    (matches) => new PersonIdentifierAmbiguousError({ identifier, matches: Count.make(matches.length) })
  )

export const findIssueAssignee = Effect.fn("IssueAssigneeResolution.findIssueAssignee")(function* (
  client: HulyClient["Service"],
  identifier: PersonRefInput
) {
  const exactPeople = yield* findExactPeople(client, identifier)
  const exactPerson = yield* oneAssigneeOrNone(identifier, exactPeople)
  if (Option.isSome(exactPerson)) return exactPerson
  return yield* oneAssigneeOrNone(identifier, yield* findFuzzyPeople(client, identifier))
}) satisfies (
  client: HulyClient["Service"],
  identifier: PersonRefInput
) => Effect.Effect<Option.Option<Person>, ResolutionError>
