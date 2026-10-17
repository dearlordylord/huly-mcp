import { Cause, Deferred, Effect, Fiber, Schema } from "effect"
import { it as effectIt } from "@effect/vitest"
import { TestClock } from "effect/testing"
import { expect, it } from "vitest"

import { withAdapterAttachment } from "../../src/resident/adapter-attachment.js"
import { MAX_ADMISSION_RESPONSE_BYTES } from "../../src/resident/adapter-limits.js"
import { AttachmentAdmitted, DEFAULT_LEASE_POLICY } from "../../src/resident/admission-contract.js"
import { readResidentAttachment } from "../../src/resident/attachment-file.js"
import { startResidentFixture } from "../helpers/resident-fixture.js"

const AUTHORIZATION = "private-control-fixture"
const HTTP_CREATED = 201
const HTTP_NO_CONTENT = 204
const HTTP_CONFLICT = 409
const HTTP_FORBIDDEN = 403
const PRIVATE_PAYLOAD = "fixture-control-private-payload"
const admitted = Schema.decodeUnknownSync(AttachmentAdmitted)({
  version: 1,
  token: "a".repeat(64),
  lease: DEFAULT_LEASE_POLICY
})
const validBody = Schema.encodeSync(Schema.fromJsonString(AttachmentAdmitted))(admitted)

effectIt.effect.each(["success", "reject", "stall"])(
  "handles %s renewal without readmission or request replay",
  (mode) =>
    Effect.gen(function* () {
      let admissions = 0
      let renewals = 0
      let releases = 0
      const arrived = yield* Deferred.make<void>()
      const entered = yield* Deferred.make<void>()
      const completed = yield* Deferred.make<void>()
      const fixture = yield* Effect.promise(() =>
        startResidentFixture(
          () => {
            throw new Error("No MCP work should dispatch")
          },
          AUTHORIZATION,
          undefined,
          (request, response) => {
            if (request.method === "POST") {
              admissions++
              response.writeHead(HTTP_CREATED, { "content-type": "application/json" }).end(validBody)
            } else if (request.method === "PUT") {
              renewals++
              Effect.runSync(Deferred.succeed(arrived, undefined))
              if (mode === "reject") response.writeHead(HTTP_FORBIDDEN).end(PRIVATE_PAYLOAD)
              if (mode === "success") response.writeHead(HTTP_NO_CONTENT).end()
            } else {
              releases++
              response.writeHead(HTTP_NO_CONTENT).end()
            }
          }
        )
      )
      try {
        const bridge = yield* withAdapterAttachment(yield* readResidentAttachment(fixture.file), () =>
          Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(completed)))
        ).pipe(Effect.exit, Effect.forkScoped)
        yield* Deferred.await(entered)
        yield* TestClock.adjust("5 seconds")
        yield* Deferred.await(arrived)
        if (mode === "stall") yield* TestClock.adjust("5 seconds")
        if (mode === "success") yield* Deferred.succeed(completed, undefined)
        const result = yield* Fiber.join(bridge)
        expect(result._tag).toBe(mode === "success" ? "Success" : "Failure")
        if (result._tag === "Failure") {
          expect(Cause.pretty(result.cause)).toContain("Resident renewal failed")
          expect(Cause.pretty(result.cause)).not.toContain(PRIVATE_PAYLOAD)
        }
        expect(admissions).toBe(1)
        expect(renewals).toBe(1)
        expect(releases).toBe(1)
      } finally {
        yield* Effect.promise(fixture.cleanup)
      }
    }).pipe(Effect.scoped)
)

it.each([
  { label: "capacity rejection", status: HTTP_CONFLICT, body: PRIVATE_PAYLOAD },
  { label: "malformed JSON", status: HTTP_CREATED, body: PRIVATE_PAYLOAD },
  { label: "invalid token", status: HTTP_CREATED, body: JSON.stringify({ version: 1, token: PRIVATE_PAYLOAD }) },
  { label: "oversized reply", status: HTTP_CREATED, body: " ".repeat(MAX_ADMISSION_RESPONSE_BYTES + 1) + validBody }
])("refuses $label admission without dispatch, retry or payload disclosure", async ({ body, status }) => {
  let admissions = 0
  let releases = 0
  const fixture = await startResidentFixture(
    () => {
      throw new Error("Must not dispatch MCP")
    },
    AUTHORIZATION,
    undefined,
    (request, response) => {
      if (request.method === "POST") admissions++
      else releases++
      response.writeHead(status, { "content-type": "application/json" }).end(body)
    }
  )
  try {
    const result = await Effect.runPromiseExit(
      Effect.gen(function* () {
        return yield* withAdapterAttachment(yield* readResidentAttachment(fixture.file), () =>
          Effect.die("Must not enter bridge")
        )
      })
    )
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") {
      const text = Cause.pretty(result.cause)
      expect(text).toContain("Resident admission failed")
      expect(text).not.toContain(PRIVATE_PAYLOAD)
    }
    expect(admissions).toBe(1)
    expect(releases).toBe(0)
  } finally {
    await fixture.cleanup()
  }
})

it("releases exactly once when the admitted bridge is interrupted", async () => {
  let releases = 0
  const fixture = await startResidentFixture(
    () => {
      throw new Error("No MCP request expected")
    },
    AUTHORIZATION,
    undefined,
    (request, response) => {
      if (request.method === "POST")
        response.writeHead(HTTP_CREATED, { "content-type": "application/json" }).end(validBody)
      else {
        releases++
        response.writeHead(HTTP_NO_CONTENT).end()
      }
    }
  )
  const entered = await Effect.runPromise(Deferred.make<void>())
  const bridge = Effect.runFork(
    Effect.gen(function* () {
      return yield* withAdapterAttachment(yield* readResidentAttachment(fixture.file), () =>
        Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never))
      )
    })
  )
  try {
    await Effect.runPromise(Deferred.await(entered).pipe(Effect.timeout("5 seconds")))
    await Effect.runPromise(Fiber.interrupt(bridge).pipe(Effect.timeout("5 seconds")))
    expect(releases).toBe(1)
  } finally {
    await Effect.runPromise(Fiber.interrupt(bridge))
    await fixture.cleanup()
  }
})

it("reports unconfirmed release without disclosing its response payload or retrying", async () => {
  let releases = 0
  const fixture = await startResidentFixture(
    () => {
      throw new Error("No MCP request expected")
    },
    AUTHORIZATION,
    undefined,
    (request, response) => {
      if (request.method === "POST")
        response.writeHead(HTTP_CREATED, { "content-type": "application/json" }).end(validBody)
      else {
        releases++
        response.writeHead(HTTP_CONFLICT).end(PRIVATE_PAYLOAD)
      }
    }
  )
  try {
    const result = await Effect.runPromiseExit(
      Effect.gen(function* () {
        yield* withAdapterAttachment(yield* readResidentAttachment(fixture.file), () => Effect.void)
      })
    )
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") {
      expect(Cause.pretty(result.cause)).toContain("Resident cleanup was not confirmed")
      expect(Cause.pretty(result.cause)).not.toContain(PRIVATE_PAYLOAD)
    }
    expect(releases).toBe(1)
  } finally {
    await fixture.cleanup()
  }
})

it("renews successfully before the next heartbeat and releases once", async () => {
  let renewals = 0
  let releases = 0
  const nextHeartbeat = Effect.runSync(Deferred.make<void>())
  const quickLease = Schema.decodeUnknownSync(AttachmentAdmitted)({
    version: 1,
    token: "b".repeat(64),
    lease: { durationMillis: 1000, renewEveryMillis: 10 }
  })
  const fixture = await startResidentFixture(
    () => {},
    AUTHORIZATION,
    undefined,
    (request, response) => {
      if (request.method === "POST")
        response
          .writeHead(HTTP_CREATED, { "content-type": "application/json" })
          .end(Schema.encodeSync(Schema.fromJsonString(AttachmentAdmitted))(quickLease))
      else if (request.method === "PUT") {
        renewals++
        response.writeHead(HTTP_NO_CONTENT).end()
        if (renewals === 2) Effect.runSync(Deferred.succeed(nextHeartbeat, undefined))
      } else {
        releases++
        response.writeHead(HTTP_NO_CONTENT).end()
      }
    }
  )
  try {
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* withAdapterAttachment(yield* readResidentAttachment(fixture.file), () => Deferred.await(nextHeartbeat))
      }).pipe(Effect.timeout("5 seconds"))
    )
    expect(renewals).toBe(2)
    expect(releases).toBe(1)
  } finally {
    await fixture.cleanup()
  }
})
