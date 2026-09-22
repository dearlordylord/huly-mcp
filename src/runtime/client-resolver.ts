import { Effect, type Exit } from "effect"

import type { ConfigValidationError } from "../config/config.js"
import type { HulyClientError, HulyClientOperations } from "../huly/client.js"
import type { HulyStorageOperations, StorageClientError } from "../huly/storage.js"
import type { WorkspaceClientOperations } from "../huly/workspace-client.js"

export interface ClientBundle {
  readonly hulyClient: HulyClientOperations
  readonly storageClient: HulyStorageOperations
  readonly workspaceClient?: WorkspaceClientOperations
}

export type HulyClientBundleError = ConfigValidationError | HulyClientError | StorageClientError

export type ClientResolver = () => Promise<Exit.Exit<ClientBundle, HulyClientBundleError>>

/** Adapt the process resolver to an interruptible Effect Promise boundary. */
export const resolveClientBundleAbortably = (
  resolver: ClientResolver,
  signal: AbortSignal
): Promise<Exit.Exit<ClientBundle, HulyClientBundleError>> => Effect.runPromise(Effect.promise(resolver), { signal })
