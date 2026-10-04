import { Effect, Schema } from "effect"
import { WorkspaceInfoSchema } from "../../src/domain/schemas/workspace.js"
import { UrlString } from "../../src/domain/schemas/shared.js"
import { runPublic } from "./public-process.js"

const VERSION_READ_TIMEOUT_MS = 30_000
const upstream = Schema.decodeUnknownSync(UrlString)(process.argv[2])
void Effect.runPromise(
  Effect.tryPromise({
    try: async (signal) => {
      const result = await runPublic(
        ["packages/huly-cli/dist/index.cjs", "workspace", "info", "get", "--json"],
        upstream,
        signal
      )
      const workspace = Schema.decodeUnknownSync(Schema.fromJsonString(WorkspaceInfoSchema))(result)
      if (workspace.version === undefined) throw new Error("Actual workspace server version unavailable")
      return { workspaceVersion: workspace.version }
    },
    catch: () => new Error("Unable to establish actual workspace server version")
  }).pipe(Effect.timeout(VERSION_READ_TIMEOUT_MS))
).then(
  (evidence) => process.stdout.write(`${JSON.stringify(evidence)}\n`),
  () => {
    process.stderr.write("Actual server-version read failed.\n")
    process.exitCode = 1
  }
)
