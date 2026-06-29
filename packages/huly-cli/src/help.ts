import { cliCommandCatalog } from "./catalog.js"

interface HelpRow {
  readonly command: string
  readonly description: string
}

const rootHelpFlags = new Set(["--help", "-h"])

const commandRows = (): ReadonlyArray<HelpRow> =>
  Object.values(cliCommandCatalog)
    .map((spec) => ({
      command: spec.path.join(" "),
      description: spec.description
    }))
    .sort((left, right) => left.command.localeCompare(right.command))

const padCommand = (rows: ReadonlyArray<HelpRow>, command: string): string => {
  const width = Math.max(...rows.map((row) => row.command.length))
  return command.padEnd(width)
}

export const isRootHelpRequest = (argv: ReadonlyArray<string>): boolean =>
  argv.length === 1 && rootHelpFlags.has(argv[0] ?? "")

export const renderRootHelp = (version: string): string => {
  const rows = commandRows()
  const commands = rows
    .map((row) => `  ${padCommand(rows, row.command)}  ${row.description}`)
    .join("\n")

  return [
    `Huly CLI ${version}`,
    "",
    "Usage:",
    "  huly [global options] <command> [options]",
    "",
    "Global options:",
    "  --json                  Print the operation result as JSON",
    "  --input-json <object>   Merge a JSON object into command input",
    "  --input-file <path>     Merge a JSON file into command input",
    "  --output <path>         Write supported binary output to a file",
    "  --yes                   Confirm destructive commands",
    "",
    "Commands:",
    commands
  ].join("\n")
}
