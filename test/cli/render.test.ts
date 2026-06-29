import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import { renderOperationResult, renderOperationSuccess } from "../../packages/huly-cli/src/render.js"

const globals = {
  json: false,
  yes: false
}

describe("CLI rendering", () => {
  it("renders arrays as concise tables", () => {
    const output = renderOperationResult(
      {
        result: [
          { id: "one", title: "Short", nested: { ignored: true } },
          {
            id: "two",
            title:
              "A title that is intentionally long enough to be truncated in the table renderer because it exceeds the maximum configured cell width"
          }
        ],
        warnings: []
      },
      globals
    )

    expect(output).toContain("id")
    expect(output).toContain("title")
    expect(output).toContain("...")
    expect(output).not.toContain("nested")
  })

  it("renders object array properties with totals", () => {
    const output = renderOperationResult(
      {
        result: {
          issues: [{ identifier: "HULY-1", title: "Bug" }],
          total: 1
        },
        warnings: []
      },
      globals
    )

    expect(output).toContain("issues:")
    expect(output).toContain("HULY-1")
    expect(output).toContain("Total: 1")

    expect(renderOperationResult({ result: { issues: [], total: "0" }, warnings: [] }, globals)).toContain("Total: 0")
    expect(renderOperationResult({ result: { issues: [], total: false }, warnings: [] }, globals)).not.toContain(
      "Total:"
    )
  })

  it("renders empty and non-scalar values predictably", () => {
    expect(renderOperationResult({ result: [], warnings: [] }, globals)).toBe("No results.")
    expect(renderOperationResult({ result: [{ nested: { value: true } }], warnings: [] }, globals)).toContain(
      "nested"
    )
    expect(renderOperationResult({ result: null, warnings: [] }, globals)).toBe("null")
    expect(renderOperationResult({ result: undefined, warnings: [] }, globals)).toBe("")
    expect(renderOperationResult({ result: true, warnings: [] }, globals)).toBe("true")
    expect(renderOperationResult({ result: Symbol("not-json"), warnings: [] }, globals)).toBe("")
    expect(renderOperationResult({ result: { ok: true, empty: undefined }, warnings: [] }, globals)).toContain(
      "empty: "
    )
    expect(renderOperationResult({ result: { nested: { value: true } }, warnings: [] }, globals)).toContain(
      "{\"value\":true}"
    )
  })

  it("renders JSON output as the raw operation result", () => {
    const output = renderOperationResult(
      {
        result: { ok: true },
        warnings: []
      },
      { json: true, yes: false }
    )

    expect(output).toBe("{\n  \"ok\": true\n}")
  })

  it("renders warnings in human and JSON output", () => {
    const success = {
      result: { ok: true },
      warnings: [{
        code: "status_metadata_unresolved" as const,
        message: "Status metadata was degraded."
      }]
    }

    const human = renderOperationResult(success, globals)
    const json = JSON.parse(renderOperationResult(success, { json: true, yes: false }))

    expect(human).toContain("Warnings:")
    expect(human).toContain("status_metadata_unresolved")
    expect(json).toEqual({
      result: { ok: true },
      warnings: success.warnings
    })
  })

  it("logs rendered output through the Effect console service", async () => {
    const logs: Array<unknown> = []
    const consoleService = await Effect.runPromise(Effect.console)

    await Effect.runPromise(
      renderOperationSuccess({ result: "ok", warnings: [] }, globals).pipe(
        Effect.withConsole({
          ...consoleService,
          log: (value) =>
            Effect.sync(() => {
              logs.push(value)
            }),
          unsafe: {
            ...consoleService.unsafe
          }
        })
      )
    )

    expect(logs).toEqual(["ok"])
  })
})
