import { describe, it } from "@effect/vitest"
import type { Channel as HulyChannel } from "@hcengineering/chunter"
import type { Person, SocialIdentity } from "@hcengineering/contact"
import { type Doc, type PersonId, type Ref, toFindResult } from "@hcengineering/core"
import { Effect } from "effect"
import { expect } from "vitest"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { buildSocialIdToPersonNameMap, listChannels } from "../../../src/huly/operations/channels.js"

import { chunter, contact } from "../../../src/huly/huly-plugins.js"

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
      return Effect.succeed(toFindResult(result as Array<Doc>))
    }
    if (_class === contact.class.SocialIdentity) {
      const q = query as { _id?: { $in?: Array<PersonId> } }
      const ids = q._id?.$in
      if (ids) {
        const filtered = socialIdentities.filter(si => ids.includes(si._id))
        return Effect.succeed(toFindResult(filtered as Array<Doc>))
      }
      return Effect.succeed(toFindResult(socialIdentities as Array<Doc>))
    }
    if (_class === contact.class.Person) {
      const q = query as { _id?: { $in?: Array<Ref<Person>> } }
      const personIds = q._id?.$in
      if (personIds) {
        const filtered = persons.filter(p => personIds.includes(p._id))
        return Effect.succeed(toFindResult(filtered as Array<Doc>))
      }
      return Effect.succeed(toFindResult(persons as Array<Doc>))
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
      return Effect.succeed(found as Doc | undefined)
    }
    return Effect.succeed(undefined)
  }) as HulyClientOperations["findOne"]

  return HulyClient.testLayer({
    findAll: findAllImpl,
    findOne: findOneImpl
  })
}

describe("buildSocialIdToPersonNameMap - empty socialIds branch (line 136)", () => {
  // test-revizorro: approved
  it.effect("returns empty map when socialIds array is empty", () =>
    Effect.gen(function*() {
      const client = yield* HulyClient

      const result = yield* buildSocialIdToPersonNameMap(client, [])

      expect(result).toBeInstanceOf(Map)
      expect(result.size).toBe(0)
    }).pipe(Effect.provide(createTestLayerWithMocks({}))))
})

describe("listChannels - nameSearch branch (line 214)", () => {
  // test-revizorro: approved
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

  // test-revizorro: approved
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

describe("listChannels - topicSearch branch (line 218)", () => {
  // test-revizorro: approved
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

  // test-revizorro: approved
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
