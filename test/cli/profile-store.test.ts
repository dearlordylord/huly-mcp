import {
  logoutProfile,
  saveLogin,
  selectProfile,
  updateProfile
} from "../../packages/huly-cli/src/profile-operations.js"
import { resolveStdioProfile } from "../../src/profiles/stdio.js"
import * as fs from "node:fs/promises"
import * as path from "node:path"

import { Effect, Redacted, Schema } from "effect"
import { afterEach, describe, expect, it } from "vitest"

import {
  cliProfilePaths,
  CliProfileSchema,
  makeCliProfileStore,
  parseProfileName,
  ResolvedCliConfigurationSchema,
  resolveCliConfiguration,
  storedToken
} from "../../packages/huly-cli/src/profile-store.js"

const temporaryDirectories: Array<string> = []

const temporaryStore = async () => {
  const directory = await fs.mkdtemp(path.join(process.cwd(), ".profile-store-test-"))
  temporaryDirectories.push(directory)
  const paths = cliProfilePaths("linux", { XDG_CONFIG_HOME: directory }, directory)
  return makeCliProfileStore(paths)
}

const profileName = (value: string) => Effect.runPromise(parseProfileName(value))

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { force: true, recursive: true }))
  )
})

describe("CLI profile store", () => {
  it("uses the documented platform-specific configuration directories", () => {
    expect(cliProfilePaths("win32", { APPDATA: "C:\\Config" }, "C:\\Home").directory).toBe("C:\\Config/huly")
    expect(cliProfilePaths("win32", {}, "C:\\Home").directory).toBe("C:\\Home/huly")
    expect(cliProfilePaths("darwin", {}, "/Users/agent").directory).toBe(
      "/Users/agent/Library/Application Support/huly"
    )
    expect(cliProfilePaths("linux", {}, "/home/agent").directory).toBe("/home/agent/.config/huly")
  })

  it("returns empty configuration when profile files do not exist", async () => {
    const store = await temporaryStore()

    expect(await Effect.runPromise(store.readProfiles())).toEqual({ version: 1, profiles: {} })
    expect(await Effect.runPromise(store.readCredentials())).toEqual({ version: 1, tokens: {} })
    expect(await Effect.runPromise(resolveCliConfiguration(store, {}))).toMatchObject({ auth: { method: "none" } })
  })

  it("rejects a password auth state that contains no credential", async () => {
    const exit = await Effect.runPromiseExit(
      Schema.decodeUnknownEffect(ResolvedCliConfigurationSchema)({ auth: { method: "password" } })
    )

    expect(exit.toString()).toContain("credentialState")
  })

  it("resolves active profile values while giving each environment variable priority", async () => {
    const store = await temporaryStore()
    const work = await profileName("work")
    await Effect.runPromise(
      store.writeProfiles({
        version: 1,
        activeProfile: work,
        profiles: { [work]: { url: "https://profile.example", workspace: "profile-space", defaultProject: "CLI" } }
      })
    )
    await Effect.runPromise(store.writeCredentials({ version: 1, tokens: { [work]: storedToken("stored-token") } }))

    const resolved = await Effect.runPromise(
      resolveCliConfiguration(store, {
        HULY_URL: "https://environment.example",
        HULY_WORKSPACE: "profile-space",
        HULY_TOKEN: "environment-token"
      })
    )

    expect(resolved.url).toBe("https://environment.example")
    expect(resolved.workspace).toBe("profile-space")
    expect(resolved.auth.method).toBe("token")
    if (resolved.auth.method === "token") expect(Redacted.value(resolved.auth.token)).toBe("environment-token")
    expect(resolved.defaultProject).toBe("CLI")
    expect(resolved.profile).toBe("work")
  })

  it("writes configuration and tokens with restrictive permissions without persisting passwords", async () => {
    const store = await temporaryStore()
    const personal = await profileName("personal")
    await Effect.runPromise(
      store.writeProfiles({
        version: 1,
        activeProfile: personal,
        profiles: { [personal]: { url: "http://localhost:8087", workspace: "ws" } }
      })
    )
    await Effect.runPromise(store.writeCredentials({ version: 1, tokens: { [personal]: storedToken("saved-token") } }))

    const profileMode = (await fs.stat(store.paths.profiles)).mode & 0o777
    const credentialMode = (await fs.stat(store.paths.credentials)).mode & 0o777
    const credentialText = await fs.readFile(store.paths.credentials, "utf8")

    expect(profileMode).toBe(0o600)
    expect(credentialMode).toBe(0o600)
    expect(credentialText).toContain("saved-token")
    expect(credentialText.toLowerCase()).not.toContain("password")
  })

  it("returns an actionable typed failure for malformed files", async () => {
    const store = await temporaryStore()
    await fs.mkdir(store.paths.directory, { recursive: true })
    await fs.writeFile(store.paths.profiles, "{not-json", "utf8")

    const exit = await Effect.runPromiseExit(store.readProfiles())

    expect(exit.toString()).toContain("Malformed JSON")
    expect(exit.toString()).toContain(store.paths.profiles)
  })

  it("rejects well-formed JSON that violates the profile schema", async () => {
    const store = await temporaryStore()
    await fs.mkdir(store.paths.directory, { recursive: true })
    await fs.writeFile(store.paths.profiles, JSON.stringify({ version: 1, profiles: { bad: { url: "::" } } }))

    const exit = await Effect.runPromiseExit(store.readProfiles())

    expect(exit.toString()).toContain("Invalid Huly CLI configuration")
  })

  it("reports the URL refinement message at the schema boundary", async () => {
    const exit = await Effect.runPromiseExit(
      Schema.decodeUnknownEffect(CliProfileSchema)({ url: "::", workspace: "workspace" })
    )

    expect(exit.toString()).toContain("Expected an http or https URL")
  })

  it("returns a typed integration failure when secure configuration cannot be written", async () => {
    const store = await temporaryStore()
    await fs.writeFile(store.paths.directory, "blocks-directory-creation")

    const exit = await Effect.runPromiseExit(store.writeProfiles({ version: 1, profiles: {} }))

    expect(exit.toString()).toContain("Cannot write")
  })

  it("returns a typed integration failure when configuration cannot be read", async () => {
    const store = await temporaryStore()
    await fs.mkdir(store.paths.profiles, { recursive: true })

    const exit = await Effect.runPromiseExit(store.readProfiles())

    expect(exit.toString()).toContain("Cannot read")
  })

  it("wraps stored tokens as redacted values", () => {
    expect(Redacted.value(storedToken("secret-token"))).toBe("secret-token")
  })

  it("preserves password-auth environment values without writing them", async () => {
    const store = await temporaryStore()
    const resolved = await Effect.runPromise(
      resolveCliConfiguration(store, {
        HULY_CONNECTION_TIMEOUT: "5000",
        HULY_EMAIL: "agent@example.com",
        HULY_PASSWORD: "ephemeral",
        HULY_WORKSPACE: "workspace"
      })
    )

    expect(resolved.connectionTimeout).toBe("5000")
    expect(resolved.workspace).toBe("workspace")
    expect(resolved.auth.method).toBe("password")
    if (resolved.auth.method === "password" && resolved.auth.credentialState === "complete") {
      expect(resolved.auth.email).toBe("agent@example.com")
      expect(Redacted.value(resolved.auth.password)).toBe("ephemeral")
    }
    expect(await Effect.runPromise(store.readCredentials())).toEqual({ version: 1, tokens: {} })
  })

  it("lets environment password authentication override a stored profile token", async () => {
    const store = await temporaryStore()
    const work = await profileName("work")
    await Effect.runPromise(
      store.writeProfiles({
        version: 1,
        activeProfile: work,
        profiles: { [work]: { url: "https://profile.example", workspace: "workspace" } }
      })
    )
    await Effect.runPromise(store.writeCredentials({ version: 1, tokens: { [work]: storedToken("stored") } }))

    const resolved = await Effect.runPromise(
      resolveCliConfiguration(store, {
        HULY_URL: "https://profile.example",
        HULY_WORKSPACE: "workspace",
        HULY_EMAIL: "agent@example.com",
        HULY_PASSWORD: "environment"
      })
    )

    expect(resolved.auth.method).toBe("password")
    if (resolved.auth.method === "password" && resolved.auth.credentialState === "complete") {
      expect(Redacted.value(resolved.auth.password)).toBe("environment")
    }
  })

  it("preserves partial password authentication for downstream config diagnostics", async () => {
    const store = await temporaryStore()

    const emailOnly = await Effect.runPromise(resolveCliConfiguration(store, { HULY_EMAIL: "agent@example.com" }))
    const passwordOnly = await Effect.runPromise(resolveCliConfiguration(store, { HULY_PASSWORD: "password" }))

    expect(emailOnly.auth).toMatchObject({
      method: "password",
      credentialState: "email-only",
      email: "agent@example.com"
    })
    expect(passwordOnly.auth).toMatchObject({ method: "password", credentialState: "password-only" })
    if (passwordOnly.auth.method === "password" && passwordOnly.auth.credentialState === "password-only") {
      expect(Redacted.value(passwordOnly.auth.password)).toBe("password")
    }
  })

  it("rejects an invalid environment URL at the resolved configuration boundary", async () => {
    const store = await temporaryStore()

    const exit = await Effect.runPromiseExit(resolveCliConfiguration(store, { HULY_URL: "not-a-url" }))

    expect(exit.toString()).toContain("Invalid resolved Huly CLI configuration")
  })

  it("atomically replaces a credentials symlink without writing through it", async () => {
    const store = await temporaryStore()
    const personal = await profileName("personal")
    await fs.mkdir(store.paths.directory, { recursive: true })
    const unrelated = path.join(store.paths.directory, "unrelated.json")
    await fs.writeFile(unrelated, "unchanged", { mode: 0o644 })
    await fs.symlink(unrelated, store.paths.credentials)

    await Effect.runPromise(store.writeCredentials({ version: 1, tokens: { [personal]: storedToken("saved-token") } }))

    expect(await fs.readFile(unrelated, "utf8")).toBe("unchanged")
    expect((await fs.lstat(store.paths.credentials)).isSymbolicLink()).toBe(false)
    expect((await fs.stat(store.paths.credentials)).mode & 0o777).toBe(0o600)
  })

  it("switches profiles by changing only the active profile name", async () => {
    const store = await temporaryStore()
    const first = await profileName("first")
    const second = await profileName("second")
    const profiles = {
      version: 1 as const,
      activeProfile: first,
      profiles: {
        [first]: { url: "https://first.example", workspace: "first" },
        [second]: { url: "https://second.example", workspace: "second" }
      }
    }
    await Effect.runPromise(store.writeProfiles(profiles))
    await Effect.runPromise(store.writeProfiles({ ...profiles, activeProfile: second }))

    const resolved = await Effect.runPromise(resolveCliConfiguration(store, {}))

    expect(resolved.profile).toBe("second")
    expect(resolved.url).toBe("https://second.example")
  })
})

describe("shared profile selection and credential binding", () => {
  const makeProfiles = async () => {
    const store = await temporaryStore()
    const first = await profileName("first")
    const second = await profileName("second")
    await Effect.runPromise(
      saveLogin(store, first, { url: "https://first.example", workspace: "one" }, storedToken("first-secret"))
    )
    await Effect.runPromise(
      saveLogin(store, second, { url: "https://second.example", workspace: "two" }, storedToken("second-secret"))
    )
    return { store, first, second }
  }

  it("selects CLI flag before environment before active", async () => {
    const { store } = await makeProfiles()
    expect((await Effect.runPromise(resolveCliConfiguration(store, {}, "first"))).profile).toBe("first")
    expect((await Effect.runPromise(resolveCliConfiguration(store, { HULY_PROFILE: "first" }))).profile).toBe("first")
    expect((await Effect.runPromise(resolveCliConfiguration(store, { HULY_PROFILE: "second" }, "first"))).profile).toBe(
      "first"
    )
    expect((await Effect.runPromise(resolveCliConfiguration(store, {}))).profile).toBe("second")
    expect(
      (await Effect.runPromise(resolveCliConfiguration(store, { HULY_PROFILE: "bad name" }, "first"))).profile
    ).toBe("first")
  })

  it("stdio never follows CLI active selection", async () => {
    const { first, store } = await makeProfiles()
    expect((await Effect.runPromise(resolveStdioProfile({}, store))).auth.method).toBe("none")
    await Effect.runPromise(selectProfile(store, first))
    const resolved = await Effect.runPromise(resolveStdioProfile({ HULY_PROFILE: "second" }, store))
    expect(resolved.workspace).toBe("two")
    expect(resolved.auth.method).toBe("token")
    if (resolved.auth.method === "token") expect(Redacted.value(resolved.auth.token)).toBe("second-secret")
  })

  it("rejects destination overrides and metadata edits without exposing secrets", async () => {
    const { first, store } = await makeProfiles()
    for (const environment of [
      { HULY_URL: "https://other.example" },
      { HULY_WORKSPACE: "other" },
      { HULY_TOKEN: "incomplete-secret" }
    ]) {
      const exit = await Effect.runPromiseExit(resolveCliConfiguration(store, environment, "first"))
      expect(exit.toString()).toContain("CliProfileStoreError")
      expect(exit.toString()).not.toContain("first-secret")
      expect(exit.toString()).not.toContain("incomplete-secret")
    }
    await Effect.runPromise(updateProfile(store, first, { workspace: "changed" }))
    expect((await Effect.runPromiseExit(resolveStdioProfile({ HULY_PROFILE: "first" }, store))).toString()).toContain(
      "destination changed"
    )
  })

  it("keeps a credential usable after changing only the default project", async () => {
    const { first, store } = await makeProfiles()
    await Effect.runPromise(updateProfile(store, first, { defaultProject: "NEW" }))
    expect((await Effect.runPromise(resolveCliConfiguration(store, {}, "first"))).defaultProject).toBe("NEW")
  })

  it("allows complete ephemeral environment credentials after a destination change", async () => {
    const { first, store } = await makeProfiles()
    await Effect.runPromise(updateProfile(store, first, { workspace: "changed" }))
    const resolved = await Effect.runPromise(
      resolveStdioProfile(
        { HULY_PROFILE: "first", HULY_URL: "https://other.example", HULY_WORKSPACE: "other", HULY_TOKEN: "ephemeral" },
        store
      )
    )
    expect(resolved.workspace).toBe("other")
    const credentials = await Effect.runPromise(store.readCredentials())
    const saved = credentials.tokens[first]
    expect(saved).toBeDefined()
    if (saved !== undefined) expect(Redacted.value(saved)).toBe("first-secret")
  })

  it("fails selected profiles with missing credentials without prompting", async () => {
    const { first, store } = await makeProfiles()
    await Effect.runPromise(store.writeCredentials({ version: 1, tokens: {} }))
    expect((await Effect.runPromiseExit(resolveStdioProfile({ HULY_PROFILE: first }, store))).toString()).toContain(
      "no usable credentials"
    )
    expect((await Effect.runPromiseExit(resolveCliConfiguration(store, {}, "absent"))).toString()).toContain(
      "does not exist"
    )
    expect((await Effect.runPromiseExit(resolveCliConfiguration(store, {}, "bad name"))).toString()).toContain(
      "Invalid Huly profile name"
    )
  })
})

it("requires reauthentication for legacy tokens with no destination binding", async () => {
  const store = await temporaryStore()
  const name = await profileName("legacy")
  await Effect.runPromise(
    store.writeProfiles({
      version: 1,
      activeProfile: name,
      profiles: { [name]: { url: "https://legacy.example", workspace: "old" } }
    })
  )
  await Effect.runPromise(store.writeCredentials({ version: 1, tokens: { [name]: storedToken("legacy-secret") } }))
  const exit = await Effect.runPromiseExit(resolveCliConfiguration(store, {}))
  expect(exit.toString()).toContain("unbound")
  expect(exit.toString()).not.toContain("legacy-secret")
})

it("uses the same injected credential selector for CLI and stdio", async () => {
  const store = await temporaryStore()
  const name = await profileName("native-ready")
  const profile = { url: "https://native.example", workspace: "shared" }
  await Effect.runPromise(store.writeProfiles({ version: 1, activeProfile: name, profiles: { [name]: profile } }))
  const destinations: Array<string> = []
  const selector = () => ({
    read: (selected: typeof name, destination: typeof profile) => {
      destinations.push(`${selected}:${destination.url}:${destination.workspace}`)
      return Effect.succeed(storedToken("external-secret"))
    },
    save: () => Effect.void,
    remove: () => Effect.void
  })
  const cli = await Effect.runPromise(resolveCliConfiguration(store, {}, undefined, true, selector))
  const stdio = await Effect.runPromise(resolveStdioProfile({ HULY_PROFILE: name }, store, selector))
  expect(cli).toEqual(stdio)
  expect(destinations).toEqual([
    "native-ready:https://native.example:shared",
    "native-ready:https://native.example:shared"
  ])
  expect(await Effect.runPromise(store.readCredentials())).toEqual({ version: 1, tokens: {} })
})

it("removes an unbound legacy token without requiring migration", async () => {
  const store = await temporaryStore()
  const name = await profileName("legacy")
  await Effect.runPromise(
    store.writeProfiles({
      version: 1,
      activeProfile: name,
      profiles: { [name]: { url: "https://legacy.example", workspace: "old" } }
    })
  )
  await Effect.runPromise(store.writeCredentials({ version: 1, tokens: { [name]: storedToken("legacy-secret") } }))
  await Effect.runPromise(logoutProfile(store))
  expect((await Effect.runPromise(store.readCredentials())).tokens).toEqual({})
})

it("rejects URLs with embedded credentials without exposing them", async () => {
  const store = await temporaryStore()
  const exit = await Effect.runPromiseExit(
    resolveCliConfiguration(store, {
      HULY_URL: "https://user:private-password@huly.example",
      HULY_TOKEN: "private-token"
    })
  )
  expect(exit.toString()).toContain("Invalid resolved Huly CLI configuration")
  expect(exit.toString()).not.toContain("private-password")
  expect(exit.toString()).not.toContain("private-token")
})

it("uses complete ephemeral password credentials for explicitly selected stdio profiles", async () => {
  const store = await temporaryStore()
  const name = await profileName("password-env")
  await Effect.runPromise(
    store.writeProfiles({ version: 1, profiles: { [name]: { url: "https://old.example", workspace: "old" } } })
  )
  const resolved = await Effect.runPromise(
    resolveStdioProfile(
      {
        HULY_PROFILE: name,
        HULY_URL: "https://new.example",
        HULY_WORKSPACE: "new",
        HULY_EMAIL: "user@example.com",
        HULY_PASSWORD: "ephemeral-password"
      },
      store
    )
  )
  expect(resolved.auth.method).toBe("password")
  expect(resolved.workspace).toBe("new")
  expect(await Effect.runPromise(store.readCredentials())).toEqual({ version: 1, tokens: {} })
})
