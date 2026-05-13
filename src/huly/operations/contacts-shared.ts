import type { Channel, Person as HulyPerson, SocialIdentity } from "@hcengineering/contact"
import type { Doc, Ref } from "@hcengineering/core"
import { SocialIdType } from "@hcengineering/core"
import { Effect, Schema } from "effect"

import { Email, type PersonName, type PersonRefInput } from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import { PersonIdentifierAmbiguousError } from "../errors.js"
import { contact } from "../huly-plugins.js"
import { escapeLikeWildcards } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

const isEmailIdentifier = Schema.is(Email)

export const findPersonById = (
  client: HulyClient["Type"],
  personId: string
): Effect.Effect<HulyPerson | undefined, HulyClientError> =>
  client.findOne<HulyPerson>(
    contact.class.Person,
    { _id: toRef<HulyPerson>(personId) }
  )

export const findPersonByEmail = (
  client: HulyClient["Type"],
  email: string
): Effect.Effect<HulyPerson | undefined, HulyClientError> =>
  Effect.gen(function*() {
    const channels = yield* client.findAll<Channel>(
      contact.class.Channel,
      {
        value: email,
        provider: contact.channelProvider.Email
      }
    )

    if (channels.length === 0) {
      return undefined
    }

    const channel = channels[0]
    return yield* client.findOne<HulyPerson>(
      contact.class.Person,
      { _id: toRef<HulyPerson>(channel.attachedTo) }
    )
  })

export const batchGetEmailsForPersons = <T extends Doc>(
  client: HulyClient["Type"],
  personIds: Array<Ref<T>>
): Effect.Effect<Map<string, string>, HulyClientError> =>
  Effect.gen(function*() {
    if (personIds.length === 0) {
      return new Map()
    }

    const channels = yield* client.findAll<Channel>(
      contact.class.Channel,
      {
        attachedTo: { $in: personIds },
        provider: contact.channelProvider.Email
      }
    )

    const emailMap = new Map<string, string>()
    for (const channel of channels) {
      if (!emailMap.has(channel.attachedTo)) {
        emailMap.set(channel.attachedTo, channel.value)
      }
    }
    return emailMap
  })

const findPersonBySocialIdentityEmail = (
  client: HulyClient["Type"],
  email: string
): Effect.Effect<HulyPerson | undefined, HulyClientError> =>
  Effect.gen(function*() {
    const identity = yield* client.findOne<SocialIdentity>(
      contact.class.SocialIdentity,
      {
        type: SocialIdType.EMAIL,
        value: email
      }
    )
    if (identity === undefined) return undefined
    return yield* client.findOne<HulyPerson>(
      contact.class.Person,
      { _id: identity.attachedTo }
    )
  })

const findPersonByExactEmail = (
  client: HulyClient["Type"],
  email: Email
): Effect.Effect<HulyPerson | undefined, HulyClientError | PersonIdentifierAmbiguousError> =>
  Effect.gen(function*() {
    const socialIdentities = yield* client.findAll<SocialIdentity>(
      contact.class.SocialIdentity,
      {
        type: SocialIdType.EMAIL,
        value: email
      }
    )

    const channels = yield* client.findAll<Channel>(
      contact.class.Channel,
      {
        value: email,
        provider: contact.channelProvider.Email
      }
    )

    const personIds = [
      ...new Set([
        ...socialIdentities.map((identity) => identity.attachedTo),
        ...channels.map((channel) => channel.attachedTo)
      ])
    ]
    if (personIds.length === 0) {
      return undefined
    }

    const persons = yield* client.findAll<HulyPerson>(
      contact.class.Person,
      { _id: { $in: personIds.map(toRef<HulyPerson>) } }
    )

    if (persons.length === 0) {
      return undefined
    }

    if (persons.length > 1) {
      return yield* new PersonIdentifierAmbiguousError({ identifier: email, matches: persons.length })
    }

    return persons[0]
  })

const findPersonByExactName = (
  client: HulyClient["Type"],
  name: PersonName
): Effect.Effect<HulyPerson | undefined, HulyClientError | PersonIdentifierAmbiguousError> =>
  Effect.gen(function*() {
    const persons = yield* client.findAll<HulyPerson>(
      contact.class.Person,
      { name }
    )

    if (persons.length === 0) {
      return undefined
    }

    if (persons.length > 1) {
      return yield* new PersonIdentifierAmbiguousError({ identifier: name, matches: persons.length })
    }

    return persons[0]
  })

export const findPersonByExactEmailOrName = (
  client: HulyClient["Type"],
  identifier: PersonRefInput
): Effect.Effect<HulyPerson | undefined, HulyClientError | PersonIdentifierAmbiguousError> =>
  isEmailIdentifier(identifier)
    ? findPersonByExactEmail(client, identifier)
    : findPersonByExactName(client, identifier)

export const findPersonByEmailOrName = (
  client: HulyClient["Type"],
  emailOrName: string
): Effect.Effect<HulyPerson | undefined, HulyClientError> =>
  Effect.gen(function*() {
    // 1. SocialIdentity email match (workspace members — primary source)
    const socialIdentityPerson = yield* findPersonBySocialIdentityEmail(client, emailOrName)
    if (socialIdentityPerson !== undefined) return socialIdentityPerson

    // 2. Exact email channel match (email channels only)
    const exactChannel = yield* client.findOne<Channel>(
      contact.class.Channel,
      {
        value: emailOrName,
        provider: contact.channelProvider.Email
      }
    )
    if (exactChannel !== undefined) {
      const person = yield* client.findOne<HulyPerson>(
        contact.class.Person,
        { _id: toRef<HulyPerson>(exactChannel.attachedTo) }
      )
      if (person !== undefined) return person
    }

    // 3. Exact name match
    const exactPerson = yield* client.findOne<HulyPerson>(
      contact.class.Person,
      { name: emailOrName }
    )
    if (exactPerson !== undefined) return exactPerson

    // 4. Substring email channel match via $like (email channels only)
    const escaped = escapeLikeWildcards(emailOrName)
    const likeChannel = yield* client.findOne<Channel>(
      contact.class.Channel,
      {
        value: { $like: `%${escaped}%` },
        provider: contact.channelProvider.Email
      }
    )
    if (likeChannel !== undefined) {
      const person = yield* client.findOne<HulyPerson>(
        contact.class.Person,
        { _id: toRef<HulyPerson>(likeChannel.attachedTo) }
      )
      if (person !== undefined) return person
    }

    // 5. Substring name match via $like
    const likePerson = yield* client.findOne<HulyPerson>(
      contact.class.Person,
      { name: { $like: `%${escaped}%` } }
    )
    return likePerson
  })
