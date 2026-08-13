import { Cause, Chunk, Context, Effect, Exit, Fiber, Layer, Runtime, Scope } from "effect"

import { type ConfigValidationError, HulyConfigService } from "../config/config.js"
import { HulyClient, type HulyClientError } from "../huly/client.js"
import { HulyUnavailableError } from "../huly/errors.js"
import { HulyStorageClient, type StorageClientError } from "../huly/storage.js"
import { WorkspaceClient } from "../huly/workspace-client.js"
import type { ClientBundle } from "../mcp/server.js"

type HulyClientBundleError = ConfigValidationError | HulyClientError | StorageClientError

export type CombinedClientLayer = Layer.Layer<
  HulyClient | HulyStorageClient | WorkspaceClient,
  HulyClientBundleError,
  never
>

/**
 * Build the combined client layer (not yet evaluated — deferred until first use).
 */
export const buildCombinedClientLayer = (): CombinedClientLayer => {
  const configLayer = HulyConfigService.layer

  const hulyClientLayer = HulyClient.layer.pipe(Layer.provide(configLayer))

  const storageClientLayer = HulyStorageClient.layer.pipe(Layer.provide(configLayer))

  const workspaceClientLayer = WorkspaceClient.layer.pipe(Layer.provide(configLayer))

  return Layer.merge(Layer.merge(hulyClientLayer, storageClientLayer), workspaceClientLayer)
}

export interface ScopedClientBundle {
  readonly bundle: ClientBundle
  readonly close: () => Promise<void>
}

export interface ClientResolver {
  readonly resolve: () => Promise<ClientBundle>
  readonly prime: (scoped: ScopedClientBundle) => void
  readonly close: () => Promise<void>
}

interface ClientAcquisition {
  readonly promise: Promise<ScopedClientBundle>
  readonly close: () => Promise<void>
}

const makeScopeClose = (scope: Scope.CloseableScope): (() => Promise<void>) => {
  const state: { promise: Promise<void> | null } = { promise: null }
  return () => {
    if (state.promise === null) state.promise = Effect.runPromise(Scope.close(scope, Exit.void))
    return state.promise
  }
}

export const buildScopedClientBundle = (
  combinedClientLayer: CombinedClientLayer
): Effect.Effect<ScopedClientBundle, HulyClientBundleError> =>
  Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* () {
      const scope = yield* Scope.make()
      const ctx = yield* restore(Layer.buildWithScope(combinedClientLayer, scope)).pipe(
        Effect.onExit((exit) => (Exit.isFailure(exit) ? Scope.close(scope, exit) : Effect.void))
      )
      return {
        bundle: {
          hulyClient: Context.get(ctx, HulyClient),
          storageClient: Context.get(ctx, HulyStorageClient),
          workspaceClient: Context.get(ctx, WorkspaceClient)
        },
        close: makeScopeClose(scope)
      }
    })
  )

/**
 * Create a memoized client resolver that builds layers on first call
 * and keeps the scope alive for the process lifetime.
 * The named operations support lazy resolution, eager priming, and exact-once closure.
 */
export const createClientResolver = (combinedClientLayer: CombinedClientLayer): ClientResolver => {
  const state: { active: Promise<ScopedClientBundle> | null; closePromise: Promise<void> | null; closed: boolean } = {
    active: null,
    closePromise: null,
    closed: false
  }
  const acquisitions = new Set<ClientAcquisition>()

  const startAcquisition = (): ClientAcquisition => {
    const fiber = Effect.runFork(buildScopedClientBundle(combinedClientLayer))
    const promise = Effect.runPromise(Fiber.join(fiber))
    return {
      promise,
      close: () =>
        Effect.runPromise(Fiber.interrupt(fiber)).then(() =>
          promise.then(
            (scoped) => scoped.close(),
            () => Promise.resolve()
          )
        )
    }
  }

  const resolve = (): Promise<ClientBundle> => {
    if (state.closed) return Promise.reject(new Error("Process-scoped Huly clients are closed"))
    if (state.active === null) {
      const acquisition = startAcquisition()
      acquisitions.add(acquisition)
      state.active = acquisition.promise
      void acquisition.promise.catch((error: unknown) => {
        const unavailable =
          error instanceof HulyUnavailableError ||
          (Runtime.isFiberFailure(error) &&
            Chunk.toArray(Cause.failures(error[Runtime.FiberFailureCauseId])).some(
              (failure) => failure instanceof HulyUnavailableError
            ))
        if (unavailable && state.active === acquisition.promise) state.active = null
      })
    }
    return state.active.then(({ bundle }) => bundle)
  }

  const prime = (scoped: ScopedClientBundle): void => {
    if (state.closed) throw new Error("Cannot prime closed process-scoped Huly clients")
    const acquisition = Promise.resolve(scoped)
    acquisitions.add({ promise: acquisition, close: scoped.close })
    state.active = acquisition
  }

  const close = (): Promise<void> => {
    state.closed = true
    if (state.closePromise === null) {
      state.closePromise = Promise.all([...acquisitions].map((acquisition) => acquisition.close())).then(() => {})
    }
    return state.closePromise
  }

  return { resolve, prime, close }
}
