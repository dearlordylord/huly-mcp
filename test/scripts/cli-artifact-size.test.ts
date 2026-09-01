import { Schema } from "effect"
import { describe, expect, it } from "vitest"

import {
  cliArtifactSizeEvidenceMismatchError,
  cliArtifactSizeReport,
  CLI_ARTIFACT_SIZE_BASELINE,
  CliArtifactSizeReportSchema,
  CliArtifactSizeSchema
} from "../../scripts/cli-artifact-size.js"

describe("CLI artifact size report", () => {
  it("reports both expected and actual reports when evidence is stale", () => {
    const expected = cliArtifactSizeReport(CLI_ARTIFACT_SIZE_BASELINE)
    const actual = cliArtifactSizeReport(
      Schema.decodeUnknownSync(CliArtifactSizeSchema)({
        ...CLI_ARTIFACT_SIZE_BASELINE,
        bundleRawBytes: CLI_ARTIFACT_SIZE_BASELINE.bundleRawBytes + 1
      })
    )
    const encodeReport = Schema.encodeSync(CliArtifactSizeReportSchema)

    expect(cliArtifactSizeEvidenceMismatchError(expected, actual).message).toBe(
      "CLI artifact metrics are stale. Run pnpm update-cli-artifact-size." +
        `\nExpected: ${JSON.stringify(encodeReport(expected))}` +
        `\nActual: ${JSON.stringify(encodeReport(actual))}`
    )
  })

  it("reports reproducible absolute and percentage deltas", () => {
    const report = cliArtifactSizeReport(
      Schema.decodeUnknownSync(CliArtifactSizeSchema)({ ...CLI_ARTIFACT_SIZE_BASELINE, bundleRawBytes: 8_936_521 })
    )

    expect(report.delta.bundleRawBytes).toEqual({ bytes: 812_411, percent: 10 })
    expect(report.materialIncrease).toBe(false)
  })

  it("rejects increases above the material-change threshold", () => {
    const report = cliArtifactSizeReport(
      Schema.decodeUnknownSync(CliArtifactSizeSchema)({ ...CLI_ARTIFACT_SIZE_BASELINE, packageBytes: 1_700_000 })
    )

    expect(report.delta.packageBytes.percent).toBeGreaterThan(10)
    expect(report.materialIncrease).toBe(true)
  })

  it("rejects evidence whose derived delta does not match its measurements", () => {
    const report = cliArtifactSizeReport(CLI_ARTIFACT_SIZE_BASELINE)

    expect(() =>
      Schema.decodeUnknownSync(CliArtifactSizeReportSchema)({
        ...report,
        delta: { ...report.delta, bundleRawBytes: { bytes: 1, percent: 1 } }
      })
    ).toThrow("Artifact deltas and material-increase status must match")
  })
})
