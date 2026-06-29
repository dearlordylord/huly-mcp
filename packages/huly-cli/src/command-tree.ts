import { Command } from "@effect/cli"
import type { NodeContext } from "@effect/platform-node"
import { Effect } from "effect"

import { operationRegistry } from "../../../src/mcp/tools/index.js"
import type { CliCommandSpec } from "./catalog-types.js"
import { cliCommandCatalog, type CliToolName, isCliToolName } from "./catalog.js"
import { buildCliCommandConfig, buildGlobalOptionsConfig, parseGlobalCommandLine } from "./cli-options.js"
import type { CliInputError } from "./input.js"
import { CliRuntimeError } from "./render.js"
import { runCliTool } from "./runner.js"

interface MutableCommandNode {
  children: Map<string, MutableCommandNode>
  name: string
  spec: CliCommandSpec | undefined
  toolName: CliToolName | undefined
}

// @effect/cli subcommands are intentionally heterogeneous in parsed config.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HulyCommand = Command.Command<any, NodeContext.NodeContext, CliInputError | CliRuntimeError, any>

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

const rawLeafArgs = (
  argv: ReadonlyArray<string>,
  _path: ReadonlyArray<string>
): ReadonlyArray<string> => argv

const makeLeafCommand = (
  node: MutableCommandNode,
  argv: ReadonlyArray<string>
): HulyCommand => {
  const toolName = node.toolName
  const spec = node.spec
  /* c8 ignore start -- buildCatalogTree assigns both fields for every leaf; this is a defensive invariant error. */
  if (toolName === undefined || spec === undefined) {
    return Command.make(
      node.name,
      {},
      () => Effect.fail(new CliRuntimeError({ message: `CLI command ${node.name} is missing catalog metadata.` }))
    )
  }
  /* c8 ignore stop */
  const operation = operationRegistry.getOperation(toolName)

  return Command.make(
    node.name,
    buildCliCommandConfig(operation, spec),
    ({ options, positionals }) =>
      Effect.gen(function*() {
        const globalOptions = yield* parseGlobalCommandLine(argv).pipe(
          Effect.mapError((error) =>
            new CliRuntimeError({ message: error instanceof Error ? error.message : String(error) })
          )
        )
        yield* runCliTool(toolName, {
          options: [...globalOptions, ...options],
          positionals,
          raw: rawLeafArgs(argv, spec.path)
        })
      })
  ).pipe(Command.withDescription(spec.description))
}

const makeGroupCommand = (
  node: MutableCommandNode,
  argv: ReadonlyArray<string>
): HulyCommand => {
  const subcommands = [...node.children.values()].map((child) => makeCommand(child, argv))
  const first = subcommands[0]
  /* c8 ignore start -- the catalog is non-empty; retained for totality if future callers build empty groups. */
  if (first === undefined) {
    return Command.make(node.name)
  }
  /* c8 ignore stop */

  return Command.make(node.name, buildGlobalOptionsConfig()).pipe(
    Command.withDescription(node.name === "huly" ? "Huly CLI" : `${node.name} commands`),
    Command.withSubcommands([first, ...subcommands.slice(1)])
  )
}

const makeCommand = (
  node: MutableCommandNode,
  argv: ReadonlyArray<string>
): HulyCommand =>
  node.toolName === undefined ? makeGroupCommand(node, argv) : makeLeafCommand(
    node,
    argv
  )

export const buildRootCommand = (argv: ReadonlyArray<string>): HulyCommand => {
  const tree = buildCatalogTree()
  const rootCommand = Command.make(tree.name, buildGlobalOptionsConfig()).pipe(
    Command.withDescription("Huly CLI")
  )
  const subcommands = [...tree.children.values()].map((child) => makeCommand(child, argv))
  const first = subcommands[0]
  if (first === undefined) return rootCommand
  return rootCommand.pipe(Command.withSubcommands([first, ...subcommands.slice(1)]))
}
