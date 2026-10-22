import { spawn } from "node:child_process"
import { once } from "node:events"
import { expect, it } from "vitest"

import { isProcessGroupAbsent, signalProcessGroup } from "../../scripts/process-group.js"

const GROUP_PID = 123
const errno = (code: string) => Object.assign(new Error(`kill ${code}`), { code })

it.skipIf(process.platform === "win32")(
  "signals an owned kernel group and confirms its absence after reaping",
  async () => {
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { detached: true, stdio: "ignore" })
    const closed = once(child, "close")
    void closed.catch(() => {})
    try {
      await once(child, "spawn")
      if (child.pid === undefined) throw new Error("Owned fixture has no PID after spawn")
      expect(isProcessGroupAbsent(child.pid)).toBe(false)
      signalProcessGroup(child.pid, "SIGTERM")
      await closed
      expect(isProcessGroupAbsent(child.pid)).toBe(true)
    } finally {
      child.kill("SIGKILL")
      await closed
    }
  }
)

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
