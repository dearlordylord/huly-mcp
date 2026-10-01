import { getDefaultEnvironment } from "@modelcontextprotocol/client/stdio"

// The SDK owns its subprocess environment contract and filters inherited variables.
export const testStdioEnvironment = () => ({
  ...getDefaultEnvironment(),
  HULY_CLI_TELEMETRY: "0",
  HULY_MCP_TELEMETRY: "0",
  LAZY_ENVS: "true"
})
