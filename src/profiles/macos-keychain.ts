import { Effect, Redacted } from "effect"

import { CliProfileStoreError } from "./model.js"
import type { NativeCredentialPort } from "./native-credential-port.js"

const unavailable = () =>
  new CliProfileStoreError({
    kind: "integration",
    message:
      "macOS Keychain access failed. Check Keychain access and the current OS user/session, or explicitly inject complete environment credentials. macOS controls access prompts, including after updates. No file fallback was used."
  })

// Internal SDK port; native payloads are encoded by the shared credential store.
export interface MacosCredentialEntry {
  readonly getPassword: () => Promise<string | null>
  readonly setPassword: (value: string) => Promise<void>
  readonly deleteCredential: () => Promise<unknown>
}
export type OpenMacosCredentialEntry = (key: string) => Promise<MacosCredentialEntry>

// Loaded only after explicit Keychain selection. The addon is an external runtime dependency.
const openEntry: OpenMacosCredentialEntry = async (key) => {
  const { AsyncEntry } = await import("@napi-rs/keyring")
  return new AsyncEntry("io.github.dearlordylord.huly-mcp", key)
}

export const makeMacosKeychain = (open: OpenMacosCredentialEntry = openEntry): NativeCredentialPort => ({
  backend: "macos-keychain",
  read: (key) =>
    Effect.tryPromise({
      try: async () => {
        const value = await (await open(key)).getPassword()
        return value === null ? undefined : Redacted.make(value)
      },
      catch: unavailable
    }),
  save: (key, value) =>
    Effect.tryPromise({
      try: async () => {
        await (await open(key)).setPassword(Redacted.value(value))
      },
      catch: unavailable
    }),
  remove: (key) =>
    Effect.tryPromise({
      try: async () => {
        await (await open(key)).deleteCredential()
      },
      catch: unavailable
    })
})
