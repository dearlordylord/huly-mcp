import { NodeHttpClient } from "@effect/platform-node"
import { Deferred, Effect, Option, Redacted, Schema, Tracer } from "effect"
import { HttpClientRequest } from "effect/http"
import { expect, it } from "vitest"

import { requestContextMiddleware } from "../../src/mcp/http-request-context.js"
import { withAdapterAttachment, withAdapterCandidate } from "../../src/resident/adapter-attachment.js"
import {
  AdmissionPolicy,
  DEFAULT_LEASE_POLICY,
  RESIDENT_ATTACHMENTS_PATH
} from "../../src/resident/admission-contract.js"
import { residentAdmissionMiddleware } from "../../src/resident/admission-http.js"
import { makeResidentAdmissions } from "../../src/resident/admissions.js"
import { ResidentAttachment } from "../../src/resident/attachment-file.js"
import { makeCompatibilityAuthority } from "../../src/resident/compatibility-authority.js"
import {
  CompatibilityChallenge,
  CompatibilityError,
  CompatibilityProof,
  MAX_COMPATIBILITY_CHALLENGES,
  MAX_COMPATIBILITY_REQUEST_BYTES,
  ResidentSelection,
  RESIDENT_COMPATIBILITY_PATH
} from "../../src/resident/compatibility-contract.js"
import { makeCompatibilityProof } from "../../src/resident/compatibility-crypto.js"
import { withResidentHeaderRedaction } from "../../src/resident/private-http.js"
import { withResidentHttpsAgent } from "../../src/resident/tls-channel.js"
import { VERSION } from "../../src/version.js"
import {
  AUTHORIZATION,
  type Owner,
  type OwnerName,
  ping,
  withNativeServer
} from "../helpers/resident-native-fixture.js"

const selected = Schema.decodeUnknownSync(ResidentSelection)({
  huly: {
    url: "https://huly.invalid",
    workspace: "fixture",
    auth: { _tag: "token", token: "fixture-private-token" },
    connectionTimeout: 1_000
  },
  policy: { toolsets: [], tools: [], exposure: { configuredMode: "auto", proxyOutputStrict: false } },
  lazyEnvs: false,
  telemetryEnabled: true
})
const policy = Schema.decodeUnknownSync(AdmissionPolicy)({
  capacity: 1,
  closeAllowanceMillis: 1_000,
  lease: DEFAULT_LEASE_POLICY
})

it("blocks unresolved compatibility refusal instead of treating it as a different configuration", async () => {
  let admitted = false
  await Effect.runPromise(
    withCompatibleServer(
      (attachment) =>
        Effect.gen(function* () {
          const error = yield* withAdapterCandidate(attachment, selected, () =>
            Effect.sync(() => {
              admitted = true
            })
          ).pipe(Effect.flip)
          expect(error._tag).toBe("BackendResponseError")
          expect(admitted).toBe(false)
        }),
      (authority) => ({
        ...authority,
        verify: () =>
          Effect.fail(new CompatibilityError({ kind: "unknown", message: "Fixture compatibility evidence expired" }))
      })
    )
  )
})
type Admissions = Effect.Success<ReturnType<typeof makeResidentAdmissions>>
type Authority = Effect.Success<ReturnType<typeof makeCompatibilityAuthority>>

const withCompatibleServer = <A, E, R>(
  use: (attachment: ResidentAttachment, admissions: Admissions) => Effect.Effect<A, E, R>,
  provideAuthority: (authority: Authority) => Authority = (authority) => authority,
  observeRequest: Effect.Effect<void> = Effect.void
) =>
  Effect.gen(function* () {
    const admissions = yield* makeResidentAdmissions(policy)
    const authority = yield* Deferred.make<Authority>()
    const native = requestContextMiddleware({
      resolveClients: () => Promise.reject(new Error("Metadata must not acquire Huly"))
    })
    return yield* withNativeServer(
      new Map<OwnerName, Owner>(),
      (endpoint, identity) =>
        Effect.gen(function* () {
          yield* Deferred.succeed(
            authority,
            provideAuthority(yield* makeCompatibilityAuthority(selected, identity.generation, AUTHORIZATION))
          )
          const attachment = ResidentAttachment.make({
            version: 1,
            transport: "tls13-external-psk-v1",
            implementation: { name: "@firfi/huly-mcp", version: VERSION },
            endpoint,
            identity,
            authorization: AUTHORIZATION
          })
          return yield* use(attachment, admissions)
        }),
      {
        middleware: (app) =>
          Deferred.await(authority).pipe(
            Effect.flatMap((owner) =>
              residentAdmissionMiddleware(admissions, owner)(observeRequest.pipe(Effect.andThen(native(app))))
            )
          )
      }
    )
  }).pipe(Effect.scoped, Effect.timeout("5 seconds"))

const request = (
  attachment: ResidentAttachment,
  method: "POST" | "GET",
  path: string,
  body = "",
  headers: Record<string, string> = {}
) =>
  withResidentHttpsAgent(attachment.endpoint, attachment.identity, (agent) =>
    Effect.gen(function* () {
      const client = yield* NodeHttpClient.makeNodeHttp.pipe(
        Effect.provideService(NodeHttpClient.HttpAgent, { http: agent, https: agent })
      )
      const response = yield* client.execute(
        HttpClientRequest.make(method)(new URL(path, attachment.endpoint).href).pipe(
          HttpClientRequest.setHeader("authorization", `Bearer ${Redacted.value(attachment.authorization)}`),
          HttpClientRequest.setHeaders(headers),
          HttpClientRequest.bodyText(body, "application/json")
        )
      )
      return { status: response.status, body: yield* response.text, cacheControl: response.headers["cache-control"] }
    })
  )

it("admits the matching client over authenticated TLS and refuses missing, malformed or incompatible proofs", async () => {
  await Effect.runPromise(
    withCompatibleServer((attachment, admissions) =>
      Effect.gen(function* () {
        expect((yield* request(attachment, "GET", RESIDENT_COMPATIBILITY_PATH)).status).toBe(405)
        expect((yield* request(attachment, "POST", RESIDENT_ATTACHMENTS_PATH)).status).toBe(400)
        expect((yield* request(attachment, "POST", RESIDENT_ATTACHMENTS_PATH, "{invalid")).status).toBe(400)
        const wrong = Schema.decodeUnknownSync(ResidentSelection)({
          ...selected,
          huly: { ...selected.huly, auth: { _tag: "token", token: "different-fixture-token" } }
        })
        const refused = yield* Effect.flip(
          withAdapterAttachment(attachment, () => Effect.die("Incompatible client must not enter"), wrong)
        )
        expect(refused._tag).toBe("BackendResponseError")
        expect(JSON.stringify(refused)).not.toContain("fixture-token")
        yield* withAdapterAttachment(
          attachment,
          (exchange) =>
            Effect.gen(function* () {
              expect((yield* Effect.flip(admissions.admit)).kind).toBe("capacity")
              yield* exchange(ping, Option.none(), (response) =>
                response.text.pipe(
                  Effect.map(() => {
                    expect(response.status).toBe(200)
                  })
                )
              )
            }),
          selected
        )
        const reclaimed = yield* admissions.admit
        yield* admissions.release(reclaimed.token)
      })
    )
  )
})

it("bounds an oversized proof body and retains capacity for a later valid client", async () => {
  await Effect.runPromise(
    withCompatibleServer((attachment) =>
      Effect.gen(function* () {
        const rejected = yield* Effect.flip(
          request(attachment, "POST", RESIDENT_ATTACHMENTS_PATH, "x".repeat(MAX_COMPATIBILITY_REQUEST_BYTES + 1))
        )
        expect(rejected._tag).toBe("HttpClientError")
        yield* withAdapterAttachment(attachment, () => Effect.void, selected)
      })
    )
  )
})

it("returns refusal if shutdown fences admission after a successful compatibility proof", async () => {
  await Effect.runPromise(
    withCompatibleServer((attachment, admissions) =>
      Effect.gen(function* () {
        const response = yield* request(attachment, "POST", RESIDENT_COMPATIBILITY_PATH)
        expect(response.status).toBe(200)
        expect(response.cacheControl).toBe("no-store")
        const challenge = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(CompatibilityChallenge))(
          response.body
        )
        const proof = yield* makeCompatibilityProof(selected, challenge, attachment.authorization)
        const body = yield* Schema.encodeEffect(Schema.fromJsonString(CompatibilityProof))(proof)
        yield* admissions.fence
        expect((yield* request(attachment, "POST", RESIDENT_ATTACHMENTS_PATH, body)).status).toBe(409)
        expect((yield* request(attachment, "POST", RESIDENT_ATTACHMENTS_PATH, body)).status).toBe(403)
      })
    )
  )
})

it.each(["generation", "version"])(
  "rejects a challenge with the wrong %s before sending a selection proof",
  async (mode) => {
    let verifications = 0
    await Effect.runPromise(
      withCompatibleServer(
        (attachment) =>
          Effect.gen(function* () {
            const refused = yield* Effect.flip(
              withAdapterAttachment(attachment, () => Effect.die("Unexpected attachment"), selected)
            )
            expect(refused._tag).toBe("BackendResponseError")
            expect(verifications).toBe(0)
          }),
        (authority) => ({
          challenge: authority.challenge.pipe(
            Effect.map((challenge) => ({
              ...challenge,
              ...(mode === "generation"
                ? {
                    generation:
                      challenge.generation === "32300000-0000-4000-8000-000000000001"
                        ? Schema.decodeUnknownSync(CompatibilityChallenge.fields.generation)(
                            "32300000-0000-4000-8000-000000000002"
                          )
                        : Schema.decodeUnknownSync(CompatibilityChallenge.fields.generation)(
                            "32300000-0000-4000-8000-000000000001"
                          )
                  }
                : { implementation: "incompatible-package-version" })
            }))
          ),
          verify: (proof) =>
            Effect.suspend(() => {
              verifications++
              return authority.verify(proof)
            })
        })
      )
    )
  }
)

it("returns bounded challenge capacity refusal without falling back to unverified admission", async () => {
  await Effect.runPromise(
    withCompatibleServer((attachment, admissions) =>
      Effect.gen(function* () {
        for (let index = 0; index < MAX_COMPATIBILITY_CHALLENGES; index++)
          expect((yield* request(attachment, "POST", RESIDENT_COMPATIBILITY_PATH)).status).toBe(200)
        expect((yield* request(attachment, "POST", RESIDENT_COMPATIBILITY_PATH)).status).toBe(503)
        const refused = yield* Effect.flip(
          withAdapterAttachment(attachment, () => Effect.die("Must not bypass comparison"), selected)
        )
        expect(refused._tag).toBe("BackendResponseError")
        const capacity = yield* admissions.admit
        yield* admissions.release(capacity.token)
      })
    )
  )
})

it("redacts rejected Huly override headers in real server spans", async () => {
  const spans: Array<Tracer.Span> = []
  const tracer = Tracer.make({
    span: (options) => {
      const span = Tracer.nativeTracer.span(options)
      spans.push(span)
      return span
    }
  })
  const headers = {
    "x-huly-url": "https://private-user:private-password@other.invalid/private?token=private-query",
    "x-huly-workspace": "private-workspace",
    "x-huly-token": "private-override-token",
    "x-huly-password": "private-unsupported-password"
  }
  await Effect.runPromise(
    withCompatibleServer((attachment) =>
      Effect.gen(function* () {
        const response = yield* request(attachment, "POST", "/mcp", "{}", headers)
        expect(response.status).toBe(400)
      })
    ).pipe(withResidentHeaderRedaction, Effect.withTracer(tracer))
  )
  for (const header of ["authorization", ...Object.keys(headers)]) {
    const values = spans
      .filter((span) => span.kind === "server")
      .flatMap((span) => [...span.attributes])
      .filter(([key]) => key === `http.request.header.${header}`)
    expect(values.length, header).toBeGreaterThan(0)
    expect(
      values.every(([, value]) => value === "<redacted>"),
      header
    ).toBe(true)
  }
})

it("rejects configured resident Huly overrides before entering request client middleware", async () => {
  let entered = 0
  await Effect.runPromise(
    withCompatibleServer(
      (attachment) =>
        Effect.gen(function* () {
          for (const headers of [
            {
              "x-huly-url": "https://other.invalid",
              "x-huly-workspace": "other",
              "x-huly-token": "other-private-token"
            },
            { "x-huly-unsupported": "fixture" }
          ]) {
            const response = yield* request(attachment, "POST", "/mcp", "{}", headers)
            expect(response.status).toBe(400)
            expect(response.body).toContain("do not accept Huly override headers")
            expect(response.body).not.toContain("other-private-token")
          }
          expect(entered).toBe(0)
          yield* withAdapterAttachment(
            attachment,
            (exchange) =>
              exchange(ping, Option.none(), (response) =>
                response.text.pipe(Effect.map(() => expect(response.status).toBe(200)))
              ),
            selected
          )
          expect(entered).toBe(1)
        }),
      (authority) => authority,
      Effect.sync(() => {
        entered++
      })
    )
  )
})
