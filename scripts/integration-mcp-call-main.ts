import { Effect, Schema } from "effect"
import { resolve } from "node:path"
import {
  integrationMcpCall,
  integrationMcpListTools,
  IntegrationMcpCallError,
  IntegrationMcpPhaseSchema,
  integrationMcpClock
} from "./integration-mcp-call.js"

import { makePriorIdentity, readPriorCache, PRIOR_CACHE_ENV } from "./integration-mcp-prior.js"
import { prepareIntegrationMcpPrior } from "./integration-mcp-prior-prepare.js"

const ARGUMENT_OFFSET = 2
const main = async (): Promise<void> => {
  const publish = (event: unknown): void => {
    process.stderr.write(`${JSON.stringify(Schema.decodeUnknownSync(IntegrationMcpPhaseSchema)(event))}\n`)
  }
  publish({ phase: "bundle-ready", elapsedMilliseconds: 0 })
  try {
    const options = {
      command: process.execPath,
      args: [resolve("dist/index.cjs")],
      environment: {
        ...process.env,
        HULY_TOOL_MODE: "native",
        LAZY_ENVS: "true",
        HULY_MCP_TELEMETRY: "0",
        HULY_CLI_TELEMETRY: "0"
      }
    }
    if (process.argv[ARGUMENT_OFFSET] === "--prepare-prior") {
      const path = await Effect.runPromise(prepareIntegrationMcpPrior(process.argv[ARGUMENT_OFFSET + 1], options))
      process.stdout.write(JSON.stringify({ priorCache: path }) + "\n")
      return
    }
    const cachePath = process.env[PRIOR_CACHE_ENV]
    const prior =
      cachePath === undefined
        ? undefined
        : await Effect.runPromise(
            makePriorIdentity(options).pipe(Effect.flatMap((identity) => readPriorCache(cachePath, identity)))
          )
    const callOptions = { ...options, ...(prior === undefined ? {} : { prior }) }
    const telemetry = { now: integrationMcpClock, publish }
    const result =
      process.argv[ARGUMENT_OFFSET] === "--list-tools"
        ? await integrationMcpListTools(callOptions, telemetry)
        : await integrationMcpCall(process.argv.slice(ARGUMENT_OFFSET), callOptions, telemetry)
    process.stdout.write(`${JSON.stringify(result)}\n`)
  } catch (error) {
    process.stderr.write(
      `${error instanceof IntegrationMcpCallError ? error.message : "Integration MCP call failed during input; no automatic mutation retry performed."}\n`
    )
    process.exitCode = 1
  }
}
void main()
