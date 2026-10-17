import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect, Redacted, Schema } from "effect"
import { expect, it } from "vitest"

import { makeCliProfileStore } from "../../src/profiles/file-store.js"
import { CliCredentialsFileSchema, CliProfilesFileSchema } from "../../src/profiles/model.js"
import { captureManualResidentSelection, captureResidentSelection } from "../../src/resident/selection-config.js"

const environment = {
  HULY_URL: "https://env.huly.invalid",
  HULY_WORKSPACE: "environment",
  HULY_TOKEN: "fixture-env-token"
}

it("captures effective token identity and normalized policy without retaining mutable environment state", async () => {
  const input = { ...environment, TOOLSETS: "Issues, projects,issues", HULY_TOOL_MODE: "native", GLAMA_VERSION: "" }
  const { runtimeContext, selection } = await Effect.runPromise(captureResidentSelection(input))
  input.HULY_TOKEN = "rotated-fixture-token"
  input.HULY_WORKSPACE = "replacement"
  input.TOOLSETS = "documents"
  expect(selection.huly.workspace).toBe("environment")
  expect(selection.huly.auth._tag).toBe("token")
  if (selection.huly.auth._tag === "token") expect(Redacted.value(selection.huly.auth.token)).toBe("fixture-env-token")
  expect(selection.policy.toolsets).toEqual(["issues", "projects"])
  expect(selection.policy.exposure.configuredMode).toBe("native")
  expect(selection.lazyEnvs).toBe(true)
  expect(JSON.stringify(runtimeContext)).not.toContain("fixture-env-token")
})

it("uses the config parser's password fallback instead of inferring authentication from token presence", async () => {
  const { runtimeContext, selection } = await Effect.runPromise(
    captureResidentSelection({
      ...environment,
      HULY_TOKEN: " ",
      HULY_EMAIL: "person",
      HULY_PASSWORD: " password ",
      HULY_CONNECTION_TIMEOUT: "2500",
      LAZY_ENVS: "false",
      GLAMA_VERSION: "fixture"
    })
  )
  expect(selection.huly.auth._tag).toBe("password")
  expect(runtimeContext.auth.method).toBe("password")
  if (selection.huly.auth._tag === "password") expect(Redacted.value(selection.huly.auth.password)).toBe(" password ")
  expect(selection.huly.connectionTimeout).toBe(2500)
  expect(selection.lazyEnvs).toBe(false)
})

it("resolves an explicitly selected profile once and keeps captured authority after rotation or logout", async () => {
  const directory = await fs.mkdtemp(join(await fs.realpath(tmpdir()), "resident-profile-"))
  const store = makeCliProfileStore({
    directory,
    profiles: join(directory, "profiles.json"),
    credentials: join(directory, "credentials.json")
  })
  const destination = { url: "https://profile.huly.invalid", workspace: "selected" }
  const writeToken = (token: string | undefined) =>
    Effect.runPromise(
      store.writeCredentials(
        Schema.decodeUnknownSync(CliCredentialsFileSchema)({
          version: 1,
          tokens: token === undefined ? {} : { selected: token },
          destinations: { selected: destination }
        })
      )
    )
  try {
    await Effect.runPromise(
      store.writeProfiles(
        Schema.decodeUnknownSync(CliProfilesFileSchema)({
          version: 1,
          activeProfile: "other",
          profiles: { selected: destination, other: { url: "https://other.invalid", workspace: "other" } }
        })
      )
    )
    await writeToken("first-profile-token")
    const first = await Effect.runPromise(captureResidentSelection({ HULY_PROFILE: "selected" }, store))
    expect(first.selection.huly.workspace).toBe("selected")
    expect(first.runtimeContext.auth.source).toBe("profile")
    await writeToken("second-profile-token")
    const second = await Effect.runPromise(captureResidentSelection({ HULY_PROFILE: "selected" }, store))
    if (first.selection.huly.auth._tag !== "token" || second.selection.huly.auth._tag !== "token")
      throw new Error("Expected profile tokens")
    expect(Redacted.value(first.selection.huly.auth.token)).toBe("first-profile-token")
    expect(Redacted.value(second.selection.huly.auth.token)).toBe("second-profile-token")
    await writeToken(undefined)
    await expect(Effect.runPromise(captureResidentSelection({ HULY_PROFILE: "selected" }, store))).rejects.toThrow(
      "no usable credentials"
    )
    expect(Redacted.value(first.selection.huly.auth.token)).toBe("first-profile-token")
    await expect(Effect.runPromise(captureResidentSelection({ HULY_PROFILE: "missing" }, store))).rejects.toThrow(
      "does not exist"
    )
    const independent = await Effect.runPromise(captureResidentSelection(environment, store))
    expect(independent.selection.huly.workspace).toBe("environment")
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

it("keeps descriptor-only mode explicit and refuses incomplete selected authority or restricted policy", async () => {
  expect(await Effect.runPromise(captureManualResidentSelection({ LAZY_ENVS: "true" }))).toBeUndefined()
  expect(await Effect.runPromise(captureManualResidentSelection({ HULY_TOOL_MODE: "auto" }))).toBeUndefined()
  const captured = await Effect.runPromise(captureManualResidentSelection(environment))
  expect(captured?.selection.huly.workspace).toBe("environment")
  for (const input of [
    { HULY_PROFILE: "missing", XDG_CONFIG_HOME: "/nonexistent-resident-profile-fixture" },
    { HULY_URL: "https://selected.invalid" },
    { TOOLS: "get_huly_context" },
    { TOOLSETS: "issues" },
    { HULY_TOOL_MODE: "native" },
    { PROXY_OUTPUT_STRICT: "true" },
    { HULY_TOOL_MODE: "invalid" }
  ]) {
    expect((await Effect.runPromiseExit(captureManualResidentSelection(input)))._tag).toBe("Failure")
  }
})
