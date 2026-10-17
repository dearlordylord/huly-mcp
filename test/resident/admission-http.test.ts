import { NodeHttpClient } from "@effect/platform-node"
import { Effect, Option, Redacted, Schema } from "effect"
import { HttpClientRequest } from "effect/http"
import { expect, it } from "vitest"

import { requestContextMiddleware } from "../../src/mcp/http-request-context.js"
import {
  AdmissionPolicy,
  AttachmentAdmitted,
  DEFAULT_LEASE_POLICY,
  type AttachmentToken,
  RESIDENT_ATTACHMENT_HEADER,
  RESIDENT_ATTACHMENTS_PATH
} from "../../src/resident/admission-contract.js"
import { residentAdmissionMiddleware } from "../../src/resident/admission-http.js"
import { makeResidentAdmissions } from "../../src/resident/admissions.js"
import {
  withResidentHttpsAgent,
  type ResidentEndpoint,
  type ResidentTlsIdentity
} from "../../src/resident/tls-channel.js"
import {
  AUTHORIZATION,
  exchange,
  initialize,
  ping,
  withNativeServer,
  type Owner,
  type OwnerName
} from "../helpers/resident-native-fixture.js"

const HTTP_OK = 200
const HTTP_CREATED = 201
const HTTP_NO_CONTENT = 204
const HTTP_FORBIDDEN = 403
const HTTP_METHOD_NOT_ALLOWED = 405
const HTTP_CAPACITY = 503
const HTTP_CONFLICT = 409
const CLOSE_ALLOWANCE_MILLIS = 5_000
const ATTACHMENT_CAPACITY = 2
const policy = Schema.decodeUnknownSync(AdmissionPolicy)({
  capacity: ATTACHMENT_CAPACITY,
  closeAllowanceMillis: CLOSE_ALLOWANCE_MILLIS,
  lease: DEFAULT_LEASE_POLICY
})

const control = (
  endpoint: ResidentEndpoint,
  identity: ResidentTlsIdentity,
  method: "POST" | "PUT" | "DELETE" | "GET",
  token?: AttachmentToken
) =>
  withResidentHttpsAgent(endpoint, identity, (agent) =>
    Effect.gen(function* () {
      const client = yield* NodeHttpClient.makeNodeHttp.pipe(
        Effect.provideService(NodeHttpClient.HttpAgent, { http: agent, https: agent })
      )
      const response = yield* client.execute(
        HttpClientRequest.make(method)(new URL(RESIDENT_ATTACHMENTS_PATH, endpoint).href).pipe(
          HttpClientRequest.setHeaders({
            authorization: `Bearer ${Redacted.value(AUTHORIZATION)}`,
            ...(token === undefined ? {} : { [RESIDENT_ATTACHMENT_HEADER]: Redacted.value(token) })
          })
        )
      )
      return { status: response.status, body: yield* response.text }
    })
  )

it("authenticates attachment membership before native MCP and fences foreign legacy UUIDs", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const admissions = yield* makeResidentAdmissions(policy)
      const nativeContext = requestContextMiddleware({
        resolveClients: () => Promise.reject(new Error("Catalog must not acquire Huly"))
      })
      yield* withNativeServer(
        new Map<OwnerName, Owner>(),
        (endpoint, identity) =>
          Effect.gen(function* () {
            expect((yield* exchange(endpoint, identity, "none", ping)).status).toBe(HTTP_FORBIDDEN)
            expect((yield* control(endpoint, identity, "GET")).status).toBe(HTTP_METHOD_NOT_ALLOWED)
            expect((yield* control(endpoint, identity, "DELETE")).status).toBe(HTTP_FORBIDDEN)
            const first = yield* control(endpoint, identity, "POST")
            const second = yield* control(endpoint, identity, "POST")
            expect(first.status).toBe(HTTP_CREATED)
            expect(second.status).toBe(HTTP_CREATED)
            const firstToken = (yield* Schema.decodeUnknownEffect(Schema.fromJsonString(AttachmentAdmitted))(
              first.body
            )).token
            const secondToken = (yield* Schema.decodeUnknownEffect(Schema.fromJsonString(AttachmentAdmitted))(
              second.body
            )).token
            expect(Redacted.value(firstToken)).not.toBe(Redacted.value(secondToken))
            expect((yield* control(endpoint, identity, "POST")).status).toBe(HTTP_CAPACITY)
            expect((yield* control(endpoint, identity, "PUT", firstToken)).status).toBe(HTTP_NO_CONTENT)
            const firstOwner = yield* admissions.find(firstToken)
            const malformedSession = yield* withResidentHttpsAgent(endpoint, identity, (agent) =>
              Effect.gen(function* () {
                const client = yield* NodeHttpClient.makeNodeHttp.pipe(
                  Effect.provideService(NodeHttpClient.HttpAgent, { http: agent, https: agent })
                )
                return yield* client
                  .execute(
                    HttpClientRequest.post(endpoint.href).pipe(
                      HttpClientRequest.setHeaders({
                        authorization: `Bearer ${Redacted.value(AUTHORIZATION)}`,
                        [RESIDENT_ATTACHMENT_HEADER]: Redacted.value(firstToken),
                        "mcp-session-id": ""
                      }),
                      HttpClientRequest.bodyText(JSON.stringify(ping), "application/json")
                    )
                  )
                  .pipe(Effect.map((response) => response.status))
              })
            )
            expect(malformedSession).toBe(HTTP_FORBIDDEN)
            const initialized = yield* exchange(
              endpoint,
              identity,
              "first",
              initialize("first"),
              Option.none(),
              firstToken
            )
            const survivor = yield* exchange(
              endpoint,
              identity,
              "second",
              initialize("second"),
              Option.none(),
              secondToken
            )
            expect(initialized.status).toBe(HTTP_OK)
            expect(survivor.status).toBe(HTTP_OK)
            expect(Option.isSome(initialized.session)).toBe(true)
            expect((yield* exchange(endpoint, identity, "second", ping, initialized.session, secondToken)).status).toBe(
              HTTP_FORBIDDEN
            )
            expect((yield* exchange(endpoint, identity, "first", ping, initialized.session, firstToken)).status).toBe(
              HTTP_OK
            )
            expect((yield* control(endpoint, identity, "DELETE", firstToken)).status).toBe(HTTP_NO_CONTENT)
            if (Option.isSome(initialized.session))
              expect(yield* firstOwner.ownsSession(Redacted.value(initialized.session.value.id))).toBe(false)
            expect((yield* control(endpoint, identity, "DELETE", firstToken)).status).toBe(HTTP_NO_CONTENT)
            expect((yield* exchange(endpoint, identity, "first", ping, initialized.session, firstToken)).status).toBe(
              HTTP_FORBIDDEN
            )
            expect((yield* exchange(endpoint, identity, "second", ping, survivor.session, secondToken)).status).toBe(
              HTTP_OK
            )
            const third = yield* control(endpoint, identity, "POST")
            expect(third.status).toBe(HTTP_CREATED)
            const thirdToken = (yield* Schema.decodeUnknownEffect(Schema.fromJsonString(AttachmentAdmitted))(
              third.body
            )).token
            const blockedOwner = yield* admissions.find(thirdToken)
            yield* Effect.exit(
              blockedOwner.withWork({
                use: () => Effect.void,
                cleanup: () => Effect.fail("Fixture cleanup could not be confirmed")
              })
            )
            expect((yield* control(endpoint, identity, "DELETE", thirdToken)).status).toBe(HTTP_CONFLICT)
            yield* admissions.release(secondToken)
          }),
        { middleware: (app) => residentAdmissionMiddleware(admissions)(nativeContext(app)) }
      )
    }).pipe(Effect.scoped, Effect.timeout("5 seconds"))
  )
})
