import { readFileSync } from "node:fs"

import { cliCommandCatalog } from "../packages/huly-cli/src/catalog.js"

const integrationScriptPath = "scripts/integration_test_cli.sh"
const deferredToolsPath = "scripts/cli-integration-deferred-tools.txt"
const coveredToolPattern = /(?:cover_cli_json|capture_cli_json) "([a-z0-9_]+)"/g

const readLines = (path: string): ReadonlyArray<string> =>
  readFileSync(path, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))

const coveredToolFromMatch = (match: RegExpExecArray): string => {
  const toolName = match[1]
  if (toolName === undefined) {
    throw new Error("Internal error: covered tool regex matched without a tool name.")
  }
  return toolName
}

const duplicateValues = (values: ReadonlyArray<string>): ReadonlyArray<string> =>
  values.filter((value, index) => values.indexOf(value) !== index)

const uniqueSorted = (values: Iterable<string>): ReadonlyArray<string> => [...new Set(values)].sort()

const catalogTools = Object.keys(cliCommandCatalog).sort()
const catalogToolSet = new Set(catalogTools)
const integrationScript = readFileSync(integrationScriptPath, "utf8")
const coveredTools = uniqueSorted(Array.from(integrationScript.matchAll(coveredToolPattern), coveredToolFromMatch))
const coveredToolSet = new Set(coveredTools)
const deferredToolLines = readLines(deferredToolsPath)
const deferredTools = uniqueSorted(deferredToolLines)
const deferredToolSet = new Set(deferredTools)

const staleCoveredTools = coveredTools.filter((tool) => !catalogToolSet.has(tool))
const staleDeferredTools = deferredTools.filter((tool) => !catalogToolSet.has(tool))
const duplicateDeferredTools = uniqueSorted(duplicateValues(deferredToolLines))
const duplicateCoveredTools = uniqueSorted(duplicateValues(coveredTools))
const coveredAndDeferredTools = coveredTools.filter((tool) => deferredToolSet.has(tool))
const undecidedTools = catalogTools.filter((tool) => !coveredToolSet.has(tool) && !deferredToolSet.has(tool))

const errors = [
  staleCoveredTools.length === 0 ? undefined : `Covered tools not in CLI catalog: ${staleCoveredTools.join(", ")}`,
  staleDeferredTools.length === 0 ? undefined : `Deferred tools not in CLI catalog: ${staleDeferredTools.join(", ")}`,
  duplicateCoveredTools.length === 0 ? undefined : `Duplicate covered tools: ${duplicateCoveredTools.join(", ")}`,
  duplicateDeferredTools.length === 0 ? undefined : `Duplicate deferred tools: ${duplicateDeferredTools.join(", ")}`,
  coveredAndDeferredTools.length === 0
    ? undefined
    : `Tools cannot be both covered and deferred: ${coveredAndDeferredTools.join(", ")}`,
  undecidedTools.length === 0 ? undefined : `CLI tools need live coverage or deferral: ${undecidedTools.join(", ")}`
].filter((message) => message !== undefined)

if (errors.length > 0) {
  console.error("CLI integration coverage is out of sync.")
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exitCode = 1
} else {
  console.log(
    `CLI integration coverage is in sync: ${coveredTools.length} live, ${deferredTools.length} deferred, ${catalogTools.length} total.`
  )
}
