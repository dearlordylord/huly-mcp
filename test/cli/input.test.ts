import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"

import { NodeContext } from "@effect/platform-node"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import type { CliCommandSpec } from "../../packages/huly-cli/src/catalog-types.js"
import { cliCommandCatalog, type CliToolName } from "../../packages/huly-cli/src/catalog.js"
import { parseCliCommandLine } from "../../packages/huly-cli/src/cli-options.js"
import { buildCliInvocation, CliInputError } from "../../packages/huly-cli/src/input.js"
import { type McpToolName, toolRegistry } from "../../src/mcp/tools/index.js"

const getTool = (name: McpToolName) => {
  const tool = toolRegistry.tools.get(name)
  if (tool === undefined) {
    throw new Error(`Missing tool ${name}`)
  }
  return tool
}

const runCliEffect = <A, E>(effect: Effect.Effect<A, E, NodeContext.NodeContext>): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.provide(NodeContext.layer)))

const invoke = (name: CliToolName, raw: ReadonlyArray<string>) =>
  runCliEffect(Effect.gen(function*() {
    const tool = getTool(name)
    const parsed = yield* parseCliCommandLine(tool, cliCommandCatalog[name], raw)
    return yield* buildCliInvocation(tool, cliCommandCatalog[name], parsed)
  }))

const rejected = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    await promise
    throw new Error("Expected promise to reject.")
  } catch (error) {
    return error
  }
}

const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error)

const schemaSpec: CliCommandSpec = {
  path: ["schema"],
  positional: [],
  description: "Schema coercion fixture"
}

describe("CLI input merging", () => {
  it("merges JSON input first and lets positionals plus explicit options override it", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "huly-cli-input-"))
    const descriptionPath = path.join(dir, "description.md")
    await fs.writeFile(descriptionPath, "new description", "utf8")

    try {
      const invocation = await invoke("update_issue", [
        "PROJ",
        "PROJ-7",
        "--input-json",
        "{\"project\":\"OLD\",\"identifier\":\"OLD-1\",\"title\":\"old\",\"estimation\":10}",
        "--title",
        "new title",
        "--estimation",
        "15",
        "--description-file",
        descriptionPath
      ])

      expect(invocation.input).toEqual({
        project: "PROJ",
        identifier: "PROJ-7",
        title: "new title",
        estimation: 15,
        description: "new description"
      })
    } finally {
      await fs.rm(dir, { force: true, recursive: true })
    }
  })

  it("maps kebab-case options to camelCase schema fields and coerces primitives", async () => {
    const invocation = await invoke("list_issues", [
      "--project",
      "HULY",
      "--title-search",
      "bug",
      "--has-assignee=false",
      "--is-top-level",
      "--limit",
      "5"
    ])

    expect(invocation.input).toEqual({
      project: "HULY",
      titleSearch: "bug",
      hasAssignee: false,
      isTopLevel: true,
      limit: 5
    })
  })

  it("reads JSON input files before explicit options", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "huly-cli-json-"))
    const inputPath = path.join(dir, "input.json")
    await fs.writeFile(inputPath, "{\"query\":\"old\",\"limit\":1}", "utf8")

    try {
      const invocation = await invoke("fulltext_search", [
        "new query",
        "--input-file",
        inputPath,
        "--limit",
        "3",
        "--json"
      ])

      expect(invocation.input).toEqual({
        query: "new query",
        limit: 3
      })
      expect(invocation.globals).toEqual({ json: true, yes: false })
    } finally {
      await fs.rm(dir, { force: true, recursive: true })
    }
  })

  it("collects destructive confirmation as a global option, not tool input", async () => {
    const invocation = await invoke("delete_comment", [
      "--project",
      "HULY",
      "--issue-identifier",
      "HULY-1",
      "--comment-id",
      "comment-1",
      "--yes"
    ])

    expect(invocation.input).toEqual({
      project: "HULY",
      issueIdentifier: "HULY-1",
      commentId: "comment-1"
    })
    expect(invocation.globals).toEqual({ json: false, yes: true })
  })

  it("supports nullable fields, negated booleans, and output globals", async () => {
    const raw = [
      "HULY",
      "HULY-1",
      "--input-json",
      "{\"project\":\"HULY\"}",
      "--description",
      "null",
      "--json=false",
      "--yes=false",
      "--output",
      "download.bin"
    ]

    const invocation = await invoke("update_issue", raw)
    const negatedBoolean = await invoke("list_issues", ["--no-has-assignee"])

    expect(invocation.input).toEqual({
      project: "HULY",
      identifier: "HULY-1",
      description: null
    })
    expect(invocation.globals).toEqual({
      json: false,
      output: "download.bin",
      yes: false
    })
    expect(negatedBoolean.input).toEqual({ hasAssignee: false })
  })

  it("uses JSON Schema references when coercing CLI values", async () => {
    const refTool = {
      ...getTool("list_issues"),
      inputSchema: {
        type: "object",
        properties: {
          count: { $ref: "#/$defs/Count" },
          enabled: { $ref: "#/$defs/Enabled" },
          tags: { $ref: "#/$defs/Tags" }
        },
        $defs: {
          Count: { type: "integer" },
          Enabled: { type: ["boolean", "null"] },
          Tags: { type: "array", items: { type: "string" } }
        }
      }
    }
    const refRaw = [
      "--count",
      "2",
      "--enabled=false",
      "--tags",
      "[\"bug\",\"cli\"]"
    ]
    const parsed = await runCliEffect(parseCliCommandLine(refTool, schemaSpec, refRaw))
    const invocation = await runCliEffect(buildCliInvocation(refTool, schemaSpec, parsed))

    expect(invocation.input).toEqual({
      count: 2,
      enabled: false,
      tags: ["bug", "cli"]
    })
  })

  it("handles edge JSON Schema shapes used by generated tool schemas", async () => {
    const schemaTool = {
      ...getTool("list_issues"),
      inputSchema: {
        type: "object",
        properties: {
          external: { $ref: "#/not-local" },
          flag: { anyOf: [{ type: "string" }, { type: "boolean" }] },
          hasAssignee: { type: "string" },
          limit: { type: "string" },
          missing: { $ref: "#/$defs/Missing" },
          nonRecordRef: { $ref: "#/$defs/NonRecord" },
          nullableBySchema: { anyOf: [{ type: "string" }, { type: "null" }] },
          stringOrBoolean: { anyOf: [{ type: "string" }, { type: "boolean" }] },
          stringOrNumber: { anyOf: [{ type: "string" }, { type: "number" }] },
          primitiveSchema: true
        },
        anyOf: [
          null,
          {
            properties: {
              unionFlag: { type: "boolean" }
            }
          }
        ],
        $defs: {
          NonRecord: true
        }
      }
    }

    const schemaRaw = [
      "--external",
      "value",
      "--flag=true",
      "--has-assignee",
      "maybe",
      "--limit",
      "many",
      "--missing",
      "value",
      "--non-record-ref",
      "value",
      "--nullable-by-schema",
      "null",
      "--string-or-boolean",
      "maybe",
      "--string-or-number",
      "many",
      "--primitive-schema",
      "value",
      "--union-flag=true",
      "--no-json",
      "--no-yes"
    ]
    const parsed = await runCliEffect(parseCliCommandLine(schemaTool, schemaSpec, schemaRaw))
    const invocation = await runCliEffect(buildCliInvocation(schemaTool, schemaSpec, parsed))

    expect(invocation.input).toEqual({
      external: "value",
      flag: true,
      hasAssignee: "maybe",
      limit: "many",
      missing: "value",
      nonRecordRef: "value",
      nullableBySchema: null,
      stringOrBoolean: "maybe",
      stringOrNumber: "many",
      primitiveSchema: "value",
      unionFlag: true
    })
    expect(invocation.globals).toEqual({ json: false, yes: false })
  })

  it("rejects unknown options before tool execution", async () => {
    const error = await rejected(invoke("list_issues", ["--not-real"]))

    expect(errorMessage(error)).toContain("not-real")
  })

  it("exposes input errors as typed CLI errors", async () => {
    const error = await Effect.runPromise(Effect.flip(
      buildCliInvocation(getTool("fulltext_search"), cliCommandCatalog.fulltext_search, {
        options: [],
        positionals: ["one", "two"],
        raw: ["one", "two"]
      })
    ))

    expect(error).toBeInstanceOf(CliInputError)
    expect(error.message).toContain("Too many positional arguments")
  })

  it("reports typed input errors for malformed option values and file reads", async () => {
    const invalidJson = await rejected(invoke("list_issues", ["--input-json", "[]"]))
    const invalidJsonSyntax = await rejected(invoke("list_issues", ["--input-json", "{bad"]))
    const missingValue = await rejected(invoke("list_issues", ["--project"]))
    const invalidBoolean = await rejected(invoke("list_issues", ["--has-assignee=maybe"]))
    const invalidNumber = await rejected(invoke("list_issues", ["--limit", "many"]))
    const missingFile = await rejected(invoke("update_issue", [
      "--description-file",
      "/tmp/huly-cli-missing-description-file"
    ]))
    const invalidNegation = await rejected(invoke("list_issues", ["--no-limit"]))

    expect(errorMessage(invalidJson)).toContain("--input-json must contain a JSON object")
    expect(errorMessage(invalidJsonSyntax)).toContain("Invalid JSON in --input-json")
    expect(errorMessage(missingValue)).toContain("Expected a value")
    expect(errorMessage(invalidBoolean)).toContain("expects true or false")
    expect(errorMessage(invalidNumber)).toContain("expects a number")
    expect(errorMessage(missingFile)).toContain("Failed to read")
    expect(errorMessage(invalidNegation)).toContain("no-limit")
  })

  it("reports invalid JSON for object and array-like option values", async () => {
    const error = await rejected(invoke("update_issue", [
      "HULY",
      "HULY-1",
      "--title",
      "{not json"
    ]))

    expect(errorMessage(error)).toContain("has invalid JSON")
  })

  it("handles parsed option edge cases from generated descriptors", async () => {
    const tool = getTool("list_issues")
    const noPositionalInput = await runCliEffect(buildCliInvocation(tool, {
      path: ["fixture"],
      positional: ["project"],
      description: "Fixture"
    }, {
      options: [],
      positionals: [],
      raw: []
    }))
    const manualBoolean = await runCliEffect(buildCliInvocation(tool, cliCommandCatalog.list_issues, {
      options: [{
        _tag: "FieldOption",
        fieldName: "hasAssignee",
        optionName: "has-assignee",
        value: "true"
      }],
      positionals: [],
      raw: ["--has-assignee=true"]
    }))
    const unknownOptions = await runCliEffect(buildCliInvocation(tool, cliCommandCatalog.list_issues, {
      options: [
        {
          _tag: "BooleanFieldOption",
          fieldName: "missingBoolean",
          optionName: "missing-boolean",
          value: true
        },
        {
          _tag: "FieldOption",
          fieldName: "missingText",
          optionName: "missing-text",
          value: "ignored"
        }
      ],
      positionals: [],
      raw: ["--missing-boolean"]
    }))

    expect(noPositionalInput.input).toEqual({})
    expect(manualBoolean.input).toEqual({ hasAssignee: true })
    expect(unknownOptions.input).toEqual({})
  })

  it("reports invalid JSON for JSON-only schema fields", async () => {
    const refTool = {
      ...getTool("list_issues"),
      inputSchema: {
        type: "object",
        properties: {
          tags: { type: "array", items: { type: "string" } }
        }
      }
    }

    const error = await rejected(
      runCliEffect(
        Effect.gen(function*() {
          const parsed = yield* parseCliCommandLine(refTool, schemaSpec, ["--tags", "not-json"])
          return yield* buildCliInvocation(refTool, schemaSpec, parsed)
        })
      )
    )

    expect(errorMessage(error)).toContain("Option tags has invalid JSON")
  })
})
