import { it } from "@effect/vitest"
import { Deferred, Effect, Fiber } from "effect"
import { TestClock } from "effect/testing"
import { expect } from "vitest"

import { Count } from "../../src/domain/schemas/shared.js"

import { AdmissionPolicy, DEFAULT_LEASE_POLICY } from "../../src/resident/admission-contract.js"
import { makeResidentAdmissions } from "../../src/resident/admissions.js"
import { makeAttachmentObservation } from "../../src/resident/attachment-observation.js"
import type { ResidentAttachmentEvent, ResidentFailureEvent } from "../../src/telemetry/events.js"
import { createNoopTelemetry } from "../../src/telemetry/noop.js"
import { RequestWorkCleanupFailed } from "../../src/runtime/request-work.js"

const firstId = "00000000-0000-4000-8000-000000000001"
const secondId = "00000000-0000-4000-8000-000000000002"
const policy = AdmissionPolicy.make({
  capacity: AdmissionPolicy.fields.capacity.make(2),
  closeAllowanceMillis: AdmissionPolicy.fields.closeAllowanceMillis.make(1000),
  lease: DEFAULT_LEASE_POLICY
})
const recording = () => {
  const attachments: Array<ResidentAttachmentEvent> = []
  const failures: Array<ResidentFailureEvent> = []
  return {
    attachments,
    failures,
    telemetry: {
      ...createNoopTelemetry(),
      residentAttachment: (event: ResidentAttachmentEvent) => {
        attachments.push(event)
      },
      residentFailure: (event: ResidentFailureEvent) => {
        failures.push(event)
      }
    }
  }
}

it.effect("assigns independent analytics IDs, observes first work once and closes each owner exactly once", () =>
  Effect.gen(function* () {
    const recorded = recording()
    let next = false
    const admissions = yield* makeResidentAdmissions(policy, undefined, undefined, recorded.telemetry, () => {
      next = !next
      return next ? firstId : secondId
    })
    const first = yield* admissions.admit
    const second = yield* admissions.admit
    const owner = yield* admissions.find(first.token)
    owner.observation?.context.observeActivity()
    owner.observation?.context.observeActivity()
    expect(recorded.attachments).toEqual([
      { phase: "admitted", attachment_id: firstId, retained_attachments: Count.make(1) },
      { phase: "admitted", attachment_id: secondId, retained_attachments: 2 },
      { phase: "activity_observed", attachment_id: firstId, first_activity: "tool_call" }
    ])
    yield* TestClock.adjust("2 seconds")
    yield* Effect.all([admissions.release(first.token), admissions.release(first.token), admissions.drain], {
      concurrency: "unbounded"
    })
    yield* admissions.release(second.token)
    const closed = recorded.attachments.filter((event) => event.phase === "closed")
    expect(closed).toHaveLength(2)
    expect(closed.map((event) => event.attachment_id).sort((left, right) => left.localeCompare(right))).toEqual([
      firstId,
      secondId
    ])
    expect(closed.every((event) => event.duration_ms === 2000)).toBe(true)
    expect(JSON.stringify(recorded)).not.toContain("token")
  }).pipe(Effect.scoped)
)

it.effect("reports lease expiration, capacity and fenced admissions without secrets", () =>
  Effect.gen(function* () {
    const recorded = recording()
    const admissions = yield* makeResidentAdmissions(
      { ...policy, capacity: AdmissionPolicy.fields.capacity.make(1) },
      undefined,
      undefined,
      recorded.telemetry,
      () => firstId
    )
    const admitted = yield* admissions.admit
    yield* Effect.exit(admissions.admit)
    expect(recorded.failures).toContainEqual({ stage: "admission", reason: "capacity" })
    yield* TestClock.adjust("31 seconds")
    expect(recorded.attachments).toContainEqual({
      phase: "closed",
      attachment_id: firstId,
      duration_ms: 30000,
      reason: "lease_expired"
    })
    yield* Effect.exit(admissions.find(admitted.token))
    expect(recorded.failures).toContainEqual({ stage: "admission", reason: "unknown" })
    yield* admissions.fence
    yield* Effect.exit(admissions.admit)
    expect(recorded.failures).toContainEqual({ stage: "admission", reason: "closing" })
  }).pipe(Effect.scoped)
)

it.effect("retains blocked cleanup and reports an incident once rather than a false close", () =>
  Effect.gen(function* () {
    const recorded = recording()
    const admissions = yield* makeResidentAdmissions(policy, undefined, undefined, recorded.telemetry, () => firstId)
    const admitted = yield* admissions.admit
    const owner = yield* admissions.find(admitted.token)
    const entered = yield* Deferred.make<void>()
    const work = yield* owner
      .withWork({
        use: () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never)),
        cleanup: () => Effect.fail(new RequestWorkCleanupFailed({ message: "private cleanup error" }))
      })
      .pipe(Effect.forkChild)
    yield* Deferred.await(entered)
    yield* Effect.exit(admissions.release(admitted.token))
    yield* Effect.exit(admissions.release(admitted.token))
    yield* Fiber.await(work)
    expect(recorded.failures.filter((event) => event.stage === "cleanup")).toEqual([
      { stage: "cleanup", reason: "failed", attachment_id: firstId }
    ])
    expect(recorded.attachments.some((event) => event.phase === "closed")).toBe(false)
    expect((yield* admissions.status).attachments).toBe(1)
    expect(JSON.stringify(recorded)).not.toContain("private cleanup error")
  }).pipe(Effect.scoped)
)

it.effect("does not let a failed telemetry sink or ID source change admissions", () =>
  Effect.gen(function* () {
    const telemetry = {
      ...createNoopTelemetry(),
      residentAttachment: () => {
        throw new Error("sink")
      },
      residentFailure: () => {
        throw new Error("sink")
      }
    }
    const admissions = yield* makeResidentAdmissions(policy, undefined, undefined, telemetry, () => firstId)
    const admitted = yield* admissions.admit
    yield* admissions.release(admitted.token)
    const noId = yield* makeResidentAdmissions(policy, undefined, undefined, telemetry, () => {
      throw new Error("entropy")
    })
    const unobserved = yield* noId.admit
    yield* noId.release(unobserved.token)
  }).pipe(Effect.scoped)
)

it("does not invent activity/closed for an unpublished admission, and bounds incidents", () => {
  const recorded = recording()
  const observation = makeAttachmentObservation(recorded.telemetry, firstId, 0n)
  observation.context.observeActivity()
  observation.closed(1n)
  expect(recorded.attachments).toEqual([])
  observation.admitted(Count.make(1))
  observation.closing("backend_shutdown")
  observation.closing("release")
  observation.failure({ stage: "work", reason: "capacity" })
  observation.failure({ stage: "work", reason: "capacity" })
  observation.closed(2_000_000n)
  observation.closed(3_000_000n)
  observation.context.observeActivity()
  expect(recorded.attachments.at(-1)).toEqual({
    phase: "closed",
    attachment_id: firstId,
    duration_ms: 2,
    reason: "backend_shutdown"
  })
  expect(recorded.failures).toEqual([
    { stage: "work", reason: "capacity", attachment_id: firstId },
    { stage: "work", reason: "capacity", attachment_id: firstId }
  ])
})
