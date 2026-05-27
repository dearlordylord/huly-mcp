import { describe, expect, it } from "vitest"

import { type ConsoleRedirectTarget, redirectConsoleToStderr } from "../../src/mcp/stdio-output.js"

type ConsoleMethodName = keyof ConsoleRedirectTarget

interface ConsoleCall {
  readonly method: ConsoleMethodName
  readonly data: ReadonlyArray<unknown>
}

interface ConsoleProbe {
  readonly target: ConsoleRedirectTarget
  readonly calls: ReadonlyArray<ConsoleCall>
}

const createConsoleProbe = (): ConsoleProbe => {
  const calls: Array<ConsoleCall> = []
  const writer = (method: ConsoleMethodName) => (...data: ReadonlyArray<unknown>): void => {
    calls.push({ method, data })
  }

  return {
    calls,
    target: {
      debug: writer("debug"),
      error: writer("error"),
      info: writer("info"),
      log: writer("log"),
      warn: writer("warn")
    }
  }
}

describe("redirectConsoleToStderr", () => {
  it("routes all console diagnostics through the original error writer", () => {
    const { calls, target } = createConsoleProbe()
    const restore = redirectConsoleToStderr(target)

    target.log("sdk log")
    target.info("sdk info")
    target.debug("sdk debug")
    target.warn("sdk warning")
    target.error("sdk error")

    restore.restore()

    expect(calls).toEqual([
      { method: "error", data: ["sdk log"] },
      { method: "error", data: ["sdk info"] },
      { method: "error", data: ["sdk debug"] },
      { method: "error", data: ["sdk warning"] },
      { method: "error", data: ["sdk error"] }
    ])
  })

  it("restores original console methods idempotently", () => {
    const { calls, target } = createConsoleProbe()
    const restore = redirectConsoleToStderr(target)

    restore.restore()
    restore.restore()
    target.log("after restore")
    target.warn("after restore warning")

    expect(calls).toEqual([
      { method: "log", data: ["after restore"] },
      { method: "warn", data: ["after restore warning"] }
    ])
  })
})
