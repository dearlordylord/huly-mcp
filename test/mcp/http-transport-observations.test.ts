import { Server } from "@modelcontextprotocol/server"
import { Effect, Redacted } from "effect"
import { describe, expect, it } from "vitest"

import type { HttpAdmissionObservation } from "../../src/mcp/http-admission-observations.js"
import { createMountedMcpHttpHandler } from "../../src/mcp/http-transport.js"
import { subscribeHttpAdmissionObservations } from "../helpers/http-admission-observations.js"

const secret = "observed-secret-token"
const differentSecret = "rejected-secret-token"
const protocolVersion = "2026-07-28"

const request = (authorization: string | undefined, host: string, origin: string): Request => {
  const headers = new Headers({
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
    "mcp-protocol-version": protocolVersion,
    "mcp-method": "tools/list",
    host,
    origin
  })
  if (authorization !== undefined) headers.set("authorization", authorization)
  return new Request("http://localhost/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {
        _meta: {
          "io.modelcontextprotocol/protocolVersion": protocolVersion,
          "io.modelcontextprotocol/clientCapabilities": {},
          "io.modelcontextprotocol/clientInfo": { name: "observations-test", version: "1" }
        }
      }
    })
  })
}

describe("HTTP transport admission observations", () => {
  it.each([
    {
      label: "unconfigured auth",
      token: undefined,
      authorization: undefined,
      configured: "NoToken",
      bearer: "NoBearer",
      status: 200
    },
    {
      label: "unconfigured auth with bearer",
      token: undefined,
      authorization: `Bearer ${secret}`,
      configured: "NoToken",
      bearer: "WrongBearer",
      status: 200
    },
    {
      label: "blank adapter token",
      token: " \t ",
      authorization: undefined,
      configured: "BlankToken",
      bearer: "NoBearer",
      status: 200
    },
    {
      label: "blank adapter token with bearer",
      token: " \t ",
      authorization: `Bearer ${secret}`,
      configured: "BlankToken",
      bearer: "WrongBearer",
      status: 200
    },
    {
      label: "missing bearer",
      token: secret,
      authorization: undefined,
      configured: "SecretToken",
      bearer: "NoBearer",
      status: 401
    },
    {
      label: "unsupported authorization scheme",
      token: secret,
      authorization: `Basic ${secret}`,
      configured: "SecretToken",
      bearer: "MalformedAuthorization",
      status: 401
    },
    {
      label: "malformed bearer",
      token: secret,
      authorization: `Bearer ${secret} extra`,
      configured: "SecretToken",
      bearer: "MalformedAuthorization",
      status: 401
    },
    {
      label: "matching bearer",
      token: secret,
      authorization: `Bearer ${secret}`,
      configured: "SecretToken",
      bearer: "MatchingBearer",
      status: 200
    },
    {
      label: "wrong bearer",
      token: secret,
      authorization: `Bearer ${differentSecret}`,
      configured: "SecretToken",
      bearer: "WrongBearer",
      status: 401
    },
    {
      label: "short wrong bearer",
      token: secret,
      authorization: "Bearer short",
      configured: "SecretToken",
      bearer: "WrongBearer",
      status: 401
    },
    {
      label: "whitespace around configured token",
      token: ` ${secret} `,
      authorization: `Bearer ${secret}`,
      configured: "SecretToken",
      bearer: "MatchingBearer",
      status: 200
    }
  ])("classifies $label without exposing credentials", async ({ authorization, bearer, configured, status, token }) => {
    const observations: HttpAdmissionObservation[] = []
    const errors: unknown[] = []
    const unsubscribe = subscribeHttpAdmissionObservations(
      (observation) => observations.push(observation),
      (error) => errors.push(error)
    )
    let created = 0
    const mounted = createMountedMcpHttpHandler(
      () => {
        created++
        const server = new Server({ name: "observation-test", version: "1" }, { capabilities: { tools: {} } })
        server.setRequestHandler("tools/list", async () => ({ tools: [] }))
        return server
      },
      token === undefined ? undefined : Redacted.make(token)
    )
    try {
      const response = await mounted.fetch(request(authorization, "localhost", "http://localhost"))
      await response.text()
      expect(response.status).toBe(status)
      expect(created).toBe(status === 200 ? 1 : 0)
      expect(observations.find((observation) => observation._tag === "createMountedMcpHttpHandler")).toEqual({
        _tag: "createMountedMcpHttpHandler",
        loopback: true,
        token: configured
      })
      expect(observations.find((observation) => observation._tag === "createMountedMcpHttpHandler_fetch")).toEqual({
        _tag: "createMountedMcpHttpHandler_fetch",
        hostOk: true,
        originOk: true,
        bearer,
        dispatched: status === 200
      })
      expect(JSON.stringify(observations)).not.toContain(secret)
      expect(JSON.stringify(observations)).not.toContain(differentSecret)
      expect(errors).toEqual([])
    } finally {
      await Effect.runPromise(mounted.close)
      unsubscribe()
    }
  })

  it.each([
    {
      label: "spoofed Host",
      binding: "127.0.0.1",
      host: "attacker.example",
      origin: "http://localhost",
      hostOk: false,
      originOk: true,
      status: 403
    },
    {
      label: "foreign Origin",
      binding: "127.0.0.1",
      host: "localhost",
      origin: "https://attacker.example",
      hostOk: true,
      originOk: false,
      status: 403
    },
    {
      label: "foreign Host and Origin on public binding",
      binding: "0.0.0.0",
      host: "attacker.example",
      origin: "https://attacker.example",
      hostOk: false,
      originOk: false,
      status: 200
    }
  ])("records $label consistently with admission", async ({ binding, host, hostOk, origin, originOk, status }) => {
    const observations: HttpAdmissionObservation[] = []
    const errors: unknown[] = []
    const unsubscribe = subscribeHttpAdmissionObservations(
      (observation) => observations.push(observation),
      (error) => errors.push(error)
    )
    let created = 0
    const mounted = createMountedMcpHttpHandler(
      () => {
        created++
        const server = new Server({ name: "observation-test", version: "1" }, { capabilities: { tools: {} } })
        server.setRequestHandler("tools/list", async () => ({ tools: [] }))
        return server
      },
      Redacted.make(secret),
      () => {},
      binding
    )
    try {
      const response = await mounted.fetch(request(`Bearer ${secret}`, host, origin))
      await response.text()
      expect(response.status).toBe(status)
      expect(created).toBe(status === 200 ? 1 : 0)
      expect(observations.find((observation) => observation._tag === "createMountedMcpHttpHandler_fetch")).toEqual({
        _tag: "createMountedMcpHttpHandler_fetch",
        hostOk,
        originOk,
        bearer: "MatchingBearer",
        dispatched: status === 200
      })
      expect(JSON.stringify(observations)).not.toContain(secret)
      expect(errors).toEqual([])
    } finally {
      await Effect.runPromise(mounted.close)
      unsubscribe()
    }
  })
})
