import { execFile } from "node:child_process"
import { createRequire } from "node:module"
import { promisify } from "node:util"
import { Effect, Redacted, Schema } from "effect"
import { MACOS_KEYCHAIN_SERVICE, macosKeychainUnavailable } from "./macos-keychain-protocol.js"
import type { CliProfileStoreError } from "./model.js"

const CredentialListSchema = Schema.Array(
  Schema.Struct({ account: Schema.String, password: Schema.RedactedFromValue(Schema.String) })
)
// Internal SDK ports. Schemas own returned credential records; callers receive redacted values.
export interface MacosPasswordSdk {
  readonly list: (key: string, signal: AbortSignal) => Promise<unknown>
  readonly save: (key: string, value: string, signal: AbortSignal) => Promise<void>
}
export interface MacosPasswords {
  readonly read: (key: string) => Effect.Effect<Redacted.Redacted<string>, CliProfileStoreError>
  readonly save: (key: string, value: Redacted.Redacted<string>) => Effect.Effect<void, CliProfileStoreError>
}
type LoadMacosPasswordSdk = () => Promise<MacosPasswordSdk>
const command = promisify(execFile)
// The same Node executable preserves Keychain ACL identity. A disposable read
// process can be terminated if native access waits for unavailable system UI.
const readProgram = `
const [modulePath, service, account] = process.argv.slice(1);
require(modulePath).findCredentialsAsync(service).then(
  entries => process.stdout.write(JSON.stringify(entries.filter(entry => entry.account === account))),
  () => { process.exitCode = 1; }
);
`
export const loadMacosPasswordSdk: LoadMacosPasswordSdk = async () => {
  const sdk = await import("@napi-rs/keyring")
  const load = typeof require === "function" ? require : createRequire(`${process.cwd()}/package.json`)
  return {
    list: async (key, signal) =>
      (
        await command(
          process.execPath,
          ["-e", readProgram, load.resolve("@napi-rs/keyring"), MACOS_KEYCHAIN_SERVICE, key],
          { encoding: "utf8", signal, killSignal: "SIGKILL" }
        )
      ).stdout,
    save: (key, value, signal) => new sdk.AsyncEntry(MACOS_KEYCHAIN_SERVICE, key).setPassword(value, signal)
  }
}

export const makeMacosPasswords = (load: LoadMacosPasswordSdk = loadMacosPasswordSdk): MacosPasswords => ({
  read: (key) =>
    Effect.gen(function* () {
      const raw = yield* Effect.tryPromise({
        try: async (signal) => (await load()).list(key, signal),
        catch: macosKeychainUnavailable
      })
      const entries = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(CredentialListSchema))(raw).pipe(
        Effect.mapError(macosKeychainUnavailable)
      )
      const [entry, ...duplicates] = entries.filter((candidate) => candidate.account === key)
      if (entry === undefined || duplicates.length > 0) return yield* macosKeychainUnavailable()
      return entry.password
    }).pipe(Effect.timeout("10 seconds"), Effect.mapError(macosKeychainUnavailable)),
  save: (key, value) =>
    Effect.tryPromise({
      try: async (signal) => (await load()).save(key, Redacted.value(value), signal),
      catch: macosKeychainUnavailable
    }).pipe(Effect.timeout("10 seconds"), Effect.mapError(macosKeychainUnavailable))
})
