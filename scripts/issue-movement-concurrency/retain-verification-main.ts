import { lstat, realpath, writeFile } from "node:fs/promises"
import { isAbsolute, join } from "node:path"
import { Effect, Schema } from "effect"
import { MovementIssueSchema } from "../../src/domain/schemas/issue-movement-state.js"
import { TransferInspectionSchema, TransferIssueSchema } from "../../src/domain/schemas/issue-transfer.js"
import { DocId } from "../../src/domain/schemas/shared.js"
import { RetainedEvidenceSchema } from "./retain-evidence.js"

class VerificationRetentionError extends Schema.TaggedError<VerificationRetentionError>()(
  "VerificationRetentionError",
  { phase: Schema.Literals(["input", "write"]) }
) {}
const PRIVATE_DIRECTORY_MODE = 0o700
const PRIVATE_FILE_MODE = 0o600
const PERMISSION_MASK = 0o777
const SnapshotSchema = Schema.Struct({
  issues: Schema.Array(
    Schema.Struct({
      issue: Schema.Struct({ ...MovementIssueSchema.fields, ...TransferIssueSchema.fields }),
      owned: TransferInspectionSchema,
      incomingReferences: Schema.Array(Schema.Json)
    })
  ),
  projects: Schema.Array(Schema.JsonObject),
  migrationTransactions: Schema.optionalKey(Schema.Array(Schema.JsonObject))
})
const RecordProofSchema = Schema.Struct({
  valid: Schema.Boolean,
  lastModificationEvidence: Schema.Literals(["observed", "unavailable"]),
  records: Schema.Array(
    Schema.Struct({
      ownerId: DocId,
      recordId: DocId,
      status: Schema.Literals(["invalid", "unchanged", "authenticated", "metadata-unavailable"])
    })
  )
})
const ReceiptSchema = Schema.Struct({
  transport: RetainedEvidenceSchema.fields.transport,
  case: RetainedEvidenceSchema.fields.case,
  before: SnapshotSchema,
  after: SnapshotSchema,
  recordEvidence: RecordProofSchema
})
const InputSchema = Schema.Struct({ directory: Schema.NonEmptyString, ...ReceiptSchema.fields })
const run = Effect.gen(function* () {
  const input = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(InputSchema))(process.argv[2]).pipe(
    Effect.mapError(() => new VerificationRetentionError({ phase: "input" }))
  )
  yield* Effect.tryPromise({
    try: async () => {
      const info = await lstat(input.directory)
      if (
        !isAbsolute(input.directory) ||
        !info.isDirectory() ||
        info.isSymbolicLink() ||
        info.uid !== process.getuid?.() ||
        (info.mode & PERMISSION_MASK) !== PRIVATE_DIRECTORY_MODE ||
        (await realpath(input.directory)) !== input.directory
      )
        throw new VerificationRetentionError({ phase: "write" })
      await writeFile(
        join(input.directory, `concurrency-verification-${input.transport}-${input.case}.json`),
        Schema.encodeSync(Schema.fromJsonString(ReceiptSchema))(input) + "\n",
        { mode: PRIVATE_FILE_MODE, flag: "wx" }
      )
    },
    catch: () => new VerificationRetentionError({ phase: "write" })
  })
})
void Effect.runPromise(run).catch(() => {
  process.stderr.write("Concurrency verification retention unavailable\n")
  process.exitCode = 1
})
