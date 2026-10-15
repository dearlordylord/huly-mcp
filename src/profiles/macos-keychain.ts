import { Effect } from "effect"

import { MACOS_KEYCHAIN_ITEM_NOT_FOUND, macosKeychainUnavailable } from "./macos-keychain-protocol.js"
import { makeMacosPasswords, type MacosPasswords } from "./macos-passwords.js"
import { runMacosSecurity, type MacosSecurityCommand } from "./macos-security.js"
import type { NativeCredentialPort } from "./native-credential-port.js"

export const makeMacosKeychain = (
  passwords: MacosPasswords = makeMacosPasswords(),
  security: MacosSecurityCommand = runMacosSecurity
): NativeCredentialPort => {
  // Both metadata lookup and secret retrieval cover the OS search list.
  const read = (key: string) =>
    Effect.gen(function* () {
      const reply = yield* security({ _tag: "Locate", key })
      if (reply.status === MACOS_KEYCHAIN_ITEM_NOT_FOUND) return undefined
      if (reply.status !== 0) return yield* macosKeychainUnavailable()
      return yield* passwords.read(key)
    })
  return {
    backend: "macos-keychain",
    read,
    save: passwords.save,
    remove: (key) =>
      Effect.gen(function* () {
        // Establish access before deletion; locked/denied reads must retain the reference.
        if ((yield* read(key)) === undefined) return
        const reply = yield* security({ _tag: "Remove", key })
        if (reply.status !== 0 && reply.status !== MACOS_KEYCHAIN_ITEM_NOT_FOUND)
          return yield* macosKeychainUnavailable()
        if ((yield* read(key)) !== undefined) return yield* macosKeychainUnavailable()
      })
  }
}
