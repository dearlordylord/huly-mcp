import { randomBytes, randomUUID } from "node:crypto"
import { once } from "node:events"
import { request } from "node:https"
import type { IncomingMessage } from "node:http"
import { createConnection } from "node:net"
import type { TLSSocket } from "node:tls"
import { Effect, Exit, Schema } from "effect"
import { expect, it } from "vitest"

import {
  makeResidentHttpsListener,
  ResidentEndpoint,
  ResidentTlsIdentity,
  withResidentHttpsAgent
} from "../../src/resident/tls-channel.js"

const RESPONSE_BOUND = 5_000
const KEY_BYTES = 32
const identity = () =>
  Schema.decodeUnknownSync(ResidentTlsIdentity)({
    generation: randomUUID(),
    key: randomBytes(KEY_BYTES).toString("hex")
  })

it("rejects a real TCP acquisition delivered after its listener was retired", async () => {
  const listener = makeResidentHttpsListener(identity())
  const notRunning = await new Promise<unknown>((resolve) => listener.close(resolve))
  expect(Schema.is(Schema.Struct({ code: Schema.Literal("ERR_SERVER_NOT_RUNNING") }))(notRunning)).toBe(true)
  listener.listen(0, "127.0.0.1")
  await once(listener, "listening")
  const address = listener.address()
  if (address === null || typeof address === "string") throw new Error("Expected owned TCP listener")
  try {
    await Effect.runPromise(
      Effect.acquireUseRelease(
        Effect.sync(() => createConnection({ host: "127.0.0.1", port: address.port })),
        (socket) =>
          Effect.callback<void>((resume) => {
            const closed = () => resume(Effect.void)
            const failed = () => {}
            socket.once("close", closed)
            socket.on("error", failed)
            return Effect.sync(() => {
              socket.removeListener("close", closed)
              socket.removeListener("error", failed)
            })
          }).pipe(Effect.timeout(RESPONSE_BOUND)),
        (socket) => Effect.sync(() => socket.destroy())
      )
    )
  } finally {
    listener.closeAllConnections()
    await new Promise<void>((resolve, reject) => listener.close((error) => (error ? reject(error) : resolve())))
  }
})

it("refuses a TLS handoff already closed by an owned cancellation callback", async () => {
  const owner = identity()
  const listener = makeResidentHttpsListener(owner)
  let dispatched = false
  let cancelled = false
  listener.prependOnceListener("secureConnection", (socket: TLSSocket) => {
    cancelled = true
    socket.destroy()
  })
  listener.on("request", (_incoming, response) => {
    dispatched = true
    response.end()
  })
  listener.listen(0, "127.0.0.1")
  await once(listener, "listening")
  const address = listener.address()
  if (address === null || typeof address === "string") throw new Error("Expected owned TLS listener")
  try {
    const endpoint = Schema.decodeUnknownSync(ResidentEndpoint)(`https://127.0.0.1:${address.port}/mcp`)
    const outcome = await Effect.runPromiseExit(
      withResidentHttpsAgent(endpoint, owner, (agent) =>
        Effect.tryPromise(
          (signal) =>
            new Promise<IncomingMessage>((resolve, reject) => {
              const outgoing = request(endpoint, { agent, signal }, resolve)
              outgoing.once("error", reject)
              outgoing.end()
            })
        )
      ).pipe(Effect.timeout(RESPONSE_BOUND))
    )
    expect(Exit.isFailure(outcome)).toBe(true)
    expect(cancelled).toBe(true)
    expect(dispatched).toBe(false)
  } finally {
    listener.closeAllConnections()
    await new Promise<void>((resolve, reject) => listener.close((error) => (error ? reject(error) : resolve())))
  }
})
