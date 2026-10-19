import assert from "node:assert/strict"
import { StringDecoder } from "node:string_decoder"
import { Client } from "@modelcontextprotocol/client"
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/client/stdio"
import { Schema } from "effect"

const DiagnosticSchema = Schema.Struct({
  error: Schema.Struct({ code: Schema.Literal("PROFILE_CREDENTIALS_UNAVAILABLE"), message: Schema.NonEmptyString })
})
const EnvironmentSchema = Schema.Record(Schema.String, Schema.String)
const DiagnosticToolsSchema = Schema.Struct({
  tools: Schema.Tuple([
    Schema.Struct({ name: Schema.Literal("get_huly_startup_diagnostic"), description: Schema.NonEmptyString })
  ])
})
const blocked = new Set(["HULY_URL", "HULY_WORKSPACE", "HULY_TOKEN", "HULY_EMAIL", "HULY_PASSWORD"])
export const profileProbeEnvironment = (input: NodeJS.ProcessEnv): Record<string, string> =>
  Schema.decodeUnknownSync(EnvironmentSchema)(
    Object.fromEntries(Object.entries(input).filter(([name, value]) => !blocked.has(name) && value !== undefined))
  )

export const probeProfileStartup = async (entry: string, environment: Record<string, string>, expected: RegExp) => {
  for (const version of ["2025-06-18", "2026-07-28"]) {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [entry],
      env: { ...getDefaultEnvironment(), ...environment, HULY_MCP_TELEMETRY: "0" },
      stderr: "pipe"
    })
    let stderr = ""
    const decoder = new StringDecoder("utf8")
    transport.stderr?.on("data", (chunk: unknown) => {
      stderr += decoder.write(Schema.decodeUnknownSync(Schema.Uint8Array)(chunk))
    })
    const client = new Client(
      { name: "profile-failure-qualification", version: "1.0.0" },
      { versionNegotiation: { mode: version === "2025-06-18" ? "legacy" : { pin: version } } }
    )
    try {
      await client.connect(transport, { timeout: 30000 })
      const {
        tools: [tool]
      } = Schema.decodeUnknownSync(DiagnosticToolsSchema)(await client.listTools())
      assert.match(tool.description, expected)
      const result = await client.callTool({ name: "get_huly_startup_diagnostic", arguments: {} })
      assert.equal(result.isError, true)
      const diagnostic = Schema.decodeUnknownSync(DiagnosticSchema)(result.structuredContent)
      assert.match(diagnostic.error.message, expected)
      assert.match(stderr, expected)
    } finally {
      await transport.close()
    }
  }
}
