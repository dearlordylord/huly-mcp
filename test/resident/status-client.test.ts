import { Effect, Redacted, Ref } from "effect"
import { HttpServerResponse } from "effect/http"
import { expect, it } from "vitest"

import { ResidentAttachment } from "../../src/resident/attachment-file.js"
import { readResidentLiveStatus } from "../../src/resident/status-client.js"
import { VERSION } from "../../src/version.js"
import { AUTHORIZATION, withNativeServer, type Owner, type OwnerName } from "../helpers/resident-native-fixture.js"

it("refuses malformed, mismatched, oversized and unauthorized status without leaking private responses", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const response = yield* Ref.make(HttpServerResponse.empty({ status: 503 }))
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
            const valid = {
              statusWire: 1,
              generation: identity.generation,
              readiness: "ready",
              work: {
                admission: "accepting",
                attachments: 0,
                pendingAdmissions: 0,
                retainedRequests: 0,
                blockedRequests: 0,
                drain: "idle"
              },
              retirement: "unconfirmed"
            }
            const replies = [
              HttpServerResponse.empty({ status: 503 }),
              HttpServerResponse.text("private-invalid-json", { status: 200 }),
              HttpServerResponse.jsonUnsafe({ ...valid, statusWire: 2 }),
              HttpServerResponse.jsonUnsafe({ ...valid, generation: "00000000-0000-4000-8000-000000000000" }),
              HttpServerResponse.jsonUnsafe({ ...valid, work: { ...valid.work, attachments: -1 } }),
              HttpServerResponse.jsonUnsafe({ ...valid, privatePayload: "x".repeat(4_097) })
            ]
            for (const reply of replies) {
              yield* Ref.set(response, reply)
              expect(yield* readResidentLiveStatus(attachment)).toEqual({ kind: "unavailable", recovery: "unverified" })
            }
            yield* Ref.set(response, HttpServerResponse.jsonUnsafe({ ...valid, privatePayload: "must-not-escape" }))
            const observed = yield* readResidentLiveStatus(attachment)
            expect(observed).toEqual({ kind: "authenticated", status: valid })
            expect(JSON.stringify(observed)).not.toContain("must-not-escape")
            expect(yield* readResidentLiveStatus({ ...attachment, authorization: Redacted.make("wrong") })).toEqual({
              kind: "unavailable",
              recovery: "unverified"
            })
          }),
        { middleware: () => Ref.get(response) }
      )
    }).pipe(Effect.scoped)
  )
})
