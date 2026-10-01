import * as os from "node:os"
import { cliProfilePaths } from "../../src/profiles/file-store.js"
import { Config, ConfigProvider, Effect, Layer, Option, Redacted } from "effect"
import { describe, expect, it } from "vitest"

import { resolvedConfigProvider } from "../../src/profiles/config-provider.js"
import { profileRuntimeContext } from "../../src/profiles/runtime-context.js"
import { defaultProfileStore } from "../../src/profiles/stdio.js"
import { HulyConfigService } from "../../src/config/config.js"

const destination = { url: "https://huly.example", workspace: "work" }

describe("shared profile runtime adapters", () => {
  it("reports saved-token authentication without exposing the secret", () => {
    const context = profileRuntimeContext(
      { ...destination, auth: { method: "token", token: Redacted.make("private-token") } },
      {}
    )
    expect(context.huly.workspace.value).toBe("work")
    expect(context.auth.source).toBe("profile")
    expect(context.configSources.env.hulyToken).toBe(false)
    expect(JSON.stringify(context)).not.toContain("private-token")
  })

  it("retains environment source for injected credentials and handles absent destinations", () => {
    const context = profileRuntimeContext(
      { auth: { method: "none" } },
      { HULY_EMAIL: "user", HULY_PASSWORD: "private-password" }
    )
    expect(context.auth.source).toBe("env")
    expect(JSON.stringify(context)).not.toContain("private-password")
  })

  it("constructs the default file adapter without reading credentials", async () => {
    const store = await Effect.runPromise(defaultProfileStore({ XDG_CONFIG_HOME: "/tmp/profile-adapter-check" }))
    expect(store.paths).toEqual(
      cliProfilePaths(process.platform, { XDG_CONFIG_HOME: "/tmp/profile-adapter-check" }, os.homedir())
    )
  })

  it("supplies resolved token configuration to the existing Huly config layer", async () => {
    const provider = resolvedConfigProvider({
      ...destination,
      auth: { method: "token", token: Redacted.make("private-token") },
      connectionTimeout: "5000"
    })
    const config = await Effect.runPromise(
      HulyConfigService.pipe(
        Effect.provide(HulyConfigService.layer.pipe(Layer.provide(ConfigProvider.layer(provider))))
      )
    )
    expect(config.workspace).toBe("work")
    expect(config.auth._tag).toBe("token")
  })

  it("supplies password configuration through the same adapter", async () => {
    const provider = resolvedConfigProvider({
      ...destination,
      auth: {
        method: "password",
        credentialState: "complete",
        email: "user@example.com",
        password: Redacted.make("password")
      }
    })
    const config = await Effect.runPromise(
      HulyConfigService.pipe(
        Effect.provide(HulyConfigService.layer.pipe(Layer.provide(ConfigProvider.layer(provider))))
      )
    )
    expect(config.auth._tag).toBe("password")
  })
})

it("preserves partial password credentials for downstream diagnostics", async () => {
  const emailProvider = resolvedConfigProvider({
    auth: { method: "password", credentialState: "email-only", email: "user@example.com" }
  })
  const emailConfig = await Effect.runPromise(
    Config.all({
      email: Config.String("HULY_EMAIL"),
      password: Config.String("HULY_PASSWORD").pipe(Config.option),
      url: Config.String("HULY_URL").pipe(Config.option)
    }).pipe(Effect.provide(ConfigProvider.layer(emailProvider)))
  )
  expect(emailConfig.email).toBe("user@example.com")
  expect(Option.isNone(emailConfig.password)).toBe(true)
  expect(Option.isNone(emailConfig.url)).toBe(true)
  const passwordProvider = resolvedConfigProvider({
    auth: { method: "password", credentialState: "password-only", password: Redacted.make("private-password") }
  })
  const passwordConfig = await Effect.runPromise(
    Config.all({
      email: Config.String("HULY_EMAIL").pipe(Config.option),
      password: Config.Redacted("HULY_PASSWORD")
    }).pipe(Effect.provide(ConfigProvider.layer(passwordProvider)))
  )
  expect(Option.isNone(passwordConfig.email)).toBe(true)
  expect(Redacted.value(passwordConfig.password)).toBe("private-password")
})

it("passes missing authentication to the existing config diagnostics", async () => {
  const provider = resolvedConfigProvider({ auth: { method: "none" } })
  const config = await Effect.runPromise(
    Config.String("HULY_TOKEN").pipe(Config.option, Effect.provide(ConfigProvider.layer(provider)))
  )
  expect(Option.isNone(config)).toBe(true)
})
