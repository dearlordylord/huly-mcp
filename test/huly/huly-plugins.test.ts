import { execFile } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"

import { build } from "esbuild"
import { describe, expect, it } from "vitest"

import { isSettingPlugin, resolveSettingPlugin, setting } from "../../src/huly/huly-plugins.js"

const runFile = promisify(execFile)

describe("Huly plugin CommonJS interop", () => {
  it("bundles the plugin registry for a consumer without Huly packages", async () => {
    const directory = await mkdtemp(join(tmpdir(), "huly-plugin-consumer-"))
    const output = join(directory, "plugins.cjs")
    try {
      await build({
        entryPoints: ["src/huly/huly-plugins.ts"],
        bundle: true,
        platform: "node",
        format: "cjs",
        outfile: output
      })
      const result = await runFile(
        process.execPath,
        [
          "-e",
          "const p = require(process.argv[1]); console.log(JSON.stringify([p.core.class.Doc, p.tracker.class.Issue, p.setting.class.OfficeSettings, p.gmail.class.Message]));",
          output
        ],
        { cwd: directory }
      )
      expect(result.stdout.trim()).toBe(
        JSON.stringify(["core:class:Doc", "tracker:class:Issue", "setting:class:OfficeSettings", "gmail:class:Message"])
      )
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })

  it("resolves direct and bundled setting plugin shapes", () => {
    expect(resolveSettingPlugin(setting)).toBe(setting)
    expect(resolveSettingPlugin({ default: setting })).toBe(setting)
  })

  it("recognizes only the native OfficeSettings plugin shape", () => {
    expect(isSettingPlugin(setting)).toBe(true)
    expect(isSettingPlugin(null)).toBe(false)
    expect(isSettingPlugin("setting")).toBe(false)
    expect(isSettingPlugin({})).toBe(false)
    expect(isSettingPlugin({ class: null })).toBe(false)
    expect(isSettingPlugin({ class: {} })).toBe(false)
    expect(isSettingPlugin({ class: { OfficeSettings: "wrong:class:OfficeSettings" } })).toBe(false)
  })

  it("rejects malformed direct and nested module shapes", () => {
    expect(() => resolveSettingPlugin(null)).toThrow("did not expose its declared default plugin")
    expect(() => resolveSettingPlugin({})).toThrow("did not expose its declared default plugin")
    expect(() => resolveSettingPlugin({ default: null })).toThrow("did not expose its declared default plugin")
  })
})
