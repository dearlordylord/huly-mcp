import type { NodeServices } from "@effect/platform-node"
import { Effect, Option, Ref, Schema } from "effect"
import { Argument, CliError, Command, Flag } from "effect/unstable/cli"

import type { ToolDefinition } from "../../../src/mcp/tools/registry.js"
import type { CliCommandSpec, CliOptionName, CliSchemaFieldName } from "./catalog-types.js"
import {
  collectFieldSpecs,
  collectRequiredFieldNames,
  fieldUsesBooleanOption,
  type FieldSpec
} from "./schema-fields.js"
import { cliFieldOptionDescription } from "./field-help.js"

export interface CliGlobalOptions {
  readonly json: boolean
  readonly yes: boolean
  readonly output?: string
}

interface ParsedFieldOption {
  readonly _tag: "FieldOption"
  readonly fieldName: CliSchemaFieldName
  readonly optionName: CliOptionName
  readonly value: string
}

interface ParsedBooleanFieldOption {
  readonly _tag: "BooleanFieldOption"
  readonly fieldName: CliSchemaFieldName
  readonly optionName: CliOptionName
  readonly value: boolean
}

interface ParsedFileFieldOption {
  readonly _tag: "FileFieldOption"
  readonly fieldName: CliSchemaFieldName
  readonly optionName: CliOptionName
  readonly path: string
}

interface ParsedBase64FileFieldOption {
  readonly _tag: "Base64FileFieldOption"
  readonly fieldName: CliSchemaFieldName
  readonly optionName: CliOptionName
  readonly path: string
}

interface ParsedGlobalOption {
  readonly _tag: "GlobalOption"
  readonly name: "input-file" | "input-json" | "output"
  readonly value: string
}

interface ParsedGlobalBooleanOption {
  readonly _tag: "GlobalBooleanOption"
  readonly name: "json" | "yes"
  readonly value: boolean
}

export type ParsedCliOption =
  | ParsedBase64FileFieldOption
  | ParsedBooleanFieldOption
  | ParsedFieldOption
  | ParsedFileFieldOption
  | ParsedGlobalBooleanOption
  | ParsedGlobalOption

export interface ParsedCliCommandLine {
  readonly options: ReadonlyArray<ParsedCliOption>
  readonly positionals: ReadonlyArray<string>
  readonly raw: ReadonlyArray<string>
}

export class CliOptionParseError extends Schema.TaggedError<CliOptionParseError>()("CliOptionParseError", {
  message: Schema.String
}) {}

export interface CliOptionHelpRow {
  readonly description: string
  readonly syntax: string
}

const emptyOptions: ReadonlyArray<ParsedCliOption> = []

const optionalTextOption = (
  name: string,
  makeOption: (value: string) => ParsedCliOption
): Flag.Flag<ReadonlyArray<ParsedCliOption>> =>
  Flag.String(name).pipe(
    Flag.optional,
    Flag.map((value) => Option.match(value, { onNone: () => emptyOptions, onSome: (text) => [makeOption(text)] }))
  )

const booleanOption = (name: "json" | "yes"): Flag.Flag<ReadonlyArray<ParsedCliOption>> =>
  Flag.Boolean(name).pipe(
    Flag.withDefault(false),
    Flag.map((value) => [{ _tag: "GlobalBooleanOption", name, value }])
  )

const fieldHelp = (spec: CliCommandSpec, rootSchema: object, field: FieldSpec, required: boolean): string => {
  const description = cliFieldOptionDescription(spec, rootSchema, field)
  const requirement = required ? "Required unless supplied through --input-json or --input-file." : undefined
  return [description, requirement].filter((part) => part !== undefined && part.length > 0).join(" ")
}

const BOOLEAN_NULL_HELP = "Pass null to clear the field."
const fieldBooleanHelp = (spec: CliCommandSpec, rootSchema: object, field: FieldSpec, required: boolean): string =>
  fieldHelp(spec, rootSchema, field, required).replace(` ${BOOLEAN_NULL_HELP}`, "").replace(BOOLEAN_NULL_HELP, "")

const fieldTextOption = (
  rootSchema: object,
  spec: CliCommandSpec,
  optionName: CliOptionName,
  field: FieldSpec,
  required: boolean
): Flag.Flag<ReadonlyArray<ParsedCliOption>> =>
  optionalTextOption(optionName, (value) => ({
    _tag: "FieldOption",
    fieldName: field.fieldName,
    optionName,
    value
  })).pipe(Flag.withDescription(fieldHelp(spec, rootSchema, field, required)))

const fieldBooleanOption = (
  rootSchema: object,
  spec: CliCommandSpec,
  optionName: CliOptionName,
  field: FieldSpec,
  required: boolean
): Flag.Flag<ReadonlyArray<ParsedCliOption>> =>
  Flag.Boolean(optionName).pipe(
    Flag.withDefault(false),
    Flag.map(
      (value): ReadonlyArray<ParsedCliOption> => [
        { _tag: "BooleanFieldOption", fieldName: field.fieldName, optionName, value }
      ]
    ),
    Flag.withDescription(fieldBooleanHelp(spec, rootSchema, field, required))
  )

const fieldFileOption = (optionName: CliOptionName, field: FieldSpec): Flag.Flag<ReadonlyArray<ParsedCliOption>> =>
  optionalTextOption(`${optionName}-file`, (path) => ({
    _tag: "FileFieldOption",
    fieldName: field.fieldName,
    optionName,
    path
  })).pipe(Flag.withDescription(fileOptionDescription(field)))

const fileOptionDescription = (field: FieldSpec): string => `Read ${field.fieldName} text from this file.`
const base64FileOptionDescription = (field: FieldSpec): string =>
  `Read this file as bytes and pass ${field.fieldName} as canonical base64.`

const fieldBase64FileOption = (
  optionName: CliOptionName,
  field: FieldSpec
): Flag.Flag<ReadonlyArray<ParsedCliOption>> =>
  optionalTextOption(`${optionName}-base64-file`, (path) => ({
    _tag: "Base64FileFieldOption",
    fieldName: field.fieldName,
    optionName,
    path
  })).pipe(Flag.withDescription(base64FileOptionDescription(field)))

const fieldOptions = (
  rootSchema: object,
  spec: CliCommandSpec,
  fields: ReadonlyMap<CliOptionName, FieldSpec>,
  requiredFields: ReadonlySet<CliSchemaFieldName>,
  fileInputFields: ReadonlySet<CliSchemaFieldName>,
  base64FileInputFields: ReadonlySet<CliSchemaFieldName>
): Array<Flag.Flag<ReadonlyArray<ParsedCliOption>>> => {
  const descriptors: Array<Flag.Flag<ReadonlyArray<ParsedCliOption>>> = []
  for (const [optionName, field] of fields) {
    descriptors.push(
      fieldUsesBooleanOption(rootSchema, field)
        ? fieldBooleanOption(rootSchema, spec, optionName, field, requiredFields.has(field.fieldName))
        : fieldTextOption(rootSchema, spec, optionName, field, requiredFields.has(field.fieldName))
    )
    if (fileInputFields.has(field.fieldName)) {
      descriptors.push(fieldFileOption(optionName, field))
    }
    if (base64FileInputFields.has(field.fieldName)) {
      descriptors.push(fieldBase64FileOption(optionName, field))
    }
  }
  return descriptors
}

export const cliFieldOptionHelpRows = (tool: ToolDefinition, spec: CliCommandSpec): ReadonlyArray<CliOptionHelpRow> => {
  const fields = collectFieldSpecs(tool.inputSchema)
  const requiredFields = collectRequiredFieldNames(tool.inputSchema)
  const behaviorFields = behaviorFieldSets(fields, spec)
  const rows: Array<CliOptionHelpRow> = []
  for (const [optionName, field] of fields) {
    if (spec.positional.includes(field.fieldName)) continue
    rows.push({
      syntax: fieldUsesBooleanOption(tool.inputSchema, field)
        ? `--${optionName}[=true|false], --no-${optionName}`
        : `--${optionName} <value>`,
      description: fieldUsesBooleanOption(tool.inputSchema, field)
        ? fieldBooleanHelp(spec, tool.inputSchema, field, requiredFields.has(field.fieldName))
        : fieldHelp(spec, tool.inputSchema, field, requiredFields.has(field.fieldName))
    })
    if (behaviorFields.text.has(field.fieldName)) {
      rows.push({ syntax: `--${optionName}-file <path>`, description: fileOptionDescription(field) })
    }
    if (behaviorFields.base64.has(field.fieldName)) {
      rows.push({ syntax: `--${optionName}-base64-file <path>`, description: base64FileOptionDescription(field) })
    }
  }
  return rows
}

const GLOBAL_OPTION_DESCRIPTIONS = {
  inputFile: "Merge a JSON object from this file before explicit field flags.",
  inputJson: "Merge this JSON object into operation input before explicit field flags.",
  json: "Print the operation result as JSON.",
  output: "Write supported attachment or image bytes to this path.",
  yes: "Confirm a consequential operation."
}

const globalOptions: ReadonlyArray<Flag.Flag<ReadonlyArray<ParsedCliOption>>> = [
  booleanOption("json").pipe(Flag.withDescription(GLOBAL_OPTION_DESCRIPTIONS.json)),
  booleanOption("yes").pipe(Flag.withDescription(GLOBAL_OPTION_DESCRIPTIONS.yes)),
  optionalTextOption("input-json", (value) => ({ _tag: "GlobalOption", name: "input-json", value })).pipe(
    Flag.withDescription(GLOBAL_OPTION_DESCRIPTIONS.inputJson)
  ),
  optionalTextOption("input-file", (value) => ({ _tag: "GlobalOption", name: "input-file", value })).pipe(
    Flag.withDescription(GLOBAL_OPTION_DESCRIPTIONS.inputFile)
  ),
  optionalTextOption("output", (value) => ({ _tag: "GlobalOption", name: "output", value })).pipe(
    Flag.withDescription(GLOBAL_OPTION_DESCRIPTIONS.output)
  )
]

const GLOBAL_OPTION_HELP_ROWS = {
  inputFile: { syntax: "--input-file <path>", description: GLOBAL_OPTION_DESCRIPTIONS.inputFile },
  inputJson: { syntax: "--input-json <object>", description: GLOBAL_OPTION_DESCRIPTIONS.inputJson },
  json: { syntax: "--json[=true|false], --no-json", description: GLOBAL_OPTION_DESCRIPTIONS.json },
  output: { syntax: "--output <path>", description: GLOBAL_OPTION_DESCRIPTIONS.output },
  yes: { syntax: "--yes[=true|false], --no-yes", description: GLOBAL_OPTION_DESCRIPTIONS.yes }
} satisfies Record<string, CliOptionHelpRow>

export const cliGlobalOptionHelpRows = (options: {
  readonly includeOutput: boolean
  readonly includeYes: boolean
}): ReadonlyArray<CliOptionHelpRow> => [
  GLOBAL_OPTION_HELP_ROWS.json,
  GLOBAL_OPTION_HELP_ROWS.inputJson,
  GLOBAL_OPTION_HELP_ROWS.inputFile,
  ...(options.includeOutput ? [GLOBAL_OPTION_HELP_ROWS.output] : []),
  ...(options.includeYes ? [GLOBAL_OPTION_HELP_ROWS.yes] : [])
]

const GLOBAL_BOOLEAN_OPTION_NAMES = new Set(["json", "yes"])
const GLOBAL_TEXT_OPTION_NAMES = new Set(["input-json", "input-file", "output"])
const LONG_OPTION_PREFIX_LENGTH = 2

const flattenOptions = (parsed: ReadonlyArray<ReadonlyArray<ParsedCliOption>>): ReadonlyArray<ParsedCliOption> =>
  parsed.flat()

interface BehaviorFieldSets {
  readonly base64: ReadonlySet<CliSchemaFieldName>
  readonly text: ReadonlySet<CliSchemaFieldName>
}

const behaviorFieldSets = (fields: ReadonlyMap<CliOptionName, FieldSpec>, spec: CliCommandSpec): BehaviorFieldSets => {
  const fileInputFields = new Set(spec.behavior?.fileInput?.fields ?? [])
  const base64FileInputFields = new Set(spec.behavior?.base64FileInput?.fields ?? [])
  const schemaFieldNames = new Set([...fields.values()].map((field) => field.fieldName))
  const unknownBehaviorFields = [...fileInputFields, ...base64FileInputFields].filter(
    (fieldName) => !schemaFieldNames.has(fieldName)
  )
  if (unknownBehaviorFields.length > 0) {
    throw new Error(`CLI behavior references unknown schema fields: ${unknownBehaviorFields.join(", ")}.`)
  }
  return { text: fileInputFields, base64: base64FileInputFields }
}

const positionals = Argument.String("arguments").pipe(Argument.variadic())

const optionRecord = (
  options: ReadonlyArray<Flag.Flag<ReadonlyArray<ParsedCliOption>>>
): Readonly<Record<string, Flag.Flag<ReadonlyArray<ParsedCliOption>>>> =>
  Object.fromEntries(options.map((option, index) => [`option${index}`, option]))

export const buildCliCommandConfig = (tool: ToolDefinition, spec: CliCommandSpec) => {
  const fields = collectFieldSpecs(tool.inputSchema)
  const behaviorFields = behaviorFieldSets(fields, spec)
  const options = [
    ...globalOptions,
    ...fieldOptions(
      tool.inputSchema,
      spec,
      new Map([...fields].filter(([, field]) => !spec.positional.includes(field.fieldName))),
      collectRequiredFieldNames(tool.inputSchema),
      behaviorFields.text,
      behaviorFields.base64
    )
  ]
  return { options: optionRecord(options), positionals }
}

export const buildGlobalOptionsConfig = () => ({ options: optionRecord(globalOptions), positionals })
export const buildGlobalFlagsConfig = () => ({ options: optionRecord(globalOptions) })

const parsedOptions = (
  options: Readonly<Record<string, ReadonlyArray<ParsedCliOption>>>
): ReadonlyArray<ParsedCliOption> => flattenOptions(Object.values(options))

const cliParseErrorMessage = (error: CliError.NonShowHelpErrors): string => {
  if (error instanceof CliError.InvalidValue && error.kind === "flag") {
    if (error.value.length === 0) return `Expected a value for --${error.option}.`
    if (error.expected.includes('"true"') && error.expected.includes('"false"')) {
      return `--${error.option} expects true or false.`
    }
  }
  return error.message
}

const parseWithConfig = (
  config: ReturnType<typeof buildGlobalOptionsConfig>,
  raw: ReadonlyArray<string>,
  textOptionNames: ReadonlySet<string>,
  knownOptionNames: ReadonlySet<string>
): Effect.Effect<ParsedCliCommandLine, CliOptionParseError, NodeServices.NodeServices> =>
  Effect.gen(function* () {
    const captured = yield* Ref.make<Option.Option<ParsedCliCommandLine>>(Option.none())
    const command = Command.make("parse", config, ({ options, positionals }) =>
      Ref.set(captured, Option.some({ options: parsedOptions(options), positionals, raw }))
    )
    yield* Command.runWith(command, { version: "0", renderErrors: false })(
      normalizeTextOptionValues(raw, textOptionNames, knownOptionNames)
    ).pipe(
      Effect.mapError(
        (error) =>
          new CliOptionParseError({
            message:
              error instanceof CliError.ShowHelp && error.errors.length > 0
                ? error.errors.map(cliParseErrorMessage).join("\n")
                : error.message
          })
      )
    )
    return yield* Ref.get(captured).pipe(
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.die("Effect CLI parser completed without invoking its handler."),
          onSome: Effect.succeed
        })
      )
    )
  })

const shouldInlineTextOptionValue = (
  token: string,
  next: string | undefined,
  textOptionNames: ReadonlySet<string>,
  knownOptionNames: ReadonlySet<string>
): boolean => {
  if (!token.startsWith("--") || token.includes("=") || next === undefined) return false
  const optionName = token.slice(LONG_OPTION_PREFIX_LENGTH)
  const nextOptionName = next.startsWith("--") ? next.slice(LONG_OPTION_PREFIX_LENGTH).split("=", 1)[0] : undefined
  return textOptionNames.has(optionName) && (nextOptionName === undefined || !knownOptionNames.has(nextOptionName))
}

const normalizeTextOptionValues = (
  raw: ReadonlyArray<string>,
  textOptionNames: ReadonlySet<string>,
  knownOptionNames: ReadonlySet<string>
): ReadonlyArray<string> => {
  const normalized: Array<string> = []
  for (let index = 0; index < raw.length; index += 1) {
    const token = raw[index]
    if (token === undefined) continue
    const next = raw[index + 1]
    if (!shouldInlineTextOptionValue(token, next, textOptionNames, knownOptionNames)) {
      if (token !== undefined) normalized.push(token)
      continue
    }
    normalized.push(`${token}=${next}`)
    index += 1
  }
  return normalized
}

export const parseCliCommandLine = (
  tool: ToolDefinition,
  spec: CliCommandSpec,
  raw: ReadonlyArray<string>
): Effect.Effect<ParsedCliCommandLine, CliOptionParseError, NodeServices.NodeServices> => {
  const fields = collectFieldSpecs(tool.inputSchema)
  const fieldOptionNames = new Set(fields.keys())
  const booleanOptionNames = new Set(
    [...fields].filter(([, field]) => fieldUsesBooleanOption(tool.inputSchema, field)).map(([name]) => name)
  )
  const textOptionNames = new Set([
    ...GLOBAL_TEXT_OPTION_NAMES,
    ...[...fieldOptionNames].filter((name) => !booleanOptionNames.has(name))
  ])
  return parseWithConfig(
    buildCliCommandConfig(tool, spec),
    raw,
    textOptionNames,
    new Set([...GLOBAL_BOOLEAN_OPTION_NAMES, ...textOptionNames, ...booleanOptionNames])
  )
}
