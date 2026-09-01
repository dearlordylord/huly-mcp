import type {
  Channel,
  Contact,
  Employee as HulyEmployee,
  Person as HulyPerson,
  SocialIdentity
} from "@hcengineering/contact"
import type { AccountUuid, Doc, Ref } from "@hcengineering/core"
import { SocialIdType } from "@hcengineering/core"
import { Effect, Option, Schema } from "effect"

import { Count, Email, type NonEmptyString, PersonName, type PersonRefInput } from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import { PersonIdentifierAmbiguousError, PersonNotAnEmployeeError, PersonNotFoundError } from "../errors.js"
import { contact } from "../huly-plugins.js"
import { escapeLikeWildcards, hulyQuery } from "./query-helpers.js"
import { toAccountUuid, toRef } from "./sdk-boundary.js"

const isEmailIdentifier = Schema.is(Email)

export const findPersonById = (
  client: HulyClient["Service"],
  personId: string
): Effect.Effect<HulyPerson | undefined, HulyClientError> =>
  client.findOne<HulyPerson>(contact.class.Person, { _id: toRef<HulyPerson>(personId) })

export const findPersonByEmail = (
  client: HulyClient["Service"],
  email: string
): Effect.Effect<HulyPerson | undefined, HulyClientError | PersonIdentifierAmbiguousError> =>
  Option.match(Schema.decodeUnknownOption(Email)(email), {
    onNone: () => Effect.succeed(undefined),
    onSome: (parsedEmail) => findPersonByExactEmail(client, parsedEmail)
  })

export const batchGetEmailsForPersons = <T extends HulyPerson>(
  client: HulyClient["Service"],
  personIds: Array<Ref<T>>
): Effect.Effect<Map<Ref<T>, Email>, HulyClientError> =>
  Effect.gen(function* () {
    if (personIds.length === 0) {
      return new Map()
    }

    const [channels, socialIdentities] = yield* Effect.all([
      client.findAll<Channel>(
        contact.class.Channel,
        hulyQuery<Channel>({ attachedTo: { $in: personIds.map(toRef<Doc>) }, provider: contact.channelProvider.Email })
      ),
      client.findAll<SocialIdentity>(
        contact.class.SocialIdentity,
        hulyQuery<SocialIdentity>({ attachedTo: { $in: personIds.map(toRef<Contact>) }, type: SocialIdType.EMAIL })
      )
    ])

    const emailMap = new Map<Ref<T>, Email>()
    for (const source of [...channels, ...socialIdentities]) {
      const personId = toRef<T>(source.attachedTo)
      const email = Schema.decodeUnknownOption(Email)(source.value)
      if (!emailMap.has(personId) && Option.isSome(email)) {
        emailMap.set(personId, email.value)
      }
    }
    return emailMap
  })

export const findPersonIdsByEmailSearch = (
  client: HulyClient["Service"],
  emailSearch: string
): Effect.Effect<Array<Ref<HulyPerson>>, HulyClientError> =>
  Effect.gen(function* () {
    const [channelPersonIds, socialIdentities] = yield* Effect.all([
      findPersonIdsByEmailChannelSearch(client, emailSearch),
      client.findAll<SocialIdentity>(
        contact.class.SocialIdentity,
        hulyQuery<SocialIdentity>({
          type: SocialIdType.EMAIL,
          value: { $like: `%${escapeLikeWildcards(emailSearch)}%` }
        })
      )
    ])

    return [
      ...new Set([...channelPersonIds, ...socialIdentities.map((identity) => toRef<HulyPerson>(identity.attachedTo))])
    ]
  })

export const findPersonIdsByEmailChannelSearch = (
  client: HulyClient["Service"],
  emailSearch: string
): Effect.Effect<Array<Ref<HulyPerson>>, HulyClientError> =>
  Effect.map(
    client.findAll<Channel>(
      contact.class.Channel,
      hulyQuery<Channel>({
        provider: contact.channelProvider.Email,
        value: { $like: `%${escapeLikeWildcards(emailSearch)}%` }
      })
    ),
    (channels) => [...new Set(channels.map((channel) => toRef<HulyPerson>(channel.attachedTo)))]
  )

export const findPersonIdsByExactEmailSources = (
  client: HulyClient["Service"],
  email: string
): Effect.Effect<Array<Ref<HulyPerson>>, HulyClientError> =>
  Effect.map(
    Effect.all([
      client.findAll<SocialIdentity>(
        contact.class.SocialIdentity,
        hulyQuery<SocialIdentity>({ type: SocialIdType.EMAIL, value: email })
      ),
      client.findAll<Channel>(
        contact.class.Channel,
        hulyQuery<Channel>({ value: email, provider: contact.channelProvider.Email })
      )
    ]),
    ([socialIdentities, channels]) => [
      ...new Set([
        ...socialIdentities.map((identity) => toRef<HulyPerson>(identity.attachedTo)),
        ...channels.map((channel) => toRef<HulyPerson>(channel.attachedTo))
      ])
    ]
  )

export const loadPeopleByIds = (
  client: HulyClient["Service"],
  personIds: ReadonlyArray<Ref<HulyPerson>>
): Effect.Effect<Array<HulyPerson>, HulyClientError> => {
  const uniqueIds = [...new Set(personIds)]
  return uniqueIds.length === 0
    ? Effect.succeed([])
    : Effect.map(
        client.findAll<HulyPerson>(contact.class.Person, hulyQuery<HulyPerson>({ _id: { $in: uniqueIds } })),
        (people) => [...new Map(people.map((person) => [person._id, person])).values()]
      )
}

export const findPeopleByExactName = (
  client: HulyClient["Service"],
  name: string
): Effect.Effect<Array<HulyPerson>, HulyClientError> =>
  client.findAll<HulyPerson>(contact.class.Person, hulyQuery<HulyPerson>({ name }))

export const findPeopleByNameSearch = (
  client: HulyClient["Service"],
  nameSearch: string
): Effect.Effect<Array<HulyPerson>, HulyClientError> =>
  client.findAll<HulyPerson>(
    contact.class.Person,
    hulyQuery<HulyPerson>({ name: { $like: `%${escapeLikeWildcards(nameSearch)}%` } })
  )

const findPersonBySocialIdentityEmail = (
  client: HulyClient["Service"],
  email: string
): Effect.Effect<HulyPerson | undefined, HulyClientError> =>
  Effect.gen(function* () {
    const identity = yield* client.findOne<SocialIdentity>(contact.class.SocialIdentity, {
      type: SocialIdType.EMAIL,
      value: email
    })
    if (identity === undefined) return undefined
    return yield* client.findOne<HulyPerson>(contact.class.Person, { _id: identity.attachedTo })
  })

const findPersonByExactEmail = (
  client: HulyClient["Service"],
  email: Email
): Effect.Effect<HulyPerson | undefined, HulyClientError | PersonIdentifierAmbiguousError> =>
  Effect.gen(function* () {
    const personIds = yield* findPersonIdsByExactEmailSources(client, email)
    if (personIds.length === 0) {
      return undefined
    }

    const persons = yield* loadPeopleByIds(client, personIds)

    if (persons.length === 0) {
      return undefined
    }

    if (persons.length > 1) {
      return yield* new PersonIdentifierAmbiguousError({ identifier: email, matches: Count.make(persons.length) })
    }

    return persons[0]
  })

const findPersonByExactName = (
  client: HulyClient["Service"],
  name: PersonName
): Effect.Effect<HulyPerson | undefined, HulyClientError | PersonIdentifierAmbiguousError> =>
  Effect.gen(function* () {
    const persons = yield* findPeopleByExactName(client, name)

    if (persons.length === 0) {
      return undefined
    }

    if (persons.length > 1) {
      return yield* new PersonIdentifierAmbiguousError({ identifier: name, matches: Count.make(persons.length) })
    }

    return persons[0]
  })

export const findPersonByExactEmailOrName = (
  client: HulyClient["Service"],
  identifier: PersonRefInput
): Effect.Effect<HulyPerson | undefined, HulyClientError | PersonIdentifierAmbiguousError> =>
  isEmailIdentifier(identifier) ? findPersonByExactEmail(client, identifier) : findPersonByExactName(client, identifier)

export const findPersonByIdOrExactEmailOrName = (
  client: HulyClient["Service"],
  identifier: PersonRefInput
): Effect.Effect<HulyPerson | undefined, HulyClientError | PersonIdentifierAmbiguousError> =>
  Effect.gen(function* () {
    const byId = yield* findPersonById(client, identifier)
    return byId ?? (yield* findPersonByExactEmailOrName(client, identifier))
  })

/**
 * Resolve a person identifier (email or exact display name) to the AccountUuid
 * carried on contact.mixin.Employee.personUuid. Non-employee Persons have no
 * workspace account and cannot be used in member arrays.
 */
export const resolveEmployeeAccountUuid = (
  client: HulyClient["Service"],
  identifier: NonEmptyString | PersonRefInput
): Effect.Effect<
  AccountUuid,
  HulyClientError | PersonIdentifierAmbiguousError | PersonNotFoundError | PersonNotAnEmployeeError
> =>
  Effect.gen(function* () {
    const person = yield* isEmailIdentifier(identifier)
      ? findPersonByExactEmail(client, identifier)
      : findPersonByExactName(client, PersonName.make(identifier))
    if (person === undefined) {
      return yield* new PersonNotFoundError({ identifier })
    }

    const employee = yield* client.findOne<HulyEmployee>(
      contact.mixin.Employee,
      hulyQuery<HulyEmployee>({ _id: toRef<HulyEmployee>(person._id) })
    )

    if (employee?.personUuid === undefined) {
      return yield* new PersonNotAnEmployeeError({ identifier })
    }

    return toAccountUuid(employee.personUuid)
  })

export const findPersonByEmailOrName = (
  client: HulyClient["Service"],
  emailOrName: string
): Effect.Effect<HulyPerson | undefined, HulyClientError> =>
  Effect.gen(function* () {
    // 1. SocialIdentity email match (workspace members — primary source)
    const socialIdentityPerson = yield* findPersonBySocialIdentityEmail(client, emailOrName)
    if (socialIdentityPerson !== undefined) return socialIdentityPerson

    // 2. Exact email channel match (email channels only)
    const exactChannel = yield* client.findOne<Channel>(contact.class.Channel, {
      value: emailOrName,
      provider: contact.channelProvider.Email
    })
    if (exactChannel !== undefined) {
      const person = yield* client.findOne<HulyPerson>(contact.class.Person, {
        _id: toRef<HulyPerson>(exactChannel.attachedTo)
      })
      if (person !== undefined) return person
    }

    // 3. Exact name match
    const exactPerson = yield* client.findOne<HulyPerson>(contact.class.Person, { name: emailOrName })
    if (exactPerson !== undefined) return exactPerson

    // 4. Substring email channel match via $like (email channels only)
    const escaped = escapeLikeWildcards(emailOrName)
    const likeChannel = yield* client.findOne<Channel>(contact.class.Channel, {
      value: { $like: `%${escaped}%` },
      provider: contact.channelProvider.Email
    })
    if (likeChannel !== undefined) {
      const person = yield* client.findOne<HulyPerson>(contact.class.Person, {
        _id: toRef<HulyPerson>(likeChannel.attachedTo)
      })
      if (person !== undefined) return person
    }

    // 5. Substring name match via $like
    const likePerson = yield* client.findOne<HulyPerson>(contact.class.Person, { name: { $like: `%${escaped}%` } })
    return likePerson
  })
