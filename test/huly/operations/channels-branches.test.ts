import { describe, it } from "@effect/vitest"
import type { Channel as HulyChannel } from "@hcengineering/chunter"
import type { Person, SocialIdentity } from "@hcengineering/contact"
import { type PersonId, type Ref, SocialIdType, type Space, toFindResult } from "@hcengineering/core"
import { Effect } from "effect"
import { expect } from "vitest"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { buildSocialIdToPersonNameMap, listChannels } from "../../../src/huly/operations/channels.js"

import { chunter, contact } from "../../../src/huly/huly-plugins.js"

const makeSocialIdentity = (overrides?: Partial<SocialIdentity>): SocialIdentity => {
  const result: SocialIdentity = {
    // SocialIdentity._id is Ref<SocialIdentity> & PersonId — double cast required for this intersection phantom type
    _id: "social-1" as Ref<SocialIdentity> & PersonId,
    _class: contact.class.SocialIdentity,
    space: "space-1" as Ref<Space>,
    attachedTo: "person-1" as Ref<Person>,
    attachedToClass: contact.class.Person,
    collection: "socialIds",
    type: SocialIdType.HULY,
    value: "user@example.com",
    key: "huly:user@example.com",
    modifiedBy: "user-1" as PersonId,
    modifiedOn: 0,
    ...overrides
  }
  return result
}

interface MockConfig {
  channels?: Array<HulyChannel>
  socialIdentities?: Array<SocialIdentity>
  persons?: Array<Person>
  captureChannelQuery?: { query?: Record<string, unknown>; options?: Record<string, unknown> }
}

const createTestLayerWithMocks = (config: MockConfig) => {
  const channels = config.channels ?? []
  const persons = config.persons ?? []
  const socialIdentities = config.socialIdentities ?? []

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown, options: unknown) => {
    if (_class === chunter.class.Channel) {
      if (config.captureChannelQuery) {
        config.captureChannelQuery.query = query as Record<string, unknown>
        config.captureChannelQuery.options = options as Record<string, unknown>
      }
      const opts = options as { sort?: Record<string, number> } | undefined
      let result = [...channels]
      if (opts?.sort?.name !== undefined) {
        const direction = opts.sort.name
        result = result.sort((a, b) => direction * a.name.localeCompare(b.name))
      }
      return Effect.succeed(toFindResult(result))
    }
    if (_class === contact.class.SocialIdentity) {
      const q = query as { _id?: { $in?: Array<PersonId> } }
      const ids = q._id?.$in
      if (ids) {
        const filtered = socialIdentities.filter(si => ids.includes(si._id))
        return Effect.succeed(toFindResult(filtered))
      }
      return Effect.succeed(toFindResult(socialIdentities))
    }
    if (_class === contact.class.Person) {
      const q = query as { _id?: { $in?: Array<Ref<Person>> } }
      const personIds = q._id?.$in
      if (personIds) {
        const filtered = persons.filter(p => personIds.includes(p._id))
        return Effect.succeed(toFindResult(filtered))
      }
      return Effect.succeed(toFindResult(persons))
    }
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]

  const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
    if (_class === chunter.class.Channel) {
      const q = query as Record<string, unknown>
      const found = channels.find(c =>
        (q.name && c.name === q.name)
        || (q._id && c._id === q._id)
      )
      return Effect.succeed(found)
    }
    return Effect.succeed(undefined)
  }) as HulyClientOperations["findOne"]

  return HulyClient.testLayer({
    findAll: findAllImpl,
    findOne: findOneImpl
  })
}

describe("buildSocialIdToPersonNameMap - empty socialIds branch (line 136)", () => {
  it.effect("returns empty map when socialIds array is empty", () =>
    Effect.gen(function*() {
      const client = yield* HulyClient

      const result = yield* buildSocialIdToPersonNameMap(client, [])

      expect(result).toBeInstanceOf(Map)
      expect(result.size).toBe(0)
    }).pipe(Effect.provide(createTestLayerWithMocks({}))))

  it.effect("skips a social identity whose person no longer exists", () => {
    // The social identity resolves, but its person is absent from the persons
    // lookup (e.g. deleted), exercising the `person !== undefined` else arm.
    const socialIdentity = makeSocialIdentity({
      _id: "social-gone" as Ref<SocialIdentity> & PersonId,
      attachedTo: "person-gone" as Ref<Person>
    })

    return Effect.gen(function*() {
      const client = yield* HulyClient

      const result = yield* buildSocialIdToPersonNameMap(client, ["social-gone" as PersonId])

      expect(result.size).toBe(0)
    }).pipe(Effect.provide(createTestLayerWithMocks({ socialIdentities: [socialIdentity], persons: [] })))
  })
})

describe("listChannels - nameSearch branch (line 214)", () => {
  it.effect("applies nameSearch filter to query", () =>
    Effect.gen(function*() {
      const captureQuery: MockConfig["captureChannelQuery"] = {}
      const testLayer = createTestLayerWithMocks({
        channels: [],
        captureChannelQuery: captureQuery
      })

      yield* listChannels({ nameSearch: "dev" }).pipe(Effect.provide(testLayer))

      expect(captureQuery.query?.name).toEqual({ $like: "%dev%" })
    }))

  it.effect("skips nameSearch when empty string", () =>
    Effect.gen(function*() {
      const captureQuery: MockConfig["captureChannelQuery"] = {}
      const testLayer = createTestLayerWithMocks({
        channels: [],
        captureChannelQuery: captureQuery
      })

      yield* listChannels({ nameSearch: "   " }).pipe(Effect.provide(testLayer))

      expect(captureQuery.query?.name).toBeUndefined()
    }))
})

describe("listChannels - nameRegex branch", () => {
  it.effect("applies nameRegex filter to query", () =>
    Effect.gen(function*() {
      const captureQuery: MockConfig["captureChannelQuery"] = {}
      const testLayer = createTestLayerWithMocks({
        channels: [],
        captureChannelQuery: captureQuery
      })

      yield* listChannels({ nameRegex: "^dev-" }).pipe(Effect.provide(testLayer))

      expect(captureQuery.query?.name).toEqual({ $regex: "^dev-" })
    }))

  it.effect("skips nameRegex when blank", () =>
    Effect.gen(function*() {
      const captureQuery: MockConfig["captureChannelQuery"] = {}
      const testLayer = createTestLayerWithMocks({
        channels: [],
        captureChannelQuery: captureQuery
      })

      yield* listChannels({ nameRegex: "  " }).pipe(Effect.provide(testLayer))

      expect(captureQuery.query?.name).toBeUndefined()
    }))
})

describe("listChannels - topicSearch branch (line 218)", () => {
  it.effect("applies topicSearch filter to query", () =>
    Effect.gen(function*() {
      const captureQuery: MockConfig["captureChannelQuery"] = {}
      const testLayer = createTestLayerWithMocks({
        channels: [],
        captureChannelQuery: captureQuery
      })

      yield* listChannels({ topicSearch: "bugs" }).pipe(Effect.provide(testLayer))

      expect(captureQuery.query?.topic).toEqual({ $like: "%bugs%" })
    }))

  it.effect("skips topicSearch when empty string", () =>
    Effect.gen(function*() {
      const captureQuery: MockConfig["captureChannelQuery"] = {}
      const testLayer = createTestLayerWithMocks({
        channels: [],
        captureChannelQuery: captureQuery
      })

      yield* listChannels({ topicSearch: "  " }).pipe(Effect.provide(testLayer))

      expect(captureQuery.query?.topic).toBeUndefined()
    }))
})
