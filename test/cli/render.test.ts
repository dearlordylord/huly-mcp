import { it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { TestConsole } from "effect/testing"
import { describe, expect } from "vitest"

import { cliCommandCatalog } from "../../packages/huly-cli/src/catalog.js"
import {
  CliRuntimeError,
  renderOperationResult,
  renderOperationSuccess,
  renderOptionsForTerminal
} from "../../packages/huly-cli/src/render.js"
import { CanonicalBase64ImageData, SupportedAttachmentImageTypeSchema } from "../../src/domain/schemas/attachments.js"

const globals = { json: false, yes: false }

describe("CLI rendering", () => {
  it("applies typed runtime error defaults", () => {
    const error = new CliRuntimeError({ message: "failed" })

    expect(error.kind).toBe("integration")
    expect(error.retryable).toBe(false)
  })

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

  it("uses catalog-owned columns and preserves reusable identifiers in narrow terminals", () => {
    const identifier = "HULY-123456789012345678901234567890"
    const output = renderOperationResult(
      {
        result: [
          {
            issueId: "65f012345678901234567890",
            identifier,
            title: "A title that cannot fit beside both identifiers",
            status: "In Progress",
            labels: []
          }
        ],
        warnings: []
      },
      globals,
      { human: cliCommandCatalog.list_issues.human, terminalWidth: 42, color: false }
    )

    expect(output).toContain(identifier)
    expect(output).toContain("identifier")
    expect(output).not.toContain("issueId")
    expect(output).not.toContain("...")
  })

  it("only styles table headings for compatible color terminals", () => {
    const success = { result: [{ identifier: "HULY", name: "Huly" }], warnings: [] }
    const human = cliCommandCatalog.list_projects.human

    expect(renderOperationResult(success, globals, { human, terminalWidth: 80, color: true })).toContain("\u001b[1m")
    expect(renderOperationResult(success, globals, { human, terminalWidth: 80, color: false })).not.toContain("\u001b[")
  })

  it("disables styling for redirected output and NO_COLOR", () => {
    expect(renderOptionsForTerminal({ columns: 80, isTTY: false, noColor: false }).color).toBe(false)
    expect(renderOptionsForTerminal({ columns: 80, isTTY: true, noColor: true }).color).toBe(false)
    expect(renderOptionsForTerminal({ columns: 80, isTTY: true, noColor: false }).color).toBe(true)
    expect(
      renderOptionsForTerminal(
        { columns: 80, isTTY: true, noColor: false },
        { columns: [{ field: "id", priority: 1, reusable: true }] }
      ).human
    ).toBeDefined()
  })

  it("renders object array properties with totals", () => {
    const output = renderOperationResult(
      { result: { issues: [{ identifier: "HULY-1", title: "Bug" }], total: 1 }, warnings: [] },
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
    expect(renderOperationResult({ result: [{ nested: { value: true } }], warnings: [] }, globals)).toContain("nested")
    expect(renderOperationResult({ result: null, warnings: [] }, globals)).toBe("null")
    expect(renderOperationResult({ result: undefined, warnings: [] }, globals)).toBe("")
    expect(renderOperationResult({ result: true, warnings: [] }, globals)).toBe("true")
    expect(renderOperationResult({ result: Symbol("not-json"), warnings: [] }, globals)).toBe("")
    expect(renderOperationResult({ result: { ok: true, empty: undefined }, warnings: [] }, globals)).toContain(
      "empty: "
    )
    expect(renderOperationResult({ result: { nested: { value: true } }, warnings: [] }, globals)).toContain(
      '{"value":true}'
    )
  })

  it("renders JSON output as the raw operation result", () => {
    const output = renderOperationResult({ result: { ok: true }, warnings: [] }, { json: true, yes: false })

    expect(output).toBe('{\n  "ok": true\n}')
  })

  it("renders a safe image descriptor without dumping base64 payload bytes", () => {
    const success = {
      result: { attachmentId: "att-image" },
      warnings: [],
      image: {
        type: "image" as const,
        data: CanonicalBase64ImageData.make("cG5nZGF0YQ=="),
        mimeType: Schema.decodeUnknownSync(SupportedAttachmentImageTypeSchema)("image/png")
      }
    }

    const human = renderOperationResult(success, globals)
    const json = JSON.parse(renderOperationResult(success, { json: true, yes: false }))

    expect(human).toContain("Image: image/png (12 base64 characters)")
    expect(human).not.toContain("cG5nZGF0YQ==")
    expect(json).toMatchObject({
      result: { attachmentId: "att-image" },
      image: { mimeType: "image/png", encoding: "base64", base64Length: 12 }
    })
    expect(JSON.stringify(json)).not.toContain("cG5nZGF0YQ==")
  })

  it("renders warnings in human and JSON output", () => {
    const success = {
      result: { ok: true },
      warnings: [{ code: "status_metadata_unresolved" as const, message: "Status metadata was degraded." }]
    }

    const human = renderOperationResult(success, globals)
    const json = JSON.parse(renderOperationResult(success, { json: true, yes: false }))

    expect(human).toContain("Warnings:")
    expect(human).toContain("status_metadata_unresolved")
    expect(json).toEqual({ result: { ok: true }, warnings: success.warnings })
  })

  it.effect("logs rendered output through the Effect console service", () =>
    Effect.gen(function* () {
      yield* renderOperationSuccess({ result: "ok", warnings: [] }, globals)
      expect(yield* TestConsole.logLines).toEqual(["ok"])
    })
  )
})
