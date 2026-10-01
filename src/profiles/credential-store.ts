import { Effect, type Redacted } from "effect"

import type { CliProfileStore } from "./file-store.js"
import { type CredentialDestination, CliProfileStoreError, type ProfileName } from "./model.js"

// Internal storage port. The file codec owns the persisted credential contract.
export interface CredentialStore {
  readonly read: (
    name: ProfileName,
    destination: CredentialDestination
  ) => Effect.Effect<Redacted.Redacted<string> | undefined, CliProfileStoreError>
  readonly save: (
    name: ProfileName,
    destination: CredentialDestination,
    token: Redacted.Redacted<string>
  ) => Effect.Effect<void, CliProfileStoreError>
  readonly remove: (name: ProfileName) => Effect.Effect<void, CliProfileStoreError>
}

// Both entrypoints and local credential commands select storage through this injected seam.
export type CredentialStoreSelector = (store: CliProfileStore) => CredentialStore

export const selectCredentialStore: CredentialStoreSelector = (store) => ({
  read: (name, destination) =>
    Effect.gen(function* () {
      const credentials = yield* store.readCredentials()
      const token = credentials.tokens[name]
      if (token === undefined) return undefined
      const binding = credentials.destinations?.[name]
      if (binding === undefined || binding.url !== destination.url || binding.workspace !== destination.workspace) {
        return yield* new CliProfileStoreError({
          kind: "input",
          message:
            "Saved Huly credential destination changed or is unbound. Run huly auth login for this profile, or supply complete environment credentials and destination."
        })
      }
      return token
    }),
  save: (name, destination, token) =>
    Effect.gen(function* () {
      const credentials = yield* store.readCredentials()
      yield* store.writeCredentials({
        ...credentials,
        tokens: { ...credentials.tokens, [name]: token },
        destinations: {
          ...credentials.destinations,
          [name]: { url: destination.url, workspace: destination.workspace }
        }
      })
    }),
  remove: (name) =>
    Effect.gen(function* () {
      const credentials = yield* store.readCredentials()
      const { [name]: _token, ...tokens } = credentials.tokens
      const { [name]: _destination, ...destinations } = credentials.destinations ?? {}
      yield* store.writeCredentials({ ...credentials, tokens, destinations })
    })
})
