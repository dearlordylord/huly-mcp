import type { NodeServices } from "@effect/platform-node"
import { Effect, Option } from "effect"
import { Command } from "effect/cli"

import { operationRegistry } from "../../../src/mcp/tools/index.js"
import type { TelemetryService } from "../../../src/telemetry/telemetry.js"
import type { CliCommandSpec } from "./catalog-types.js"
import { cliCommandCatalog, type CliToolName, isCliToolName } from "./catalog.js"
import { buildCliCommandConfig, buildGlobalFlagsConfig, buildGlobalOptionsConfig } from "./cli-options.js"
import type { CliCommandPath } from "./command-schema.js"
import type { CliInputError } from "./input.js"
import { CliRuntimeError } from "./render.js"
import { runCliTool } from "./runner.js"
import { localCliCommands, type LocalCliService } from "./local-commands.js"

interface MutableCommandNode {
  children: Map<string, MutableCommandNode>
  name: string
  spec: CliCommandSpec | undefined
  toolName: CliToolName | undefined
}

type GeneratedCommandInput = Command.Command.Config.Infer<ReturnType<typeof buildGlobalOptionsConfig>>

type HulyCommand = Command.Command<
  string,
  GeneratedCommandInput,
  Record<never, never>,
  CliInputError | CliRuntimeError,
  NodeServices.NodeServices | TelemetryService | LocalCliService
>

const makeNode = (name: string): MutableCommandNode => ({
  children: new Map(),
  name,
  spec: undefined,
  toolName: undefined
})

const childNode = (node: MutableCommandNode, name: string): MutableCommandNode => {
  const existing = node.children.get(name)
  if (existing !== undefined) return existing

  const child = makeNode(name)
  node.children.set(name, child)
  return child
}

const addCatalogCommand = (root: MutableCommandNode, toolName: CliToolName, spec: CliCommandSpec): void => {
  let node = root
  for (const segment of spec.path) {
    node = childNode(node, segment)
  }
  node.toolName = toolName
  node.spec = spec
}

const buildCatalogTree = (): MutableCommandNode => {
  const root = makeNode("huly")
  for (const [toolName, spec] of Object.entries(cliCommandCatalog)) {
    if (isCliToolName(toolName)) {
      addCatalogCommand(root, toolName, spec)
    }
  }
  return root
}

const rawLeafArgs = (argv: ReadonlyArray<string>, _path: ReadonlyArray<string>): ReadonlyArray<string> => argv

const makeLeafCommand = (node: MutableCommandNode, argv: ReadonlyArray<string>): HulyCommand => {
  const toolName = node.toolName
  const spec = node.spec
  /* c8 ignore start -- buildCatalogTree assigns both fields for every leaf; this is a defensive invariant error. */
  if (toolName === undefined || spec === undefined) {
    return Command.make(node.name, buildGlobalOptionsConfig(), () =>
      Effect.fail(new CliRuntimeError({ message: `CLI command ${node.name} is missing catalog metadata.` }))
    )
  }
  /* c8 ignore stop */
  const operation = operationRegistry.getOperation(toolName)

  return Command.make(node.name, buildCliCommandConfig(operation, spec), ({ options, positionals }) =>
    runCliTool(toolName, { options: Object.values(options).flat(), positionals, raw: rawLeafArgs(argv, spec.path) })
  ).pipe(Command.withDescription(spec.description))
}

const makeGroupCommand = (node: MutableCommandNode, argv: ReadonlyArray<string>): HulyCommand => {
  const subcommands = [...node.children.values()].map((child) => makeCommand(child, argv))
  const first = subcommands[0]
  /* c8 ignore start -- the catalog is non-empty; retained for totality if future callers build empty groups. */
  if (first === undefined) {
    return Command.make(node.name, buildGlobalFlagsConfig())
  }
  /* c8 ignore stop */

  return Command.make(node.name, buildGlobalFlagsConfig()).pipe(
    Command.withDescription(node.name === "huly" ? "Huly CLI" : `${node.name} commands`),
    Command.withSubcommands([first, ...subcommands.slice(1)])
  )
}

const makeCommand = (node: MutableCommandNode, argv: ReadonlyArray<string>): HulyCommand =>
  node.toolName === undefined ? makeGroupCommand(node, argv) : makeLeafCommand(node, argv)

const nodeAtPath = (node: MutableCommandNode, path: CliCommandPath): Option.Option<MutableCommandNode> => {
  const [segment, ...remaining] = path
  if (segment === undefined) return Option.some(node)
  const child = node.children.get(segment)
  return child === undefined ? Option.none() : nodeAtPath(child, remaining)
}

export const buildCommandDescriptorAtPath = (path: CliCommandPath): Option.Option<Command.Command.Any> =>
  Option.flatMap(nodeAtPath(buildCatalogTree(), path), (node) =>
    node.toolName === undefined ? Option.none() : Option.some(makeLeafCommand(node, []))
  )

export const buildRootCommand = (argv: ReadonlyArray<string>) => {
  const tree = buildCatalogTree()
  const rootCommand = Command.make(tree.name, buildGlobalFlagsConfig()).pipe(Command.withDescription("Huly CLI"))
  const subcommands = [...localCliCommands, ...[...tree.children.values()].map((child) => makeCommand(child, argv))]
  const first = subcommands[0]
  if (first === undefined) return rootCommand
  return rootCommand.pipe(Command.withSubcommands([first, ...subcommands.slice(1)]))
}
