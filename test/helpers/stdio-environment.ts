import { getDefaultEnvironment } from "@modelcontextprotocol/client/stdio"
import { Schema } from "effect"

const parseCompileCache = Schema.decodeUnknownSync(Schema.UndefinedOr(Schema.NonEmptyString))

// The SDK owns its subprocess environment contract and filters inherited variables.
export const testStdioEnvironment = () => {
  const cache = parseCompileCache(process.env.HULY_TEST_SUBPROCESS_COMPILE_CACHE ?? process.env.NODE_COMPILE_CACHE)
  return {
    ...getDefaultEnvironment(),
    // Only bundled subprocesses use bytecode caching; the instrumented Vitest process does not.
    ...(cache === undefined ? {} : { NODE_COMPILE_CACHE: cache }),
    HULY_CLI_TELEMETRY: "0",
    HULY_MCP_TELEMETRY: "0",
    LAZY_ENVS: "true"
  }
}
