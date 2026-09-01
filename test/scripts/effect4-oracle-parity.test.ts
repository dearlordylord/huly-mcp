import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"

import { Schema } from "effect"
import { describe, expect, it } from "vitest"

import { toDraft07JsonSchema, withExactlyOneRequired } from "../../src/domain/schemas/json-schema.js"
import { canonicalJson } from "../../scripts/effect4-oracle-canonical.js"
import { captureAuthoredConstraints } from "../../scripts/effect4-oracle-constraints.js"
import {
  classifyOracleDeltas,
  compareOracleValues,
  createOracleDeltaReport,
  formatOracleDelta,
  type IntentionalOracleDelta
} from "../../scripts/effect4-oracle-delta.js"
import { validateCurrentDraft07Corpora } from "../../scripts/effect4-oracle-current-corpus.js"
import {
  validateDraft07DiscoveryResult,
  validateDraft07ToolCorpus,
  verifyRuntimeDraft07Agreement
} from "../../scripts/effect4-oracle-draft07.js"
import {
  EFFECT4_ORACLE_DELTA_REVIEW_PATH,
  EFFECT4_ORACLE_PATH,
  verifyEffect4Oracle
} from "../../scripts/effect4-oracle-io.js"
import {
  createOracleDeltaAuditReport,
  createOracleDeltaReview,
  oracleDeltaReviewCategory,
  OracleDeltaAuditReportSchema,
  OracleDeltaReviewSchema,
  parseCandidateToolIdentities,
  verifyReviewedOracleDeltas
} from "../../scripts/effect4-oracle-review.js"
import {
  readEffect4OracleBaseline,
  reportEffect4OracleDeltas,
  runEffect4OracleDeltaReportCommand,
  writeEffect4OracleDeltaReport
} from "../../scripts/report-effect4-oracle-deltas.js"
import {
  decodeOracleStdioResponses,
  LIST_TOOLS_REQUEST_ID,
  normalizeOracleCliVersion,
  oracleLegacyStdioInput,
  oracleStdioInput,
  requireSuccessfulOracleProcess
} from "../../scripts/effect4-oracle-process.js"
import {
  BehavioralOracleSchema,
  OracleJsonRpcRequestSchema,
  OracleJsonRpcResponseSchema
} from "../../scripts/effect4-oracle-schema.js"

const candidateToolResponses = (toolNames: ReadonlyArray<string>) =>
  Schema.decodeUnknownSync(Schema.Array(OracleJsonRpcResponseSchema))([
    {
      id: 2,
      jsonrpc: "2.0",
      result: {
        tools: toolNames.map((name) => ({
          description: `${name} description`,
          inputSchema: { properties: { assignee: { type: "string" }, unrelated: { type: "string" } } },
          name
        }))
      }
    }
  ])

describe("Effect 4 oracle structural parity", () => {
  it("retains array order and reports escaped JSON Pointer paths", () => {
    expect(compareOracleValues({ tools: [{ name: "a" }, { "a/b~c": true }] }, { tools: [{ name: "b" }] })).toEqual([
      { _tag: "Changed", path: "/tools/0/name", before: "a", after: "b" },
      { _tag: "Removed", path: "/tools/1", before: { "a/b~c": true } }
    ])
    expect(compareOracleValues({ "a/b~c": 1 }, { "a/b~c": 2 })).toEqual([
      { _tag: "Changed", path: "/a~1b~0c", before: 1, after: 2 }
    ])
    expect(compareOracleValues([1], [1, 2])).toEqual([{ _tag: "Added", path: "/1", after: 2 }])
    expect(compareOracleValues({ before: true }, { after: false })).toEqual([
      { _tag: "Added", path: "/after", after: false },
      { _tag: "Removed", path: "/before", before: true }
    ])
    expect(compareOracleValues({ unchanged: true }, { unchanged: true })).toEqual([])
  })

  it("accepts exact intentional deltas and rejects unexpected or stale entries", () => {
    const deltas = compareOracleValues({ count: 1 }, { count: 2 })
    const exact: ReadonlyArray<IntentionalOracleDelta> = [
      {
        _tag: "Changed",
        path: "/count",
        before: 1,
        after: 2,
        rationale: "Effect 4 intentionally changes this fixture.",
        issue: "#225"
      }
    ]
    expect(classifyOracleDeltas(deltas, exact)).toEqual({ unexpected: [], stale: [], duplicateIntentional: [] })
    expect(classifyOracleDeltas(deltas, [])).toEqual({ unexpected: deltas, stale: [], duplicateIntentional: [] })
    expect(classifyOracleDeltas([], exact)).toEqual({ unexpected: [], stale: exact, duplicateIntentional: [] })
    expect(classifyOracleDeltas(deltas, [...exact, ...exact]).duplicateIntentional).toEqual(exact)
    expect(createOracleDeltaReport(deltas, exact)).toMatchObject({ bySurface: { count: 1 }, total: 1 })
    const variants = [
      { _tag: "Added", path: "", after: true },
      { _tag: "Removed", path: "", before: false },
      { _tag: "Changed", path: "", before: 1, after: 2 },
      { _tag: "Changed", path: "/a~1b~0c", before: "before", after: "after" }
    ] as const
    expect(variants.map(formatOracleDelta)).toEqual([
      "/: added true",
      "/: removed false",
      "/: 1 -> 2",
      '/a~1b~0c: "before" -> "after"'
    ])
    expect(createOracleDeltaReport(variants, [])).toMatchObject({ bySurface: { root: 3, "a/b~c": 1 }, total: 4 })
  })

  it("captures nested authored composition and boolean constraints in stable order", () => {
    expect(
      captureAuthoredConstraints([
        { name: "empty", inputSchema: { type: "string" } },
        {
          name: "constrained",
          inputSchema: {
            anyOf: [{ type: "string" }, { not: { const: false } }],
            properties: { values: { uniqueItems: true } },
            additionalProperties: false
          }
        }
      ])
    ).toEqual([
      {
        toolName: "constrained",
        constraints: [
          { path: ["additionalProperties"], value: false },
          { path: ["anyOf"], value: [{ type: "string" }, { not: { const: false } }] },
          { path: ["anyOf", 1, "not"], value: { const: false } },
          { path: ["anyOf", 1, "not", "const"], value: false },
          { path: ["properties", "values", "uniqueItems"], value: true }
        ]
      }
    ])
  })

  it("normalizes stdio version surfaces and rejects unsuccessful captures", () => {
    const responses = decodeOracleStdioResponses(
      [
        { jsonrpc: "2.0", id: 1, result: { serverInfo: { name: "huly", version: "1.2.3" } } },
        {
          jsonrpc: "2.0",
          id: 2,
          result: { _meta: { "io.modelcontextprotocol/serverInfo": { name: "huly", version: "1.2.3" } } }
        },
        { jsonrpc: "2.0", id: 3, result: null },
        { jsonrpc: "2.0", id: 4, result: { _meta: null } },
        { jsonrpc: "2.0", id: 5, result: { _meta: { "io.modelcontextprotocol/serverInfo": null } } }
      ]
        .map((response) => JSON.stringify(response))
        .join("\n")
    )
    expect(responses[0]?.result).toMatchObject({ serverInfo: { version: "<package-version>" } })
    expect(responses[1]?.result).toMatchObject({
      _meta: { "io.modelcontextprotocol/serverInfo": { version: "<package-version>" } }
    })
    expect(responses[2]?.result).toBeNull()
    expect(responses[3]?.result).toEqual({ _meta: null })
    expect(responses[4]?.result).toEqual({ _meta: { "io.modelcontextprotocol/serverInfo": null } })
    expect(requireSuccessfulOracleProcess("fixture", { exitCode: 0, stdout: "ok", stderr: "" })).toMatchObject({
      stdout: "ok"
    })
    expect(() => requireSuccessfulOracleProcess("fixture", { exitCode: 1, stdout: "", stderr: "" })).toThrow("exit 1")
    expect(() =>
      requireSuccessfulOracleProcess("fixture", { exitCode: 0, stdout: "", stderr: "sanitized failure" })
    ).toThrow("sanitized failure")
  })

  it("builds current and legacy process inputs and normalizes CLI versions", () => {
    const decodeRequest = Schema.decodeUnknownSync(Schema.fromJsonString(OracleJsonRpcRequestSchema))
    const requests = oracleStdioInput()
      .trim()
      .split("\n")
      .map((line) => decodeRequest(line))
    expect(requests.map(({ id, method }) => ({ id, method }))).toEqual([
      { id: 1, method: "server/discover" },
      { id: LIST_TOOLS_REQUEST_ID, method: "tools/list" },
      { id: 3, method: "resources/templates/list" },
      { id: 4, method: "tools/call" },
      { id: 5, method: "tools/call" },
      { id: 6, method: "tools/call" },
      { id: 7, method: "resources/list" }
    ])
    expect(oracleLegacyStdioInput()).toContain('"protocolVersion":"2025-06-18"')
    expect(oracleLegacyStdioInput()).toContain(`"id":${LIST_TOOLS_REQUEST_ID},"method":"tools/list"`)
    expect(normalizeOracleCliVersion({ exitCode: 0, stderr: "", stdout: "Huly CLI 1.2.3\nUsage" })).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "Huly CLI <package-version>\nUsage"
    })
    expect(normalizeOracleCliVersion({ exitCode: 2, stderr: "failure", stdout: "" })).toEqual({
      exitCode: 2,
      stderr: "failure",
      stdout: ""
    })
  })

  it("classifies every reviewed delta surface and builds ordered category metadata", () => {
    const candidateToolIdentities = parseCandidateToolIdentities(candidateToolResponses(["future_tool", "list_issues"]))
    const deltas = [
      { _tag: "Added", path: "/registry/authoredConstraints/0/constraints/0", after: true },
      { _tag: "Changed", path: "/registry/tools/0/inputSchema/description", before: "old", after: "new" },
      { _tag: "Changed", path: "/registry/tools/0/outputSchema/type", before: "string", after: "number" },
      {
        _tag: "Changed",
        path: "/bundledProcesses/stdio/native/0/result/tools/1/description",
        before: "old",
        after: "new"
      },
      { _tag: "Changed", path: "/bundledProcesses/cli/rootHelp/stdout", before: "old", after: "new" },
      { _tag: "Changed", path: "/cli/errors/json/message", before: "old", after: "new" }
    ] as const
    expect(deltas.map((delta) => oracleDeltaReviewCategory(delta, candidateToolIdentities))).toEqual([
      "authored-constraints",
      "schema-metadata",
      "draft07-structure",
      "issue-assignee-description",
      "cli-help",
      "cli-json-diagnostic"
    ])
    expect(oracleDeltaReviewCategory({ _tag: "Changed", path: "/cli/help/root", before: "old", after: "new" })).toBe(
      "cli-help"
    )
    expect(
      oracleDeltaReviewCategory({ _tag: "Changed", path: "/cli/result/stderr", before: "old", after: "new" })
    ).toBe("cli-json-diagnostic")
    expect(oracleDeltaReviewCategory({ _tag: "Added", path: "/unclassified", after: true })).toBeUndefined()
    expect(
      oracleDeltaReviewCategory(
        {
          _tag: "Changed",
          path: "/bundledProcesses/stdio/native/0/result/tools/0/description",
          before: "old",
          after: "unrelated future change"
        },
        candidateToolIdentities
      )
    ).toBeUndefined()

    const review = createOracleDeltaReview("baseline", "current", deltas, candidateToolIdentities)
    expect(review.categories.map(({ category, issue }) => ({ category, issue }))).toEqual([
      { category: "draft07-structure", issue: "#225" },
      { category: "schema-metadata", issue: "#225" },
      { category: "authored-constraints", issue: "#225" },
      { category: "issue-assignee-description", issue: "#245" },
      { category: "cli-json-diagnostic", issue: "#228" },
      { category: "cli-help", issue: "#228" }
    ])
    expect(() =>
      createOracleDeltaReview("baseline", "current", [{ _tag: "Added", path: "/unclassified", after: true }])
    ).toThrow("unclassified")
  })

  it("classifies issue-assignee descriptions by candidate tool name across reorder and insertion", () => {
    const firstCandidate = parseCandidateToolIdentities(
      candidateToolResponses(["list_issues", "create_issue", "update_issue"])
    )
    const reorderedCandidate = parseCandidateToolIdentities(
      candidateToolResponses(["future_inserted_tool", "update_issue", "list_issues", "create_issue"])
    )
    const descriptionDelta = (toolIndex: number) => ({
      _tag: "Changed" as const,
      path: `/bundledProcesses/stdio/native/0/result/tools/${toolIndex}/description`,
      before: "old",
      after: "new"
    })
    const inputDescriptionDelta = (toolIndex: number, fieldName = "assignee") => ({
      _tag: "Changed" as const,
      path: `/bundledProcesses/stdio/native/0/result/tools/${toolIndex}/inputSchema/properties/${fieldName}/description`,
      before: "old",
      after: "new"
    })

    expect([0, 1, 2].map((index) => oracleDeltaReviewCategory(descriptionDelta(index), firstCandidate))).toEqual([
      "issue-assignee-description",
      "issue-assignee-description",
      "issue-assignee-description"
    ])
    expect([1, 2, 3].map((index) => oracleDeltaReviewCategory(descriptionDelta(index), reorderedCandidate))).toEqual([
      "issue-assignee-description",
      "issue-assignee-description",
      "issue-assignee-description"
    ])
    expect(oracleDeltaReviewCategory(descriptionDelta(0), reorderedCandidate)).toBeUndefined()
    expect([0, 1, 2].map((index) => oracleDeltaReviewCategory(inputDescriptionDelta(index), firstCandidate))).toEqual([
      "issue-assignee-description",
      "issue-assignee-description",
      "issue-assignee-description"
    ])
    expect(
      [1, 2, 3].map((index) => oracleDeltaReviewCategory(inputDescriptionDelta(index), reorderedCandidate))
    ).toEqual(["issue-assignee-description", "issue-assignee-description", "issue-assignee-description"])
    expect(oracleDeltaReviewCategory(inputDescriptionDelta(0), reorderedCandidate)).toBe("schema-metadata")
    expect(oracleDeltaReviewCategory(inputDescriptionDelta(1, "unrelated"), reorderedCandidate)).toBe("schema-metadata")
    expect(
      oracleDeltaReviewCategory(
        {
          ...inputDescriptionDelta(1),
          path: "/bundledProcesses/stdio/native/0/result/tools/1/inputSchema/properties/assignee/anyOf/0/description"
        },
        reorderedCandidate
      )
    ).toBe("schema-metadata")
  })

  it("leaves malformed candidate tool entries unclassified", () => {
    const delta = {
      _tag: "Changed" as const,
      path: "/bundledProcesses/stdio/native/0/result/tools/0/description",
      before: "old",
      after: "new"
    }
    const responses = (result: unknown) =>
      Schema.decodeUnknownSync(Schema.Array(OracleJsonRpcResponseSchema))([{ id: 2, jsonrpc: "2.0", result }])

    expect(oracleDeltaReviewCategory(delta)).toBeUndefined()
    expect(oracleDeltaReviewCategory(delta, parseCandidateToolIdentities(responses(null)))).toBeUndefined()
    expect(oracleDeltaReviewCategory(delta, parseCandidateToolIdentities(responses({})))).toBeUndefined()
    expect(oracleDeltaReviewCategory(delta, parseCandidateToolIdentities(responses({ tools: [null] })))).toBeUndefined()
    expect(oracleDeltaReviewCategory(delta, parseCandidateToolIdentities(responses({ tools: [{}] })))).toBeUndefined()
  })

  it("rejects unclassified, zero-count, duplicate, and stale compact review categories", () => {
    const fixture = canonicalJson({ count: 1 })
    const review = (categories: ReadonlyArray<unknown>) =>
      Schema.decodeUnknownSync(OracleDeltaReviewSchema)({
        formatVersion: 1,
        baselineSha256: "7b2652e71fb224bd0ee1a2a62b131782d1b78604ef51c9b08f1dc01e4e6bf67b",
        reviewedCurrentSha256: "7b2652e71fb224bd0ee1a2a62b131782d1b78604ef51c9b08f1dc01e4e6bf67b",
        categories
      })
    expect(() =>
      verifyReviewedOracleDeltas(fixture, fixture, [{ _tag: "Added", path: "/unclassified", after: true }], review([]))
    ).toThrow("unclassified")

    const category = {
      category: "cli-help",
      count: 1,
      deltaSetSha256: "0".repeat(64),
      rationale: "Reviewed fixture.",
      issue: "#225"
    }
    expect(() => verifyReviewedOracleDeltas(fixture, fixture, [], review([category, category]))).toThrow("duplicate")
    expect(() => review([{ ...category, count: 0 }])).toThrow()
    expect(() => review([{ ...category, rationale: "   " }])).toThrow()
    expect(() => review([{ ...category, issue: "issue-225" }])).toThrow()

    const reviewedDelta = { _tag: "Changed", path: "/cli/errors/json/message", before: "old", after: "new" } as const
    const exactReview = createOracleDeltaReview(fixture, fixture, [reviewedDelta])
    expect(() => verifyReviewedOracleDeltas(fixture, fixture, [reviewedDelta], exactReview)).not.toThrow()
    expect(() => verifyReviewedOracleDeltas(fixture, fixture, [], exactReview)).toThrow("differs")
    expect(() => verifyReviewedOracleDeltas("changed", fixture, [reviewedDelta], exactReview)).toThrow("baseline")
    expect(() => verifyReviewedOracleDeltas(fixture, "changed", [reviewedDelta], exactReview)).toThrow("corpus")
    expect(() => verifyReviewedOracleDeltas(fixture, fixture, [reviewedDelta], review([]))).toThrow("unreviewed")
  })

  it("groups authored-constraint audit details by stable tool and rejects invalid associations", async () => {
    const baselineJson = await fs.readFile(EFFECT4_ORACLE_PATH, "utf8")
    const baseline = Schema.decodeUnknownSync(Schema.fromJsonString(BehavioralOracleSchema))(baselineJson)
    const firstTool = baseline.registry.authoredConstraints[0]
    const secondTool = baseline.registry.authoredConstraints[1]
    expect(firstTool).toBeDefined()
    expect(secondTool).toBeDefined()
    if (firstTool === undefined || secondTool === undefined) return

    const authoredDelta = {
      _tag: "Added",
      path: "/registry/authoredConstraints/0/constraints/0/value",
      after: true
    } as const
    const report = createOracleDeltaAuditReport(baselineJson, baselineJson, baseline, baseline, [authoredDelta])
    expect(report.authoredConstraintsByTool).toEqual([{ toolName: firstTool.toolName, deltas: [authoredDelta] }])
    expect(report.categories).toEqual([{ category: "authored-constraints", deltas: [authoredDelta] }])

    expect(() =>
      createOracleDeltaAuditReport(baselineJson, baselineJson, baseline, baseline, [
        { _tag: "Added", path: "/registry/authoredConstraints/not-an-index/value", after: true }
      ])
    ).toThrow("invalid path")
    expect(() =>
      createOracleDeltaAuditReport(baselineJson, baselineJson, baseline, baseline, [
        { _tag: "Added", path: "/registry/authoredConstraints/999999/value", after: true }
      ])
    ).toThrow("stable tool")

    const changedCurrent = Schema.decodeUnknownSync(BehavioralOracleSchema)({
      ...baseline,
      registry: {
        ...baseline.registry,
        authoredConstraints: [
          { ...firstTool, toolName: secondTool.toolName },
          ...baseline.registry.authoredConstraints.slice(1)
        ]
      }
    })
    expect(() =>
      createOracleDeltaAuditReport(baselineJson, baselineJson, baseline, changedCurrent, [authoredDelta])
    ).toThrow("stable tool")
    expect(() =>
      createOracleDeltaAuditReport(baselineJson, baselineJson, baseline, baseline, [
        { _tag: "Added", path: "/unclassified", after: true }
      ])
    ).toThrow("unclassified")
  })

  it("renders the report command through injected corpus boundaries", async () => {
    const baselineJson = await readEffect4OracleBaseline()
    const writes: Array<string> = []
    const dependencies = {
      readBaseline: async () => baselineJson,
      renderCurrent: async () => baselineJson,
      write: (content: string) => writes.push(content)
    }
    await runEffect4OracleDeltaReportCommand(undefined, dependencies)
    expect(writes).toHaveLength(1)
    expect(
      Schema.decodeUnknownSync(Schema.fromJsonString(OracleDeltaAuditReportSchema))(writes[0] ?? "")
    ).toMatchObject({ categories: [], authoredConstraintsByTool: [] })
    await expect(
      reportEffect4OracleDeltas({
        readBaseline: async () => "not-json",
        renderCurrent: async () => baselineJson,
        write: (content) => writes.push(content)
      })
    ).rejects.toThrow()
    await runEffect4OracleDeltaReportCommand("true", {
      readBaseline: async () => Promise.reject(new Error("must not run")),
      renderCurrent: async () => Promise.reject(new Error("must not run")),
      write: () => {
        throw new Error("must not run")
      }
    })
    writeEffect4OracleDeltaReport("")
  })

  it("rejects unexpected and stale deltas through the file verifier", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "effect4-oracle-parity-"))
    try {
      const oraclePath = path.join(root, EFFECT4_ORACLE_PATH)
      const reviewPath = path.join(root, EFFECT4_ORACLE_DELTA_REVIEW_PATH)
      await fs.mkdir(path.dirname(oraclePath), { recursive: true })
      await fs.writeFile(oraclePath, '{"count":1}\n', "utf8")
      await fs.writeFile(
        reviewPath,
        canonicalJson({
          formatVersion: 1,
          baselineSha256: "bc237aec467eef4ad72ab44c19ed2edbed79f7b5824a2e7ebfb3faf583433e66",
          reviewedCurrentSha256: "bc237aec467eef4ad72ab44c19ed2edbed79f7b5824a2e7ebfb3faf583433e66",
          categories: []
        }),
        "utf8"
      )
      await expect(verifyEffect4Oracle(root, '{"count":2}\n')).rejects.toThrow("/count")
      await expect(verifyEffect4Oracle(root, '{"count":1}\n')).resolves.toBe(oraclePath)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})

describe("Effect 4 oracle Draft-07 validation", () => {
  const RuntimeFixture = Schema.Struct({
    code: Schema.NonEmptyString,
    count: Schema.Int,
    pair: Schema.Tuple([Schema.String, Schema.Number])
  })
  const RuntimeFixtureJsonSchema = toDraft07JsonSchema(RuntimeFixture)

  it("compiles the complete current native and proxy corpora without CLI imports", () => {
    expect(validateCurrentDraft07Corpora()).toEqual({ native: 524, proxy: 6 })
  }, 60_000)

  it("compiles complete tool documents and rejects duplicate names or dialect leaks", () => {
    const outputSchema = toDraft07JsonSchema(Schema.Struct({ accepted: Schema.Boolean }))
    expect(
      validateDraft07ToolCorpus([{ name: "fixture", inputSchema: RuntimeFixtureJsonSchema, outputSchema }])
    ).toHaveLength(1)
    expect(
      validateDraft07DiscoveryResult({
        tools: [{ name: "fixture", inputSchema: RuntimeFixtureJsonSchema, outputSchema }]
      })
    ).toBe(1)
    expect(() =>
      validateDraft07ToolCorpus([
        { name: "fixture", inputSchema: RuntimeFixtureJsonSchema, outputSchema },
        { name: "fixture", inputSchema: RuntimeFixtureJsonSchema, outputSchema }
      ])
    ).toThrow("duplicate tool")
    expect(() =>
      validateDraft07ToolCorpus([
        {
          name: "newer-dialect",
          inputSchema: { $schema: "http://json-schema.org/draft-07/schema#", type: "array", prefixItems: [] },
          outputSchema
        }
      ])
    ).toThrow("prefixItems")
    expect(() =>
      validateDraft07ToolCorpus([
        {
          name: "missing-ref",
          inputSchema: { $schema: "http://json-schema.org/draft-07/schema#", $ref: "#/$defs/Missing" },
          outputSchema
        }
      ])
    ).toThrow("unresolved local ref")
    expect(() =>
      validateDraft07ToolCorpus([
        {
          name: "legacy-definition-ref",
          inputSchema: { $schema: "http://json-schema.org/draft-07/schema#", $ref: "#/definitions/Legacy" },
          outputSchema
        }
      ])
    ).toThrow("unrestored Draft-07 definition ref")
    expect(() =>
      validateDraft07ToolCorpus([{ name: "missing-dialect", inputSchema: { type: "string" }, outputSchema }])
    ).toThrow("must declare")
    expect(() =>
      validateDraft07ToolCorpus([
        {
          name: "invalid-draft07",
          inputSchema: { $schema: "http://json-schema.org/draft-07/schema#", type: "not-a-json-schema-type" },
          outputSchema
        }
      ])
    ).toThrow("not valid Draft-07")
    expect(() =>
      validateDraft07ToolCorpus([
        {
          name: "external-ref",
          inputSchema: { $schema: "http://json-schema.org/draft-07/schema#", $ref: "https://example.test/schema" },
          outputSchema
        }
      ])
    ).toThrow("not valid Draft-07")
  })

  it("resolves escaped JSON Pointer definition names", () => {
    const schema = {
      $schema: "http://json-schema.org/draft-07/schema#",
      $defs: { "A/B~C": { type: "string" } },
      $ref: "#/$defs/A~1B~0C"
    }
    expect(validateDraft07ToolCorpus([{ name: "escaped", inputSchema: schema, outputSchema: schema }])).toHaveLength(1)
  })

  it("proves representative runtime parsing agrees with emitted Draft-07", () => {
    verifyRuntimeDraft07Agreement({
      name: "struct-refinement-tuple",
      schema: RuntimeFixture,
      jsonSchema: RuntimeFixtureJsonSchema,
      samples: [
        { code: "A", count: 1, pair: ["left", 2] },
        { code: "", count: 1, pair: ["left", 2] },
        { code: "A", count: 1.5, pair: ["left", 2] },
        { code: "A", count: 1, pair: ["left"] }
      ]
    })
  })

  it("rejects runtime and Draft-07 disagreement", () => {
    expect(() =>
      verifyRuntimeDraft07Agreement({
        name: "disagreement",
        schema: Schema.String,
        jsonSchema: toDraft07JsonSchema(Schema.Number),
        samples: ["accepted-only-at-runtime"]
      })
    ).toThrow("runtime/Draft-07 disagreement")
  })

  it("proves authored cross-field constraints agree with the matching runtime rule", () => {
    const SourceFixture = Schema.Struct({
      filePath: Schema.optionalKey(Schema.String),
      fileUrl: Schema.optionalKey(Schema.String)
    }).pipe(
      Schema.check(
        Schema.makeFilter((value) =>
          (value.filePath === undefined) !== (value.fileUrl === undefined) ? undefined : "Provide exactly one source."
        )
      )
    )
    const authored = withExactlyOneRequired(toDraft07JsonSchema(SourceFixture), ["filePath", "fileUrl"])
    expect(
      validateDraft07ToolCorpus([
        {
          name: "authored",
          inputSchema: authored,
          outputSchema: toDraft07JsonSchema(Schema.Struct({ accepted: Schema.Boolean }))
        }
      ])
    ).toHaveLength(1)
    verifyRuntimeDraft07Agreement({
      name: "authored-exactly-one",
      schema: SourceFixture,
      jsonSchema: authored,
      samples: [
        { filePath: "/tmp/a" },
        { fileUrl: "https://example.test/a" },
        {},
        { filePath: "/tmp/a", fileUrl: "https://example.test/a" }
      ]
    })
  })
})
