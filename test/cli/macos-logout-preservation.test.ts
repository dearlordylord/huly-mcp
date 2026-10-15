import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { Effect, Redacted, Result, Schema } from "effect"
import { expect, it } from "vitest"

import { getAuthStatus, logoutProfile, saveLogin } from "../../packages/huly-cli/src/profile-operations.js"
import { cliProfilePaths, makeCliProfileStore } from "../../src/profiles/file-store.js"
import { makeMacosKeychain } from "../../src/profiles/macos-keychain.js"
import { makeMacosPasswords } from "../../src/profiles/macos-passwords.js"
import { MacosSecurityReplySchema } from "../../src/profiles/macos-keychain-protocol.js"
import { parseProfileName } from "../../src/profiles/model.js"
import { resolveCliConfiguration } from "../../src/profiles/resolve.js"

it("retains the reference on locked logout and restores access after unlock", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "huly-keychain-logout-"))
  const values = new Map<string, string>()
  let locked = false
  const passwords = makeMacosPasswords(async () => ({
    list: async () => JSON.stringify(locked ? [] : [...values].map(([account, password]) => ({ account, password }))),
    save: async (key, value) => {
      values.set(key, value)
    }
  }))
  const native = makeMacosKeychain(passwords, (request) => {
    if (request._tag === "Remove" && !locked) values.delete(request.key)
    return Effect.succeed(
      Schema.decodeUnknownSync(MacosSecurityReplySchema)({ status: values.has(request.key) ? 0 : 44, output: "" })
    )
  })
  const store = makeCliProfileStore(cliProfilePaths("linux", { XDG_CONFIG_HOME: directory }, directory), native)
  const name = await Effect.runPromise(parseProfileName("locked-logout"))
  const profile = { url: "https://huly.example", workspace: "work", credentialStorage: native.backend }
  try {
    await Effect.runPromise(saveLogin(store, name, profile, Redacted.make("retained-token-sentinel")))
    const profiles = await fs.readFile(store.paths.profiles, "utf8")
    const credentials = await fs.readFile(store.paths.credentials, "utf8")
    locked = true
    const result = await Effect.runPromise(logoutProfile(store, name).pipe(Effect.result))
    expect(Result.isFailure(result)).toBe(true)
    expect(JSON.stringify(result)).not.toContain("private-error-sentinel")
    expect(await fs.readFile(store.paths.profiles, "utf8")).toBe(profiles)
    expect(await fs.readFile(store.paths.credentials, "utf8")).toBe(credentials)
    expect(await Effect.runPromise(getAuthStatus(store, {}, name))).toMatchObject({ configured: true, verified: false })
    locked = false
    const resolved = await Effect.runPromise(resolveCliConfiguration(store, {}, name))
    expect(resolved.auth.method).toBe("token")
    if (resolved.auth.method === "token") expect(Redacted.value(resolved.auth.token)).toBe("retained-token-sentinel")
    await Effect.runPromise(logoutProfile(store, name))
    expect(values.size).toBe(0)
    expect((await Effect.runPromise(store.readCredentials())).native?.[name]).toBeUndefined()
    expect(await fs.readFile(store.paths.profiles, "utf8")).toBe(profiles)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})
