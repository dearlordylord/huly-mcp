import { Effect, Result, type Schema } from "effect"
import { describe, expect, it } from "vitest"

import { liveProjectCall, parseLiveProjectReply } from "../../scripts/resident-live-exposure.js"
import { LiveReadClient, resolveLiveReadClient } from "../../scripts/resident-live-read-contract.js"
import { discoverLiveReadProtocol, liveReadMetadata } from "../../scripts/resident-live-protocol.js"

const native = LiveReadClient.make({ name: "claude-code", configuredMode: "auto", exposure: "native" })
const proxy = LiveReadClient.make({ name: "codex", configuredMode: "auto", exposure: "proxy" })
const project = { identifier: "ONE", name: "Exact fixture project", archived: false }

describe("resident read client exposure qualification", () => {
  it("retains explicit client identity and keeps the existing default", () => {
    expect(resolveLiveReadClient("second", undefined)).toEqual({
      name: "resident-live-second",
      configuredMode: "native",
      exposure: "native"
    })
    for (const client of [native, proxy]) {
      expect(resolveLiveReadClient("first", client)).toBe(client)
      expect(liveReadMetadata({ host: "first", client })).toMatchObject({
        _meta: { "io.modelcontextprotocol/clientInfo": { name: client.name, version: "1.0" } }
      })
    }
  })

  it("passes the selected client identity through legacy initialization", async () => {
    const requests: Schema.Json[] = []
    await Effect.runPromise(
      discoverLiveReadProtocol(
        { host: "first", protocol: "2025-06-18", client: proxy },
        (_id, _method, params) => {
          requests.push(params)
          return Effect.succeed({
            protocolVersion: "2025-06-18",
            capabilities: {},
            serverInfo: { name: "fixture", version: "1" }
          })
        },
        () => Effect.void
      )
    )
    expect(requests).toEqual([
      { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "codex", version: "1.0" } }
    ])
  })

  it("constructs direct and proxy calls without changing the selected project", () => {
    expect(liveProjectCall(native, { project: "ONE" })).toEqual({ name: "get_project", arguments: { project: "ONE" } })
    expect(liveProjectCall(proxy, { project: "TWO" })).toEqual({
      name: "invoke_tool",
      arguments: { toolName: "get_project", arguments: { project: "TWO" } }
    })
  })

  it.each([native, proxy])("parses exact $exposure project results and refuses other envelopes", async (client) => {
    const nativeReply = { structuredContent: { result: project } }
    const proxyReply = { structuredContent: { result: { toolName: "get_project", result: project } } }
    const valid = client.exposure === "native" ? nativeReply : proxyReply
    const other = client.exposure === "native" ? proxyReply : nativeReply
    expect(await Effect.runPromise(parseLiveProjectReply(client, valid))).toMatchObject(project)
    for (const invalid of [
      other,
      { ...valid, isError: true },
      { structuredContent: { result: { toolName: "list_projects", result: project } } }
    ]) {
      const result = await Effect.runPromise(parseLiveProjectReply(client, invalid).pipe(Effect.result))
      expect(Result.isFailure(result) && result.failure.phase).toBe("read")
    }
  })
})
