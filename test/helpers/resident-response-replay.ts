import { execFile } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"
import type { Schema } from "effect"
import type { ResidentPackagePath } from "../../src/resident/managed-contract.js"
import { quintNodeArguments, quintSubprocessEnvironment } from "./resident-quint-cli.js"

import type { ResidentResponseObservation } from "../../src/resident/response-observations.js"

const runFile = promisify(execFile)
const MODEL_CONTEXTS = 4
const REPLAY_BOUND = 5_000

export const replayResidentResponses = async (
  streams: ReadonlyArray<ReadonlyArray<ResidentResponseObservation>>,
  cli: Schema.Schema.Type<typeof ResidentPackagePath>
) => {
  const steps: Array<string> = []
  let nextContext = 0
  for (const stream of streams) {
    if (stream.length === 0) throw new Error("Missing resident response observations")
    const contexts = new Map<number, number>()
    for (const observation of stream) {
      if (observation.event === "Started") {
        if (contexts.has(observation.request)) throw new Error("Duplicate resident request context")
        if (nextContext >= MODEL_CONTEXTS) throw new Error("Observed trace exceeds the declared model domain")
        contexts.set(observation.request, nextContext++)
      } else {
        const context = contexts.get(observation.request)
        if (context === undefined) throw new Error("Response observed without an owning request context")
        steps.push(`.then(observeResult(${context}, ${observation.event}, ${String(observation.accepted)}))`)
      }
    }
  }
  if (steps.length === 0) throw new Error("Resident trace has no response decisions to replay")
  const directory = await mkdtemp(join(process.cwd(), "dist/resident-replay-"))
  const path = join(directory, "replay.qnt")
  try {
    await writeFile(
      path,
      `module resident_replay {
  import resident_response_ownership.* from "../../quint-specs/resident-response-ownership"
  run observedTest = init${steps.join("")}.expect(safety)
}\n`
    )
    await runFile(process.execPath, quintNodeArguments(cli, ["test", path, "--backend=typescript"]), {
      timeout: REPLAY_BOUND,
      killSignal: "SIGKILL",
      env: quintSubprocessEnvironment(cli)
    })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
