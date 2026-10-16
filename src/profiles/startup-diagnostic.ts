import { createInterface } from "node:readline"
import type { Readable } from "node:stream"
import { Effect, Schema } from "effect"
import { handleStartupDiagnosticRequest, StartupDiagnosticConfigSchema } from "../startup-diagnostic-mcp.js"
import { writeStderrLine } from "../utils/stderr.js"
import type { CliProfileStoreError } from "./model.js"

// Internal stdio ports; the protocol schemas own all serialized data.
interface DiagnosticStdio {
  readonly input: Readable
  readonly writeOutput: (value: string) => void
  readonly writeError: (value: string) => void
}
export const runProfileStartupDiagnostic = (
  error: CliProfileStoreError,
  serverVersion: string,
  io: DiagnosticStdio = {
    input: process.stdin,
    writeOutput: process.stdout.write.bind(process.stdout),
    writeError: writeStderrLine
  }
) =>
  Effect.callback<void>((resume) => {
    const message = `Huly MCP profile startup failed: ${error.message} After recovery, restart this MCP server.`
    const config = Schema.decodeUnknownSync(StartupDiagnosticConfigSchema)({
      serverVersion,
      message,
      error: { code: "PROFILE_CREDENTIALS_UNAVAILABLE", message }
    })
    io.writeError(message)
    const lines = createInterface({ input: io.input })
    lines.on("line", (line) => {
      const response = handleStartupDiagnosticRequest(line, config)
      if (response !== undefined) io.writeOutput(`${response}\n`)
    })
    lines.on("close", () => resume(Effect.void))
    return Effect.sync(() => lines.close())
  })
