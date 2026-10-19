import { type Effect, type Redacted } from "effect"

import type { CliProfileStore } from "./file-store.js"
import {
  type CredentialDestination,
  type CliProfileStoreError,
  type ProfileName,
  type CredentialStorage
} from "./model.js"

// Internal storage port. The file codec owns the persisted credential contract.
export interface CredentialStore {
  readonly read: (
    name: ProfileName,
    destination: CredentialDestination
  ) => Effect.Effect<Redacted.Redacted<string> | undefined, CliProfileStoreError>
  readonly save: (
    name: ProfileName,
    destination: CredentialDestination,
    token: Redacted.Redacted<string>,
    backend?: CredentialStorage
  ) => Effect.Effect<void, CliProfileStoreError>
  readonly remove: (name: ProfileName) => Effect.Effect<void, CliProfileStoreError>
}

// Both entrypoints and local credential commands select storage through this injected seam.
export type CredentialStoreSelector = (store: CliProfileStore) => CredentialStore

export { selectCredentialStore } from "./routed-credential-store.js"
