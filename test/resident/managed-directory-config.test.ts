import * as fs from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { ConfigProvider, Effect, Exit } from "effect"
import { expect, it } from "vitest"

import { readManagedDirectory } from "../../src/resident/managed-directory-config.js"
import { ResidentDirectory } from "../../src/resident/protected-path.js"

const withDirectory = async (use: (directory: ResidentDirectory) => Promise<void>) => {
  const directory = ResidentDirectory.make(await fs.mkdtemp(join(tmpdir(), "resident-directory-config-")))
  try {
    await use(directory)
  } finally {
    await fs.rm(directory, { recursive: true })
  }
}

it("uses persistent Linux application state and honors an absolute XDG state base", async () =>
  withDirectory(async (directory) => {
    for (const state of [undefined, "", "relative", "/custom/state"]) {
      const provider = ConfigProvider.fromUnknown({ HOME: "/users/fixture", XDG_STATE_HOME: state })
      const result = await Effect.runPromise(
        readManagedDirectory("linux", directory).pipe(Effect.provide(ConfigProvider.layer(provider)))
      )
      expect(result).toBe(
        join(state === "/custom/state" ? state : "/users/fixture/.local/state", "huly-mcp", "resident")
      )
    }
    expect(await fs.readdir(directory)).toEqual([])
  }))

it("uses macOS Application Support without consulting Linux state configuration", async () =>
  withDirectory(async (directory) => {
    const result = await Effect.runPromise(
      readManagedDirectory("darwin", directory).pipe(
        Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ HOME: "/Users/fixture", XDG_STATE_HOME: 42 })))
      )
    )
    expect(result).toBe("/Users/fixture/Library/Application Support/huly-mcp/resident")
  }))

it("uses the OS home when HOME is absent and the legacy namespace does not exist", async () =>
  withDirectory(async (directory) => {
    const result = await Effect.runPromise(
      readManagedDirectory("linux", ResidentDirectory.make(join(directory, "absent"))).pipe(
        Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({})))
      )
    )
    expect(result).toBe(join(homedir(), ".local", "state", "huly-mcp", "resident"))
  }))

it("preserves explicit namespaces without consulting or altering legacy state", async () =>
  withDirectory(async (directory) => {
    const file = join(directory, "old-record")
    await fs.writeFile(file, "owned legacy evidence")
    const result = await Effect.runPromise(
      readManagedDirectory("linux", directory).pipe(
        Effect.provide(
          ConfigProvider.layer(ConfigProvider.fromUnknown({ MCP_RESIDENT_STATE_DIRECTORY: "explicit-state", HOME: 42 }))
        )
      )
    )
    expect(result).toBe("explicit-state")
    expect(await fs.readFile(file, "utf8")).toBe("owned legacy evidence")
  }))

it("refuses an occupied legacy namespace with a useful retirement diagnostic", async () =>
  withDirectory(async (directory) => {
    const file = join(directory, "old-record")
    await fs.writeFile(file, "owned legacy evidence")
    const error = await Effect.runPromise(
      readManagedDirectory("linux", directory).pipe(
        Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ HOME: "/users/fixture" }))),
        Effect.flip
      )
    )
    expect(error.message).toContain("Stop and verify its owned processes")
    expect(await fs.readFile(file, "utf8")).toBe("owned legacy evidence")
  }))

it("refuses unreadable legacy state rather than assuming it is empty", async () =>
  withDirectory(async (directory) => {
    const file = ResidentDirectory.make(join(directory, "not-a-directory"))
    await fs.writeFile(file, "evidence")
    const error = await Effect.runPromise(
      readManagedDirectory("linux", file).pipe(
        Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ HOME: "/users/fixture" }))),
        Effect.flip
      )
    )
    expect(error.message).toContain("could not be inspected")
    expect(await fs.readFile(file, "utf8")).toBe("evidence")
  }))

it("rejects an explicit empty directory and a relative home when supplied by the config provider", async () =>
  withDirectory(async (directory) => {
    for (const config of [{ MCP_RESIDENT_STATE_DIRECTORY: "" }, { HOME: "relative" }]) {
      const result = await Effect.runPromise(
        readManagedDirectory("linux", directory).pipe(
          Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(config, { preserveEmptyStrings: true }))),
          Effect.exit
        )
      )
      expect(Exit.isFailure(result), JSON.stringify(config)).toBe(true)
    }
  }))
