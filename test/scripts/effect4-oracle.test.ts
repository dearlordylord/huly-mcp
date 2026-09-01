import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"

import { Schema } from "effect"
import { describe, expect, it } from "vitest"

import { canonicalJson } from "../../scripts/effect4-oracle-canonical.js"
import { runCapturedProcess } from "../../scripts/captured-process.js"
import { validateCurrentDraft07Corpora } from "../../scripts/effect4-oracle-current-corpus.js"
import {
  EFFECT4_ORACLE_DELTA_REVIEW_PATH,
  EFFECT4_ORACLE_PATH,
  verifyEffect4Oracle,
  writeEffect4Oracle
} from "../../scripts/effect4-oracle-io.js"
import { BehavioralOracleSchema, JsonValueSchema } from "../../scripts/effect4-oracle-schema.js"

const readCheckedOracle = async () =>
  Schema.decodeUnknownSync(Schema.fromJsonString(BehavioralOracleSchema))(
    await fs.readFile(EFFECT4_ORACLE_PATH, "utf8")
  )

describe("Effect 4 behavioral oracle", () => {
  it("captures complete registries and deterministic CLI fixtures", async () => {
    const oracle = await readCheckedOracle()

    expect(oracle).toMatchObject({
      formatVersion: 1,
      bundledProcesses: {
        artifacts: { cli: { embeddedManifestVersion: true }, mcp: { embeddedManifestVersion: true } },
        cli: {
          rootHelp: { exitCode: 0, stderr: "", stdout: expect.stringContaining("Huly CLI <package-version>") },
          jsonErrorBeforeDeepCommand: {
            exitCode: 2,
            stderr: expect.stringContaining('"code":"INVALID_INPUT"'),
            stdout: ""
          },
          jsonErrorAfterDeepCommand: {
            exitCode: 2,
            stderr: expect.stringContaining('"code":"INVALID_INPUT"'),
            stdout: ""
          }
        },
        stdio: {
          legacy: expect.arrayContaining([expect.objectContaining({ id: 1 }), expect.objectContaining({ id: 2 })]),
          native: expect.arrayContaining([expect.objectContaining({ id: 2 }), expect.objectContaining({ id: 7 })]),
          proxy: expect.any(Array)
        }
      },
      registry: {
        authoredConstraints: expect.arrayContaining([
          expect.objectContaining({ toolName: "list_activity" }),
          expect.objectContaining({ toolName: "upload_drive_file" })
        ]),
        rawOrder: expect.arrayContaining(["list_projects", "create_issue"]),
        operationOrder: expect.arrayContaining(["list_projects", "create_issue"]),
        tools: expect.arrayContaining([expect.objectContaining({ name: "list_projects", category: "projects" })]),
        builtinNames: ["get_version", "get_huly_context"],
        proxyNames: ["list_tool_categories", "search_tools", "get_tool_schema", "invoke_tool"]
      },
      resources: { dynamicResourceInventory: true },
      cli: {
        parity: { live: { cliRoutes: 522, ignoredOperations: 0, registryOperations: 522, routesWithoutOperations: 0 } },
        routes: expect.arrayContaining([
          expect.objectContaining({ path: ["issues", "create"], toolName: "create_issue" })
        ]),
        help: {
          root: expect.stringContaining("Huly CLI effect-3-oracle"),
          group: expect.stringContaining("huly issues create"),
          leaf: expect.stringContaining("Create an issue")
        },
        input: {
          jsonLast: { globals: { json: false, yes: false }, input: { limit: 2, query: "from json" } },
          fileLast: { globals: { json: false, yes: false }, input: { limit: 1, query: "from file" } },
          explicitLast: { globals: { json: true, yes: false }, input: { limit: 3, query: "positional query" } }
        },
        errors: {
          defect: { decoded: { code: "INTERNAL_ERROR", message: expect.any(String), retryable: false } },
          human: { exitStatus: 2, stderr: expect.stringContaining("Invalid JSON") },
          json: { decoded: { code: "INVALID_INPUT", retryable: false } }
        }
      }
    })

    const nativeDiscovery = oracle.bundledProcesses.stdio.native.find((response) => response.id === 1)
    expect(JSON.stringify(nativeDiscovery)).toContain('"version":"<package-version>"')
    const resourceList = oracle.bundledProcesses.stdio.native.find((response) => response.id === 7)
    expect(resourceList?.result).toMatchObject({ resources: [] })
    const legacyInitialize = oracle.bundledProcesses.stdio.legacy.find((response) => response.id === 1)
    expect(legacyInitialize?.result).toMatchObject({ protocolVersion: "2025-06-18" })
    expect(JSON.stringify(legacyInitialize)).toContain('"version":"<package-version>"')
    const constraintKeywords = new Set(
      oracle.registry.authoredConstraints.flatMap(({ constraints }) =>
        constraints.map(({ path }) => path.at(-1)).filter((part): part is string => typeof part === "string")
      )
    )
    expect(constraintKeywords).toContain("additionalProperties")
    expect(constraintKeywords).toContain("anyOf")
    expect(constraintKeywords).toContain("not")
    expect(constraintKeywords).toContain("oneOf")
  })

  it("sorts object keys while retaining array order and rejects non-JSON values", () => {
    expect(canonicalJson({ z: 1, a: [{ y: true, x: "first" }, "second"] })).toBe(
      '{\n  "a": [\n    {\n      "x": "first",\n      "y": true\n    },\n    "second"\n  ],\n  "z": 1\n}\n'
    )
    expect(canonicalJson({ a: 1, z: 2 })).toContain('"z": 2')
    expect(() => canonicalJson({ invalid: Number.NaN })).toThrow("finite numbers")
    expect(() => canonicalJson(Symbol("invalid"))).toThrow("unsupported symbol")
    expect(() => canonicalJson({ omitted: undefined })).toThrow("unsupported undefined")
    expect(() => canonicalJson(new Date(0))).toThrow("unsupported object")
    const symbolKeyed = { valid: true }
    Object.defineProperty(symbolKeyed, Symbol("hidden"), { value: true })
    expect(() => canonicalJson(symbolKeyed)).toThrow("symbol keys")
    const nonEnumerable = { valid: true }
    Object.defineProperty(nonEnumerable, "hidden", { enumerable: false, value: true })
    expect(() => canonicalJson(nonEnumerable)).toThrow("enumerable data properties")
    const cyclicArray: Array<unknown> = []
    cyclicArray.push(cyclicArray)
    expect(() => canonicalJson(cyclicArray)).toThrow("must not contain cycles")
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(() => canonicalJson(cyclic)).toThrow("must not contain cycles")
    expect(() => Schema.decodeUnknownSync(JsonValueSchema)(undefined)).toThrow()
    expect(() => Schema.decodeUnknownSync(JsonValueSchema)(new Date(0))).toThrow()
    expect(() => Schema.decodeUnknownSync(JsonValueSchema)(cyclic)).toThrow()
  })

  it("compiles every native and proxy public schema as Draft-07", () => {
    expect(validateCurrentDraft07Corpora()).toEqual({ native: 524, proxy: 6 })
  }, 60_000)

  it("terminates and reaps an oracle subprocess after its deadline", async () => {
    await expect(
      runCapturedProcess(
        process.execPath,
        ["-e", 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1_000)'],
        {},
        "",
        50
      )
    ).rejects.toThrow("timed out and was terminated")
  })

  it("writes and verifies exact canonical bytes", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "effect4-oracle-io-"))
    try {
      const content = canonicalJson({ small: "deterministic fixture" })
      const oraclePath = await writeEffect4Oracle(root, content)
      const reviewPath = path.join(root, EFFECT4_ORACLE_DELTA_REVIEW_PATH)
      await fs.writeFile(
        reviewPath,
        canonicalJson({
          formatVersion: 1,
          baselineSha256: "9053d8e8efe22940ca928624fae1b62a9e7aa5e0b2bd9782ad54915b498ea53a",
          reviewedCurrentSha256: "9053d8e8efe22940ca928624fae1b62a9e7aa5e0b2bd9782ad54915b498ea53a",
          categories: []
        }),
        "utf8"
      )
      expect(oraclePath).toBe(path.join(root, EFFECT4_ORACLE_PATH))
      await expect(verifyEffect4Oracle(root, content)).resolves.toBe(oraclePath)
      await expect(verifyEffect4Oracle(root, canonicalJson({ small: "changed fixture" }))).rejects.toThrow("/small")
      await fs.writeFile(
        reviewPath,
        canonicalJson({
          formatVersion: 1,
          baselineSha256: "0".repeat(64),
          reviewedCurrentSha256: "9053d8e8efe22940ca928624fae1b62a9e7aa5e0b2bd9782ad54915b498ea53a",
          categories: []
        }),
        "utf8"
      )
      await expect(verifyEffect4Oracle(root, content)).rejects.toThrow(
        /^Effect 4 behavioral oracle differs from docs\/migrations\/effect-4\/behavioral-oracle\.json\.$/
      )
    } finally {
      await fs.rm(root, { force: true, recursive: true })
    }
  })
})
