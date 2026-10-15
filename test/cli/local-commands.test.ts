import * as fs from "node:fs/promises"
import * as path from "node:path"

import { NodeServices } from "@effect/platform-node"
import { Effect, Layer, Redacted, Schema } from "effect"
import { TestConsole } from "effect/testing"
import { Command } from "effect/cli"
import { afterEach, describe, expect, it } from "vitest"

import { buildRootCommand } from "../../packages/huly-cli/src/command-tree.js"
import { LocalCliService, type LocalCliPorts } from "../../packages/huly-cli/src/local-commands.js"
import { CliRuntimeError } from "../../packages/huly-cli/src/render.js"
import { CliAuthStatusSchema } from "../../packages/huly-cli/src/profile-operations.js"
import { cliProfilePaths, makeCliProfileStore } from "../../packages/huly-cli/src/profile-store.js"
import { TelemetryService } from "../../src/telemetry/telemetry.js"

const temporaryDirectories: Array<string> = []

const makePorts = async (): Promise<LocalCliPorts> => {
  const directory = await fs.mkdtemp(path.join(process.cwd(), ".local-cli-test-"))
  temporaryDirectories.push(directory)
  return {
    promptSecret: () => Effect.succeed(Redacted.make("never-store-this")),
    platform: "linux",
    checkConnection: () => Effect.void,
    readTokenStdin: () => Effect.succeed(Redacted.make("stdin-token")),
    authenticate: (request) => {
      expect(request.email).toBe("agent@example.com")
      expect(Redacted.value(request.password)).toBe("never-store-this")
      return Effect.succeed(Redacted.make("workspace-token"))
    },
    environment: {},
    prompt: (label) =>
      Effect.succeed(
        label === "Huly email" ? "agent@example.com" : label === "Huly password" ? "never-store-this" : ""
      ),
    store: makeCliProfileStore(cliProfilePaths("linux", { XDG_CONFIG_HOME: directory }, directory))
  }
}

const run = async (ports: LocalCliPorts, argv: ReadonlyArray<string>): Promise<ReadonlyArray<string>> => {
  return Effect.runPromise(
    Effect.gen(function* () {
      yield* Command.runWith(buildRootCommand(argv), { version: "test", renderErrors: false })(argv).pipe(
        Effect.provide(
          Layer.mergeAll(NodeServices.layer, TelemetryService.testLayer(), Layer.succeed(LocalCliService, ports))
        )
      )
      return (yield* TestConsole.logLines).map(String)
    }).pipe(Effect.provide(TestConsole.layer))
  )
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { force: true, recursive: true }))
  )
})

describe("Effect CLI local commands", () => {
  it("refuses import without an existing selected profile", async () => {
    const ports = await makePorts()
    await expect(run(ports, ["auth", "import-token", "--stdin"])).rejects.toThrow("Create and select")
    await expect(run(ports, ["auth", "import-token", "--profile", "missing", "--stdin"])).rejects.toThrow(
      "does not exist"
    )
  })

  it("checks complete environment credentials without creating a saved profile", async () => {
    const ports = await makePorts()
    const output = await run(
      {
        ...ports,
        environment: { HULY_URL: "https://huly.example", HULY_WORKSPACE: "work", HULY_TOKEN: "environment-sentinel" }
      },
      ["auth", "check", "--json"]
    )
    expect(JSON.parse(output.join("\n"))).toEqual({ verified: true })
  })

  it("creates, updates, selects, and lists named profiles", async () => {
    const ports = await makePorts()

    await run(ports, [
      "profile",
      "create",
      "work",
      "--url",
      "https://huly.example",
      "--workspace",
      "main",
      "--default-project",
      "HULY"
    ])
    await run(ports, ["profile", "update", "work", "--default-project", "CLI"])
    await run(ports, ["profile", "select", "work"])
    const listed = await run(ports, ["profile", "list", "--json"])

    expect(JSON.parse(listed.join("\n"))).toEqual([
      {
        name: "work",
        active: true,
        credentialStorage: "file",
        configured: false,
        verified: false,
        authenticated: false,
        url: "https://huly.example",
        workspace: "main",
        defaultProject: "CLI"
      }
    ])
  })

  it("logs in, reports sanitized status, and logs out without storing the password", async () => {
    const ports = await makePorts()
    await run(ports, [
      "profile",
      "create",
      "work",
      "--url",
      "https://huly.example",
      "--workspace",
      "main",
      "--default-project",
      "HULY"
    ])

    await run(ports, ["auth", "login", "--profile", "work"])
    const status = JSON.parse((await run(ports, ["auth", "status", "--json"])).join("\n"))
    const credentialText = await fs.readFile(ports.store.paths.credentials, "utf8")

    expect(status).toMatchObject({ authenticated: true, authMethod: "token", profile: "work" })
    expect(JSON.stringify(status)).not.toContain("workspace-token")
    expect(credentialText).toContain("workspace-token")
    expect(credentialText).not.toContain("never-store-this")

    await run(ports, ["auth", "logout", "--profile", "work"])
    const loggedOut = JSON.parse((await run(ports, ["auth", "status", "--json"])).join("\n"))
    expect(loggedOut).toMatchObject({ authenticated: false, authMethod: "none", profile: "work" })
  })

  it("prompts for a new login profile and uses the active profile for logout", async () => {
    const base = await makePorts()
    const ports: LocalCliPorts = {
      ...base,
      prompt: (label) =>
        Effect.succeed(
          label === "Huly URL"
            ? "https://prompted.example"
            : label === "Huly workspace"
              ? "prompted-workspace"
              : label === "Huly email"
                ? "agent@example.com"
                : "never-store-this"
        )
    }

    expect(JSON.parse((await run(ports, ["auth", "login", "--json"])).join("\n"))).toBe(
      "Logged in to Huly profile 'default'."
    )
    const profiles = await Effect.runPromise(ports.store.readProfiles())
    expect(Object.values(profiles.profiles)).toEqual([
      { url: "https://prompted.example", workspace: "prompted-workspace" }
    ])

    await run(ports, ["auth", "logout"])
    expect((await Effect.runPromise(ports.store.readCredentials())).tokens).toEqual({})
  })

  it("updates every profile field and can clear the default project", async () => {
    const ports = await makePorts()
    await run(ports, [
      "profile",
      "create",
      "work",
      "--url",
      "https://old.example",
      "--workspace",
      "old",
      "--default-project",
      "OLD"
    ])
    await run(ports, ["profile", "update", "work", "--url", "https://intermediate.example"])
    expect(Object.values((await Effect.runPromise(ports.store.readProfiles())).profiles)[0]?.defaultProject).toBe("OLD")
    await run(ports, [
      "profile",
      "update",
      "work",
      "--url",
      "https://new.example",
      "--workspace",
      "new",
      "--clear-default-project"
    ])

    expect(Object.values((await Effect.runPromise(ports.store.readProfiles())).profiles)).toEqual([
      { url: "https://new.example", workspace: "new" }
    ])
  })

  it("reports empty lists and rejects invalid local operations", async () => {
    const ports = await makePorts()

    expect(await run(ports, ["profile", "list"])).toEqual(["No Huly CLI profiles."])
    expect(await run(ports, ["profile", "list", "--json"])).toEqual(["[]"])
    await expect(run(ports, ["auth", "logout"])).rejects.toThrow("No active")
    await expect(
      run(ports, ["profile", "create", "bad/name", "--url", "https://valid.example", "--workspace", "ws"])
    ).rejects.toThrow("Profile names")
    await expect(
      run(ports, ["profile", "create", "invalid", "--url", "ftp://invalid.example", "--workspace", "ws"])
    ).rejects.toThrow("Invalid profile values")
    await run(ports, ["profile", "create", "duplicate", "--url", "https://valid.example", "--workspace", "ws"])
    await run(ports, ["profile", "update", "duplicate", "--url", "https://updated.example"])
    await expect(run(ports, ["profile", "update", "duplicate", "--url", "ftp://invalid.example"])).rejects.toThrow(
      "Invalid profile update values"
    )
    await expect(run(ports, ["profile", "update", "duplicate", "--workspace", ""])).rejects.toThrow(
      "Invalid profile update values"
    )
    await expect(
      run(ports, ["profile", "create", "duplicate", "--url", "https://valid.example", "--workspace", "ws"])
    ).rejects.toThrow("already exists")
    await expect(run(ports, ["profile", "select", "missing"])).rejects.toThrow("does not exist")
    await expect(run(ports, ["profile", "update", "missing", "--url", "https://new.example"])).rejects.toThrow(
      "does not exist"
    )
    await expect(run(ports, ["profile", "update", "missing"])).rejects.toThrow("has no changes")
  })

  it("rejects invalid prompted login values before authentication", async () => {
    const base = await makePorts()
    const invalidProfilePorts: LocalCliPorts = {
      ...base,
      prompt: (label) => Effect.succeed(label === "Huly URL" ? "not-a-url" : "value")
    }
    await expect(run(invalidProfilePorts, ["auth", "login"])).rejects.toThrow("URL or workspace is invalid")

    await run(base, ["profile", "create", "work", "--url", "https://valid.example", "--workspace", "ws"])
    const emptyEmailPorts: LocalCliPorts = {
      ...base,
      prompt: (label) => Effect.succeed(label === "Huly email" ? "" : "never-store-this")
    }
    await expect(run(emptyEmailPorts, ["auth", "login", "--profile", "work"])).rejects.toThrow(
      "Email or password is empty"
    )
  })

  it("reports password authentication without exposing secrets", async () => {
    const base = await makePorts()
    const ports: LocalCliPorts = { ...base, environment: { HULY_EMAIL: "agent@example.com", HULY_PASSWORD: "secret" } }
    const status = (await run(ports, ["auth", "status"])).join("\n")

    expect(status).toContain('"authMethod": "password"')
    expect(status).not.toContain("secret")
  })

  it("does not report incomplete password authentication as authenticated", async () => {
    const base = await makePorts()
    const ports: LocalCliPorts = { ...base, environment: { HULY_EMAIL: "agent@example.com" } }
    const status = JSON.parse((await run(ports, ["auth", "status", "--json"])).join("\n"))

    expect(status).toMatchObject({ authenticated: false, authMethod: "none" })
  })

  it("rejects contradictory authentication status payloads", async () => {
    const exit = await Effect.runPromiseExit(
      Schema.decodeUnknownEffect(CliAuthStatusSchema)({
        authenticated: false,
        authMethod: "token",
        sources: { url: "missing", workspace: "missing", authentication: "missing" }
      })
    )

    expect(exit.toString()).toContain("authMethod")
  })
})

it("reports a selected logged-out profile without prompting", async () => {
  const ports = await makePorts()
  await run(ports, ["profile", "create", "logged-out", "--url", "https://huly.example", "--workspace", "main"])
  const output = await run(ports, ["auth", "status", "--profile", "logged-out", "--json"])
  expect(JSON.parse(output.join("\n"))).toMatchObject({
    profile: "logged-out",
    authenticated: false,
    authMethod: "none"
  })
})

it("imports a token through explicit stdin, verifies before saving, and checks without exposing secrets", async () => {
  const base = await makePorts()
  const events: Array<string> = []
  const ports: LocalCliPorts = {
    ...base,
    prompt: () => Effect.die("explicit stdin must not prompt"),
    readTokenStdin: () => Effect.succeed(Redacted.make("private-import-sentinel")),
    checkConnection: (configuration) =>
      Effect.sync(() => {
        expect(configuration.auth.method).toBe("token")
        if (configuration.auth.method === "token")
          expect(Redacted.value(configuration.auth.token)).toBe("private-import-sentinel")
        events.push("checked")
      })
  }
  await run(ports, ["profile", "create", "work", "--url", "https://huly.example", "--workspace", "main"])
  const imported = await run(ports, ["auth", "import-token", "--stdin", "--profile", "work", "--json"])
  const checked = await run(ports, ["auth", "check", "--json"])
  expect(checked.join("\n")).toContain('"verified": true')
  expect([...imported, ...checked].join("\n")).not.toContain("private-import-sentinel")
  expect(events).toEqual(["checked", "checked"])
  const offline = await run(ports, ["auth", "status", "--json"])
  expect(offline.join("\n")).toContain('"verified": false')
  expect(events).toHaveLength(2)
})

it("uses hidden token input and preserves a working token after failed verification", async () => {
  const base = await makePorts()
  const ports: LocalCliPorts = {
    ...base,
    promptSecret: (label) =>
      Effect.sync(() => {
        expect(label).toBe("Huly token")
        return Redacted.make("hidden-token-sentinel")
      })
  }
  await run(ports, ["profile", "create", "work", "--url", "https://huly.example", "--workspace", "main"])
  await run(ports, ["auth", "import-token"])
  const before = await fs.readFile(ports.store.paths.credentials, "utf8")
  await expect(
    run(
      {
        ...ports,
        checkConnection: () =>
          Effect.fail(new CliRuntimeError({ kind: "authentication", message: "Rejected.", retryable: false }))
      },
      ["auth", "import-token"]
    )
  ).rejects.toThrow("Rejected")
  expect(await fs.readFile(ports.store.paths.credentials, "utf8")).toBe(before)
})
