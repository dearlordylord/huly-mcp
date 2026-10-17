import { Effect, Exit } from "effect"
import { expect, it } from "vitest"

import { resolveManagedStartup } from "../../src/resident/startup-selection.js"
import { ProfileEnvironmentSchema } from "../../src/profiles/model.js"
import { makeCliProfileStore } from "../../src/profiles/file-store.js"
import { withRegistryDirectory } from "../helpers/resident-registry-fixture.js"
import { join } from "node:path"

it("chooses local lazy discovery only when no Huly authority was selected", async () => {
  expect(await Effect.runPromise(resolveManagedStartup({ LAZY_ENVS: "true" }))).toEqual({ kind: "local" })
  expect(await Effect.runPromise(resolveManagedStartup({ GLAMA_VERSION: "fixture" }))).toEqual({ kind: "local" })
  expect(
    Exit.isFailure(await Effect.runPromiseExit(resolveManagedStartup({ LAZY_ENVS: "false", GLAMA_VERSION: "fixture" })))
  ).toBe(true)
  expect(Exit.isFailure(await Effect.runPromiseExit(resolveManagedStartup({})))).toBe(true)
})

it("never interprets partial or invalid explicit authority as an absent configuration", async () => {
  for (const key of Object.keys(ProfileEnvironmentSchema.fields).filter((key) => key !== "HULY_PROFILE")) {
    const result = await Effect.runPromiseExit(
      resolveManagedStartup({ LAZY_ENVS: "true", [key]: "invalid-fixture-value" })
    )
    expect(Exit.isFailure(result)).toBe(true)
  }
})

it("captures configured lazy authority without replacing it with local discovery", async () => {
  const environment = {
    HULY_URL: "https://selected.invalid",
    HULY_WORKSPACE: "selected",
    HULY_TOKEN: "fixture-token",
    LAZY_ENVS: "true"
  }
  const selected = await Effect.runPromise(resolveManagedStartup(environment))
  environment.HULY_WORKSPACE = "replaced"
  expect(selected.kind).toBe("resident")
  if (selected.kind === "resident") {
    expect(selected.capture.selection.huly.workspace).toBe("selected")
    expect(selected.capture.selection.lazyEnvs).toBe(true)
  }
})

it("preserves an invalid explicit profile failure even with valid environment credentials and lazy startup", async () =>
  withRegistryDirectory(async (directory) => {
    const store = makeCliProfileStore({
      directory,
      profiles: join(directory, "profiles.json"),
      credentials: join(directory, "credentials.json")
    })
    const result = await Effect.runPromiseExit(
      resolveManagedStartup(
        {
          HULY_PROFILE: "missing",
          LAZY_ENVS: "true",
          HULY_URL: "https://fallback.invalid",
          HULY_WORKSPACE: "fallback",
          HULY_TOKEN: "fixture-fallback-token"
        },
        store
      )
    )
    expect(Exit.isFailure(result)).toBe(true)
  }))
