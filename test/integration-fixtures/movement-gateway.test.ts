import { describe, expect, it } from "vitest"
import { makeGatewayBarrier } from "../../scripts/issue-movement-concurrency/barrier.js"
import { type GatewayEvent, parseWritePoint } from "../../scripts/issue-movement-concurrency/protocol.js"

describe("movement certification gateway", () => {
  it("distinguishes sequence reservation from unrelated project updates and unscoped batches", () => {
    expect(
      parseWritePoint({
        _class: "core:class:TxUpdateDoc",
        objectClass: "tracker:class:Project",
        objectId: "p",
        operations: { $inc: { sequence: 1 } }
      })
    ).toBe("allocation-before")
    expect(
      parseWritePoint({
        _class: "core:class:TxUpdateDoc",
        objectClass: "tracker:class:Project",
        objectId: "p",
        operations: { sequence: 1 }
      })
    ).toBeUndefined()
    expect(parseWritePoint({ _class: "core:class:TxApplyIf", txes: [] })).toBeUndefined()
    expect(parseWritePoint({ _class: "core:class:TxApplyIf", scope: "movement", txes: [{ objectId: "root" }] })).toBe(
      "commit-before"
    )
  })

  it("allows an independent edit to finish before forwarding the paused write", async () => {
    const events: Array<GatewayEvent> = []
    const barrier = makeGatewayBarrier((event) => events.push(event))
    barrier.control({ command: "arm", point: "commit-before", action: "pause", persistent: false })
    const order: Array<string> = []
    const paused = barrier.visit("commit-before").then(() => {
      order.push("forward")
    })
    expect(events).toEqual([{ event: "barrier", point: "commit-before", action: "pause" }])
    order.push("independent-edit-completed")
    barrier.control({ command: "release" })
    await paused
    expect(order).toEqual(["independent-edit-completed", "forward"])
    expect(await barrier.visit("commit-before")).toBeUndefined()
  })

  it("keeps verification outages active across every bounded read until rearmed", async () => {
    const barrier = makeGatewayBarrier(() => undefined)
    barrier.control({ command: "arm", point: "verification-read", action: "fail", persistent: true })
    expect(await barrier.visit("allocation-before")).toBeUndefined()
    expect(await barrier.visit("verification-read")).toBe("fail")
    expect(await barrier.visit("verification-read")).toBe("fail")
    barrier.control({ command: "arm", point: "commit-after", action: "drop", persistent: false })
    expect(await barrier.visit("verification-read")).toBeUndefined()
    expect(await barrier.visit("commit-after")).toBe("drop")
    expect(await barrier.visit("commit-after")).toBeUndefined()
  })
})
