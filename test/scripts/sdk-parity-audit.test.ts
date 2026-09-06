import { execFileSync } from "node:child_process"
import * as fs from "node:fs"
import * as path from "node:path"

import { describe, expect, it } from "vitest"

describe("SDK parity audit", () => {
  it("classifies plugin mixins including re-exported setting model declarations", () => {
    const settingTypes = path.join(process.cwd(), "node_modules/@hcengineering/setting/types")
    const settingIndex = fs.readFileSync(path.join(settingTypes, "index.d.ts"), "utf8")
    const spaceTypeEditor = fs.readFileSync(path.join(settingTypes, "spaceTypeEditor.d.ts"), "utf8")

    expect(settingIndex).toContain("SpaceTypeEditor: Ref<Mixin<SpaceTypeEditor>>")
    expect(settingIndex).toContain("SpaceTypeCreator: Ref<Mixin<SpaceTypeCreator>>")
    expect(spaceTypeEditor).toContain("export interface SpaceTypeEditor extends Class<SpaceType>")
    expect(spaceTypeEditor).toContain("export interface SpaceTypeCreator extends Class<SpaceTypeDescriptor>")

    const output = execFileSync(process.execPath, ["scripts/audit-sdk-parity.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8"
    })
    expect(output).toContain("SDK parity ledger covers 316 SDK model exports")
  })
})
