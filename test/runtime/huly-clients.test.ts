import { it } from "@effect/vitest"
import { Cause, ConfigProvider, Deferred, Effect, Exit, Fiber, Layer, Ref } from "effect"
import type { HulyInitializationStatus } from "../../src/runtime/client-initialization.js"
import { describe, expect } from "vitest"

import { HulyClient } from "../../src/huly/client.js"
import { HulyConnectionError, HulyUnavailableError } from "../../src/huly/errors-base.js"
import { HulyStorageClient } from "../../src/huly/storage.js"
import { normalizeHulyOrigin } from "../../src/huly/unavailable-diagnostics.js"
import { WorkspaceClient } from "../../src/huly/workspace-client.js"
import {
  buildCombinedClientLayer,
  buildScopedClientBundle,
  createClientResolver
} from "../../src/runtime/huly-clients.js"

const clientLayer = Layer.merge(
  Layer.merge(HulyClient.testLayer({}), HulyStorageClient.testLayer({})),
  WorkspaceClient.testLayer({})
)

describe("shared Huly client runtime", () => {
  it.effect("reports full-model initialization independently of an available lightweight client", () =>
    Effect.gen(function* () {
      const model = yield* Ref.make<HulyInitializationStatus>("initializing")
      const layer = Layer.mergeAll(
        HulyClient.testLayer({ initializationStatus: Ref.get(model) }),
        HulyStorageClient.testLayer({}),
        WorkspaceClient.testLayer({})
      )
      const resolver = createClientResolver(layer)
      yield* Effect.acquireUseRelease(
        Effect.succeed(resolver),
        ({ resolve, status }) =>
          Effect.gen(function* () {
            expect(Exit.isSuccess(yield* Effect.promise(resolve))).toBe(true)
            expect(yield* status).toBe("initializing")
            yield* Ref.set(model, "failed")
            expect(yield* status).toBe("failed")
            yield* Ref.set(model, "ready")
            expect(yield* status).toBe("ready")
          }),
        ({ close }) => Effect.promise(close)
      )
      expect(yield* resolver.status).toBe("closed")
    })
  )
  it.effect("rejects missing configuration before network acquisition in background and on-demand modes", () =>
    Effect.gen(function* () {
      for (const mode of ["background", "on-demand"] as const) {
        const layer = mode === "background" ? buildCombinedClientLayer() : buildCombinedClientLayer(undefined, mode)
        const error = yield* buildScopedClientBundle(layer).pipe(
          Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({}))),
          Effect.flip
        )
        expect(error._tag).toBe("ConfigValidationError")
      }
    })
  )

  it("builds scoped client bundles and closes them exactly once", async () => {
    let releases = 0
    const trackedLayer = clientLayer.pipe(Layer.tap(() => Effect.addFinalizer(() => Effect.sync(() => releases++))))
    const scoped = await Effect.runPromise(buildScopedClientBundle(trackedLayer))

    expect(scoped.bundle.storageClient.getFileUrl("blob-1")).toContain("blob-1")
    if (scoped.bundle.workspaceClient === undefined) {
      throw new Error("Expected workspace client in scoped bundle")
    }
    if (scoped.bundle.storageClient.downloadFile === undefined) {
      throw new Error("Expected storage client download support")
    }
    expect(await Effect.runPromise(scoped.bundle.storageClient.downloadFile("blob-1"))).toEqual(
      Buffer.from("test file blob-1")
    )
    expect(await Effect.runPromise(scoped.bundle.workspaceClient.getUserWorkspaces())).toEqual([])

    await Promise.all([scoped.close(), scoped.close()])
    expect(releases).toBe(1)
  })

  it("memoizes one acquisition and closes its owned scope exactly once", async () => {
    let acquisitions = 0
    let releases = 0
    const trackedLayer = Layer.suspend(() => {
      acquisitions += 1
      return clientLayer.pipe(Layer.tap(() => Effect.addFinalizer(() => Effect.sync(() => releases++))))
    })
    const { close, resolve, status } = createClientResolver(trackedLayer)
    expect(await Effect.runPromise(status)).toBe("inactive")
    expect(acquisitions).toBe(0)

    const first = await resolve()
    const second = await resolve()

    expect(second).toBe(first)
    expect(Exit.isSuccess(first)).toBe(true)
    expect(acquisitions).toBe(1)
    expect(await Effect.runPromise(status)).toBe("ready")

    await Promise.all([close(), close()])
    expect(releases).toBe(1)
    expect(await Effect.runPromise(status)).toBe("closed")
    expect(Exit.isFailure(await resolve())).toBe(true)
  })

  it("evicts a mixed acquisition containing unavailability so a later call can recover", async () => {
    let available = false
    const unavailable = new HulyUnavailableError({
      endpointOrigin: normalizeHulyOrigin("https://huly.example.test"),
      failureKind: "refused"
    })
    const recoverableLayer = Layer.suspend(() =>
      available
        ? clientLayer
        : clientLayer.pipe(
            Layer.tap(() =>
              Effect.failCause(
                Cause.combine(Cause.fail(new HulyConnectionError({ message: "connection" })), Cause.fail(unavailable))
              )
            )
          )
    )
    const { close, resolve, status } = createClientResolver(recoverableLayer)

    try {
      expect(Exit.isFailure(await resolve())).toBe(true)
      expect(await Effect.runPromise(status)).toBe("inactive")
      available = true
      expect(Exit.isSuccess(await resolve())).toBe(true)
    } finally {
      await close()
    }
  })

  it("keeps non-unavailable failures cached", async () => {
    let acquisitions = 0
    const failingLayer = Layer.suspend(() => {
      acquisitions += 1
      return clientLayer.pipe(Layer.tap(() => Effect.fail(new HulyConnectionError({ message: "stable failure" }))))
    })
    const { close, resolve, status } = createClientResolver(failingLayer)

    const first = await resolve()
    const second = await resolve()

    expect(Exit.isFailure(first)).toBe(true)
    expect(await Effect.runPromise(status)).toBe("failed")
    expect(second).toBe(first)
    expect(acquisitions).toBe(1)
    await close()
  })

  it("does not evict an unavailable failure mixed with a defect", async () => {
    let acquisitions = 0
    const unavailable = new HulyUnavailableError({
      endpointOrigin: normalizeHulyOrigin("https://huly.example.test"),
      failureKind: "refused"
    })
    const failingLayer = Layer.suspend(() => {
      acquisitions += 1
      return clientLayer.pipe(
        Layer.tap(() => Effect.failCause(Cause.combine(Cause.fail(unavailable), Cause.die("token=secret"))))
      )
    })
    const { close, resolve } = createClientResolver(failingLayer)

    const first = await resolve()
    const second = await resolve()

    expect(Exit.isFailure(first)).toBe(true)
    expect(second).toBe(first)
    expect(acquisitions).toBe(1)
    await close()
  })

  it("interrupts and awaits a pending acquisition when closed", async () => {
    const started = await Effect.runPromise(Deferred.make<void>())
    const interrupted = await Effect.runPromise(Deferred.make<void>())
    const finishCleanup = await Effect.runPromise(Deferred.make<void>())
    const pendingLayer = clientLayer.pipe(
      Layer.tap(() =>
        Deferred.succeed(started, undefined).pipe(
          Effect.andThen(Effect.never),
          Effect.onInterrupt(() =>
            Deferred.succeed(interrupted, undefined).pipe(Effect.andThen(Deferred.await(finishCleanup)))
          )
        )
      )
    )
    const { close, resolve, status } = createClientResolver(pendingLayer)
    const pendingResolution = resolve()

    await Effect.runPromise(Deferred.await(started))
    expect(await Effect.runPromise(status)).toBe("initializing")
    const closing = close()
    await Effect.runPromise(Deferred.await(interrupted))
    expect(await Effect.runPromise(status)).toBe("closed")
    await Effect.runPromise(Deferred.succeed(finishCleanup, undefined))
    await closing

    expect(await Effect.runPromise(Deferred.await(interrupted))).toBeUndefined()
    expect(Exit.isFailure(await pendingResolution)).toBe(true)
  })

  it.effect("releases an acquired scope when startup is interrupted", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>()
      const released = yield* Deferred.make<void>()
      const continueStartup = yield* Deferred.make<void>()
      const startupLayer = Layer.merge(
        clientLayer,
        Layer.effectDiscard(
          Effect.acquireRelease(Effect.void, () => Deferred.succeed(released, undefined)).pipe(
            Effect.andThen(Deferred.succeed(started, undefined)),
            Effect.andThen(Deferred.await(continueStartup))
          )
        )
      )
      const acquisition = yield* buildScopedClientBundle(startupLayer).pipe(
        Effect.forkChild({ startImmediately: true })
      )

      yield* Deferred.await(started)
      yield* Fiber.interrupt(acquisition)

      expect(yield* Deferred.isDone(released)).toBe(true)
    })
  )
})
