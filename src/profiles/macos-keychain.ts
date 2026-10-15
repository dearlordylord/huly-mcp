import { Effect, Redacted } from "effect"

import { CliProfileStoreError } from "./model.js"
import type { NativeCredentialPort } from "./native-credential-port.js"

const unavailable = () =>
  new CliProfileStoreError({
    kind: "integration",
    message:
      "macOS Keychain access failed. Check Keychain access and the current OS user/session, or explicitly inject complete environment credentials. macOS controls access prompts, including after updates. No file fallback was used."
  })

// Loaded only after explicit Keychain selection. The addon is an external runtime dependency.
export const makeMacosKeychain = (): NativeCredentialPort => ({
  backend: "macos-keychain",
  read: (key) =>
    Effect.tryPromise({
      try: async () => {
        const { AsyncEntry } = await import("@napi-rs/keyring")
        const value = await new AsyncEntry("io.github.dearlordylord.huly-mcp", key).getPassword()
        return value === null ? undefined : Redacted.make(value)
      },
      catch: unavailable
    }),
  save: (key, value) =>
    Effect.tryPromise({
      try: async () => {
        const { AsyncEntry } = await import("@napi-rs/keyring")
        await new AsyncEntry("io.github.dearlordylord.huly-mcp", key).setPassword(Redacted.value(value))
      },
      catch: unavailable
    }),
  remove: (key) =>
    Effect.tryPromise({
      try: async () => {
        const { AsyncEntry } = await import("@napi-rs/keyring")
        await new AsyncEntry("io.github.dearlordylord.huly-mcp", key).deleteCredential()
      },
      catch: unavailable
    })
})
