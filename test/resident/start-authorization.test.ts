import { expect, it } from "vitest"

import { type ChildStartEvent, type ChildStartState, decideChildStart } from "../../src/resident/start-authorization.js"

const events: ReadonlyArray<ChildStartEvent> = ["start", "disconnect", "timeout"]
const states: ReadonlyArray<ChildStartState> = ["authorized", "retired"]

it("authorizes one claim when Start precedes disconnect or timeout", () => {
  const first = decideChildStart("prepared", "start")
  expect(first).toEqual({ state: "authorized", action: "claim" })
  for (const event of events)
    expect(decideChildStart(first.state, event)).toEqual({ state: "authorized", action: "none" })
})

it.each(["disconnect", "timeout"] satisfies Array<ChildStartEvent>)("retires before a late Start after %s", (event) => {
  const first = decideChildStart("prepared", event)
  expect(first).toEqual({ state: "retired", action: "exit" })
  expect(decideChildStart(first.state, "start")).toEqual({ state: "retired", action: "none" })
})

it("never repeats a committed claim or exit action", () => {
  for (const state of states) {
    for (const event of events) expect(decideChildStart(state, event)).toEqual({ state, action: "none" })
  }
})
