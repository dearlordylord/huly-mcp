import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { readFileSync } from "node:fs"
import { expect } from "vitest"

import { firstClassToolHints, runtimeParityRoutingRows } from "../../../src/huly/operations/sdk-discovery-tool-hints.js"
import { toolRegistry } from "../../../src/mcp/tools/index.js"

interface LedgerGroup {
  readonly package: string
  readonly status: string
  readonly rationale: string
  readonly exports: ReadonlyArray<string>
}

interface SdkParityLedger {
  readonly groups: ReadonlyArray<LedgerGroup>
}

const readLedger = (): SdkParityLedger =>
  // Test JSON boundary: this fixture is immediately validated by expectations below.
  JSON.parse(readFileSync("plans/sdk-parity-ledger.json", "utf-8")) as SdkParityLedger

const findLedgerGroup = (
  ledger: SdkParityLedger,
  packageName: string,
  exportName: string
): LedgerGroup | undefined =>
  ledger.groups.find((group) => group.package === packageName && group.exports.includes(exportName))

describe("firstClassToolHints", () => {
  it.effect("references only example tool names that exist in the registry", () =>
    Effect.gen(function*() {
      const registeredNames = new Set(toolRegistry.definitions.map((tool) => tool.name))
      const referenced = [...firstClassToolHints.values()]
        .flatMap((hints) => hints.flatMap((hint) => hint.exampleTools))

      // Guard against a vacuous pass if the hint table is ever emptied.
      expect(referenced.length).toBeGreaterThan(0)

      const missing = referenced.filter((name) => !registeredNames.has(name))
      expect(missing).toEqual([])
    }))

  it.effect("keeps runtime parity routing constants aligned with the sdk parity ledger", () =>
    Effect.gen(function*() {
      const ledger = readLedger()
      const registeredNames = new Set(toolRegistry.definitions.map((tool) => tool.name))

      expect(runtimeParityRoutingRows.length).toBeGreaterThan(0)

      for (const row of runtimeParityRoutingRows) {
        const group = findLedgerGroup(ledger, row.packageName, row.exportName)
        expect(group, `${row.packageName}#${row.exportName}`).toBeDefined()
        expect(row.hint.status).toBe(group?.status)
        expect(row.hint.rationale).toBe(group?.rationale)
        if (row.hint.status === "covered") {
          expect(row.hint.safestMcpTools.length).toBeGreaterThan(0)
          expect(row.hint.safestMcpTools.filter((toolName) => !registeredNames.has(toolName))).toEqual([])
        }
        if (row.hint.status === "gap") {
          expect(row.hint.backlogIssue).toBe(92)
        }
      }
    }))
})
