import { execFile } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"
import { Exit, Schema } from "effect"

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
export class ResidentObservationRejected extends Error {
  constructor(cause: unknown) {
    super("Quint rejected observed admission decision", { cause })
  }
}

export const replayResidentAdmissions = async (input: ReadonlyArray<AdmissionObservation>) => {
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
      [
        join(process.cwd(), "node_modules/@informalsystems/quint/dist/src/cli.js"),
        "test",
        path,
        "--backend=typescript",
        "--match",
        "Test$",
        "--max-samples=1"
      ],
      { timeout: 4_000, killSignal: "SIGKILL" }
    )
  } catch (error) {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined)
    const parsed = Schema.decodeUnknownExit(QuintTestFailure)(error)
    if (
      Exit.isSuccess(parsed) &&
      parsed.value.stdout.includes("observedTest") &&
      parsed.value.stdout.includes("[QNT513]") &&
      parsed.value.stdout.includes("Cannot continue in `then`")
    )
      throw new ResidentObservationRejected(error)
    throw error
  }
  await rm(directory, { recursive: true, force: true })
}
