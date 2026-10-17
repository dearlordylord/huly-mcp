import { spawn } from "node:child_process"
import { once } from "node:events"
import { createInterface } from "node:readline"
import { Effect, Schema } from "effect"

import type { ResidentPackagePath } from "../../src/resident/managed-contract.js"
import type { ResidentDirectory } from "../../src/resident/protected-path.js"
import { ManagedParentConnected } from "../resident/managed-observation.js"
import { type HostName, ManagedNativeHostObservation } from "../resident/native-host-observation.js"
import { residentSelectionEnvironment } from "./resident-selection-environment.js"

const RESPONSE_BOUND = 5_000
const bounded = <A>(promise: Promise<A>) =>
  Effect.runPromise(Effect.promise(() => promise).pipe(Effect.timeout(RESPONSE_BOUND)))
// Internal child-process port; argv is parsed by the native-host fixture's Input schema.
export const spawnManagedNativeParent = (options: {
  readonly fixture: Schema.Schema.Type<typeof ResidentPackagePath>
  readonly bundle: Schema.Schema.Type<typeof ResidentPackagePath>
  readonly directory: ResidentDirectory
  readonly host: Schema.Schema.Type<typeof HostName>
  readonly workspace: "fixture" | "other-fixture"
}) => {
  const child = spawn(
    process.execPath,
    [options.fixture, options.bundle, options.directory, options.host, options.workspace],
    { env: residentSelectionEnvironment() }
  )
  const exited = once(child, "exit")
  void exited.catch(() => {})
  child.stderr.on("data", (chunk: Buffer) => process.stderr.write(chunk))
  child.stdin.on("error", () => process.stderr.write("Managed stop fixture command pipe closed\n"))
  const lines = createInterface({ input: child.stdout })
  const incoming = lines[Symbol.asyncIterator]()
  const next = async () => {
    const result = await bounded(incoming.next())
    if (result.done) throw new Error("Managed stop parent exited without an observation")
    return result.value
  }
  return {
    child,
    connected: async () => Schema.decodeUnknownSync(Schema.fromJsonString(ManagedParentConnected))(await next()),
    read: async () => Schema.decodeUnknownSync(Schema.fromJsonString(ManagedNativeHostObservation))(await next()),
    close: async () => {
      if (child.exitCode === null && child.signalCode === null) child.stdin.end("close\n")
      try {
        return await bounded(exited)
      } finally {
        lines.close()
      }
    }
  }
}
