import { expect, it } from "vitest"

import { isProcessGroupAbsent, signalProcessGroup } from "../../scripts/process-group.js"

const GROUP_PID = 123
const errno = (code: string) => Object.assign(new Error(`kill ${code}`), { code })

it("signals the owned process group", () => {
  signalProcessGroup(GROUP_PID, "SIGKILL", (pid, signal) => {
    expect(pid).toBe(-GROUP_PID)
    expect(signal).toBe("SIGKILL")
  })
})

it.each(["ESRCH", "EPERM"])("leaves a %s signal attempt subject to separate absence proof", (code) => {
  expect(() =>
    signalProcessGroup(GROUP_PID, "SIGTERM", () => {
      throw errno(code)
    })
  ).not.toThrow()
})

it("does not mistake a live group for absence", () => {
  expect(
    isProcessGroupAbsent(GROUP_PID, (pid, signal) => {
      expect(pid).toBe(-GROUP_PID)
      expect(signal).toBe(0)
    })
  ).toBe(false)
})

it("requires ESRCH after transient permission denial", () => {
  const codes = ["EPERM", "ESRCH"]
  const probe = () => {
    throw errno(codes.shift() ?? "EIO")
  }
  expect(isProcessGroupAbsent(GROUP_PID, probe)).toBe(false)
  expect(isProcessGroupAbsent(GROUP_PID, probe)).toBe(true)
})

it.each([errno("EIO"), new Error("unexpected kernel failure")])("preserves unexpected kernel failures", (error) => {
  const send = () => {
    throw error
  }
  expect(() => signalProcessGroup(GROUP_PID, "SIGKILL", send)).toThrow(error)
  expect(() => isProcessGroupAbsent(GROUP_PID, send)).toThrow(error)
})
