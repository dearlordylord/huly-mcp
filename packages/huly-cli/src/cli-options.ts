import { Args, CliConfig, Options } from "@effect/cli"
import type { NodeContext } from "@effect/platform-node"
import { Effect, Option } from "effect"

import type { ToolDefinition } from "../../../src/mcp/tools/registry.js"
import type { CliCommandSpec } from "./catalog-types.js"
import {
  collectFieldSpecs,
  fieldAcceptsBoolean,
  fieldAcceptsJson,
  fieldAcceptsNull,
  fieldAcceptsNumber,
  fieldAcceptsString,
  type FieldSpec
} from "./schema-fields.js"

export interface CliGlobalOptions {
  readonly json: boolean
  readonly yes: boolean
  readonly output?: string
}

interface ParsedFieldOption {
  readonly _tag: "FieldOption"
  readonly fieldName: string
  readonly optionName: string
  readonly value: string
}

interface ParsedBooleanFieldOption {
  readonly _tag: "BooleanFieldOption"
  readonly fieldName: string
  readonly optionName: string
  readonly value: boolean
}

interface ParsedFileFieldOption {
  readonly _tag: "FileFieldOption"
  readonly fieldName: string
  readonly optionName: string
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

const positionals = Args.text({ name: "arg" }).pipe(Args.repeated)

const emptyOptions: ReadonlyArray<ParsedCliOption> = []

const optionalTextOption = (
  name: string,
  makeOption: (value: string) => ParsedCliOption
): Options.Options<ReadonlyArray<ParsedCliOption>> =>
  Options.text(name).pipe(
    Options.optional,
    Options.map((value) =>
      Option.match(value, {
        onNone: () => emptyOptions,
        onSome: (text) => [makeOption(text)]
      })
    )
  )

const booleanOption = (
  name: "json" | "yes"
): Options.Options<ReadonlyArray<ParsedCliOption>> =>
  Options.boolean(name, { negationNames: [`no-${name}`] }).pipe(
    Options.map((value) => [{
      _tag: "GlobalBooleanOption",
      name,
      value
    }])
  )

const fieldTextOption = (optionName: string, field: FieldSpec): Options.Options<ReadonlyArray<ParsedCliOption>> =>
  optionalTextOption(optionName, (value) => ({
    _tag: "FieldOption",
    fieldName: field.fieldName,
    optionName,
    value
  }))

const fieldBooleanOption = (
  optionName: string,
  field: FieldSpec
): Options.Options<ReadonlyArray<ParsedCliOption>> =>
  Options.boolean(optionName, { negationNames: [`no-${optionName}`] }).pipe(
    Options.map((value) => [{
      _tag: "BooleanFieldOption",
      fieldName: field.fieldName,
      optionName,
      value
    }])
  )

const fieldFileOption = (optionName: string, field: FieldSpec): Options.Options<ReadonlyArray<ParsedCliOption>> =>
  optionalTextOption(`${optionName}-file`, (path) => ({
    _tag: "FileFieldOption",
    fieldName: field.fieldName,
    optionName,
    path
  }))

const fieldUsesBooleanOption = (rootSchema: object, field: FieldSpec): boolean =>
  fieldAcceptsBoolean(rootSchema, field)
  && !fieldAcceptsString(rootSchema, field)
  && !fieldAcceptsNumber(rootSchema, field)
  && !fieldAcceptsNull(rootSchema, field)
  && !fieldAcceptsJson(rootSchema, field)

const fieldOptions = (
  rootSchema: object,
  fields: ReadonlyMap<string, FieldSpec>,
  fileInputFields: ReadonlySet<string>
): Array<Options.Options<ReadonlyArray<ParsedCliOption>>> => {
  const descriptors: Array<Options.Options<ReadonlyArray<ParsedCliOption>>> = []
  for (const [optionName, field] of fields) {
    descriptors.push(
      fieldUsesBooleanOption(rootSchema, field)
        ? fieldBooleanOption(optionName, field)
        : fieldTextOption(optionName, field)
    )
    if (fileInputFields.has(field.fieldName)) {
      descriptors.push(fieldFileOption(optionName, field))
    }
  }
  return descriptors
}

const globalOptions: ReadonlyArray<Options.Options<ReadonlyArray<ParsedCliOption>>> = [
  booleanOption("json"),
  booleanOption("yes"),
  optionalTextOption("input-json", (value) => ({ _tag: "GlobalOption", name: "input-json", value })),
  optionalTextOption("input-file", (value) => ({ _tag: "GlobalOption", name: "input-file", value })),
  optionalTextOption("output", (value) => ({ _tag: "GlobalOption", name: "output", value }))
]

const flattenOptions = (
  parsed: ReadonlyArray<ReadonlyArray<ParsedCliOption>>
): ReadonlyArray<ParsedCliOption> => parsed.flat()

export const buildCliCommandConfig = (tool: ToolDefinition, spec: CliCommandSpec) => {
  const fields = collectFieldSpecs(tool.inputSchema)
  const fileInputFields = new Set(spec.behavior?.fileInput?.fields ?? [])
  const options = Options.all([
    ...globalOptions,
    ...fieldOptions(tool.inputSchema, fields, fileInputFields)
  ]).pipe(Options.map(flattenOptions))

  return { options, positionals }
}

export const buildGlobalOptionsConfig = () => ({
  options: Options.all(globalOptions).pipe(Options.map(flattenOptions))
})

export const parseCliCommandLine = (
  tool: ToolDefinition,
  spec: CliCommandSpec,
  raw: ReadonlyArray<string>
): Effect.Effect<ParsedCliCommandLine, unknown, NodeContext.NodeContext> => {
  const config = buildCliCommandConfig(tool, spec)
  return Options.processCommandLine(config.options, raw, CliConfig.defaultConfig).pipe(
    Effect.flatMap(([error, rest, options]) =>
      Option.match(error, {
        onNone: () =>
          Effect.succeed({
            options,
            positionals: rest,
            raw
          }),
        onSome: Effect.fail
      })
    )
  )
}

export const parseGlobalCommandLine = (
  raw: ReadonlyArray<string>
): Effect.Effect<ReadonlyArray<ParsedCliOption>, unknown, NodeContext.NodeContext> =>
  Options.processCommandLine(buildGlobalOptionsConfig().options, raw, CliConfig.defaultConfig).pipe(
    Effect.flatMap(([error, , options]) =>
      Option.match(error, {
        onNone: () => Effect.succeed(options),
        onSome: Effect.fail
      })
    )
  )

export const rawOptionPresent = (raw: ReadonlyArray<string>, optionName: string): boolean =>
  raw.some((token) =>
    token === `--${optionName}`
    || token.startsWith(`--${optionName}=`)
    || token === `--no-${optionName}`
    || token.startsWith(`--no-${optionName}=`)
  )

export const rawOptionInlineValue = (raw: ReadonlyArray<string>, optionName: string): string | undefined => {
  const positivePrefix = `--${optionName}=`
  const negativePrefix = `--no-${optionName}=`
  const token = raw.find((value) => value.startsWith(positivePrefix) || value.startsWith(negativePrefix))
  if (token === undefined) return undefined
  const equalsIndex = token.indexOf("=")
  return token.slice(equalsIndex + 1)
}
