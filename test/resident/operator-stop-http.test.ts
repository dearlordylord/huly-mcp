import { NodeHttpClient } from "@effect/platform-node"
import { Effect, Exit, Redacted, Ref, Schema } from "effect"
import { HttpClientRequest } from "effect/http"
import { expect, it } from "vitest"

import { AdmissionPolicy, DEFAULT_LEASE_POLICY } from "../../src/resident/admission-contract.js"
import { residentAdmissionMiddleware } from "../../src/resident/admission-http.js"
import { makeResidentAdmissions } from "../../src/resident/admissions.js"
import { type ResidentStopSupport } from "../../src/resident/operator-stop.js"
import { withResidentHttpsAgent } from "../../src/resident/tls-channel.js"
import { AUTHORIZATION, withNativeServer, type Owner, type OwnerName } from "../helpers/resident-native-fixture.js"

const OTHER_GENERATION = "00000000-0000-4000-8000-000000000000"
const STOP_PATH = "/resident/control/stop-v1"
const policy = Schema.decodeUnknownSync(AdmissionPolicy)({
  capacity: 2,
  closeAllowanceMillis: 5_000,
  lease: DEFAULT_LEASE_POLICY
})

it("authenticates exact-generation stop before fencing existing admissions, with repeatable acceptance only", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const admissions = yield* makeResidentAdmissions(policy)
      const support = yield* Ref.make<ResidentStopSupport>({ kind: "unsupported" })
      yield* withNativeServer(
        new Map<OwnerName, Owner>(),
        (endpoint, identity) =>
          Effect.gen(function* () {
            const control = (method: "GET" | "POST" | "DELETE", body = "", authorized = true) =>
              withResidentHttpsAgent(endpoint, identity, (agent) =>
                Effect.gen(function* () {
                  const client = yield* NodeHttpClient.makeNodeHttp.pipe(
                    Effect.provideService(NodeHttpClient.HttpAgent, { http: agent, https: agent })
                  )
                  const response = yield* client.execute(
                    HttpClientRequest.make(method)(new URL(STOP_PATH, endpoint).href).pipe(
                      HttpClientRequest.setHeaders({
                        authorization: authorized ? `Bearer ${Redacted.value(AUTHORIZATION)}` : "Bearer wrong"
                      }),
                      HttpClientRequest.bodyText(body, "application/json")
                    )
                  )
                  return {
                    status: response.status,
                    body: yield* response.headers["content-type"]?.includes("application/json")
                      ? response.json
                      : response.text
                  }
                })
              )
            expect((yield* control("GET")).status).toBe(409)
            yield* Ref.set(support, { kind: "managed", generation: identity.generation, fence: admissions.fence })
            const capability = yield* control("GET")
            expect(capability).toEqual({
              status: 200,
              body: {
                stopWire: 1,
                generation: identity.generation,
                mode: "managed",
                acknowledgment: "admission-fenced",
                retirementEvidence: "none"
              }
            })
            expect((yield* control("POST", "{broken")).status).toBe(400)
            expect((yield* control("POST", JSON.stringify({ stopWire: 1, generation: OTHER_GENERATION }))).status).toBe(
              409
            )
            expect(
              (yield* control("POST", JSON.stringify({ stopWire: 2, generation: identity.generation }))).status
            ).toBe(400)
            const oversized = yield* Effect.exit(control("POST", JSON.stringify({ padding: "x".repeat(4_097) })))
            if (Exit.isSuccess(oversized)) expect(oversized.value.status).toBe(400)
            expect((yield* control("DELETE")).status).toBe(405)
            const existing = yield* admissions.admit
            const body = JSON.stringify({ stopWire: 1, generation: identity.generation })
            expect((yield* control("POST", body, false)).status).toBe(401)
            yield* admissions.renew(existing.token)
            const accepted = yield* control("POST", body)
            expect(accepted).toEqual({
              status: 202,
              body: {
                stopWire: 1,
                generation: identity.generation,
                accepted: "admission-fenced",
                retirement: "unconfirmed"
              }
            })
            expect(yield* control("POST", body)).toEqual(accepted)
            expect(Exit.isFailure(yield* Effect.exit(admissions.admit))).toBe(true)
            yield* admissions.release(existing.token)
          }),
        {
          middleware: (app) =>
            Ref.get(support).pipe(
              Effect.flatMap((current) => residentAdmissionMiddleware(admissions, undefined, current)(app))
            )
        }
      )
    }).pipe(Effect.scoped, Effect.timeout("5 seconds"))
  )
})
