import { spawn } from "node:child_process"
import { once } from "node:events"
import { createInterface } from "node:readline"
import { Effect, Schema } from "effect"

import type { ResidentPackagePath } from "../../src/resident/managed-contract.js"
import { ModelWaitCommand, ModelWaitEvent, ModelWaitHostInput } from "../resident/model-wait-contract.js"
import { residentSelectionEnvironment } from "./resident-selection-environment.js"

const RESPONSE_BOUND = 5_000
export const boundModelWait = <A>(promise: Promise<A>) =>
  Effect.runPromise(Effect.promise(() => promise).pipe(Effect.timeout(RESPONSE_BOUND)))

export const spawnModelWaitParent = (
  host: Schema.Schema.Type<typeof ResidentPackagePath>,
  input: ModelWaitHostInput
) => {
  const child = spawn(process.execPath, [host, Schema.encodeSync(Schema.fromJsonString(ModelWaitHostInput))(input)], {
    env: residentSelectionEnvironment()
  })
  const exited = once(child, "exit")
  void exited.catch(() => {})
  child.stderr.on("data", (chunk: Buffer) => process.stderr.write(chunk))
  child.stdin.on("error", () => process.stderr.write("Model waiter command channel closed\n"))
  const lines = createInterface({ input: child.stdout })
  const incoming = lines[Symbol.asyncIterator]()
  const send = (command: ModelWaitCommand) =>
    child.stdin.write(`${Schema.encodeSync(Schema.fromJsonString(ModelWaitCommand))(command)}\n`)
  return {
    child,
    send,
    next: async () => {
      const line = await boundModelWait(incoming.next())
      if (line.done) throw new Error("Model waiter ended before its observation")
      return Schema.decodeUnknownSync(Schema.fromJsonString(ModelWaitEvent))(line.value)
    },
    close: async () => {
      if (child.exitCode === null && child.signalCode === null) {
        send({ _tag: "close" })
        child.stdin.end()
      }
      try {
        return await boundModelWait(exited)
      } finally {
        lines.close()
      }
    }
  }
}
