import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { promisify } from "node:util"
import { Effect, Redacted, Schema } from "effect"

import { saveLogin } from "../packages/huly-cli/src/profile-operations.js"
import { cliProfilePaths, makeCliProfileStore } from "../src/profiles/file-store.js"
import { makeMacosKeychain } from "../src/profiles/macos-keychain.js"
import { parseProfileName } from "../src/profiles/model.js"
import { resolveCliConfiguration } from "../src/profiles/resolve.js"

const FixtureSchema = Schema.Struct({
  HULY_TEST_KEYCHAIN_PATH: Schema.NonEmptyString,
  HULY_TEST_ORIGINAL_KEYCHAIN: Schema.NonEmptyString,
  HULY_TEST_KEYCHAIN_PASSWORD: Schema.RedactedFromValue(Schema.NonEmptyString)
})
const command = promisify(execFile)
const commandTimeout = 15000
const processArgumentOffset = 2

const run = async () => {
  assert.equal(process.platform, "darwin", "This probe requires real macOS Keychain.")
  const fixture = Schema.decodeUnknownSync(FixtureSchema)(process.env)
  const [executable] = Schema.decodeUnknownSync(Schema.Tuple([Schema.NonEmptyString]))(
    process.argv.slice(processArgumentOffset)
  )
  const native = makeMacosKeychain()
  const store = makeCliProfileStore(cliProfilePaths("darwin", {}, os.homedir()), native)
  await fs.mkdir(path.dirname(store.paths.directory), { recursive: true })
  // Refuse an existing configuration; the fixture owns only a new runner directory.
  await fs.mkdir(store.paths.directory)
  const name = await Effect.runPromise(parseProfileName("locked-logout"))
  const token = Redacted.make("huly-native-locked-logout-sentinel")
  const unlock = () =>
    command(
      "/usr/bin/security",
      ["unlock-keychain", "-p", Redacted.value(fixture.HULY_TEST_KEYCHAIN_PASSWORD), fixture.HULY_TEST_KEYCHAIN_PATH],
      { timeout: commandTimeout }
    )
  try {
    await Effect.runPromise(
      saveLogin(
        store,
        name,
        { url: "https://huly.invalid", workspace: "qualification", credentialStorage: "macos-keychain" },
        token
      )
    )
    const profiles = await fs.readFile(store.paths.profiles, "utf8")
    const credentials = await fs.readFile(store.paths.credentials, "utf8")
    const listing = await command("/usr/bin/security", ["list-keychains", "-d", "user"], { timeout: commandTimeout })
    const parseKeychain = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.NonEmptyString))
    const keychains = listing.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => parseKeychain(line))
    if (!keychains.includes(fixture.HULY_TEST_KEYCHAIN_PATH)) {
      await command(
        "/usr/bin/security",
        ["list-keychains", "-d", "user", "-s", ...keychains, fixture.HULY_TEST_KEYCHAIN_PATH],
        { timeout: commandTimeout }
      )
    }
    await command("/usr/bin/security", ["default-keychain", "-d", "user", "-s", fixture.HULY_TEST_ORIGINAL_KEYCHAIN], {
      timeout: commandTimeout
    })
    const beforeLock = await Effect.runPromise(resolveCliConfiguration(store, {}, name))
    assert.equal(beforeLock.auth.method, "token", "Changing the default Keychain must retain search-list access.")
    process.stdout.write("Checking packaged logout against a locked Keychain.\n")
    await command("/usr/bin/security", ["lock-keychain", fixture.HULY_TEST_KEYCHAIN_PATH], { timeout: commandTimeout })
    const environment = { ...process.env, HULY_PROFILE: name, HULY_CLI_TELEMETRY: "0" }
    let failed = false
    try {
      await command(executable, ["auth", "logout", "--profile", name, "--json"], {
        env: environment,
        timeout: commandTimeout
      })
    } catch (error) {
      const failure = Schema.decodeUnknownSync(
        Schema.Struct({ code: Schema.Int, stdout: Schema.String, stderr: Schema.String })
      )(error)
      assert.notEqual(failure.code, 0)
      assert.match(failure.stdout + failure.stderr, /Keychain access failed/)
      assert(!(failure.stdout + failure.stderr).includes(Redacted.value(token)))
      failed = true
    }
    assert(failed, "Locked logout unexpectedly reported success.")
    assert.equal(await fs.readFile(store.paths.profiles, "utf8"), profiles)
    assert.equal(await fs.readFile(store.paths.credentials, "utf8"), credentials)
    process.stdout.write("Locked logout failed and preserved profile/credential files.\n")
    await unlock()
    const resolved = await Effect.runPromise(resolveCliConfiguration(store, {}, name))
    assert.equal(resolved.auth.method, "token")
    if (resolved.auth.method === "token") assert.equal(Redacted.value(resolved.auth.token), Redacted.value(token))
    process.stdout.write("Unlock restored access to the previous credential.\n")
    await command(executable, ["auth", "logout", "--profile", name, "--json"], {
      env: environment,
      timeout: commandTimeout
    })
    assert.equal((await Effect.runPromise(store.readCredentials())).native?.[name], undefined)
    assert.equal(await fs.readFile(store.paths.profiles, "utf8"), profiles)
    assert(!credentials.includes(Redacted.value(token)))
    process.stdout.write(
      "PASS: packaged macOS locked logout fails, retains reference, restores access after unlock, and deletes after unlock.\n"
    )
  } finally {
    await unlock()
    const reference = (await Effect.runPromise(store.readCredentials())).native?.[name]
    if (reference !== undefined) await Effect.runPromise(native.remove(reference.key))
    await fs.rm(store.paths.directory, { recursive: true, force: true })
  }
}

run().catch(() => {
  process.stderr.write("FAIL: real macOS packaged logout preservation probe; credential material suppressed.\n")
  process.exitCode = 1
})
