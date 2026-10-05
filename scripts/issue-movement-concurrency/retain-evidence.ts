import { lstat, realpath, writeFile } from "node:fs/promises"
import { isAbsolute, join } from "node:path"
import { Effect, Schema } from "effect"
import { ScenarioEvidence } from "./scenario-contract.js"

const PRIVATE_DIRECTORY_MODE = 0o700
const PRIVATE_FILE_MODE = 0o600
const PERMISSION_MODE_MASK = 0o777
const CaseName = Schema.Literals([
  "refuse-stale-child",
  "preserve-later-child",
  "refuse-stale-comment",
  "preserve-later-comment",
  "refuse-stale-time",
  "preserve-later-time",
  "refuse-stale-attribute",
  "preserve-later-attribute",
  "refuse-stale-ancestry",
  "preserve-later-ancestry",
  "before-allocation-send",
  "allocated-reply-lost",
  "successful-batch-reply-lost",
  "verification-outage"
])
export const RetainedEvidenceSchema = Schema.Struct({
  transport: Schema.Literals(["mcp", "cli"]),
  case: CaseName,
  evidence: ScenarioEvidence
})
const RetentionInputSchema = Schema.Struct({ directory: Schema.NonEmptyString, receipt: RetainedEvidenceSchema })
export class EvidenceRetentionError extends Schema.TaggedError<EvidenceRetentionError>()("EvidenceRetentionError", {
  stage: Schema.Literals(["input", "directory", "write"])
}) {}
// The fixture shell supplies custody configuration; the existing scenario schema owns every retained payload.
export const retainConcurrencyEvidence = (input: unknown) =>
  Effect.gen(function* () {
    const parsed = yield* Schema.decodeUnknownEffect(RetentionInputSchema)(input).pipe(
      Effect.mapError(() => new EvidenceRetentionError({ stage: "input" }))
    )
    yield* Effect.tryPromise({
      try: async () => {
        const directory = await lstat(parsed.directory)
        const owner = process.getuid?.()
        if (
          !isAbsolute(parsed.directory) ||
          owner === undefined ||
          !directory.isDirectory() ||
          directory.isSymbolicLink() ||
          directory.uid !== owner ||
          (directory.mode & PERMISSION_MODE_MASK) !== PRIVATE_DIRECTORY_MODE ||
          (await realpath(parsed.directory)) !== parsed.directory
        )
          throw new Error("Private evidence directory unavailable")
      },
      catch: () => new EvidenceRetentionError({ stage: "directory" })
    })
    const path = join(parsed.directory, `concurrency-${parsed.receipt.transport}-${parsed.receipt.case}.json`)
    yield* Effect.tryPromise({
      try: () =>
        writeFile(path, Schema.encodeSync(Schema.fromJsonString(RetainedEvidenceSchema))(parsed.receipt) + "\n", {
          mode: PRIVATE_FILE_MODE,
          flag: "wx"
        }),
      catch: () => new EvidenceRetentionError({ stage: "write" })
    })
  })
