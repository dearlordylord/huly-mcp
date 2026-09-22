import { readFileSync, writeFileSync } from "node:fs"

import { Console, Effect } from "effect"

import { cliCommandCatalog, isCliToolName } from "../packages/huly-cli/src/catalog.js"
import type { CliCommandSpec } from "../packages/huly-cli/src/catalog-types.js"
import { operationRegistry } from "../src/mcp/tools/index.js"
import {
  collectFieldSpecs,
  collectRequiredFieldNames,
  fieldNameToOptionName,
  fieldUsesBooleanOption,
  type FieldSpec
} from "../packages/huly-cli/src/schema-fields.js"
import { cliFieldOptionDescription } from "../packages/huly-cli/src/field-help.js"
import { explicitCliConfirmationMessage } from "../packages/huly-cli/src/safety-policies.js"
import { cliDescriptionProblems, cliFieldDescriptionProblems } from "./cli-documentation-contract.js"

const readmePath = "packages/huly-cli/README.md"
const startMarker = "<!-- CLI_COMMAND_REFERENCE_START -->"
const endMarker = "<!-- CLI_COMMAND_REFERENCE_END -->"
const checkOnly = process.argv.includes("--check")
const NOT_FOUND = -1

const commandEntries = Object.entries(cliCommandCatalog).map(([toolName, spec]) => {
  if (!isCliToolName(toolName)) throw new Error(`Unknown CLI catalog tool ${toolName}.`)
  return { command: spec.path.join(" "), description: spec.description }
})
const fieldEntries = Object.entries(cliCommandCatalog).flatMap(([toolName, spec]) => {
  if (!isCliToolName(toolName)) throw new Error(`Unknown CLI catalog tool ${toolName}.`)
  const operation = operationRegistry.getOperation(toolName)
  return [...collectFieldSpecs(operation.inputSchema).values()].map((field) => ({
    command: spec.path.join(" "),
    description: cliFieldOptionDescription(spec, operation.inputSchema, field),
    field: fieldNameToOptionName(field.fieldName)
  }))
})
const descriptionProblems = [...cliDescriptionProblems(commandEntries), ...cliFieldDescriptionProblems(fieldEntries)]
if (descriptionProblems.length > 0) {
  throw new Error(`CLI catalog descriptions violate the LLM-first contract:\n${descriptionProblems.join("\n")}`)
}

const escapeCell = (value: string): string => value.replaceAll("|", "\\|").replaceAll("\n", " ")

const fieldFlag = (spec: CliCommandSpec, rootSchema: object, field: FieldSpec): string => {
  const optionName = fieldNameToOptionName(field.fieldName)
  const syntax = fieldUsesBooleanOption(rootSchema, field)
    ? `\`--${optionName}\` / \`--no-${optionName}\``
    : `\`--${optionName} <value>\``
  const description = cliFieldOptionDescription(spec, rootSchema, field)
  return description.length === 0 ? syntax : `${syntax} — ${escapeCell(description)}`
}

const fieldList = (fields: ReadonlyArray<string>): string => (fields.length === 0 ? "—" : fields.join("<br>"))

const commandRows = (): string =>
  Object.entries(cliCommandCatalog)
    .toSorted(([, left], [, right]) => left.path.join(" ").localeCompare(right.path.join(" ")))
    .map(([toolName, spec]) => {
      if (!isCliToolName(toolName)) throw new Error(`Unknown CLI catalog tool ${toolName}.`)
      const commandSpec: CliCommandSpec = spec
      const operation = operationRegistry.getOperation(toolName)
      const positional = new Set(commandSpec.positional)
      const fields = [...collectFieldSpecs(operation.inputSchema).values()]
      const required = collectRequiredFieldNames(operation.inputSchema)
      const positionals = commandSpec.positional.map((fieldName) => {
        const field = fields.find((candidate) => candidate.fieldName === fieldName)
        const description =
          field === undefined ? "" : cliFieldOptionDescription(commandSpec, operation.inputSchema, field)
        return description.length === 0 ? `\`<${fieldName}>\`` : `\`<${fieldName}>\` — ${escapeCell(description)}`
      })
      const requiredFlags = fields
        .filter((field) => !positional.has(field.fieldName) && required.has(field.fieldName))
        .map((field) => fieldFlag(commandSpec, operation.inputSchema, field))
      const optionalFlags = fields
        .filter((field) => !positional.has(field.fieldName) && !required.has(field.fieldName))
        .map((field) => fieldFlag(commandSpec, operation.inputSchema, field))
      const fileFlags = (commandSpec.behavior?.fileInput?.fields ?? []).map(
        (field) => `\`--${fieldNameToOptionName(field)}-file <path>\` — read ${field} as text`
      )
      const base64FileFlags = (commandSpec.behavior?.base64FileInput?.fields ?? []).map(
        (field) => `\`--${fieldNameToOptionName(field)}-base64-file <path>\` — encode local bytes as canonical base64`
      )
      const confirmation =
        explicitCliConfirmationMessage(toolName, commandSpec) === undefined ? "" : " Requires `--yes`."
      const output = commandSpec.behavior?.fileOutput === undefined ? "" : " Supports `--output <path>`."
      const command =
        `huly ${commandSpec.path.join(" ")} ${commandSpec.positional.map((field) => `<${field}>`).join(" ")}`.trim()
      return `| \`${command}\` | ${escapeCell(commandSpec.description)}${confirmation}${output} | ${fieldList(positionals)} | ${fieldList(requiredFlags)} | ${fieldList([...optionalFlags, ...fileFlags, ...base64FileFlags])} |`
    })
    .join("\n")

const generated = [
  startMarker,
  "<!-- Generated from cliCommandCatalog and shared operation schemas. Run `pnpm update-cli-readme`. -->",
  "## Complete command reference",
  "",
  `This release provides ${Object.keys(cliCommandCatalog).length} native commands for ${operationRegistry.operations.size} shared Huly operations.`,
  "",
  "All commands also accept `--json`, `--input-json <object>`, and `--input-file <path>`. Explicit field flags override JSON sources. Structured fields accept JSON. Named positionals are required and are not duplicated as flags. Required non-positional inputs may instead be supplied through either JSON source.",
  "",
  "| Command | Purpose and behavior | Required positionals | Required inputs (flag or JSON) | Optional flags and alternatives |",
  "| --- | --- | --- | --- | --- |",
  commandRows(),
  endMarker
].join("\n")

const source = readFileSync(readmePath, "utf8")
const start = source.indexOf(startMarker)
const end = source.indexOf(endMarker)
const next =
  start === NOT_FOUND || end === NOT_FOUND
    ? `${source.trimEnd()}\n\n${generated}\n`
    : `${source.slice(0, start)}${generated}${source.slice(end + endMarker.length)}`

if (checkOnly) {
  if (next !== source) {
    Effect.runSync(Console.error(`${readmePath} command reference is stale. Run pnpm update-cli-readme.`))
    process.exitCode = 1
  }
} else {
  writeFileSync(readmePath, next)
}
