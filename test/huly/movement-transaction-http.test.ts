import type { Tx } from "@hcengineering/core"
import { Effect, Redacted, Schema } from "effect"
import { expect, it } from "vitest"
import {
  makeMovementRequestUrl,
  MovementEndpointSchema,
  MovementTransportConfigSchema,
  movementHttpPort,
  sendMovementTransaction,
  type MovementHttpPort
} from "../../src/huly/movement-transaction-transport.js"
import { NonEmptyString, PositiveInteger } from "../../src/domain/schemas/shared.js"
import { withHttpFixture } from "../helpers/http-fixture.js"
import { sdkFixture } from "../helpers/huly-sdk.js"

const sequence = sdkFixture<Tx>({
  _id: "sequence-request",
  _class: "core:class:TxUpdateDoc",
  space: "core:space:Tx",
  objectSpace: "core:space:Space",
  modifiedOn: 0,
  modifiedBy: "person",
  objectId: "destination",
  objectClass: "tracker:class:Project",
  operations: { $inc: { sequence: 1 } },
  retrieve: true
})
const configFor = (endpoint: string) =>
  Schema.decodeUnknownSync(MovementTransportConfigSchema)({
    endpoint,
    workspace: "workspace/with space",
    token: Redacted.make(NonEmptyString.make("private-fixture-token")),
    timeoutMs: 1000
  })

for (const { expected, protocol } of [
  { protocol: "http:", expected: "http:" },
  { protocol: "https:", expected: "https:" },
  { protocol: "ws:", expected: "http:" },
  { protocol: "wss:", expected: "https:" }
]) {
  it(`routes the supported ${protocol} endpoint to its ordinary REST scheme without changing input`, async () => {
    const endpoint = Schema.decodeUnknownSync(MovementEndpointSchema)(`${protocol}//ordinary.invalid/base///`)
    const before = endpoint.href
    const url = await Effect.runPromise(makeMovementRequestUrl(endpoint, NonEmptyString.make("workspace/with space")))
    expect(url.href).toBe(`${expected}//ordinary.invalid/base/api/v1/tx/workspace%2Fwith%20space`)
    expect(endpoint.href).toBe(before)
  })
}

for (const protocol of ["http:", "ws:"]) {
  it(`sends one authenticated ordinary REST POST through the ${protocol} endpoint`, async () => {
    const requests: Array<unknown> = []
    await withHttpFixture(
      (request, response) => {
        const chunks: Array<Uint8Array> = []
        request.on("data", (chunk: unknown) => chunks.push(Schema.decodeUnknownSync(Schema.Uint8Array)(chunk)))
        request.on("end", () => {
          requests.push({
            method: request.method,
            path: request.url,
            authorization: request.headers.authorization,
            contentType: request.headers["content-type"],
            transaction: Schema.decodeUnknownSync(Schema.fromJsonString(Schema.JsonObject))(
              Buffer.concat(chunks).toString("utf8")
            )
          })
          response.end('{"object":{"sequence":7}}')
        })
      },
      async (url) => {
        const endpoint = new URL(`${url}/base///`)
        endpoint.protocol = protocol
        const result = await Effect.runPromise(
          sendMovementTransaction(sequence, configFor(endpoint.href), movementHttpPort)
        )
        expect(result).toEqual({ object: { sequence: 7 } })
        expect(requests).toEqual([
          {
            method: "POST",
            path: "/base/api/v1/tx/workspace%2Fwith%20space",
            authorization: "Bearer private-fixture-token",
            contentType: "application/json",
            transaction: sequence
          }
        ])
      }
    )
  })
}

for (const action of ["redirect", "truncated-body", "disconnect"]) {
  it(`does not retry a movement ${action} and preserves sanitized after-send uncertainty`, async () => {
    const paths: Array<string | undefined> = []
    await withHttpFixture(
      (request, response) => {
        paths.push(request.url)
        if (action === "disconnect") request.socket.destroy()
        else if (action === "redirect") {
          response.writeHead(302, { location: "/private-fixture-token" })
          response.end()
        } else {
          response.writeHead(200, { "content-length": "100" })
          response.write("{")
          response.socket?.end()
        }
      },
      async (url) => {
        const result = await Effect.runPromise(
          Effect.result(sendMovementTransaction(sequence, configFor(url), movementHttpPort))
        )
        expect(result._tag).toBe("Failure")
        if (result._tag === "Failure") {
          expect(result.failure.phase).toBe("after-send")
          expect(JSON.stringify(result.failure)).not.toContain("private-fixture-token")
          expect(result.failure.reason).toContain("no transport retry")
        }
        expect(paths).toEqual(["/api/v1/tx/workspace%2Fwith%20space"])
      }
    )
  })
}

for (const body of ['{"object":{"sequence":"7"}}', '{"sequence":7}']) {
  it(`rejects a schema-invalid allocation result ${body} after one send`, async () => {
    const sent: Array<string> = []
    const http: MovementHttpPort = {
      send: (request) =>
        Effect.sync(() => {
          sent.push(request.body)
          return { status: PositiveInteger.make(200), body }
        })
    }
    const result = await Effect.runPromise(
      Effect.result(sendMovementTransaction(sequence, configFor("http://ordinary.invalid"), http))
    )
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") {
      expect(result.failure.phase).toBe("after-send")
      expect(result.failure.reason).toContain("did not match its contract")
    }
    expect(sent).toHaveLength(1)
  })
}

it("requires serverTime on a successful conditional reply and sends same-project updates without allocation", async () => {
  const conditional = sdkFixture<Tx>({
    _id: "batch-request",
    _class: "core:class:TxApplyIf",
    space: "core:space:Tx",
    objectSpace: "core:space:Tx",
    modifiedOn: 0,
    modifiedBy: "person",
    scope: "issue-transfer:root",
    match: [],
    notMatch: [],
    txes: []
  })
  const sent: Array<string> = []
  const reply = (body: string): MovementHttpPort => ({
    send: (request) =>
      Effect.sync(() => {
        sent.push(request.body)
        return { status: PositiveInteger.make(200), body }
      })
  })
  const config = configFor("http://ordinary.invalid")
  const malformed = await Effect.runPromise(
    Effect.result(sendMovementTransaction(conditional, config, reply('{"success":true}')))
  )
  expect(malformed._tag).toBe("Failure")
  if (malformed._tag === "Failure") expect(malformed.failure.phase).toBe("after-send")
  expect(
    await Effect.runPromise(sendMovementTransaction(conditional, config, reply('{"success":true,"serverTime":1}')))
  ).toEqual({ success: true, serverTime: 1 })
  const update = sdkFixture<Tx>({
    ...sequence,
    objectClass: "tracker:class:Issue",
    operations: { attachedTo: "parent" }
  })
  expect(await Effect.runPromise(sendMovementTransaction(update, config, reply("{}")))).toEqual({})
  expect(sent).toEqual([JSON.stringify(conditional), JSON.stringify(conditional), JSON.stringify(update)])
})
