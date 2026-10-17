import { join } from "node:path"
import { ConfigProvider, Effect, Redacted, Schema } from "effect"
import { expect, it } from "vitest"

import { HulyConfigService } from "../../src/config/config.js"
import { cliProfilePaths, makeCliProfileStore } from "../../src/profiles/file-store.js"
import { CliCredentialsFileSchema, CliProfilesFileSchema } from "../../src/profiles/model.js"
import { captureResidentSelection } from "../../src/resident/selection-config.js"
import { resolveProcessConfiguration } from "../../src/runtime/process-configuration.js"
import { withRegistryDirectory } from "../helpers/resident-registry-fixture.js"

const environment = {
  HULY_URL: "https://process.invalid",
  HULY_WORKSPACE: "process",
  HULY_TOKEN: "process-fixture-token",
  LAZY_ENVS: "true"
}
const provideEnvironment = ConfigProvider.layer(ConfigProvider.fromUnknown(environment))

it.skipIf(process.platform !== "linux")("reads a Linux XDG stdio profile through the default startup store", async () =>
  withRegistryDirectory(async (directory) => {
    const input = { XDG_CONFIG_HOME: directory, HULY_PROFILE: "xdg-selected", LAZY_ENVS: "true" }
    const store = makeCliProfileStore(cliProfilePaths("linux", input, directory))
    const destination = { url: "https://xdg-profile.invalid", workspace: "xdg-profile" }
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* store.writeProfiles(
          Schema.decodeUnknownSync(CliProfilesFileSchema)({ version: 1, profiles: { "xdg-selected": destination } })
        )
        yield* store.writeCredentials(
          Schema.decodeUnknownSync(CliCredentialsFileSchema)({
            version: 1,
            tokens: { "xdg-selected": "xdg-profile-private-token" },
            destinations: { "xdg-selected": destination }
          })
        )
        const selected = yield* resolveProcessConfiguration("stdio", input, undefined)
        const config = yield* HulyConfigService.pipe(Effect.provide(selected.configLayer))
        expect(config.workspace).toBe("xdg-profile")
        expect(selected.authMethod).toBe("token")
        expect(selected.runtimeConfigContext().auth.source).toBe("profile")
        expect(JSON.stringify(selected.runtimeConfigContext())).not.toContain("xdg-profile-private-token")
      }).pipe(Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(input))))
    )
  })
)

it("uses captured authority and context even when ambient profile and credentials differ", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const captured = yield* captureResidentSelection(environment)
      const selected = yield* resolveProcessConfiguration(
        "stdio",
        { HULY_PROFILE: "missing", HULY_TOKEN: "other" },
        captured
      )
      const config = yield* HulyConfigService.pipe(Effect.provide(selected.configLayer))
      expect(config.workspace).toBe("process")
      expect(selected.lazyEnvs).toBe(true)
      expect(selected.runtimeConfigContext()).toBe(captured.runtimeContext)
    }).pipe(Effect.provide(provideEnvironment))
  )
})

it("preserves lazy environment configuration for both token and password authentication", async () => {
  for (const auth of [
    { HULY_TOKEN: "process-fixture-token" },
    { HULY_EMAIL: "fixture-email", HULY_PASSWORD: "private-fixture-password" }
  ]) {
    const input = {
      HULY_URL: environment.HULY_URL,
      HULY_WORKSPACE: environment.HULY_WORKSPACE,
      LAZY_ENVS: "true",
      ...auth
    }
    await Effect.runPromise(
      Effect.gen(function* () {
        const selected = yield* resolveProcessConfiguration("stdio", input, undefined)
        const config = yield* HulyConfigService.pipe(Effect.provide(selected.configLayer))
        expect(selected.authMethod).toBe(config.auth._tag)
        expect(selected.runtimeConfigContext().auth.source).toBe("env")
        expect(JSON.stringify(selected.runtimeConfigContext())).not.toContain("private-fixture-password")
      }).pipe(Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(input))))
    )
  }
})

it("resolves a saved stdio profile, preserves provenance, and refuses a missing explicit profile", async () =>
  withRegistryDirectory(async (directory) => {
    const store = makeCliProfileStore({
      directory,
      profiles: join(directory, "profiles.json"),
      credentials: join(directory, "credentials.json")
    })
    const destination = { url: "https://profile.invalid", workspace: "profile" }
    await Effect.runPromise(
      store.writeProfiles(
        Schema.decodeUnknownSync(CliProfilesFileSchema)({ version: 1, profiles: { selected: destination } })
      )
    )
    await Effect.runPromise(
      store.writeCredentials(
        Schema.decodeUnknownSync(CliCredentialsFileSchema)({
          version: 1,
          tokens: { selected: "profile-private-token" },
          destinations: { selected: destination }
        })
      )
    )
    await Effect.runPromise(
      Effect.gen(function* () {
        const selected = yield* resolveProcessConfiguration("stdio", { HULY_PROFILE: "selected" }, undefined, store)
        const config = yield* HulyConfigService.pipe(Effect.provide(selected.configLayer))
        expect(config.workspace).toBe("profile")
        expect(selected.runtimeConfigContext().auth.source).toBe("profile")
        if (config.auth._tag === "token") expect(Redacted.value(config.auth.token)).toBe("profile-private-token")
        expect(selected.authMethod).toBe("token")
        const error = yield* resolveProcessConfiguration("stdio", { HULY_PROFILE: "missing" }, undefined, store).pipe(
          Effect.flip
        )
        expect(error._tag).toBe("CliProfileStoreError")
        const http = yield* resolveProcessConfiguration(
          "http",
          { ...environment, HULY_PROFILE: "missing" },
          undefined,
          store
        )
        expect(http.runtimeConfigContext().auth.source).toBe("env")
      }).pipe(Effect.provide(provideEnvironment))
    )
  }))
