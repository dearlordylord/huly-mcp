import { spawn } from "node:child_process"
import { once } from "node:events"
import { createInterface } from "node:readline"
import { Effect, Schema } from "effect"

import type { ResidentPackagePath } from "../../src/resident/managed-contract.js"
import {
  ActiveQueryCommand,
  ActiveQueryEvent,
  ActiveQueryHostInput,
  OUTPUT_EXIT_BOUND
} from "../resident/active-query-contract.js"
import { residentSelectionEnvironment } from "./resident-selection-environment.js"

const RESPONSE_BOUND = 5_000
export const boundActiveQuery = <A>(promise: Promise<A>) =>
  Effect.runPromise(Effect.promise(() => promise).pipe(Effect.timeout(RESPONSE_BOUND)))

export const spawnActiveQueryParent = (
  host: Schema.Schema.Type<typeof ResidentPackagePath>,
  input: ActiveQueryHostInput
) => {
  const child = spawn(process.execPath, [host, Schema.encodeSync(Schema.fromJsonString(ActiveQueryHostInput))(input)], {
    env: residentSelectionEnvironment()
  })
  const exited = once(child, "exit")
  void exited.catch(() => {})
  child.stderr.on("data", (chunk: Buffer) => process.stderr.write(chunk))
  child.stdin.on("error", () => process.stderr.write("Active query command channel closed\n"))
  const lines = createInterface({ input: child.stdout })
  const incoming = lines[Symbol.asyncIterator]()
  const send = (command: ActiveQueryCommand) =>
    child.stdin.write(`${Schema.encodeSync(Schema.fromJsonString(ActiveQueryCommand))(command)}\n`)
  const nextWithin = async (bound: number) => {
    const line = await Effect.runPromise(Effect.promise(() => incoming.next()).pipe(Effect.timeout(bound)))
    if (line.done) throw new Error("Active query ended before its observation")
    return Schema.decodeUnknownSync(Schema.fromJsonString(ActiveQueryEvent))(line.value)
  }
  return {
    child,
    send,
    next: () => nextWithin(RESPONSE_BOUND),
    nextAfterOutputDeadline: () => nextWithin(OUTPUT_EXIT_BOUND),
    close: async () => {
      if (child.exitCode === null && child.signalCode === null && !child.stdin.writableEnded) {
        send({ _tag: "close" })
        child.stdin.end()
      }
      try {
        return await boundActiveQuery(exited)
      } finally {
        lines.close()
      }
    }
  }
}
