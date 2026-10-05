import { expect, test } from "vitest"
import type { MovementObserverStatus } from "../../src/mcp/movement-stage-observer.js"
import {
  makeMovementStatusReader,
  MAX_OBSERVER_STATUS_LINE_BYTES
} from "../../scripts/integration-mcp-observer-status.js"
test("split chunks and multiple lines forward only the projected static enum", () => {
  const statuses: Array<MovementObserverStatus> = []
  const reader = makeMovementStatusReader(
    (status) => statuses.push(status),
    () => {}
  )
  reader.accept(Buffer.from('SECRET_RAW\n{"observerStatus":"rec'))
  reader.accept(
    Buffer.from('orded","private":"SECRET_RAW"}\n{"observerStatus":"invalid"}\n{"observerStatus":"unavailable"}\n')
  )
  expect(statuses).toEqual([{ observerStatus: "recorded" }, { observerStatus: "unavailable" }])
  reader.close()
  reader.accept(Buffer.from('{"observerStatus":"recorded"}\n'))
  expect(statuses).toHaveLength(2)
})
test("oversized unterminated diagnostics discard until newline then resume", () => {
  const statuses: Array<MovementObserverStatus> = []
  const reader = makeMovementStatusReader(
    (status) => statuses.push(status),
    () => {}
  )
  reader.accept(Buffer.from("x".repeat(MAX_OBSERVER_STATUS_LINE_BYTES)))
  reader.accept(Buffer.from('x{"observerStatus":"recorded"}\n{"observerStatus":"unavailable"}\n'))
  reader.accept(null)
  expect(statuses).toEqual([{ observerStatus: "unavailable" }])
})
test("diagnostic callback defects become unavailable without escaping the listener", () => {
  let unavailable = 0
  const reader = makeMovementStatusReader(
    () => {
      throw new Error("PRIVATE_DEFECT")
    },
    () => {
      unavailable++
    }
  )
  expect(() => reader.accept(Buffer.from('{"observerStatus":"recorded"}\n'))).not.toThrow()
  expect(unavailable).toBe(1)
})

test("discarding an oversized line across chunks recovers only after its newline", () => {
  const statuses: Array<MovementObserverStatus> = []
  const reader = makeMovementStatusReader(
    (status) => statuses.push(status),
    () => {}
  )
  reader.accept(Buffer.from("x".repeat(MAX_OBSERVER_STATUS_LINE_BYTES + 1)))
  reader.accept(Buffer.from('{"observerStatus":"recorded"}'))
  expect(statuses).toEqual([])
  reader.accept(Buffer.from('\n{"observerStatus":"unavailable"}\n'))
  expect(statuses).toEqual([{ observerStatus: "unavailable" }])
})
