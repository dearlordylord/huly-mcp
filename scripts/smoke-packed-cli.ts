import { spawnSync } from "node:child_process"

import { Console, Effect, Schema } from "effect"

import { cliCommandCatalog } from "../packages/huly-cli/src/catalog.js"
import { CliFailureSchema } from "../packages/huly-cli/src/failures.js"
import { CliCommandCount, CliHelpCommandLabel } from "../packages/huly-cli/src/help-schema.js"
import {
  CLI_COVERAGE_REVIEWED_LOCAL_COMMANDS,
  CLI_COVERAGE_REVIEWED_REGISTRY_OPERATIONS,
  CLI_COVERAGE_REVIEWED_ROOT_COMMANDS,
  CLI_REVIEWED_COVERAGE_CATEGORIES
} from "../packages/huly-cli/src/live-coverage.js"
import { allTools } from "../src/mcp/tools/index.js"
import { ToolCategory, ToolName } from "../src/mcp/tools/registry.js"
import { categoryRepresentativeToolNames } from "./cli-package-contract.js"

const NonEmptyTrimmedString = Schema.Trimmed.pipe(Schema.check(Schema.isNonEmpty()))
const PackedCliArgumentsSchema = Schema.Tuple([
  NonEmptyTrimmedString.annotate({ description: "Path to the installed packed huly executable." }),
  NonEmptyTrimmedString.annotate({ description: "Version declared by the packed CLI package." })
])
const ProcessResultSchema = Schema.Struct({ status: Schema.Int, stderr: Schema.String, stdout: Schema.String })
const NODE_ARGUMENT_OFFSET = 2
const INPUT_EXIT_STATUS = 2

const [executable, expectedVersion] = Schema.decodeUnknownSync(PackedCliArgumentsSchema)(
  process.argv.slice(NODE_ARGUMENT_OFFSET)
)

const runCli = (args: ReadonlyArray<string>) => {
  const result = spawnSync(executable, args, { encoding: "utf8", env: { PATH: process.env["PATH"] ?? "" } })
  if (result.error !== undefined) throw result.error
  return Schema.decodeUnknownSync(ProcessResultSchema)(result)
}

const parseFailure = Schema.decodeUnknownSync(Schema.fromJsonString(CliFailureSchema))
const expectedInputMessage =
  "Invalid JSON in --input-json: SyntaxError: Expected property name or '}' in JSON at position 1 (line 1 column 2)"

const version = runCli(["--version"])
const expectedVersionOutput = `huly v${expectedVersion}`
if (version.status !== 0 || version.stderr !== "" || version.stdout.trim() !== expectedVersionOutput) {
  throw new Error(`Packed CLI version output did not equal ${expectedVersionOutput}.`)
}

const rootHelp = runCli(["--help"])
if (rootHelp.status !== 0) throw new Error(`Packed CLI root help failed: ${rootHelp.stderr}`)
const commandSection = rootHelp.stdout.split("Commands:\n")[1]
if (commandSection === undefined) throw new Error("Packed CLI root help has no command section.")
const RootHelpCommandRowSchema = Schema.Struct({
  command: CliHelpCommandLabel,
  count: Schema.NumberFromString.pipe(Schema.decodeTo(CliCommandCount))
})
const commandRows = commandSection.split("\n").flatMap((line) => {
  const match = /^  (huly \S+)\s+(\d+) commands?$/.exec(line)
  const command = match?.[1]
  const count = match?.[2]
  return command === undefined || count === undefined
    ? []
    : [Schema.decodeUnknownSync(RootHelpCommandRowSchema)({ command, count })]
})
const actualCommandCounts = new Map(commandRows.map((row) => [row.command, row.count]))
if (actualCommandCounts.size !== CLI_COVERAGE_REVIEWED_ROOT_COMMANDS) {
  throw new Error(
    `Packed CLI exposes ${String(actualCommandCounts.size)} root commands; expected ${String(CLI_COVERAGE_REVIEWED_ROOT_COMMANDS)}.`
  )
}

const packedRegistryRoutes =
  commandRows.reduce((total, row) => total + row.count, 0) - CLI_COVERAGE_REVIEWED_LOCAL_COMMANDS
if (packedRegistryRoutes !== CLI_COVERAGE_REVIEWED_REGISTRY_OPERATIONS) {
  throw new Error(
    `Packed CLI exposes ${String(packedRegistryRoutes)} catalog routes; expected ${String(CLI_COVERAGE_REVIEWED_REGISTRY_OPERATIONS)}.`
  )
}

const categoryRepresentativeCommands = categoryRepresentativeToolNames(
  CLI_REVIEWED_COVERAGE_CATEGORIES.map((category) => ToolCategory.make(category)),
  allTools.map((tool) => ({ category: tool.category, name: ToolName.make(tool.name) }))
).map((toolName) => cliCommandCatalog[toolName].path)
const behaviorSpecificLeafHelpCommands = [
  ["attachments", "add"],
  ["attachments", "download"],
  ["attachments", "read-image"],
  ["calendar", "events", "recurring", "create"],
  ["comments", "add"],
  ["support", "status", "get"],
  ["workbench", "applications", "list"],
  ["workspace", "info"]
]
const leafHelpCommands = [...categoryRepresentativeCommands, ...behaviorSpecificLeafHelpCommands].filter(
  (command, index, commands) => commands.findIndex((candidate) => candidate.join(" ") === command.join(" ")) === index
)
for (const command of leafHelpCommands) {
  const help = runCli([...command, "--help"])
  const expectedUsage = `Usage:\n  huly ${command.join(" ")}`
  if (help.status !== 0 || !help.stdout.includes(expectedUsage)) {
    throw new Error(`Packed CLI leaf help failed for '${command.join(" ")}': ${help.stderr}`)
  }
}

const refusal = runCli(["boards", "cards", "delete", "board", "card"])
if (refusal.status === 0 || !refusal.stderr.includes("requires --yes")) {
  throw new Error("Packed CLI did not enforce the consequential-operation confirmation boundary.")
}

const structuredFailure = runCli(["calendar", "events", "recurring", "create", "title", "1", "--rules", "not-json"])
if (
  structuredFailure.status !== INPUT_EXIT_STATUS ||
  structuredFailure.stdout !== "" ||
  !structuredFailure.stderr.includes("has invalid JSON")
) {
  throw new Error("Packed CLI did not parse structured input before client construction.")
}

const humanFailure = runCli(["issues", "create", "--input-json", "{bad"])
if (
  humanFailure.status !== INPUT_EXIT_STATUS ||
  humanFailure.stdout !== "" ||
  humanFailure.stderr !== `${expectedInputMessage}\n` ||
  humanFailure.stderr.trim().split("\n").length !== 1
) {
  throw new Error("Packed CLI human input failure changed stream or exit semantics.")
}

const jsonFailure = runCli(["issues", "create", "--input-json", "{bad", "--json"])
const decodedJsonFailure = parseFailure(jsonFailure.stderr)
if (
  jsonFailure.status !== INPUT_EXIT_STATUS ||
  jsonFailure.stdout !== "" ||
  jsonFailure.stderr.trim().split("\n").length !== 1 ||
  decodedJsonFailure.code !== "INVALID_INPUT" ||
  decodedJsonFailure.message !== expectedInputMessage ||
  decodedJsonFailure.retryable ||
  decodedJsonFailure.hint !== "Run the command with --help and correct the supplied arguments."
) {
  throw new Error("Packed CLI JSON input failure changed document, stream, or exit semantics.")
}

const structuredPrecedence = runCli([
  "calendar",
  "events",
  "recurring",
  "create",
  "title",
  "1",
  "--input-json",
  '{"rules":"not-json"}',
  "--rules",
  '[{"frequency":"daily","interval":1}]',
  "--json"
])
const decodedStructuredPrecedence = parseFailure(structuredPrecedence.stderr)
if (
  structuredPrecedence.status !== 1 ||
  structuredPrecedence.stdout !== "" ||
  decodedStructuredPrecedence.code !== "INTEGRATION_FAILED"
) {
  throw new Error("Packed CLI did not accept structured JSON with explicit-field precedence before configuration.")
}

Effect.runSync(
  Console.log(
    `Packed CLI smoke passed: version ${expectedVersion}, ${String(actualCommandCounts.size)} root commands, ${String(packedRegistryRoutes)} catalog routes, representative help, structured precedence, and exact text/JSON failure exits.`
  )
)
