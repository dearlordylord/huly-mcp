import type { Effect } from "effect"
import { Console, Schema } from "effect"

import type { ToolOperationSuccess } from "../../../src/mcp/tools/registry.js"
import type { CliGlobalOptions } from "./cli-options.js"

export class CliRuntimeError extends Schema.TaggedError<CliRuntimeError>()(
  "CliRuntimeError",
  {
    message: Schema.String
  }
) {}

const MAX_TABLE_COLUMNS = 6
const MAX_CELL_LENGTH = 80

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const scalarText = (value: unknown): string => {
  if (value === null) return "null"
  if (value === undefined) return ""
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  const encoded = JSON.stringify(value)
  return typeof encoded === "string" ? encoded : ""
}

const truncate = (value: string): string =>
  value.length > MAX_CELL_LENGTH ? `${value.slice(0, MAX_CELL_LENGTH - 3)}...` : value

const scalarKeys = (record: Record<string, unknown>): Array<string> =>
  Object.keys(record).filter((key) => {
    const value = record[key]
    return value === null
      || value === undefined
      || typeof value === "string"
      || typeof value === "number"
      || typeof value === "boolean"
  })

const renderTable = (rows: ReadonlyArray<Record<string, unknown>>): string => {
  const [firstRow] = rows
  if (firstRow === undefined) return "No results."

  const columns = scalarKeys(firstRow).slice(0, MAX_TABLE_COLUMNS)
  if (columns.length === 0) return JSON.stringify(rows, null, 2)

  const tableColumns = columns.map((column) => ({
    name: column,
    width: Math.max(
      column.length,
      ...rows.map((row) => truncate(scalarText(row[column])).length)
    )
  }))
  const line = tableColumns.map((column) => column.name.padEnd(column.width)).join("  ")
  const separator = tableColumns.map((column) => "-".repeat(column.width)).join("  ")
  const body = rows.map((row) =>
    tableColumns
      .map((column) => truncate(scalarText(row[column.name])).padEnd(column.width))
      .join("  ")
  )
  return [line, separator, ...body].join("\n")
}

const firstArrayProperty = (
  result: Record<string, unknown>
): readonly [key: string, rows: ReadonlyArray<Record<string, unknown>>] | undefined => {
  for (const [key, value] of Object.entries(result)) {
    if (Array.isArray(value) && value.every(isRecord)) {
      return [key, value]
    }
  }
  return undefined
}

const renderObjectSummary = (result: Record<string, unknown>): string => {
  const table = firstArrayProperty(result)
  if (table !== undefined) {
    const [key, rows] = table
    const total = typeof result.total === "number" || typeof result.total === "string" ? `\nTotal: ${result.total}` : ""
    return `${key}:\n${renderTable(rows)}${total}`
  }

  return Object.entries(result)
    .map(([key, value]) => `${key}: ${scalarText(value)}`)
    .join("\n")
}

const renderHuman = (result: unknown): string => {
  if (Array.isArray(result) && result.every(isRecord)) return renderTable(result)
  if (isRecord(result)) return renderObjectSummary(result)
  return scalarText(result)
}

export const renderOperationResult = (
  success: ToolOperationSuccess,
  globals: CliGlobalOptions
): string => globals.json ? JSON.stringify(success.result, null, 2) : renderHuman(success.result)

export const renderOperationSuccess = (
  success: ToolOperationSuccess,
  globals: CliGlobalOptions
): Effect.Effect<void, CliRuntimeError> => Console.log(renderOperationResult(success, globals))
