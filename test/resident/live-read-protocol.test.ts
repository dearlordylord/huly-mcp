import { Effect, Result, Schema } from "effect"
import { describe, expect, it } from "vitest"

import {
  type LiveReadHostInput,
  LiveReadProtocol,
  resolveLiveReadProtocol
} from "../../scripts/resident-live-read-contract.js"
import { discoverLiveReadProtocol, liveReadMetadata } from "../../scripts/resident-live-protocol.js"
import { HostMessage } from "../../src/resident/request-headers.js"

const legacy = { host: "first", protocol: "2025-06-18" } satisfies Pick<LiveReadHostInput, "host" | "protocol">
const initialized = { protocolVersion: "2025-06-18", capabilities: {}, serverInfo: { name: "fixture", version: "1" } }

describe("live read protocol qualification", () => {
  it("selects modern by default and preserves either explicitly supported protocol", () => {
    expect(resolveLiveReadProtocol(undefined)).toBe("2026-07-28")
    for (const protocol of ["2026-07-28", "2025-06-18"]) {
      const parsed = Schema.decodeUnknownSync(LiveReadProtocol)(protocol)
      expect(resolveLiveReadProtocol(parsed)).toBe(protocol)
    }
    expect(Schema.decodeUnknownResult(LiveReadProtocol)("unknown")._tag).toBe("Failure")
    expect(liveReadMetadata({ host: "second" })).toMatchObject({
      _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28" }
    })
    expect(liveReadMetadata(legacy)).toEqual({})
  })

  it("negotiates the requested legacy version before sending an ID-free initialized notification", async () => {
    const events: Array<{ kind: "request" | "notification"; message: HostMessage } | { kind: "negotiated" }> = []
    await Effect.runPromise(
      discoverLiveReadProtocol(
        legacy,
        (id, method, params) => {
          events.push({ kind: "request", message: HostMessage.make({ jsonrpc: "2.0", id, method, params }) })
          return Effect.sync(() => {
            events.push({ kind: "negotiated" })
            return initialized
          })
        },
        (frame) =>
          Effect.sync(() => {
            events.push({
              kind: "notification",
              message: Schema.decodeUnknownSync(Schema.fromJsonString(HostMessage))(frame)
            })
          })
      )
    )
    expect(events).toEqual([
      {
        kind: "request",
        message: {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "resident-live-first", version: "1.0" }
          }
        }
      },
      { kind: "negotiated" },
      { kind: "notification", message: { jsonrpc: "2.0", method: "notifications/initialized" } }
    ])
  })

  it("refuses a different negotiated version before marking the client initialized", async () => {
    let notified = false
    const result = await Effect.runPromise(
      discoverLiveReadProtocol(
        legacy,
        () => Effect.succeed({ ...initialized, protocolVersion: "2026-07-28" }),
        () =>
          Effect.sync(() => {
            notified = true
          })
      ).pipe(Effect.result)
    )
    expect(Result.isFailure(result) && result.failure.phase).toBe("discover")
    expect(notified).toBe(false)
  })
  it.each([true, false])("uses modern discovery and parses its reply (valid=%s)", async (valid) => {
    const methods: string[] = []
    let notified = false
    const result = await Effect.runPromise(
      discoverLiveReadProtocol(
        { host: "second" },
        (_id, method) => {
          methods.push(method)
          return Effect.succeed(valid ? { supportedVersions: ["2026-07-28"], capabilities: { tools: {} } } : {})
        },
        () =>
          Effect.sync(() => {
            notified = true
          })
      ).pipe(Effect.result)
    )
    expect(Result.isSuccess(result)).toBe(valid)
    if (Result.isFailure(result)) expect(result.failure.phase).toBe("discover")
    expect(methods).toEqual(["server/discover"])
    expect(notified).toBe(false)
  })
})
