import * as fs from "node:fs/promises"

import { Effect, Schema } from "effect"

import type { ToolDefinition } from "../../../src/mcp/tools/registry.js"
import type { CliCommandSpec } from "./catalog.js"
import {
  type CliGlobalOptions,
  type ParsedCliCommandLine,
  type ParsedCliOption,
  rawOptionInlineValue,
  rawOptionPresent
} from "./cli-options.js"
import {
  collectFieldSpecs,
  fieldAcceptsBoolean,
  fieldAcceptsJson,
  fieldAcceptsNull,
  fieldAcceptsNumber,
  fieldAcceptsString,
  type FieldSpec
} from "./schema-fields.js"

export class CliInputError extends Schema.TaggedError<CliInputError>()(
  "CliInputError",
  {
    message: Schema.String
  }
) {}

interface CliInvocation {
  readonly globals: CliGlobalOptions
  readonly input: Readonly<Record<string, unknown>>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const parseJsonObjectText = (
  source: string,
  text: string
): Effect.Effect<Record<string, unknown>, CliInputError> =>
  Effect.try({
    try: () => {
      const parsed: unknown = JSON.parse(text)
      return parsed
    },
    catch: (error) => new CliInputError({ message: `Invalid JSON in ${source}: ${String(error)}` })
  }).pipe(
    Effect.flatMap((parsed) =>
      isRecord(parsed)
        ? Effect.succeed(parsed)
        : Effect.fail(new CliInputError({ message: `${source} must contain a JSON object.` }))
    )
  )

const readTextFile = (path: string): Effect.Effect<string, CliInputError> =>
  Effect.tryPromise({
    try: () => fs.readFile(path, "utf8"),
    catch: (error) => new CliInputError({ message: `Failed to read ${path}: ${String(error)}` })
  })

const parseBooleanValue = (fieldName: string, raw: string): Effect.Effect<boolean, CliInputError> => {
  const normalized = raw.toLowerCase()
  if (normalized === "true" || normalized === "1") return Effect.succeed(true)
  if (normalized === "false" || normalized === "0") return Effect.succeed(false)
  return Effect.fail(new CliInputError({ message: `Option ${fieldName} expects true or false.` }))
}

const parseNumberValue = (fieldName: string, raw: string): Effect.Effect<number, CliInputError> => {
  const value = Number(raw)
  return Number.isFinite(value)
    ? Effect.succeed(value)
    : Effect.fail(new CliInputError({ message: `Option ${fieldName} expects a number.` }))
}

const parseJsonValue = (fieldName: string, raw: string): Effect.Effect<unknown, CliInputError> =>
  Effect.try({
    try: () => {
      const parsed: unknown = JSON.parse(raw)
      return parsed
    },
    catch: (error) => new CliInputError({ message: `Option ${fieldName} has invalid JSON: ${String(error)}` })
  })

const parseFieldValue = (
  rootSchema: object,
  field: FieldSpec,
  raw: string
): Effect.Effect<unknown, CliInputError> => {
  const acceptsBoolean = fieldAcceptsBoolean(rootSchema, field)
  const acceptsNumber = fieldAcceptsNumber(rootSchema, field)
  const acceptsString = fieldAcceptsString(rootSchema, field)
  const acceptsJson = fieldAcceptsJson(rootSchema, field)
  if (raw === "null" && fieldAcceptsNull(rootSchema, field)) return Effect.succeed(null)
  if (acceptsBoolean && ["0", "1", "false", "true"].includes(raw.toLowerCase())) {
    return parseBooleanValue(field.fieldName, raw)
  }
  if (acceptsBoolean && !acceptsString && !acceptsNumber && !acceptsJson) {
    return parseBooleanValue(field.fieldName, raw)
  }
  if (acceptsNumber && Number.isFinite(Number(raw))) return parseNumberValue(field.fieldName, raw)
  if (acceptsNumber && !acceptsString && !acceptsBoolean && !acceptsJson) return parseNumberValue(field.fieldName, raw)
  if (raw.startsWith("[") || raw.startsWith("{")) {
    return parseJsonValue(field.fieldName, raw)
  }
  if (acceptsJson && !acceptsString) return parseJsonValue(field.fieldName, raw)
  return Effect.succeed(raw)
}

const collectSourceInput = (
  options: ReadonlyArray<ParsedCliOption>
): Effect.Effect<Record<string, unknown>, CliInputError> =>
  Effect.gen(function*() {
    let input: Record<string, unknown> = {}
    for (const option of options) {
      if (option._tag === "GlobalOption" && option.name === "input-json") {
        input = { ...input, ...yield* parseJsonObjectText("--input-json", option.value) }
      }
      if (option._tag === "GlobalOption" && option.name === "input-file") {
        const content = yield* readTextFile(option.value)
        input = { ...input, ...yield* parseJsonObjectText(option.value, content) }
      }
    }
    return input
  })

const collectPositionals = (
  spec: CliCommandSpec,
  positionals: ReadonlyArray<string>
): Effect.Effect<Record<string, unknown>, CliInputError> => {
  const unknownOption = positionals.find((value) => value.startsWith("--"))
  if (unknownOption !== undefined) {
    return Effect.fail(new CliInputError({ message: `Unknown option ${unknownOption}.` }))
  }
  if (positionals.length > spec.positional.length) {
    return Effect.fail(
      new CliInputError({
        message: `Too many positional arguments. Expected ${spec.positional.length}, received ${positionals.length}.`
      })
    )
  }

  const input: Record<string, unknown> = {}
  for (const [index, fieldName] of spec.positional.entries()) {
    const value = positionals[index]
    if (value !== undefined) {
      input[fieldName] = value
    }
  }
  return Effect.succeed(input)
}

const collectExplicitOptions = (
  parsed: ParsedCliCommandLine,
  rootSchema: object,
  fields: ReadonlyMap<string, FieldSpec>
): Effect.Effect<Record<string, unknown>, CliInputError> =>
  Effect.gen(function*() {
    const input: Record<string, unknown> = {}
    for (const option of parsed.options) {
      if (option._tag === "BooleanFieldOption" && rawOptionPresent(parsed.raw, option.optionName)) {
        const field = fields.get(option.optionName)
        const inlineValue = rawOptionInlineValue(parsed.raw, option.optionName)
        if (field !== undefined) {
          input[option.fieldName] = inlineValue === undefined
            ? option.value
            : yield* parseBooleanValue(option.fieldName, inlineValue)
        }
      }
      if (option._tag === "FieldOption") {
        const field = fields.get(option.optionName)
        if (field !== undefined) input[option.fieldName] = yield* parseFieldValue(rootSchema, field, option.value)
      }
      if (option._tag === "FileFieldOption") {
        input[option.fieldName] = yield* readTextFile(option.path)
      }
    }
    return input
  })

const rawGlobalBooleanValue = (
  raw: ReadonlyArray<string>,
  name: "json" | "yes"
): Effect.Effect<boolean, CliInputError> => {
  const matching = raw.filter((token) =>
    token === `--${name}`
    || token === `--no-${name}`
    || token.startsWith(`--${name}=`)
    || token.startsWith(`--no-${name}=`)
  )
  const last = matching[matching.length - 1]
  if (last === undefined || last === `--no-${name}`) return Effect.succeed(false)
  if (last === `--${name}`) return Effect.succeed(true)
  return parseBooleanValue(name, last.slice(last.indexOf("=") + 1))
}

const collectGlobalOptions = (
  options: ReadonlyArray<ParsedCliOption>,
  raw: ReadonlyArray<string>
): Effect.Effect<CliGlobalOptions, CliInputError> =>
  Effect.gen(function*() {
    const json = yield* rawGlobalBooleanValue(raw, "json")
    const yes = yield* rawGlobalBooleanValue(raw, "yes")
    let output: string | undefined

    for (const option of options) {
      if (option._tag === "GlobalOption" && option.name === "output") output = option.value
    }

    return output === undefined ? { json, yes } : { json, output, yes }
  })

export const buildCliInvocation = (
  tool: ToolDefinition,
  spec: CliCommandSpec,
  parsed: ParsedCliCommandLine
): Effect.Effect<CliInvocation, CliInputError> =>
  Effect.gen(function*() {
    const fields = collectFieldSpecs(tool.inputSchema)
    const sourceInput = yield* collectSourceInput(parsed.options)
    const explicitInput = yield* collectExplicitOptions(parsed, tool.inputSchema, fields)
    const positionalInput = yield* collectPositionals(spec, parsed.positionals)
    const globals = yield* collectGlobalOptions(parsed.options, parsed.raw)

    return {
      globals,
      input: {
        ...sourceInput,
        ...positionalInput,
        ...explicitInput
      }
    }
  })
