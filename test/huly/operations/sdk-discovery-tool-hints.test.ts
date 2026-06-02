import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { expect } from "vitest"

import { firstClassToolHints } from "../../../src/huly/operations/sdk-discovery-tool-hints.js"
import { toolRegistry } from "../../../src/mcp/tools/index.js"

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
})
