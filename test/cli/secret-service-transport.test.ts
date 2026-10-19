import { Message, Variant } from "dbus-next"
import { Effect, Result } from "effect"
import { expect, it } from "vitest"

import { makeSecretServiceConnect } from "../../src/profiles/linux-secret-service.js"

it("loads the installed SDK only on connection and releases a transport without a running service", async () => {
  const connection = await Effect.runPromise(makeSecretServiceConnect()("unix:path=/nonexistent-huly-test-bus"))
  await Effect.runPromise(connection.close)
  await Effect.runPromise(connection.close)
})

it("owns SDK transport lifetime and encodes requests before dispatch", async () => {
  const messages: Array<Message> = []
  let disconnected = false
  let listener: (() => void) | undefined
  const connect = makeSecretServiceConnect(async () => ({
    Message,
    Variant,
    sessionBus: ({ busAddress }) => {
      expect(busAddress).toBe("unix:path=/fixture")
      return {
        on: (_event, callback) => {
          listener = callback
        },
        call: async (message) => {
          messages.push(message)
          return { body: [[], []] }
        },
        disconnect: () => {
          disconnected = true
        }
      }
    }
  }))
  const connection = await Effect.runPromise(connect("unix:path=/fixture"))
  listener?.()
  expect(await Effect.runPromise(connection.call({ _tag: "SearchItems", key: "key" }))).toEqual([[], []])
  expect(messages[0]?.member).toBe("SearchItems")
  await Effect.runPromise(connection.close)
  expect(disconnected).toBe(true)
})

it("maps addon and transport failures and absent replies without exposing details", async () => {
  const denied = makeSecretServiceConnect(async () => {
    throw new Error("private-addon-sentinel")
  })
  const result = await Effect.runPromise(denied("unix:path=/fixture").pipe(Effect.result))
  expect(Result.isFailure(result)).toBe(true)
  expect(JSON.stringify(result)).not.toContain("private-addon-sentinel")
  for (const fail of [true, false]) {
    const connect = makeSecretServiceConnect(async () => ({
      Message,
      Variant,
      sessionBus: () => ({
        on: () => {},
        disconnect: () => {},
        call: async () => {
          if (fail) throw new Error("private-bus-sentinel")
          return null
        }
      })
    }))
    const connection = await Effect.runPromise(connect("unix:path=/fixture"))
    const called = await Effect.runPromise(connection.call({ _tag: "SearchItems", key: "key" }).pipe(Effect.result))
    expect(Result.isFailure(called)).toBe(fail)
    expect(JSON.stringify(called)).not.toContain("private-bus-sentinel")
  }
})
