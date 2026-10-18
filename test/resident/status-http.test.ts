import { NodeHttpClient } from "@effect/platform-node"
import { Effect, Redacted, Ref, Schema } from "effect"
import { HttpClientRequest } from "effect/http"
import { expect, it } from "vitest"

import { AdmissionPolicy, DEFAULT_LEASE_POLICY } from "../../src/resident/admission-contract.js"
import { residentAdmissionMiddleware } from "../../src/resident/admission-http.js"
import { makeResidentAdmissions } from "../../src/resident/admissions.js"
import { ResidentLiveStatus, RESIDENT_STATUS_PATH } from "../../src/resident/status-contract.js"
import { readResidentLiveStatus } from "../../src/resident/status-client.js"
import { ResidentAttachment } from "../../src/resident/attachment-file.js"
import { withResidentHttpsAgent } from "../../src/resident/tls-channel.js"
import { VERSION } from "../../src/version.js"
import { AUTHORIZATION, withNativeServer, type Owner, type OwnerName } from "../helpers/resident-native-fixture.js"

const policy = Schema.decodeUnknownSync(AdmissionPolicy)({
  capacity: 2,
  closeAllowanceMillis: 5_000,
  lease: DEFAULT_LEASE_POLICY
})

it("authenticates status without admission, preserves fencing and refuses mutation methods", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const admissions = yield* makeResidentAdmissions(policy)
      const selected = yield* Ref.make<ResidentLiveStatus | undefined>(undefined)
      yield* withNativeServer(
        new Map<OwnerName, Owner>(),
        (endpoint, identity) =>
          Effect.gen(function* () {
            const attachment = ResidentAttachment.make({
              version: 1,
              transport: "tls13-external-psk-v1",
              endpoint,
              identity,
              authorization: AUTHORIZATION,
              implementation: { name: "@firfi/huly-mcp", version: VERSION }
            })
            const control = (method: "GET" | "POST", authorized = true) =>
              withResidentHttpsAgent(endpoint, identity, (agent) =>
                Effect.gen(function* () {
                  const client = yield* NodeHttpClient.makeNodeHttp.pipe(
                    Effect.provideService(NodeHttpClient.HttpAgent, { http: agent, https: agent })
                  )
                  const response = yield* client.execute(
                    HttpClientRequest.make(method)(new URL(RESIDENT_STATUS_PATH, endpoint).href).pipe(
                      HttpClientRequest.setHeaders({
                        authorization: authorized ? `Bearer ${Redacted.value(AUTHORIZATION)}` : "Bearer wrong"
                      })
                    )
                  )
                  return { status: response.status, cache: response.headers["cache-control"] }
                })
              )
            expect((yield* control("GET", false)).status).toBe(401)
            expect((yield* control("POST")).status).toBe(405)
            expect((yield* readResidentLiveStatus(attachment)).kind).toBe("unavailable")
            yield* Ref.set(
              selected,
              ResidentLiveStatus.make({
                statusWire: 1,
                generation: identity.generation,
                readiness: "ready",
                work: yield* admissions.status,
                retirement: "unconfirmed"
              })
            )
            expect(yield* control("GET")).toEqual({ status: 200, cache: "no-store" })
            expect(yield* readResidentLiveStatus(attachment)).toMatchObject({
              kind: "authenticated",
              status: { generation: identity.generation, readiness: "ready", work: { attachments: 0 } }
            })
            yield* admissions.fence
            const prior = yield* Ref.get(selected)
            if (prior === undefined) return yield* Effect.die("Missing fixture status")
            yield* Ref.set(selected, { ...prior, work: yield* admissions.status })
            expect(yield* readResidentLiveStatus(attachment)).toMatchObject({
              kind: "authenticated",
              status: { work: { admission: "fenced", drain: "draining" }, retirement: "unconfirmed" }
            })
            expect((yield* admissions.status).attachments).toBe(0)
          }),
        {
          middleware: (request) =>
            Effect.gen(function* () {
              const status = yield* Ref.get(selected)
              return yield* residentAdmissionMiddleware(
                admissions,
                undefined,
                undefined,
                status === undefined ? undefined : Effect.succeed(status)
              )(request)
            })
        }
      )
    }).pipe(Effect.scoped)
  )
})
