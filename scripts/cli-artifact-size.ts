import { Schema } from "effect"

const PercentSchema = Schema.Number.pipe(Schema.check(Schema.isFinite()), Schema.brand("CliArtifactPercent"))
const ByteCountSchema = Schema.Int.pipe(
  Schema.check(Schema.isGreaterThanOrEqualTo(0)),
  Schema.brand("CliArtifactByteCount")
)
const ByteDeltaSchema = Schema.Int.pipe(Schema.brand("CliArtifactByteDelta"))
type CliArtifactByteCount = Schema.Schema.Type<typeof ByteCountSchema>
type CliArtifactByteDelta = Schema.Schema.Type<typeof ByteDeltaSchema>
type CliArtifactPercent = Schema.Schema.Type<typeof PercentSchema>

export const CliArtifactSizeSchema = Schema.Struct({
  bundleGzipBytes: ByteCountSchema,
  bundleRawBytes: ByteCountSchema,
  packageBytes: ByteCountSchema,
  packageUnpackedBytes: ByteCountSchema
})
export type CliArtifactSize = Schema.Schema.Type<typeof CliArtifactSizeSchema>

const CliArtifactSizeDeltaSchema = Schema.Struct({ bytes: ByteDeltaSchema, percent: PercentSchema })

const ARTIFACT_SIZE_FIELDS = ["bundleGzipBytes", "bundleRawBytes", "packageBytes", "packageUnpackedBytes"] as const
const MATERIAL_INCREASE_PERCENT = 10
const PERCENT_MULTIPLIER = 100

const parseArtifactSizeDelta = Schema.decodeUnknownSync(CliArtifactSizeDeltaSchema)
const measuredDelta = (
  current: CliArtifactByteCount,
  baseline: CliArtifactByteCount
): { readonly bytes: CliArtifactByteDelta; readonly percent: CliArtifactPercent } =>
  parseArtifactSizeDelta({ bytes: current - baseline, percent: ((current - baseline) / baseline) * PERCENT_MULTIPLIER })

const CliArtifactSizeReportFields = Schema.Struct({
  baseline: CliArtifactSizeSchema,
  current: CliArtifactSizeSchema,
  delta: Schema.Struct({
    bundleGzipBytes: CliArtifactSizeDeltaSchema,
    bundleRawBytes: CliArtifactSizeDeltaSchema,
    packageBytes: CliArtifactSizeDeltaSchema,
    packageUnpackedBytes: CliArtifactSizeDeltaSchema
  }),
  materialIncrease: Schema.Boolean
})
export const CliArtifactSizeReportSchema = CliArtifactSizeReportFields.check(
  Schema.makeFilter((report) => {
    const deltasMatch = ARTIFACT_SIZE_FIELDS.every((field) => {
      const expected = measuredDelta(report.current[field], report.baseline[field])
      const actual = report.delta[field]
      return actual.bytes === expected.bytes && actual.percent === expected.percent
    })
    const materialIncrease = ARTIFACT_SIZE_FIELDS.some(
      (field) => report.delta[field].percent > MATERIAL_INCREASE_PERCENT
    )
    return deltasMatch && report.materialIncrease === materialIncrease
      ? undefined
      : "Artifact deltas and material-increase status must match the baseline and current measurements."
  })
)
export type CliArtifactSizeReport = Schema.Schema.Type<typeof CliArtifactSizeReportSchema>

const encodeCliArtifactSizeReport = Schema.encodeSync(CliArtifactSizeReportSchema)

export const cliArtifactSizeEvidenceMismatchError = (
  expected: CliArtifactSizeReport,
  actual: CliArtifactSizeReport
): Error =>
  new Error(
    "CLI artifact metrics are stale. Run pnpm update-cli-artifact-size." +
      `\nExpected: ${JSON.stringify(encodeCliArtifactSizeReport(expected))}` +
      `\nActual: ${JSON.stringify(encodeCliArtifactSizeReport(actual))}`
  )

export const CLI_ARTIFACT_SIZE_BASELINE = Schema.decodeUnknownSync(CliArtifactSizeSchema)({
  bundleGzipBytes: 1_506_144,
  bundleRawBytes: 8_124_110,
  packageBytes: 1_542_645,
  packageUnpackedBytes: 8_382_949
})

export const cliArtifactSizeReport = (current: CliArtifactSize): CliArtifactSizeReport => {
  const delta = {
    bundleGzipBytes: measuredDelta(current.bundleGzipBytes, CLI_ARTIFACT_SIZE_BASELINE.bundleGzipBytes),
    bundleRawBytes: measuredDelta(current.bundleRawBytes, CLI_ARTIFACT_SIZE_BASELINE.bundleRawBytes),
    packageBytes: measuredDelta(current.packageBytes, CLI_ARTIFACT_SIZE_BASELINE.packageBytes),
    packageUnpackedBytes: measuredDelta(current.packageUnpackedBytes, CLI_ARTIFACT_SIZE_BASELINE.packageUnpackedBytes)
  }
  return CliArtifactSizeReportSchema.make({
    baseline: CLI_ARTIFACT_SIZE_BASELINE,
    current,
    delta,
    materialIncrease: ARTIFACT_SIZE_FIELDS.some((field) => delta[field].percent > MATERIAL_INCREASE_PERCENT)
  })
}
