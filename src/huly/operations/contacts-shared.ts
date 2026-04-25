import type { Channel, Person as HulyPerson, SocialIdentity } from "@hcengineering/contact"
import type { Doc, Ref } from "@hcengineering/core"
import { SocialIdType } from "@hcengineering/core"
import { Effect } from "effect"

import type { HulyClient, HulyClientError } from "../client.js"
import { contact } from "../huly-plugins.js"
import { escapeLikeWildcards } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

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
