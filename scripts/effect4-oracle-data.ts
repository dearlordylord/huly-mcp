import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"

import { NodeServices } from "@effect/platform-node"
import { Effect, Option, Result, Schema } from "effect"

import { cliCommandCatalog, type CliToolName } from "../packages/huly-cli/src/catalog.js"
import { CliCommandSegment } from "../packages/huly-cli/src/command-schema.js"
import { parseCliCommandLine } from "../packages/huly-cli/src/cli-options.js"
import { CLI_FAILURE_CONTRACT, CliFailureSchema, presentCliFailure } from "../packages/huly-cli/src/failures.js"
import { CliHelpRequest, CliHelpWidth, CliPackageVersion } from "../packages/huly-cli/src/help-schema.js"
import { renderCliHelp } from "../packages/huly-cli/src/help.js"
import { buildCliInvocation, CliInputError } from "../packages/huly-cli/src/input.js"
import { CLI_PARITY_BASELINE, CLI_PARITY_TARGET } from "../packages/huly-cli/src/parity-contract.js"
import { CliRuntimeError } from "../packages/huly-cli/src/render.js"
import { getHulyContextToolDefinition, versionToolDefinition } from "../src/mcp/huly-context-tool.js"
import { proxyToolDefinitions } from "../src/mcp/proxy-tools.js"
import { parseHulyResourceUri } from "../src/mcp/resources.js"
import { operationRegistry, toolRegistry } from "../src/mcp/tools/index.js"
import { canonicalJson } from "./effect4-oracle-canonical.js"
import { captureAuthoredConstraints } from "./effect4-oracle-constraints.js"
import { validateCurrentDraft07Corpora } from "./effect4-oracle-current-corpus.js"
import { validateDraft07DiscoveryResult } from "./effect4-oracle-draft07.js"
import { captureBundledProcessOracle } from "./effect4-oracle-process-capture.js"
import { LIST_TOOLS_REQUEST_ID } from "./effect4-oracle-process.js"
import { type BehavioralOracle, BehavioralOracleSchema, type BundledProcesses } from "./effect4-oracle-schema.js"

const ORACLE_HELP_WIDTH = 100
const HELP_WIDTH = CliHelpWidth.make(ORACLE_HELP_WIDTH)
const ORACLE_CLI_VERSION = CliPackageVersion.make("effect-3-oracle")

const renderedHelp = (pathSegments: ReadonlyArray<string>): string =>
  Option.getOrThrow(
    renderCliHelp(
      CliHelpRequest.make({
        path: pathSegments.map((segment) => CliCommandSegment.make(segment)),
        version: ORACLE_CLI_VERSION,
        width: HELP_WIDTH
      })
    )
  )

const cliTool = (name: CliToolName) => {
  return Option.getOrThrow(Option.fromNullishOr(toolRegistry.tools.get(name)))
}

const invokeCli = (name: CliToolName, raw: ReadonlyArray<string>) => {
  const tool = cliTool(name)
  return Effect.runPromise(
    parseCliCommandLine(tool, cliCommandCatalog[name], raw).pipe(
      Effect.flatMap((parsed) => buildCliInvocation(tool, cliCommandCatalog[name], parsed)),
      Effect.provide(NodeServices.layer)
    )
  )
}

const captureCliInputFixtures = async () => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "huly-effect4-oracle-"))
  const inputPath = path.join(temporaryDirectory, "input.json")
  await fs.writeFile(inputPath, '{"query":"from file","limit":1}', "utf8")

  try {
    const jsonLast = await invokeCli("fulltext_search", [
      "--input-file",
      inputPath,
      "--input-json",
      '{"query":"from json","limit":2}'
    ])
    const fileLast = await invokeCli("fulltext_search", [
      '--input-json={"query":"from json","limit":2}',
      `--input-file=${inputPath}`
    ])
    const explicitLast = await invokeCli("fulltext_search", [
      "positional query",
      "--input-json",
      '{"query":"from json","limit":2}',
      "--limit",
      "3",
      "--json"
    ])
    return { explicitLast, fileLast, jsonLast }
  } finally {
    await fs.rm(temporaryDirectory, { force: true, recursive: true })
  }
}

const isKnownCliError = (error: unknown): error is CliInputError | CliRuntimeError =>
  error instanceof CliInputError || error instanceof CliRuntimeError

const captureCliErrorFixtures = async () => {
  const invalidJson = await Effect.runPromise(
    Effect.result(
      parseCliCommandLine(cliTool("fulltext_search"), cliCommandCatalog.fulltext_search, ["--input-json", "{bad"]).pipe(
        Effect.flatMap((parsed) =>
          buildCliInvocation(cliTool("fulltext_search"), cliCommandCatalog.fulltext_search, parsed)
        ),
        Effect.provide(NodeServices.layer)
      )
    )
  )
  const invalidJsonFailure = Option.getOrThrow(Result.getFailure(invalidJson))
  const human = presentCliFailure(invalidJsonFailure, false, isKnownCliError)
  const json = presentCliFailure(invalidJsonFailure, true, isKnownCliError)
  const defect = presentCliFailure(new Error("secret oracle defect"), true, isKnownCliError)
  return {
    defect: { ...defect, decoded: Schema.decodeUnknownSync(Schema.fromJsonString(CliFailureSchema))(defect.stderr) },
    human,
    json: { ...json, decoded: Schema.decodeUnknownSync(Schema.fromJsonString(CliFailureSchema))(json.stderr) }
  }
}

const captureInvalidResource = () => {
  try {
    parseHulyResourceUri("https://example.invalid/not-huly")
    throw new Error("Resource oracle invalid URI fixture unexpectedly succeeded.")
  } catch (error) {
    const parsedError = Schema.decodeUnknownSync(Schema.instanceOf(Error))(error)
    return { message: parsedError.message, name: parsedError.name }
  }
}

const cliRoutes = () =>
  Object.entries(cliCommandCatalog)
    .map(([toolName, spec]) => ({ toolName, ...spec }))
    .sort((left, right) => left.toolName.localeCompare(right.toolName))

const liveParity = () => {
  const operationNames = new Set(operationRegistry.definitions.map((tool) => tool.name))
  const routeNames = new Set(Object.keys(cliCommandCatalog))
  return {
    cliRoutes: routeNames.size,
    ignoredOperations: [...operationNames].filter((name) => !routeNames.has(name)).length,
    registryOperations: operationNames.size,
    routesWithoutOperations: [...routeNames].filter((name) => !operationNames.has(name)).length
  }
}

export const requireOracleDiscoveries = (bundledProcesses: BundledProcesses) => {
  const native = bundledProcesses.stdio.native.find((response) => response.id === LIST_TOOLS_REQUEST_ID)
  const proxy = bundledProcesses.stdio.proxy.find((response) => response.id === LIST_TOOLS_REQUEST_ID)
  if (native === undefined || proxy === undefined) {
    throw new Error("Bundled oracle capture did not return both native and proxy tools/list responses.")
  }
  return { native, proxy }
}

type CaptureBundledProcesses = () => Promise<BundledProcesses>

export const captureEffect4Oracle = async (
  captureBundledProcesses: CaptureBundledProcesses = captureBundledProcessOracle
): Promise<BehavioralOracle> => {
  validateCurrentDraft07Corpora()
  const bundledProcesses = await captureBundledProcesses()
  const { native: nativeDiscovery, proxy: proxyDiscovery } = requireOracleDiscoveries(bundledProcesses)
  validateDraft07DiscoveryResult(nativeDiscovery.result)
  validateDraft07DiscoveryResult(proxyDiscovery.result)

  return Schema.decodeUnknownSync(BehavioralOracleSchema)({
    formatVersion: 1,
    bundledProcesses,
    registry: {
      authoredConstraints: captureAuthoredConstraints(toolRegistry.definitions),
      rawOrder: toolRegistry.definitions.map((tool) => tool.name),
      operationOrder: operationRegistry.definitions.map((tool) => tool.name),
      tools: toolRegistry.definitions.map((tool) => ({ name: tool.name, category: tool.category })),
      builtinNames: [versionToolDefinition.name, getHulyContextToolDefinition.name],
      proxyNames: proxyToolDefinitions.map((tool) => tool.name)
    },
    resources: { dynamicResourceInventory: true, invalidUri: captureInvalidResource() },
    cli: {
      routes: cliRoutes(),
      parity: { live: liveParity(), historicalBaseline: CLI_PARITY_BASELINE, target: CLI_PARITY_TARGET },
      help: { root: renderedHelp([]), group: renderedHelp(["issues"]), leaf: renderedHelp(["issues", "create"]) },
      input: await captureCliInputFixtures(),
      errors: await captureCliErrorFixtures(),
      failureContract: CLI_FAILURE_CONTRACT
    }
  })
}

export const renderEffect4Oracle = (oracle: BehavioralOracle): string => canonicalJson(oracle)
