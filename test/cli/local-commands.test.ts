import * as fs from "node:fs/promises"
import * as path from "node:path"

import { NodeServices } from "@effect/platform-node"
import { Effect, Layer, Redacted, Schema } from "effect"
import { TestConsole } from "effect/testing"
import { Command } from "effect/unstable/cli"
import { afterEach, describe, expect, it } from "vitest"

import { buildRootCommand } from "../../packages/huly-cli/src/command-tree.js"
import { LocalCliService, type LocalCliPorts } from "../../packages/huly-cli/src/local-commands.js"
import { CliAuthStatusSchema } from "../../packages/huly-cli/src/profile-operations.js"
import { cliProfilePaths, makeCliProfileStore } from "../../packages/huly-cli/src/profile-store.js"
import { TelemetryService } from "../../src/telemetry/telemetry.js"

const temporaryDirectories: Array<string> = []

const makePorts = async (): Promise<LocalCliPorts> => {
  const directory = await fs.mkdtemp(path.join(process.cwd(), ".local-cli-test-"))
  temporaryDirectories.push(directory)
  return {
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
