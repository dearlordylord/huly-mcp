import { readFileSync } from "node:fs"

import { Console, Effect, Schema } from "effect"

import {
  FullIntegrationInventorySchema,
  FullIntegrationProtocolOnlyCasesSchema,
  FullIntegrationToolNamesSchema
} from "./full-integration-inventory-contract.js"

const ListIntegrationCasesArgumentsSchema = Schema.Tuple([
  Schema.Literal("scripts/integration_test_full.sh"),
  Schema.Literals(["mcp", "cli"]),
  Schema.Literals(["bundled-mcp", "packed-cli"])
])
const IntegrationSourceSchema = Schema.String

const NODE_ARGUMENT_OFFSET = 2
const [sourcePath, surface, artifact] = Schema.decodeUnknownSync(ListIntegrationCasesArgumentsSchema)(
  process.argv.slice(NODE_ARGUMENT_OFFSET)
)
const source = Schema.decodeUnknownSync(IntegrationSourceSchema)(readFileSync(sourcePath, "utf8"))
const toolCalls = Schema.decodeUnknownSync(FullIntegrationToolNamesSchema)(
  Array.from(source.matchAll(/\\?"name\\?":\\?"([a-z0-9_]+)\\?"/g), (match) => match[1]).filter(
    (toolName): toolName is string => toolName !== undefined
  )
)
const protocolOnlyCases = Schema.decodeUnknownSync(FullIntegrationProtocolOnlyCasesSchema)(
  Array.from(
    source.matchAll(/"(resources\/(?:templates\/list|list\(projects\)|read (?:project|issue))[^"\n]*)"/g),
    (match) => match[1]?.replace(/\(\$[^)]*\)/g, "")
  ).filter((caseName): caseName is string => caseName !== undefined)
)
const inventory = Schema.encodeSync(FullIntegrationInventorySchema)({
  artifact,
  protocolOnlyCases: [...new Set(protocolOnlyCases)],
  scenario: sourcePath,
  surface,
  toolCalls,
  uniqueTools: [...new Set(toolCalls)].sort()
})

Effect.runSync(Console.log(JSON.stringify(inventory)))
