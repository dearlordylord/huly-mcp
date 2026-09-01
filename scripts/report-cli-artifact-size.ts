import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { gzipSync } from "node:zlib"

import { Schema } from "effect"

import {
  cliArtifactSizeEvidenceMismatchError,
  cliArtifactSizeReport,
  CliArtifactSizeReportSchema,
  CliArtifactSizeSchema
} from "./cli-artifact-size.js"
import { parsePnpmPackMetadata, tarArchiveUnpackedSize } from "./cli-package-artifact.js"

const JSON_INDENT = 2
const evidencePath = "docs/migrations/effect-4/cli-artifact-size.json"
const write = process.argv.includes("--write")
const parseEvidence = Schema.decodeUnknownSync(Schema.fromJsonString(CliArtifactSizeReportSchema))

const main = async (): Promise<void> => {
  const directory = mkdtempSync(join(tmpdir(), "huly-cli-artifact-size-"))
  try {
    const packOutput = execFileSync(
      "pnpm",
      ["--dir", "packages/huly-cli", "pack", "--pack-destination", directory, "--json"],
      { encoding: "utf8", env: { ...process.env, npm_config_ignore_scripts: "true" } }
    )
    const metadata = parsePnpmPackMetadata(packOutput)
    const bundle = readFileSync("packages/huly-cli/dist/index.cjs")
    const report = cliArtifactSizeReport(
      Schema.decodeUnknownSync(CliArtifactSizeSchema)({
        bundleGzipBytes: gzipSync(bundle, { level: 9 }).byteLength,
        bundleRawBytes: bundle.byteLength,
        packageBytes: statSync(metadata.filename).size,
        packageUnpackedBytes: await tarArchiveUnpackedSize(metadata.filename)
      })
    )
    const encoded = `${JSON.stringify(Schema.encodeSync(CliArtifactSizeReportSchema)(report), null, JSON_INDENT)}\n`
    if (write) writeFileSync(evidencePath, encoded)
    else {
      const evidence = readFileSync(evidencePath, "utf8")
      if (evidence !== encoded) {
        throw cliArtifactSizeEvidenceMismatchError(parseEvidence(evidence), report)
      }
    }
    console.log(encoded.trimEnd())
    if (report.materialIncrease) process.exitCode = 1
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
}

void main()
