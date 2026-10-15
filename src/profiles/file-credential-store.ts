import { Effect } from "effect"
import { CliProfileStoreError } from "./model.js"
import type { CredentialStoreSelector } from "./credential-store.js"
import { matchesCredentialDestination } from "./credential-destination.js"

export const selectFileCredentialStore: CredentialStoreSelector = (store) => ({
  read: (name, destination) =>
    Effect.gen(function* () {
      const credentials = yield* store.readCredentials()
      const token = credentials.tokens[name]
      if (token === undefined) return undefined
      const binding = credentials.destinations?.[name]
      if (binding === undefined || !matchesCredentialDestination(binding, destination)) {
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
