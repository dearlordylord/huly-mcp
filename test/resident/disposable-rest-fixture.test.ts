import { Deferred, Effect, Schema } from "effect"
import { expect, it } from "vitest"

import { DisposableRestProject, startDisposableRestFixture } from "./disposable-rest-fixture.js"

const WORKSPACE = "00000000-0000-4000-8000-000000000001"
const project = Schema.decodeUnknownSync(DisposableRestProject)({
  _id: "fixture-survivor",
  _class: "tracker:class:Project",
  space: "fixture-space",
  modifiedOn: 1,
  modifiedBy: "fixture-owner",
  identifier: "SURVIVE",
  name: "Surviving project",
  archived: false
})
const targets = Schema.decodeUnknownSync(
  Schema.Struct({
    departing: DisposableRestProject.fields.identifier,
    survivor: DisposableRestProject.fields.identifier
  })
)({ departing: "LEAVE", survivor: "SURVIVE" })
const FindReply = Schema.Struct({
  dataType: Schema.Literal("TotalArray"),
  value: Schema.Array(DisposableRestProject),
  total: Schema.Natural
})

it("holds project reads independently and records arrival before releasing their responses", async () => {
  const departingArrived = Effect.runSync(Deferred.make<void>())
  const survivorArrived = Effect.runSync(Deferred.make<void>())
  const releaseDeparting = Effect.runSync(Deferred.make<void>())
  const releaseSurvivor = Effect.runSync(Deferred.make<void>())
  const rest = await startDisposableRestFixture({
    projects: [project],
    onProjectRead: async (identifier) => {
      const departing = identifier === targets.departing
      Effect.runSync(Deferred.succeed(departing ? departingArrived : survivorArrived, undefined))
      await Effect.runPromise(Deferred.await(departing ? releaseDeparting : releaseSurvivor))
    }
  })
  const read = async (identifier: typeof targets.departing) => {
    const url = new URL(`/api/v1/find-all/${WORKSPACE}`, rest.endpoint)
    url.searchParams.set("class", "tracker:class:Project")
    url.searchParams.set("query", JSON.stringify({ identifier }))
    const response = await fetch(url, { headers: { authorization: "Bearer fixture-rest-token" } })
    expect(response.status).toBe(200)
    return Schema.decodeUnknownSync(FindReply)(await response.json())
  }
  const pending: Array<ReturnType<typeof read>> = []
  try {
    let departingSettled = false
    const departing = read(targets.departing).finally(() => {
      departingSettled = true
    })
    pending.push(departing)
    await Effect.runPromise(Deferred.await(departingArrived).pipe(Effect.timeout("5 seconds")))
    const survivor = read(targets.survivor)
    pending.push(survivor)
    await Effect.runPromise(Deferred.await(survivorArrived).pipe(Effect.timeout("5 seconds")))
    expect(rest.observed.projectQueries).toEqual(["LEAVE", "SURVIVE"])
    expect(rest.observed.projectReads).toBe(2)
    expect(Effect.runSync(Deferred.isDone(releaseDeparting))).toBe(false)
    Effect.runSync(Deferred.succeed(releaseSurvivor, undefined))
    expect(await survivor).toEqual({ dataType: "TotalArray", value: [project], total: 1 })
    expect(Effect.runSync(Deferred.isDone(releaseDeparting))).toBe(false)
    expect(departingSettled).toBe(false)
    Effect.runSync(Deferred.succeed(releaseDeparting, undefined))
    expect(await departing).toEqual({ dataType: "TotalArray", value: [], total: 0 })
    expect(rest.observed.invalidRequests).toBe(0)
    expect(rest.observed.projectWrites).toBe(0)
  } finally {
    Effect.runSync(Deferred.succeed(releaseDeparting, undefined))
    Effect.runSync(Deferred.succeed(releaseSurvivor, undefined))
    await Promise.allSettled(pending)
    await rest.close()
  }
})
