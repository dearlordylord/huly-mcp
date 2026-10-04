import { resolve } from "node:path"
import { integrationMcpCall, IntegrationMcpCallError } from "./integration-mcp-call.js"

const ARGUMENT_OFFSET = 2
const main = async (): Promise<void> => {
  try {
    const result = await integrationMcpCall(process.argv.slice(ARGUMENT_OFFSET), {
      command: process.execPath,
      args: [resolve("dist/index.cjs")],
      environment: { ...process.env, HULY_TOOL_MODE: "native" }
    })
    process.stdout.write(`${JSON.stringify(result)}\n`)
  } catch (error) {
    process.stderr.write(
      `${error instanceof IntegrationMcpCallError ? error.message : "Integration MCP call failed during input; no automatic mutation retry performed."}\n`
    )
    process.exitCode = 1
  }
}
void main()
