import { Context, Effect, Exit, Layer, Scope } from "effect"

import { type ConfigValidationError, HulyConfigService } from "../config/config.js"
import { HulyClient, type HulyClientError } from "../huly/client.js"
import { HulyStorageClient, type StorageClientError } from "../huly/storage.js"
import { WorkspaceClient, type WorkspaceClientError } from "../huly/workspace-client.js"
import type { ClientBundle } from "../mcp/server.js"

type HulyClientBundleError =
  | ConfigValidationError
  | HulyClientError
  | StorageClientError
  | WorkspaceClientError

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

  const hulyClientLayer = HulyClient.layer.pipe(
    Layer.provide(configLayer)
  )

  const storageClientLayer = HulyStorageClient.layer.pipe(
    Layer.provide(configLayer)
  )

  const workspaceClientLayer = WorkspaceClient.layer.pipe(
    Layer.provide(configLayer)
  )

  return Layer.merge(
    Layer.merge(hulyClientLayer, storageClientLayer),
    workspaceClientLayer
  )
}

export const buildClientBundle = (
  combinedClientLayer: CombinedClientLayer
): Effect.Effect<ClientBundle, HulyClientBundleError> =>
  buildScopedClientBundle(combinedClientLayer).pipe(Effect.map(({ bundle }) => bundle))

export const buildScopedClientBundle = (
  combinedClientLayer: CombinedClientLayer
): Effect.Effect<
  {
    readonly bundle: ClientBundle
    readonly close: () => void
  },
  HulyClientBundleError
> =>
  Effect.gen(function*() {
    const scope = yield* Scope.make()
    const close = () => {
      Effect.runFork(Scope.close(scope, Exit.void))
    }
    const ctx = yield* Layer.buildWithScope(combinedClientLayer, scope).pipe(
      Effect.tapError(() => Scope.close(scope, Exit.void))
    )
    return {
      bundle: {
        hulyClient: Context.get(ctx, HulyClient),
        storageClient: Context.get(ctx, HulyStorageClient),
        workspaceClient: Context.get(ctx, WorkspaceClient)
      },
      close
    }
  })

/**
 * Create a memoized client resolver that builds layers on first call
 * and keeps the scope alive for the process lifetime.
 * Returns [resolver, prime] — prime pre-populates the cache from an existing bundle.
 */
export const createClientResolver = (
  combinedClientLayer: CombinedClientLayer
): readonly [resolve: () => Promise<ClientBundle>, prime: (bundle: ClientBundle) => void] => {
  let clientsPromise: Promise<ClientBundle> | null = null

  const resolve = (): Promise<ClientBundle> => {
    if (clientsPromise === null) {
      clientsPromise = Effect.runPromise(buildClientBundle(combinedClientLayer))
    }
    return clientsPromise
  }

  const prime = (bundle: ClientBundle): void => {
    clientsPromise = Promise.resolve(bundle)
  }

  return [resolve, prime] as const
}
