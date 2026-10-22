import { it } from "@effect/vitest"
import { Cause, Deferred, Effect, Exit, Fiber } from "effect"
import { TestClock } from "effect/testing"
import { describe, expect } from "vitest"

import { AttachmentTelemetry } from "../../src/telemetry/attachment-context.js"
import { createNoopTelemetry } from "../../src/telemetry/noop.js"
import {
  jsonUtf8Bytes,
  observeToolCall,
  toolFailureStatus,
  toolResponseStatus
} from "../../src/telemetry/tool-observation.js"
import type { ToolCalledProps } from "../../src/telemetry/telemetry.js"

const success = () => ({ status: "success" as const })
const metadata = { toolName: "list_projects", callPath: "direct" as const }

describe("tool outcome semantics", () => {
  it.each([
    "ParseError",
    "UnknownTool",
    "ServerShuttingDown",
    "MissingArguments",
    "UnexpectedArguments",
    "CliInputError"
  ])("classifies %s as rejection", (tag) => {
    expect(toolResponseStatus(true, tag)).toBe("rejected")
  })
  it("keeps domain errors distinct from malformed requests and interruptions", () => {
    expect(toolResponseStatus(false, undefined)).toBe("success")
    expect(toolResponseStatus(true, "ProjectNotFoundError")).toBe("error")
    expect(toolResponseStatus(true, undefined)).toBe("error")
    expect(toolResponseStatus(true, "Interrupted")).toBe("cancelled")
    expect(toolFailureStatus(Cause.combine(Cause.die("private defect"), Cause.interrupt()))).toBe("error")
  })
  it("counts UTF-8 bytes without throwing on unserializable embedding input", () => {
    expect(jsonUtf8Bytes({ text: "ёж" })).toBe(Buffer.byteLength(JSON.stringify({ text: "ёж" })))
    const cycle: Array<unknown> = []
    cycle.push(cycle)
    expect(jsonUtf8Bytes(cycle)).toBeUndefined()
    expect(jsonUtf8Bytes(undefined)).toBeUndefined()
  })
})

it.effect("correlates concurrent attachments and measures their attempts with monotonic time", () =>
  Effect.gen(function* () {
    const calls: Array<ToolCalledProps> = []
    const activity: Array<string> = []
    const telemetry = {
      ...createNoopTelemetry(),
      toolCalled: (event: ToolCalledProps) => {
        calls.push(event)
      }
    }
    const observe = (id: string) =>
      observeToolCall(telemetry, { ...metadata, toolName: id }, Effect.sleep("2 seconds"), success).pipe(
        Effect.provideService(AttachmentTelemetry, {
          id,
          observeActivity: () => {
            activity.push(id)
          }
        })
      )
    const work = yield* Effect.all([observe("first"), observe("second")], { concurrency: "unbounded" }).pipe(
      Effect.forkChild
    )
    yield* TestClock.adjust("2 seconds")
    yield* Fiber.join(work)
    expect(
      calls
        .sort((left, right) => left.toolName.localeCompare(right.toolName))
        .map((event) => [event.toolName, event.attachmentId, event.durationMs])
    ).toEqual([
      ["first", "first", 2000],
      ["second", "second", 2000]
    ])
    expect(activity.sort((left, right) => left.localeCompare(right))).toEqual(["first", "second"])
  })
)

it.effect("reports a pure interruption once without converting its effect result", () =>
  Effect.gen(function* () {
    const events: Array<ToolCalledProps> = []
    const entered = yield* Deferred.make<void>()
    const telemetry = {
      ...createNoopTelemetry(),
      toolCalled: (event: ToolCalledProps) => {
        events.push(event)
      }
    }
    const work = yield* observeToolCall(
      telemetry,
      metadata,
      Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never)),
      success
    ).pipe(Effect.forkChild)
    yield* Deferred.await(entered)
    yield* Fiber.interrupt(work)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ status: "cancelled", errorTag: "Interrupted" })
    expect(Exit.isFailure(yield* Fiber.await(work))).toBe(true)
  })
)

it.effect("reports defects and typed failures without error text and isolates throwing sinks", () =>
  Effect.gen(function* () {
    const events: Array<ToolCalledProps> = []
    const telemetry = {
      ...createNoopTelemetry(),
      toolCalled: (event: ToolCalledProps) => {
        events.push(event)
      }
    }
    yield* observeToolCall(telemetry, metadata, Effect.fail("private message"), success).pipe(Effect.exit)
    expect(events[0]).toMatchObject({ status: "error", errorTag: "UnexpectedError" })
    expect(JSON.stringify(events)).not.toContain("private message")
    const hostile = {
      ...telemetry,
      toolCalled: () => {
        throw new Error("sink unavailable")
      }
    }
    expect(yield* observeToolCall(hostile, metadata, Effect.succeed(42), success)).toBe(42)
    const brokenContext = observeToolCall(telemetry, metadata, Effect.void, success).pipe(
      Effect.provideService(AttachmentTelemetry, {
        id: "test",
        observeActivity: () => {
          throw new Error("activity sink")
        }
      })
    )
    yield* brokenContext
  })
)
