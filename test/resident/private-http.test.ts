import { Effect, Option, Schema, Tracer } from "effect"
import { HttpClient } from "effect/http"
import { expect, it } from "vitest"

import { withAdapterAttachment } from "../../src/resident/adapter-attachment.js"
import { RESIDENT_ATTACHMENT_HEADER } from "../../src/resident/admission-contract.js"
import { readResidentAttachment } from "../../src/resident/attachment-file.js"
import { LegacyHttpSession } from "../../src/resident/protocol-session.js"
import { HostMessage } from "../../src/resident/request-headers.js"
import { startResidentFixture } from "../helpers/resident-fixture.js"

it("redacts attachment and native session capability headers in real HTTP client spans", async () => {
  const spans: Array<Tracer.Span> = []
  const tracer = Tracer.make({
    span: (options) => {
      const span = Tracer.nativeTracer.span(options)
      spans.push(span)
      return span
    }
  })
  const fixture = await startResidentFixture(
    (_request, response) => response.writeHead(200).end(),
    "private-span-fixture"
  )
  try {
    await Effect.runPromise(
      Effect.gen(function* () {
        const attachment = yield* readResidentAttachment(fixture.file)
        const session = Schema.decodeUnknownSync(LegacyHttpSession)({
          id: "private-native-session-fixture",
          protocolVersion: "2025-06-18"
        })
        yield* withAdapterAttachment(attachment, (exchange) =>
          exchange(HostMessage.make({ jsonrpc: "2.0", id: 1, method: "ping" }), Option.some(session), (response) =>
            response.text.pipe(Effect.asVoid)
          )
        )
      }).pipe(
        Effect.withTracer(tracer),
        Effect.provideService(HttpClient.TracerHeaderFilter, () => true)
      )
    )
    const capability = spans
      .flatMap((span) => [...span.attributes])
      .filter(([key]) => key === `http.request.header.${RESIDENT_ATTACHMENT_HEADER}`)
    const legacy = spans
      .flatMap((span) => [...span.attributes])
      .filter(([key]) => key === "http.request.header.mcp-session-id")
    expect(capability.length).toBeGreaterThan(0)
    expect(legacy.length).toBeGreaterThan(0)
    expect(capability.every(([, value]) => value === "<redacted>")).toBe(true)
    expect(legacy.every(([, value]) => value === "<redacted>")).toBe(true)
  } finally {
    await fixture.cleanup()
  }
})
