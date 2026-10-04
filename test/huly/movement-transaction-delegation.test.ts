import { Hierarchy, ModelDb, TxOperations, type Client, type Doc, type Tx } from "@hcengineering/core"
import { Deferred, Effect, Redacted, Schema } from "effect"
import { expect, it } from "vitest"
import {
  makeMovementTxOperations,
  MovementTransportConfigSchema,
  type MovementHttpPort
} from "../../src/huly/movement-transaction-transport.js"
import { NonEmptyString, PositiveInteger } from "../../src/domain/schemas/shared.js"
import { corePersonId, docRef, findResult, sdkFixture } from "../helpers/huly-sdk.js"
import { hulyQuery } from "../../src/huly/operations/query-helpers.js"

const config = Schema.decodeUnknownSync(MovementTransportConfigSchema)({
  endpoint: "http://ordinary.invalid",
  workspace: "workspace",
  token: Redacted.make(NonEmptyString.make("private-fixture-token")),
  timeoutMs: 1000
})
const sequence = sdkFixture<Tx>({
  _id: "sequence-request",
  _class: "core:class:TxUpdateDoc",
  space: "core:space:Tx",
  objectSpace: "core:space:Space",
  modifiedOn: 0,
  modifiedBy: "person",
  objectId: "destination",
  objectClass: "tracker:class:Project",
  operations: { $inc: { sequence: 1 } },
  retrieve: true
})

it("delegates reads with unchanged arguments, isolates writes and leaves lease closure to the ordinary client", async () => {
  const hierarchy = new Hierarchy()
  const model = new ModelDb(hierarchy)
  const calls: Array<unknown> = []
  const ordinaryClient = sdkFixture<Client>({
    getHierarchy: () => hierarchy,
    getModel: () => model,
    findAll: (...args: Array<unknown>) => {
      calls.push({ operation: "findAll", args })
      return Promise.resolve(findResult([]))
    },
    findOne: (...args: Array<unknown>) => {
      calls.push({ operation: "findOne", args })
      return Promise.resolve(undefined)
    },
    searchFulltext: (...args: Array<unknown>) => {
      calls.push({ operation: "searchFulltext", args })
      return Promise.resolve({ docs: [], total: 0 })
    },
    domainRequest: (...args: Array<unknown>) => {
      calls.push({ operation: "domainRequest", args })
      return Promise.resolve({ domain: "fixture", value: { accepted: true } })
    },
    tx: (...args: Array<unknown>) => {
      calls.push({ operation: "ordinaryTx", args })
      return Promise.resolve({})
    },
    close: () => {
      calls.push({ operation: "ordinaryClose" })
      return Promise.resolve()
    }
  })
  const ordinary = new TxOperations(ordinaryClient, corePersonId("person"), true)
  const writes: Array<string> = []
  const http: MovementHttpPort = {
    send: (request) =>
      Effect.sync(() => {
        writes.push(request.body)
        return { status: PositiveInteger.make(200), body: '{"object":{"sequence":7}}' }
      })
  }
  const movement = makeMovementTxOperations(ordinary, config, http)
  expect(movement.user).toBe(ordinary.user)
  expect(movement.isDerived).toBe(true)
  expect(movement.getHierarchy()).toBe(hierarchy)
  expect(movement.getModel()).toBe(model)
  const cls = sdkFixture<Parameters<Client["findAll"]>[0]>("tracker:class:Issue")
  const query = hulyQuery<Doc>({ _id: docRef<Doc>("root") })
  const options = { limit: 1 }
  expect(await movement.findAll(cls, query, options)).toEqual(findResult([]))
  expect(await movement.findOne(cls, query, options)).toBeUndefined()
  const search = { query: "root" }
  expect(await movement.searchFulltext(search, options)).toEqual({ docs: [], total: 0 })
  const domain = sdkFixture<Parameters<Client["domainRequest"]>[0]>("fixture")
  const params = { action: "inspect" }
  const domainOptions = { retry: false }
  expect(await movement.client.domainRequest(domain, params, domainOptions)).toEqual({
    domain: "fixture",
    value: { accepted: true }
  })
  expect(await movement.tx(sequence)).toEqual({ object: { sequence: 7 } })
  await movement.close()
  expect(calls).toEqual([
    { operation: "findAll", args: [cls, query, options] },
    { operation: "findOne", args: [cls, query, options] },
    { operation: "searchFulltext", args: [search, options] },
    { operation: "domainRequest", args: [domain, params, domainOptions] }
  ])
  expect(writes).toEqual([JSON.stringify(sequence)])
  await ordinary.close()
  expect(calls.at(-1)).toEqual({ operation: "ordinaryClose" })
})

it("cancels an in-flight single send through the owning operation's AbortSignal", async () => {
  const started = await Effect.runPromise(Deferred.make<void>())
  const events: Array<string> = []
  const http: MovementHttpPort = {
    send: () =>
      Effect.sync(() => {
        events.push("sent")
      }).pipe(
        Effect.andThen(Deferred.succeed(started, undefined)),
        Effect.andThen(Effect.never),
        Effect.onInterrupt(() =>
          Effect.sync(() => {
            events.push("cancelled")
          })
        )
      )
  }
  const ordinary = sdkFixture<TxOperations>({ user: corePersonId("person"), isDerived: false })
  const abort = new AbortController()
  const movement = makeMovementTxOperations(ordinary, config, http, abort.signal)
  const result = movement.tx(sequence)
  await Effect.runPromise(Deferred.await(started))
  abort.abort()
  await expect(result).rejects.toBeDefined()
  expect(events).toEqual(["sent", "cancelled"])
  await movement.close()
})
