import { readFileSync, writeFileSync } from "node:fs"

import { Console, Effect, Schema } from "effect"

import {
  certifyPackedArtifact,
  packedArtifactEvidenceMismatchError,
  PackedArtifactCertificationSchema
} from "./package-artifact-certification.js"

const CertificationArgumentsSchema = Schema.Tuple([
  Schema.NonEmptyString,
  Schema.Literals(["mcp", "cli"]),
  Schema.NonEmptyString
])
const WriteArgumentsSchema = Schema.Tuple([
  Schema.NonEmptyString,
  Schema.Literals(["mcp", "cli"]),
  Schema.NonEmptyString,
  Schema.Literal("--write")
])
const ArgumentsSchema = Schema.Union([CertificationArgumentsSchema, WriteArgumentsSchema])

const processArgumentOffset = 2
const jsonIndent = 2

const [archivePath, kind, version, writeFlag] = Schema.decodeUnknownSync(ArgumentsSchema)(
  process.argv.slice(processArgumentOffset)
)
const expected =
  kind === "mcp"
    ? {
        binName: "huly-mcp",
        expectedEntries: ["package/LICENSE", "package/README.md", "package/dist/index.cjs", "package/package.json"],
        expectedExternalModules: ["@opentelemetry/api", "ws"],
        name: "@firfi/huly-mcp",
        version
      }
    : {
        binName: "huly",
        expectedEntries: [
          "package/LICENSE",
          "package/README.md",
          "package/dist/index.cjs",
          "package/package.json",
          "package/skills/huly-cli/SKILL.md",
          "package/skills/huly-cli/agents/openai.yaml",
          "package/skills/huly-cli/references/automation.md"
        ],
        expectedExternalModules: ["ws"],
        name: "@firfi/huly-cli",
        version
      }

const main = async (): Promise<void> => {
  const certification = await certifyPackedArtifact(archivePath, expected)
  if (kind === "mcp") {
    const evidencePath = "docs/certification/mcp-artifact-certification.json"
    const parseEvidence = Schema.decodeUnknownSync(Schema.fromJsonString(PackedArtifactCertificationSchema))
    if (writeFlag === "--write") {
      writeFileSync(evidencePath, `${JSON.stringify(certification, undefined, jsonIndent)}\n`)
    } else {
      const expectedCertification = parseEvidence(readFileSync(evidencePath, "utf8"))
      if (JSON.stringify(certification) !== JSON.stringify(expectedCertification)) {
        throw packedArtifactEvidenceMismatchError(expectedCertification, certification)
      }
    }
  }
  process.stdout.write(`${JSON.stringify(certification)}\n`)
}

main().catch(async (error: unknown) => {
  await Effect.runPromise(Console.error(error))
  process.exitCode = 1
})
