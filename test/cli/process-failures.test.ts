import { Schema } from "effect"
import { describe, expect, it } from "vitest"

import { CliFailureSchema } from "../../packages/huly-cli/src/failures.js"
import { runCapturedProcess } from "../../scripts/captured-process.js"
import type { FailureBoundaryScenario } from "./fixtures/failure-boundary-scenarios.js"

const parseCliFailure = Schema.decodeUnknownSync(Schema.fromJsonString(CliFailureSchema))
const PROCESS_TEST_TIMEOUT_MILLISECONDS = 20_000

const runCli = (args: ReadonlyArray<string>) =>
  runCapturedProcess(process.execPath, ["packages/huly-cli/dist/index.cjs", ...args], {})

const runFailureBoundary = (scenario: FailureBoundaryScenario) =>
  runCapturedProcess(
    process.execPath,
    ["--import", "tsx", "test/cli/fixtures/failure-boundary-process.ts", scenario],
    {}
  )

describe("CLI failure process boundary", { timeout: PROCESS_TEST_TIMEOUT_MILLISECONDS }, () => {
  it("writes one JSON failure to stderr, keeps stdout empty, and exits by taxonomy", async () => {
    const result = await runCli(["issues", "create", "--input-json", "{bad", "--json"])

    expect(result.exitCode).toBe(2)
    expect(result.stdout).toBe("")
    expect(result.stderr.trim().split("\n")).toHaveLength(1)
    expect(parseCliFailure(result.stderr)).toMatchObject({ code: "INVALID_INPUT", retryable: false })
  })

  it("keeps human failure output actionable and off stdout", async () => {
    const result = await runCli(["issues", "create", "--input-json", "{bad"])

    expect(result.exitCode).toBe(2)
    expect(result.stdout).toBe("")
    expect(result.stderr).toContain("Invalid JSON in --input-json")
    expect(result.stderr).not.toContain('"code"')
  })

  it("translates an unknown command into one JSON input failure", async () => {
    const result = await runCli(["nonsense", "--json"])

    expect(result.exitCode).toBe(2)
    expect(result.stdout).toBe("")
    expect(result.stderr.trim().split("\n")).toHaveLength(1)
    expect(parseCliFailure(result.stderr)).toMatchObject({ code: "INVALID_INPUT", retryable: false })
  })

  it("translates a missing required option into one JSON input failure", async () => {
    const result = await runCli(["profile", "create", "bad", "--json"])

    expect(result.exitCode).toBe(2)
    expect(result.stdout).toBe("")
    expect(result.stderr.trim().split("\n")).toHaveLength(1)
    expect(parseCliFailure(result.stderr)).toMatchObject({ code: "INVALID_INPUT", retryable: false })
  })

  it("routes explicit generated field flags through the built CLI before rendering one JSON failure", async () => {
    const result = await runCli([
      "issues",
      "list",
      "--project",
      "HULY",
      "--title-search",
      "bug",
      "--output",
      "out.json",
      "--json"
    ])

    expect(result.exitCode).toBe(2)
    expect(result.stdout).toBe("")
    expect(result.stderr.trim().split("\n")).toHaveLength(1)
    expect(parseCliFailure(result.stderr)).toMatchObject({
      code: "INVALID_INPUT",
      message: "issues list does not support --output.",
      retryable: false
    })
  })

  it("sanitizes an Effect defect at the process boundary", async () => {
    const result = await runFailureBoundary("defect")

    expect(result.exitCode).toBe(70)
    expect(result.stdout).toBe("")
    expect(result.stderr.trim().split("\n")).toHaveLength(1)
    expect(parseCliFailure(result.stderr)).toMatchObject({ code: "INTERNAL_ERROR", retryable: false })
    expect(result.stderr).not.toContain("secret defect detail")
    expect(result.stderr).not.toContain("FiberFailure")
  })

  it("renders a known typed failure at the process boundary", async () => {
    const result = await runFailureBoundary("known")

    expect(result.exitCode).toBe(2)
    expect(result.stdout).toBe("")
    expect(result.stderr.trim().split("\n")).toHaveLength(1)
    expect(parseCliFailure(result.stderr)).toMatchObject({
      code: "INVALID_INPUT",
      message: "known input failure",
      retryable: false
    })
  })

  it.each(["interrupt", "empty"] satisfies ReadonlyArray<FailureBoundaryScenario>)(
    "sanitizes an %s cause at the process boundary",
    async (scenario) => {
      const result = await runFailureBoundary(scenario)

      expect(result.exitCode).toBe(70)
      expect(result.stdout).toBe("")
      expect(result.stderr.trim().split("\n")).toHaveLength(1)
      expect(parseCliFailure(result.stderr)).toMatchObject({ code: "INTERNAL_ERROR", retryable: false })
      expect(result.stderr).not.toContain("secret")
      expect(result.stderr).not.toContain("FiberFailure")
    }
  )

  it("treats a mixed cause with fatal reasons as internal", async () => {
    const result = await runFailureBoundary("mixed")

    expect(result.exitCode).toBe(70)
    expect(result.stdout).toBe("")
    expect(result.stderr.trim().split("\n")).toHaveLength(1)
    expect(parseCliFailure(result.stderr)).toMatchObject({ code: "INTERNAL_ERROR", retryable: false })
    expect(result.stderr).not.toContain("first known failure")
    expect(result.stderr).not.toContain("second known failure")
    expect(result.stderr).not.toContain("secret")
    expect(result.stderr).not.toContain("FiberFailure")
  })
})
