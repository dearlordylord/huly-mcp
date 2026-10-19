import { execFile } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { promisify } from "node:util"
import { Exit, Option, Schema } from "effect"

import type { ResidentPackagePath } from "../../src/resident/managed-contract.js"

export const AdmissionObservation = Schema.Struct({
  event: Schema.Literals(["Begin", "Finish", "Fence", "LateOwner", "Closed"]),
  allowed: Schema.Boolean,
  pending: Schema.Natural,
  members: Schema.Natural,
  accepting: Schema.Boolean
})
export type AdmissionObservation = Schema.Schema.Type<typeof AdmissionObservation>
const runFile = promisify(execFile)
const QuintTestFailure = Schema.Struct({
  code: Schema.Literal(1),
  killed: Schema.Literal(false),
  stdout: Schema.String,
  stderr: Schema.String
})
const QuintProcessFailure = Schema.Struct({
  code: Schema.optionalKey(Schema.Union([Schema.Int, Schema.String, Schema.Null])),
  signal: Schema.optionalKey(Schema.NullOr(Schema.String)),
  killed: Schema.optionalKey(Schema.Boolean),
  stdout: Schema.optionalKey(Schema.String),
  stderr: Schema.optionalKey(Schema.String)
})
export class ResidentObservationRejected extends Error {
  constructor(cause: unknown) {
    super("Quint rejected observed admission decision", { cause })
  }
}

export const replayResidentAdmissions = async (
  input: ReadonlyArray<AdmissionObservation>,
  cli: Schema.Schema.Type<typeof ResidentPackagePath>
) => {
  const observations = Schema.decodeUnknownSync(Schema.Array(AdmissionObservation))(input)
  if (observations.length === 0) throw new Error("Missing resident admission observations")
  const steps = observations.map(
    ({ accepting, allowed, event, members, pending }) =>
      `.then(observeAdmission(${event}, ${String(allowed)}, ${pending}, ${members}, ${String(accepting)}))`
  )
  const directory = await mkdtemp(join(process.cwd(), "dist/resident-launch-replay-"))
  const path = join(directory, "replay.qnt")
  try {
    await writeFile(
      path,
      `module resident_launch_replay {
  import resident_launch_observations.* from "../../quint-specs/resident-launch-observations"
  import resident_launch.* from "../../quint-specs/resident-launch"
  run observedTest = observedOwner${steps.join("")}.expect(safety)
}\n`
    )
    // One owned Node process: no package-manager wrapper or Rust evaluator child.
    await runFile(
      process.execPath,
      [cli, "test", path, "--backend=typescript", "--match", "Test$", "--max-samples=1"],
      {
        timeout: 4_000,
        killSignal: "SIGKILL",
        env: { ...process.env, NODE_COMPILE_CACHE: join(dirname(cli), "compile-cache") }
      }
    )
  } catch (error) {
    const parsed = Schema.decodeUnknownExit(QuintTestFailure)(error)
    if (
      Exit.isSuccess(parsed) &&
      parsed.value.stdout.includes("observedTest") &&
      parsed.value.stdout.includes("[QNT513]") &&
      parsed.value.stdout.includes("Cannot continue in `then`")
    ) {
      await rm(directory, { recursive: true, force: true })
      throw new ResidentObservationRejected(error)
    }
    const diagnostic = Schema.decodeUnknownOption(QuintProcessFailure)(error)
    if (Option.isSome(diagnostic))
      await writeFile(
        join(directory, "failure.json"),
        Schema.encodeSync(Schema.fromJsonString(QuintProcessFailure))(diagnostic.value),
        { flag: "wx", mode: 0o600 }
      ).catch(() => process.stderr.write("Resident replay failure receipt could not be written\n"))
    process.stderr.write(`Resident observation replay failed; retained ${directory}\n`)
    throw error
  }
  await rm(directory, { recursive: true, force: true })
}
