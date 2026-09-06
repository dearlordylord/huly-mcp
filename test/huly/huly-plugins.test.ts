import { describe, expect, it } from "vitest"

import { isSettingPlugin, resolveSettingPlugin, setting } from "../../src/huly/huly-plugins.js"

describe("Huly plugin CommonJS interop", () => {
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
