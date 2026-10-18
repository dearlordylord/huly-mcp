import { homedir } from "node:os"
import { join } from "node:path"
import { ConfigProvider, Effect, Exit } from "effect"
import { expect, it } from "vitest"

import { readManagedDirectory } from "../../src/resident/managed-directory-config.js"

it("uses persistent Linux application state and honors an absolute XDG state base", async () => {
  for (const state of [undefined, "", "relative", "/custom/state"]) {
    const provider = ConfigProvider.fromUnknown({ HOME: "/users/fixture", XDG_STATE_HOME: state })
    const result = await Effect.runPromise(
      readManagedDirectory("linux").pipe(Effect.provide(ConfigProvider.layer(provider)))
    )
    expect(result).toBe(join(state === "/custom/state" ? state : "/users/fixture/.local/state", "huly-mcp", "resident"))
  }
})

it("uses macOS Application Support without consulting Linux state configuration", async () => {
  const result = await Effect.runPromise(
    readManagedDirectory("darwin").pipe(
      Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ HOME: "/Users/fixture", XDG_STATE_HOME: 42 })))
    )
  )
  expect(result).toBe("/Users/fixture/Library/Application Support/huly-mcp/resident")
})

it("uses the OS home when HOME is absent", async () => {
  const result = await Effect.runPromise(
    readManagedDirectory("linux").pipe(Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({}))))
  )
  expect(result).toBe(join(homedir(), ".local", "state", "huly-mcp", "resident"))
})

it("preserves explicit namespaces without consulting default location configuration", async () => {
  const result = await Effect.runPromise(
    readManagedDirectory("linux").pipe(
      Effect.provide(
        ConfigProvider.layer(ConfigProvider.fromUnknown({ MCP_RESIDENT_STATE_DIRECTORY: "explicit-state", HOME: 42 }))
      )
    )
  )
  expect(result).toBe("explicit-state")
})

it("rejects an explicit empty directory and a relative home when supplied by the config provider", async () => {
  for (const config of [{ MCP_RESIDENT_STATE_DIRECTORY: "" }, { HOME: "relative" }]) {
    const result = await Effect.runPromise(
      readManagedDirectory("linux").pipe(
        Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(config, { preserveEmptyStrings: true }))),
        Effect.exit
      )
    )
    expect(Exit.isFailure(result), JSON.stringify(config)).toBe(true)
  }
})
