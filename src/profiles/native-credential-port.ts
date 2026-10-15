import { type Effect, type Redacted } from "effect"

import type { CliProfileStoreError, NativeCredentialStorage } from "./model.js"

// Internal adapter port; NativeCredentialSchema owns the serialized secret payload.
export interface NativeCredentialPort {
  readonly backend: NativeCredentialStorage
  readonly read: (key: string) => Effect.Effect<Redacted.Redacted<string> | undefined, CliProfileStoreError>
  readonly save: (key: string, value: Redacted.Redacted<string>) => Effect.Effect<void, CliProfileStoreError>
  readonly remove: (key: string) => Effect.Effect<void, CliProfileStoreError>
}
