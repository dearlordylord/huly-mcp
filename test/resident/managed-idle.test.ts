import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Option, Schema, Stream } from "effect"
import { TestClock } from "effect/testing"
import type { HttpClientResponse } from "effect/http"
import { expect } from "vitest"

import { MAX_ADAPTER_RESPONSE_BYTES } from "../../src/resident/adapter-limits.js"
import { decodeBackendMessages } from "../../src/resident/response-stream.js"
import { AdmissionPolicy, AttachmentToken, DEFAULT_LEASE_POLICY } from "../../src/resident/admission-contract.js"
import { makeResidentAdmissions } from "../../src/resident/admissions.js"
import { runOwnedGeneration, withResidentSelection } from "../../src/resident/managed-selection.js"
import { ResidentDirectory } from "../../src/resident/protected-path.js"
import { captureResidentSelection } from "../../src/resident/selection-config.js"
import { makeStartupBudget } from "../../src/resident/startup-budget.js"
import { runConfiguredResidentServer } from "../../src/runtime/server-startup.js"
import { ping } from "../helpers/resident-native-fixture.js"

const policy = Schema.decodeUnknownSync(AdmissionPolicy)({
  capacity: 1,
  closeAllowanceMillis: 1_000,
  lease: DEFAULT_LEASE_POLICY
})

const successfulPing = (response: HttpClientResponse.HttpClientResponse) =>
  decodeBackendMessages({
    body: response.stream,
    contentType: response.headers["content-type"] ?? "",
    maxBytes: MAX_ADAPTER_RESPONSE_BYTES
  }).pipe(
    Stream.runCollect,
    Effect.tap((messages) =>
      Effect.sync(() => {
        expect(response.status).toBe(200)
        expect(messages).toEqual([{ jsonrpc: "2.0", id: 1, result: {} }])
      })
    )
  )

it.effect("keeps a late HTTP attachment alive and retires its configured owner only after a new idle interval", () =>
  Effect.acquireUseRelease(
    Effect.promise(async () =>
      ResidentDirectory.make(await fs.mkdtemp(join(await fs.realpath(tmpdir()), "resident-managed-idle-")))
    ),
    (directory) =>
      Effect.gen(function* () {
        const environment = {
          HULY_URL: "https://idle.invalid",
          HULY_WORKSPACE: "idle",
          HULY_TOKEN: "fixture-idle-token",
          LAZY_ENVS: "true",
          HULY_MCP_TELEMETRY: "0"
        }
        const capture = yield* captureResidentSelection(environment)
        const startup = yield* makeStartupBudget
        const published = yield* Deferred.make<void>()
        const done = yield* Deferred.make<void>()
        const running = yield* withResidentSelection({
          directory,
          capture,
          startup,
          existing: () => Effect.die("Unexpected existing idle owner"),
          absent: (ownership) =>
            runOwnedGeneration(ownership, (ready) =>
              runConfiguredResidentServer({
                capture,
                directory,
                environment,
                lifetime: "managed",
                startup,
                report: (file) => ready(file).pipe(Effect.andThen(Deferred.succeed(published, undefined)))
              })
            )
        }).pipe(
          Effect.tap(() => Deferred.succeed(done, undefined)),
          Effect.forkScoped
        )
        yield* Deferred.await(published)
        yield* TestClock.adjust("4900 millis")
        expect(yield* Deferred.isDone(done)).toBe(false)
        const connected = yield* Deferred.make<void>()
        const release = yield* Deferred.make<void>()
        const caller = yield* withResidentSelection({
          directory,
          capture,
          startup: yield* makeStartupBudget,
          existing: (_file, exchange) =>
            Effect.gen(function* () {
              yield* exchange(ping, Option.none(), successfulPing)
              yield* Deferred.succeed(connected, undefined)
              yield* Deferred.await(release)
              yield* exchange(ping, Option.none(), successfulPing)
            }),
          absent: () => Effect.die("The late caller must use the published owner")
        }).pipe(Effect.forkScoped)
        yield* Deferred.await(connected)
        try {
          yield* TestClock.adjust("5 seconds")
          expect(yield* Deferred.isDone(done)).toBe(false)
        } finally {
          yield* Deferred.succeed(release, undefined)
        }
        yield* Fiber.join(caller)
        yield* TestClock.adjust("4900 millis")
        expect(yield* Deferred.isDone(done)).toBe(false)
        yield* TestClock.adjust("100 millis")
        yield* Fiber.join(running)
        expect(yield* Effect.promise(() => fs.readdir(directory))).toEqual([])
        const selectedFresh = yield* withResidentSelection({
          directory,
          capture,
          startup: yield* makeStartupBudget,
          existing: () => Effect.die("A retired descriptor must not be reused"),
          absent: () => Effect.succeed(true)
        })
        expect(selectedFresh).toBe(true)
      }).pipe(Effect.scoped),
    (directory) => Effect.promise(() => fs.rm(directory, { recursive: true, force: true }))
  )
)

it.effect("keeps a live member and grants a full idle interval after its confirmed release", () =>
  Effect.gen(function* () {
    const registry = yield* makeResidentAdmissions(policy)
    const member = yield* registry.admit
    const done = yield* Deferred.make<void>()
    const idle = yield* registry.awaitIdleAndFence.pipe(
      Effect.tap(() => Deferred.succeed(done, undefined)),
      Effect.forkChild
    )
    yield* TestClock.adjust("6013 millis")
    expect(yield* Deferred.isDone(done)).toBe(false)
    yield* registry.release(member.token)
    yield* TestClock.adjust("4900 millis")
    expect(yield* Deferred.isDone(done)).toBe(false)
    yield* TestClock.adjust("100 millis")
    yield* Fiber.join(idle)
    expect((yield* Effect.flip(registry.admit)).kind).toBe("closing")
    yield* registry.awaitIdleAndFence
  }).pipe(Effect.scoped)
)

it.effect("does not retire while token acquisition is pending and bounds a drain waiting for it", () =>
  Effect.gen(function* () {
    const entered = yield* Deferred.make<void>()
    const token = yield* Deferred.make<AttachmentToken>()
    const registry = yield* makeResidentAdmissions(
      policy,
      Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(token)))
    )
    const admitting = yield* registry.admit.pipe(Effect.flip, Effect.forkChild)
    yield* Deferred.await(entered)
    const done = yield* Deferred.make<void>()
    const idle = yield* registry.awaitIdleAndFence.pipe(
      Effect.tap(() => Deferred.succeed(done, undefined)),
      Effect.forkChild
    )
    yield* TestClock.adjust("6 seconds")
    expect(yield* Deferred.isDone(done)).toBe(false)
    const drain = yield* registry.drain.pipe(Effect.flip, Effect.forkChild)
    try {
      yield* TestClock.adjust("1 second")
      expect((yield* Fiber.join(drain)).kind).toBe("pending")
    } finally {
      yield* Deferred.succeed(token, Schema.decodeUnknownSync(AttachmentToken)("c".repeat(64)))
    }
    expect((yield* Fiber.join(admitting)).kind).toBe("closing")
    yield* Fiber.join(idle)
    yield* registry.drain
  }).pipe(Effect.scoped)
)

it.effect("drains every admitted owner before returning and refuses all subsequent admission", () =>
  Effect.gen(function* () {
    const registry = yield* makeResidentAdmissions(policy)
    const member = yield* registry.admit
    const owner = yield* registry.find(member.token)
    yield* registry.drain
    yield* owner.closed
    expect((yield* Effect.flip(registry.find(member.token))).kind).toBe("unknown")
    expect((yield* Effect.flip(registry.admit)).kind).toBe("closing")
    yield* registry.drain
  }).pipe(Effect.scoped)
)

it.effect("retires the configured managed HTTP owner after idle and removes only its confirmed state", () =>
  Effect.acquireUseRelease(
    Effect.promise(async () =>
      ResidentDirectory.make(await fs.mkdtemp(join(await fs.realpath(tmpdir()), "resident-managed-idle-")))
    ),
    (directory) =>
      Effect.gen(function* () {
        const environment = {
          HULY_URL: "https://idle.invalid",
          HULY_WORKSPACE: "idle",
          HULY_TOKEN: "fixture-idle-token",
          LAZY_ENVS: "true",
          HULY_MCP_TELEMETRY: "0"
        }
        const capture = yield* captureResidentSelection(environment)
        const startup = yield* makeStartupBudget
        const published = yield* Deferred.make<void>()
        const done = yield* Deferred.make<void>()
        const running = yield* withResidentSelection({
          directory,
          capture,
          startup,
          existing: () => Effect.die("Unexpected existing idle owner"),
          absent: (ownership) =>
            runOwnedGeneration(ownership, (ready) =>
              runConfiguredResidentServer({
                capture,
                directory,
                environment,
                lifetime: "managed",
                startup,
                report: (file) => ready(file).pipe(Effect.andThen(Deferred.succeed(published, undefined)))
              })
            )
        }).pipe(
          Effect.tap(() => Deferred.succeed(done, undefined)),
          Effect.forkScoped
        )
        yield* Deferred.await(published)
        yield* TestClock.adjust("4900 millis")
        expect(yield* Deferred.isDone(done)).toBe(false)
        yield* TestClock.adjust("100 millis")
        yield* Fiber.join(running)
        expect(yield* Effect.promise(() => fs.readdir(directory))).toEqual([])
      }).pipe(Effect.scoped),
    (directory) => Effect.promise(() => fs.rm(directory, { recursive: true, force: true }))
  )
)
