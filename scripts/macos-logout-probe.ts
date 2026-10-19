import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { promisify } from "node:util"
import { Effect, Redacted, Result, Schema } from "effect"

import { saveLogin } from "../packages/huly-cli/src/profile-operations.js"
import { cliProfilePaths, makeCliProfileStore } from "../src/profiles/file-store.js"
import { makeMacosKeychain } from "../src/profiles/macos-keychain.js"
import { runMacosSecurity } from "../src/profiles/macos-security.js"
import { parseProfileName } from "../src/profiles/model.js"
import { resolveCliConfiguration } from "../src/profiles/resolve.js"

import { profileProbeEnvironment, probeProfileStartup } from "./probe-profile-startup.js"

const FixtureSchema = Schema.Struct({
  HULY_TEST_KEYCHAIN_PATH: Schema.NonEmptyString,
  HULY_TEST_ORIGINAL_KEYCHAIN: Schema.NonEmptyString,
  HULY_TEST_KEYCHAIN_PASSWORD: Schema.RedactedFromValue(Schema.NonEmptyString)
})
const command = promisify(execFile)
const commandTimeout = 15000
const processArgumentOffset = 2
let phase = "fixture configuration"

const refuseLogout = async (
  executable: string,
  name: string,
  environment: Record<string, string>,
  token: Redacted.Redacted<string>
) => {
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
    assert.match(failure.stdout + failure.stderr, /Keychain/)
    assert(!(failure.stdout + failure.stderr).includes(Redacted.value(token)))
    failed = true
  }
  assert(failed, "Unavailable or locked logout unexpectedly reported success.")
}

const run = async () => {
  assert.equal(process.platform, "darwin", "This probe requires real macOS Keychain.")
  const fixture = Schema.decodeUnknownSync(FixtureSchema)(process.env)
  const [executable, mcpEntry] = Schema.decodeUnknownSync(Schema.Tuple([Schema.NonEmptyString, Schema.NonEmptyString]))(
    process.argv.slice(processArgumentOffset)
  )
  const native = makeMacosKeychain()
  const store = makeCliProfileStore(cliProfilePaths("darwin", {}, os.homedir()), native)
  await fs.mkdir(path.dirname(store.paths.directory), { recursive: true })
  // Refuse an existing configuration; the fixture owns only a new runner directory.
  await fs.mkdir(store.paths.directory)
  phase = "initial credential publication"
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
    await Effect.runPromise(
      saveLogin(
        store,
        name,
        { url: "https://huly.invalid", workspace: "qualification", credentialStorage: "macos-keychain" },
        token
      )
    )
    assert.deepEqual((await Effect.runPromise(store.readCredentials())).native?.[name]?.retiredKeys, [])
    const profiles = await fs.readFile(store.paths.profiles, "utf8")
    const credentials = await fs.readFile(store.paths.credentials, "utf8")
    phase = "search-list configuration"
    await command("/usr/bin/security", ["default-keychain", "-d", "user", "-s", fixture.HULY_TEST_ORIGINAL_KEYCHAIN], {
      timeout: commandTimeout
    })
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
    phase = "unlocked nondefault metadata lookup"
    const reference = (await Effect.runPromise(store.readCredentials())).native?.[name]
    assert(reference !== undefined)
    const located = await Effect.runPromise(runMacosSecurity({ _tag: "Locate", key: reference.key }))
    process.stdout.write(`Nondefault metadata lookup status: ${located.status}.\n`)
    assert.equal(located.status, 0)
    phase = "unlocked nondefault native secret read"
    const nondefaultToken = await Effect.runPromise(native.read(reference.key))
    assert(nondefaultToken !== undefined)
    phase = "unlocked nondefault profile resolution"
    const beforeLock = await Effect.runPromise(resolveCliConfiguration(store, {}, name))
    assert.equal(beforeLock.auth.method, "token", "Changing the default Keychain must retain search-list access.")
    const environment = profileProbeEnvironment({ ...process.env, HULY_PROFILE: name, HULY_CLI_TELEMETRY: "0" })
    const available = [...new Set([...keychains, fixture.HULY_TEST_KEYCHAIN_PATH])]
    phase = "unavailable Keychain logout and MCP startup"
    await command(
      "/usr/bin/security",
      ["list-keychains", "-d", "user", "-s", ...available.filter((entry) => entry !== fixture.HULY_TEST_KEYCHAIN_PATH)],
      { timeout: commandTimeout }
    )
    await refuseLogout(executable, name, environment, token)
    assert(Result.isFailure(await Effect.runPromise(resolveCliConfiguration(store, {}, name).pipe(Effect.result))))
    await probeProfileStartup(mcpEntry, environment, /Keychain|native credential/)
    assert.equal(await fs.readFile(store.paths.profiles, "utf8"), profiles)
    assert.equal(await fs.readFile(store.paths.credentials, "utf8"), credentials)
    await command("/usr/bin/security", ["list-keychains", "-d", "user", "-s", ...available], {
      timeout: commandTimeout
    })
    assert.notEqual(await Effect.runPromise(native.read(reference.key)), undefined)
    const restored = await Effect.runPromise(resolveCliConfiguration(store, {}, name))
    assert.equal(restored.auth.method, "token")
    if (restored.auth.method === "token") assert.equal(Redacted.value(restored.auth.token), Redacted.value(token))
    process.stdout.write(
      "PASS: unavailable Keychain retains reference and token; search-list restoration recovers access; MCP exposes diagnosis.\n"
    )
    process.stdout.write("Checking packaged logout against a locked Keychain.\n")
    phase = "locked packaged logout"
    await command("/usr/bin/security", ["lock-keychain", fixture.HULY_TEST_KEYCHAIN_PATH], { timeout: commandTimeout })
    await refuseLogout(executable, name, environment, token)
    await probeProfileStartup(mcpEntry, environment, /Keychain access failed/)
    assert.equal(await fs.readFile(store.paths.profiles, "utf8"), profiles)
    assert.equal(await fs.readFile(store.paths.credentials, "utf8"), credentials)
    process.stdout.write("Locked logout failed and preserved profile/credential files.\n")
    await unlock()
    phase = "unlocked credential recovery"
    const resolved = await Effect.runPromise(resolveCliConfiguration(store, {}, name))
    assert.equal(resolved.auth.method, "token")
    if (resolved.auth.method === "token") assert.equal(Redacted.value(resolved.auth.token), Redacted.value(token))
    process.stdout.write("Unlock restored access to the previous credential.\n")
    phase = "unlocked packaged logout"
    await command(executable, ["auth", "logout", "--profile", name, "--json"], {
      env: environment,
      timeout: commandTimeout
    })
    assert.equal((await Effect.runPromise(store.readCredentials())).native?.[name], undefined)
    assert.equal(await fs.readFile(store.paths.profiles, "utf8"), profiles)
    assert(!credentials.includes(Redacted.value(token)))
    await probeProfileStartup(mcpEntry, environment, /no usable credentials/)
    process.stdout.write(
      "PASS: packaged macOS locked logout fails, retains reference, restores access after unlock, and deletes after unlock.\n"
    )
  } finally {
    await command(
      "/usr/bin/security",
      ["list-keychains", "-d", "user", "-s", fixture.HULY_TEST_ORIGINAL_KEYCHAIN, fixture.HULY_TEST_KEYCHAIN_PATH],
      { timeout: commandTimeout }
    )
    await unlock()
    const reference = (await Effect.runPromise(store.readCredentials())).native?.[name]
    if (reference !== undefined) await Effect.runPromise(native.remove(reference.key))
    await fs.rm(store.paths.directory, { recursive: true, force: true })
  }
}

run().catch(() => {
  process.stderr.write(
    `FAIL: real macOS packaged logout preservation probe at ${phase}; credential material suppressed.\n`
  )
  process.exitCode = 1
})
