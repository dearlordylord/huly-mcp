#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const failureMessages = []

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(entryPath)
    return entry.isFile() ? [entryPath] : []
  })

const relative = (file) => path.relative(root, file)

const addFailure = (file, message) => {
  failureMessages.push(`${relative(file)}: ${message}`)
}

const schemaFiles = walk(path.join(root, "src/domain/schemas"))
  .filter((file) => file.endsWith(".ts"))

for (const file of schemaFiles) {
  const text = fs.readFileSync(file, "utf8")
  if (/^\s*export\s+interface\s+\w+/m.test(text)) {
    addFailure(file, "exported interfaces are not allowed in schema modules; export Schema-derived types")
  }
  if (/No codec needed|not used for runtime validation/i.test(text)) {
    addFailure(file, "schema modules must not claim that boundary codecs are unnecessary")
  }
}

const legacyHandlerHelpers = [
  "createToolHandler",
  "createEncodedToolHandler",
  "createStorageToolHandler",
  "createCombinedToolHandler",
  "createEncodedCombinedToolHandler",
  "createWorkspaceToolHandler",
  "createEncodedWorkspaceToolHandler",
  "createNoParamsWorkspaceToolHandler",
  "createEncodedNoParamsWorkspaceToolHandler"
]

const productionToolFiles = walk(path.join(root, "src/mcp/tools"))
  .filter((file) => file.endsWith(".ts"))
  .filter((file) => !file.endsWith(`${path.sep}registry.ts`))
  .filter((file) => !file.endsWith(`${path.sep}index.ts`))

const findMatchingBrace = (text, openBraceIndex) => {
  let depth = 0
  let quote = null
  let escaped = false
  let lineComment = false
  let blockComment = false

  for (let i = openBraceIndex; i < text.length; i += 1) {
    const char = text[i]
    const next = text[i + 1]

    if (lineComment) {
      if (char === "\n") lineComment = false
      continue
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false
        i += 1
      }
      continue
    }
    if (quote !== null) {
      if (escaped) {
        escaped = false
      } else if (char === "\\") {
        escaped = true
      } else if (char === quote) {
        quote = null
      }
      continue
    }
    if (char === "/" && next === "/") {
      lineComment = true
      i += 1
      continue
    }
    if (char === "/" && next === "*") {
      blockComment = true
      i += 1
      continue
    }
    if (char === "\"" || char === "'" || char === "`") {
      quote = char
      continue
    }
    if (char === "{") depth += 1
    if (char === "}") {
      depth -= 1
      if (depth === 0) return i
    }
  }

  return -1
}

for (const file of productionToolFiles) {
  const text = fs.readFileSync(file, "utf8")
  for (const helper of legacyHandlerHelpers) {
    const helperImport = new RegExp(`\\b${helper}\\b`)
    if (helperImport.test(text)) {
      addFailure(file, `production tool module must not use legacy raw handler helper ${helper}`)
    }
  }
  if (/\bhandler\s*:/.test(text)) {
    addFailure(file, "production tool modules must define tools through schema-required builders")
  }

  const defineToolPattern = /\bdefine(?:Storage|Combined|Workspace|NoParamsWorkspace)?Tool\s*\(\s*\{/g
  for (const match of text.matchAll(defineToolPattern)) {
    const openBraceIndex = match.index + match[0].lastIndexOf("{")
    const closeBraceIndex = findMatchingBrace(text, openBraceIndex)
    if (closeBraceIndex === -1) {
      addFailure(file, "could not parse define*Tool spec object")
      continue
    }
    const specText = text.slice(openBraceIndex, closeBraceIndex + 1)
    if (!/\bresultSchema\s*:/.test(specText)) {
      addFailure(file, "define*Tool spec is missing resultSchema")
    }
  }
}

const mcpSourceFiles = walk(path.join(root, "src/mcp"))
  .filter((file) => file.endsWith(".ts"))

for (const file of mcpSourceFiles) {
  const text = fs.readFileSync(file, "utf8")
  if (/\bdefaultToolOutputSchema\b/.test(text)) {
    addFailure(file, "registered production tools must not use the generic default output schema")
  }
}

const hulyContextToolFile = path.join(root, "src/mcp/huly-context-tool.ts")
const hulyContextToolText = fs.readFileSync(hulyContextToolFile, "utf8")
for (const definitionName of ["versionToolDefinition", "getHulyContextToolDefinition"]) {
  const definitionIndex = hulyContextToolText.indexOf(`const ${definitionName}`)
  if (definitionIndex === -1) {
    addFailure(hulyContextToolFile, `missing builtin ${definitionName}`)
    continue
  }
  const objectIndex = hulyContextToolText.indexOf("{", definitionIndex)
  const closeIndex = findMatchingBrace(hulyContextToolText, objectIndex)
  const definitionText = closeIndex === -1 ? "" : hulyContextToolText.slice(objectIndex, closeIndex + 1)
  if (!/\boutputSchema\s*:/.test(definitionText)) {
    addFailure(hulyContextToolFile, `builtin ${definitionName} is missing outputSchema`)
  }
}

if (failureMessages.length > 0) {
  console.error("Schema boundary verification failed:")
  for (const message of failureMessages) console.error(`- ${message}`)
  process.exitCode = 1
}
