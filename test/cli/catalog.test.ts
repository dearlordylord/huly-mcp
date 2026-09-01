import { describe, expect, it } from "vitest"

import type { CliCommandSpec } from "../../packages/huly-cli/src/catalog-types.js"
import { cliCommandCatalog, ignoredMcpTools, isCliToolName } from "../../packages/huly-cli/src/catalog.js"
import { buildCliCommandConfig } from "../../packages/huly-cli/src/cli-options.js"
import { allTools, resolveAnnotations } from "../../src/mcp/tools/index.js"
import {
  CLI_BEHAVIOR_CLASSES,
  CLI_DEDICATED_LIVE_RISK_CLASSES,
  CLI_PARITY_BASELINE,
  CLI_PARITY_TARGET
} from "../../packages/huly-cli/src/parity-contract.js"
import {
  CONSEQUENTIAL_CLI_TOOLS,
  hasExplicitCliConfirmationPolicy
} from "../../packages/huly-cli/src/safety-policies.js"
import {
  cliIntegrationCoverageDecision,
  CLI_COVERAGE_REVIEWED_REGISTRY_OPERATIONS,
  CLI_REVIEWED_COVERAGE_CATEGORIES,
  CLI_UNIQUE_RISK_DECISIONS
} from "../../packages/huly-cli/src/live-coverage.js"
import {
  collectFieldSpecs,
  collectRequiredFieldNames,
  fieldOptionDescription
} from "../../packages/huly-cli/src/schema-fields.js"

const catalogEntries = () => Object.entries(cliCommandCatalog)

const pathKey = (path: ReadonlyArray<string>): string => path.join(" ")

describe("CLI catalog", () => {
  it("records the auditable parity baseline and target", () => {
    expect(CLI_PARITY_BASELINE).toEqual({
      registryOperations: 522,
      cliRoutes: 451,
      ignoredOperations: 71,
      directLiveCases: 68,
      deferredLiveCases: 383
    })
    expect(CLI_PARITY_TARGET).toEqual({ ignoredOperations: 0, routesPerRegistryOperation: 1 })
    expect(CLI_BEHAVIOR_CLASSES).toContain("structured-json-input")
    expect(CLI_BEHAVIOR_CLASSES).toContain("workspace-administration")
    expect(CLI_DEDICATED_LIVE_RISK_CLASSES).toEqual(["transport", "safety", "privacy", "workspace-client", "lifecycle"])
  })
  it("has exactly one CLI route for every registry operation and no ignored operations", () => {
    const implemented = new Set(Object.keys(cliCommandCatalog))
    const toolNames = allTools.map((tool) => tool.name)

    expect(ignoredMcpTools).toEqual([])
    expect(implemented.size).toBe(allTools.length)
    expect(toolNames.filter((name) => !implemented.has(name))).toEqual([])
  })

  it("requires an explicit integration-risk review when the registry or its categories change", () => {
    const categories = new Set(allTools.map((tool) => tool.category))
    const decisions = allTools.map((tool) => cliIntegrationCoverageDecision(tool.name, tool.category))

    expect(allTools).toHaveLength(CLI_COVERAGE_REVIEWED_REGISTRY_OPERATIONS)
    expect(
      [...categories].filter(
        (category) => !CLI_REVIEWED_COVERAGE_CATEGORIES.some((candidate) => candidate === category)
      )
    ).toEqual([])
    expect(decisions).toHaveLength(allTools.length)
    expect(decisions.filter((decision) => decision.risks.length > 0 && decision.type !== "dedicated-live")).toEqual([])
    expect([...new Set(decisions.flatMap((decision) => decision.risks))].sort()).toEqual(
      [...CLI_DEDICATED_LIVE_RISK_CLASSES].sort()
    )
    for (const riskDecision of CLI_UNIQUE_RISK_DECISIONS) {
      for (const toolName of riskDecision.tools) {
        const tool = allTools.find((candidate) => candidate.name === toolName)
        if (tool === undefined) throw new Error(`Unknown unique-risk tool ${toolName}.`)
        expect(cliIntegrationCoverageDecision(toolName, tool.category)).toMatchObject({
          type: "dedicated-live",
          caseIds: expect.arrayContaining([riskDecision.caseId]),
          risks: expect.arrayContaining([...riskDecision.risks])
        })
      }
    }
    expect(() => cliIntegrationCoverageDecision("list_projects", "new-unreviewed-category")).toThrow(
      "risk classification is missing category"
    )
  })

  it("keeps generated CLI command paths unique and non-overlapping", () => {
    const byPath = new Map<string, Array<string>>()
    for (const [toolName, spec] of catalogEntries()) {
      const key = pathKey(spec.path)
      byPath.set(key, [...(byPath.get(key) ?? []), toolName])
    }

    const duplicates = [...byPath.entries()].filter(([, toolNames]) => toolNames.length > 1)
    const prefixConflicts = catalogEntries().flatMap(([toolName, spec]) =>
      catalogEntries()
        .filter(
          ([otherToolName, otherSpec]) =>
            toolName !== otherToolName &&
            spec.path.length < otherSpec.path.length &&
            spec.path.every((segment, index) => otherSpec.path[index] === segment)
        )
        .map(([otherToolName]) => [toolName, otherToolName])
    )

    expect(duplicates).toEqual([])
    expect(prefixConflicts).toEqual([])
  })

  it("records explicit CLI confirmation for every destructive operation", () => {
    const missing = allTools.flatMap((tool) => {
      if (!isCliToolName(tool.name)) return []
      const spec: CliCommandSpec = cliCommandCatalog[tool.name]
      return resolveAnnotations(tool.operation).destructiveHint === true &&
        !hasExplicitCliConfirmationPolicy(tool.name, spec)
        ? [tool.name]
        : []
    })

    expect(missing).toEqual([])
  })

  it("requires explicit confirmation for every security-administration write", () => {
    const missing = allTools.flatMap((tool) => {
      if (tool.category !== "security-administration" || !isCliToolName(tool.name)) return []
      const spec: CliCommandSpec = cliCommandCatalog[tool.name]
      return resolveAnnotations(tool.operation).readOnlyHint !== true &&
        !hasExplicitCliConfirmationPolicy(tool.name, spec)
        ? [tool.name]
        : []
    })

    expect(missing).toEqual([])
  })

  it("keeps every classified consequential operation behind explicit confirmation", () => {
    const missing = CONSEQUENTIAL_CLI_TOOLS.filter(
      (toolName) => !hasExplicitCliConfirmationPolicy(toolName, cliCommandCatalog[toolName])
    )

    expect(missing).toEqual([])
  })

  it("keeps positional and file-policy field names synchronized with operation schemas", () => {
    const errors = allTools.flatMap((tool) => {
      if (!isCliToolName(tool.name)) return []
      const spec: CliCommandSpec = cliCommandCatalog[tool.name]
      const fields = new Set(
        [...collectFieldSpecs(tool.operation.inputSchema).values()].map((field) => field.fieldName)
      )
      const required = collectRequiredFieldNames(tool.operation.inputSchema)
      const behaviorFields = [
        ...(spec.behavior?.fileInput?.fields ?? []),
        ...(spec.behavior?.base64FileInput?.fields ?? [])
      ]
      const unknown = [...spec.positional, ...behaviorFields].filter((field) => !fields.has(field))
      const optionalPositionals = spec.positional.filter((field) => !required.has(field))
      return [
        ...unknown.map((field) => `${tool.name}: unknown field ${field}`),
        ...optionalPositionals.map((field) => `${tool.name}: optional positional ${field}`)
      ]
    })

    expect(errors).toEqual([])
  })

  it("rejects file behavior metadata that names a missing schema field", () => {
    const listProjects = allTools.find((tool) => tool.name === "list_projects")
    if (listProjects === undefined) throw new Error("Missing list_projects fixture.")
    const invalidSpec: CliCommandSpec = {
      path: ["invalid"],
      positional: [],
      description: "Invalid behavior fixture",
      behavior: { fileInput: { fields: ["missing"] } }
    }

    expect(() => buildCliCommandConfig(listProjects, invalidSpec)).toThrow(
      "CLI behavior references unknown schema fields: missing."
    )
  })

  it("keeps notable generated paths aligned with the public command vocabulary", () => {
    expect(cliCommandCatalog.list_tags.path).toEqual(["tags", "list"])
    expect(cliCommandCatalog.create_tag.path).toEqual(["tags", "create"])
    expect(cliCommandCatalog.list_tag_categories.path).toEqual(["tags", "categories", "list"])
  })

  it("explains upload source locations in attachment commands", () => {
    for (const description of [
      cliCommandCatalog.add_issue_attachment.description,
      cliCommandCatalog.add_document_attachment.description
    ]) {
      expect(description).toContain("CLI process")
      expect(description).toContain("canonical base64")
      expect(description).toContain("--data-base64-file")
    }
  })

  it("derives allowed values and union-field guidance from operation schemas", () => {
    const createIssue = allTools.find((tool) => tool.name === "create_issue")
    const setConversationClosed = allTools.find((tool) => tool.name === "set_conversation_closed")
    if (createIssue === undefined || setConversationClosed === undefined) throw new Error("Missing CLI help fixtures.")
    const priority = collectFieldSpecs(createIssue.inputSchema).get("priority")
    const channel = collectFieldSpecs(setConversationClosed.inputSchema).get("channel")
    if (priority === undefined || channel === undefined) throw new Error("Missing CLI help fixture fields.")

    expect(fieldOptionDescription(createIssue.inputSchema, priority)).toContain('Allowed values: "urgent"')
    expect(fieldOptionDescription(setConversationClosed.inputSchema, channel)).toContain("{ channel } | { dm }")

    const assignee = collectFieldSpecs(createIssue.inputSchema).get("assignee")
    if (assignee === undefined) throw new Error("Missing create issue assignee help fixture.")
    expect(fieldOptionDescription(createIssue.inputSchema, assignee)).not.toContain("Pattern:")
  })

  it("only presents patterns that apply to every scalar union branch", () => {
    const partlyConstrained = fieldOptionDescription(
      {},
      { fieldName: "assignee", schema: { anyOf: [{ type: "string", pattern: "^[^@]+@[^@]+$" }, { type: "string" }] } }
    )
    const universallyConstrained = fieldOptionDescription(
      {},
      {
        fieldName: "code",
        schema: {
          anyOf: [
            { type: "string", pattern: "^[A-Z]+$" },
            { type: "string", pattern: "^[A-Z]+$", description: "Alias" }
          ]
        }
      }
    )
    const nullableConstrained = fieldOptionDescription(
      {},
      { fieldName: "email", schema: { anyOf: [{ type: "string", pattern: "^[^@]+@[^@]+$" }, { type: "null" }] } }
    )
    const patternWithAlternative = (alternative: unknown, rootSchema: object = {}) =>
      fieldOptionDescription(rootSchema, {
        fieldName: "code",
        schema: { anyOf: [{ type: "string", pattern: "^[A-Z]+$" }, alternative] }
      })

    expect(partlyConstrained).not.toContain("Pattern:")
    expect(universallyConstrained).toContain("Pattern: ^[A-Z]+$")
    expect(nullableConstrained).toContain("Pattern: ^[^@]+@[^@]+$")
    expect(patternWithAlternative({})).not.toContain("Pattern:")
    expect(patternWithAlternative({ const: "lower" })).not.toContain("Pattern:")
    expect(patternWithAlternative({ const: 1 })).toContain("Pattern: ^[A-Z]+$")
    expect(patternWithAlternative({ enum: [null, "lower"] })).not.toContain("Pattern:")
    expect(patternWithAlternative({ enum: [null, 1] })).toContain("Pattern: ^[A-Z]+$")
    expect(patternWithAlternative(null)).toContain("Pattern: ^[A-Z]+$")
    expect(patternWithAlternative({ allOf: [{}] })).not.toContain("Pattern:")
    expect(patternWithAlternative({ allOf: [{ type: "null" }] })).toContain("Pattern: ^[A-Z]+$")
    expect(patternWithAlternative({ oneOf: [{}] })).not.toContain("Pattern:")
    expect(patternWithAlternative({ oneOf: [{ type: "null" }] })).toContain("Pattern: ^[A-Z]+$")
    expect(patternWithAlternative({ $ref: "#/$defs/Anything" }, { $defs: { Anything: {} } })).not.toContain("Pattern:")
  })

  it("describes nested schema constraints without assuming every variant is an object", () => {
    const rootSchema = {
      allOf: [
        null,
        {
          oneOf: [
            { required: ["choice"], properties: { choice: { type: "string" } } },
            { required: ["other"], properties: { other: { type: "string" } } }
          ]
        }
      ]
    }
    const description = fieldOptionDescription(rootSchema, {
      fieldName: "choice",
      schema: { type: ["string", "null", 1], enum: [undefined, "x"], pattern: "^x$", default: "x" }
    })
    const constDescription = fieldOptionDescription({}, { fieldName: "fixed", schema: { const: "only" } })

    expect(description).toContain('Allowed values: "x"')
    expect(description).toContain("Pattern: ^x$")
    expect(description).toContain('Default: "x"')
    expect(description).toContain("{ choice } | { other }")
    expect(constDescription).toContain('Allowed values: "only"')
    expect(collectRequiredFieldNames({ anyOf: [] })).toEqual(new Set())
  })

  it("bounds malformed and cyclic-looking schema references", () => {
    const tooDeep = {
      allOf: [
        {
          allOf: [
            {
              allOf: [{ allOf: [{ allOf: [{ allOf: [{ allOf: [{ allOf: [{ allOf: [{ type: "object" }] }] }] }] }] }] }]
            }
          ]
        }
      ]
    }
    const nonObjectDefinition = { $ref: "#/$defs/Invalid", $defs: { Invalid: [] } }

    expect(collectFieldSpecs(tooDeep)).toEqual(new Map())
    expect(collectRequiredFieldNames(nonObjectDefinition)).toEqual(new Set())
    expect(
      fieldOptionDescription(nonObjectDefinition, { fieldName: "invalid", schema: { $ref: "#/$defs/Invalid" } })
    ).toBe("")
  })

  it("narrows CLI tool names at runtime", () => {
    expect(isCliToolName("list_projects")).toBe(true)
    expect(isCliToolName("not_a_tool")).toBe(false)
  })
})
