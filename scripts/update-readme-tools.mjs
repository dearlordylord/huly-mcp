#!/usr/bin/env node

import { createRequire } from "node:module"
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, join, normalize, resolve } from "node:path"
import ts from "typescript"

const require = createRequire(import.meta.url)
const hulyTaskPlugin = require("@hcengineering/task").default
const checkMode = process.argv.includes("--check")

const sourceCache = new Map()
const bindingCache = new Map()
const moduleBindingsCache = new Map()

const sourcePath = (filePath) => normalize(resolve(filePath))

const sourceFor = (filePath) => {
  const resolved = sourcePath(filePath)
  const cached = sourceCache.get(resolved)
  if (cached !== undefined) return cached

  const source = ts.createSourceFile(
    resolved,
    readFileSync(resolved, "utf-8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  )
  sourceCache.set(resolved, source)
  return source
}

const resolveModulePath = (fromFile, specifier) => {
  if (!specifier.startsWith(".")) return specifier

  const basePath = resolve(dirname(fromFile), specifier)
  if (basePath.endsWith(".js")) {
    const tsPath = `${basePath.slice(0, -3)}.ts`
    if (existsSync(tsPath)) return sourcePath(tsPath)
    return sourcePath(join(basePath.slice(0, -3), "index.ts"))
  }
  const tsPath = `${basePath}.ts`
  if (existsSync(tsPath)) return sourcePath(tsPath)
  return sourcePath(join(basePath, "index.ts"))
}

const propertyNameText = (name) => {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text
  return undefined
}

const setBindingValue = (bindings, name, value) => {
  if (ts.isIdentifier(name)) {
    bindings.set(name.text, value)
    return
  }

  if (ts.isArrayBindingPattern(name) && Array.isArray(value)) {
    name.elements.forEach((element, index) => {
      if (ts.isBindingElement(element)) setBindingValue(bindings, element.name, value[index])
    })
  }
}

const moduleBindingsFor = (filePath) => {
  const resolved = sourcePath(filePath)
  const cached = moduleBindingsCache.get(resolved)
  if (cached !== undefined) return cached

  const source = sourceFor(resolved)
  const bindings = new Map()
  const exportStars = []

  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const modulePath = resolveModulePath(resolved, statement.moduleSpecifier.text)
      const namedBindings = statement.importClause?.namedBindings
      if (namedBindings !== undefined && ts.isNamedImports(namedBindings)) {
        for (const element of namedBindings.elements) {
          bindings.set(element.name.text, {
            kind: "import",
            importedName: element.propertyName?.text ?? element.name.text,
            modulePath
          })
        }
      }
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer !== undefined) {
          bindings.set(declaration.name.text, { kind: "local", initializer: declaration.initializer })
        }
      }
    }

    if (ts.isExportDeclaration(statement)) {
      const modulePath = statement.moduleSpecifier !== undefined && ts.isStringLiteral(statement.moduleSpecifier)
        ? resolveModulePath(resolved, statement.moduleSpecifier.text)
        : resolved

      if (statement.exportClause !== undefined && ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          bindings.set(element.name.text, {
            kind: "reExport",
            exportedName: element.propertyName?.text ?? element.name.text,
            modulePath
          })
        }
      } else if (statement.exportClause === undefined && statement.moduleSpecifier !== undefined) {
        exportStars.push(modulePath)
      }
    }
  }

  if (exportStars.length > 0) {
    bindings.set("__exportStars", { kind: "exportStars", modulePaths: exportStars })
  }

  moduleBindingsCache.set(resolved, bindings)
  return bindings
}

const bindingValue = (filePath, name) => {
  const resolved = sourcePath(filePath)
  const cacheKey = `${resolved}:${name}`
  if (bindingCache.has(cacheKey)) return bindingCache.get(cacheKey)

  const binding = moduleBindingsFor(resolved).get(name)
  if (binding === undefined) {
    const exportStars = moduleBindingsFor(resolved).get("__exportStars")
    if (exportStars?.kind === "exportStars") {
      for (const modulePath of exportStars.modulePaths) {
        const value = bindingValue(modulePath, name)
        if (value !== undefined) return value
      }
    }
    return undefined
  }

  let value
  switch (binding.kind) {
    case "local":
      value = expressionValue(binding.initializer, resolved)
      break
    case "import":
      if (binding.modulePath === "../../huly/huly-plugins.js" || binding.modulePath.endsWith("/src/huly/huly-plugins.ts")) {
        value = binding.importedName === "task" ? hulyTaskPlugin : undefined
      } else {
        value = bindingValue(binding.modulePath, binding.importedName)
      }
      break
    case "reExport":
      value = bindingValue(binding.modulePath, binding.exportedName)
      break
  }

  bindingCache.set(cacheKey, value)
  return value
}

const functionValue = (node, filePath, localBindings) => {
  if (ts.isIdentifier(node)) {
    const binding = moduleBindingsFor(filePath).get(node.text)
    if (binding?.kind === "local" && ts.isArrowFunction(binding.initializer)) {
      return functionValue(binding.initializer, filePath, localBindings)
    }
    return undefined
  }

  if (!ts.isArrowFunction(node)) return undefined

  return (...args) => {
    const scopedBindings = new Map(localBindings)
    node.parameters.forEach((parameter, index) => {
      setBindingValue(scopedBindings, parameter.name, args[index])
    })

    return ts.isBlock(node.body)
      ? undefined
      : expressionValue(node.body, filePath, scopedBindings)
  }
}

const expressionValue = (node, filePath, localBindings = new Map()) => {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isNumericLiteral(node)) return Number(node.text)
  if (ts.isIdentifier(node)) {
    return localBindings.has(node.text) ? localBindings.get(node.text) : bindingValue(filePath, node.text)
  }
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)) {
    return expressionValue(node.expression, filePath, localBindings)
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map((element) => expressionValue(element, filePath, localBindings))
  }
  if (ts.isObjectLiteralExpression(node)) {
    const value = {}
    for (const property of node.properties) {
      if (ts.isPropertyAssignment(property)) {
        const key = propertyNameText(property.name)
        if (key !== undefined) value[key] = expressionValue(property.initializer, filePath, localBindings)
      }
    }
    return value
  }
  if (ts.isPropertyAccessExpression(node)) {
    const target = expressionValue(node.expression, filePath, localBindings)
    return target?.[node.name.text]
  }
  if (ts.isTemplateExpression(node)) {
    return node.templateSpans.reduce(
      (output, span) => `${output}${String(expressionValue(span.expression, filePath, localBindings))}${span.literal.text}`,
      node.head.text
    )
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = expressionValue(node.left, filePath, localBindings)
    const right = expressionValue(node.right, filePath, localBindings)
    return typeof left === "string" || typeof right === "string" ? `${left ?? ""}${right ?? ""}` : undefined
  }
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
    if (node.expression.text === "enumValuesDescription" && node.arguments.length === 1) {
      const values = expressionValue(node.arguments[0], filePath, localBindings)
      return Array.isArray(values) ? values.join(", ") : undefined
    }

    const fn = functionValue(node.expression, filePath, localBindings)
    if (fn !== undefined) {
      return fn(...node.arguments.map((argument) => expressionValue(argument, filePath, localBindings)))
    }
  }

  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const target = expressionValue(node.expression.expression, filePath, localBindings)
    const method = node.expression.name.text

    if (method === "join" && Array.isArray(target)) {
      const separator = node.arguments.length > 0
        ? expressionValue(node.arguments[0], filePath, localBindings)
        : ","
      return target.join(typeof separator === "string" ? separator : ",")
    }

    if (method === "map" && Array.isArray(target) && node.arguments.length === 1) {
      const mapper = functionValue(node.arguments[0], filePath, localBindings)
      return mapper === undefined ? undefined : target.map((item) => mapper(item))
    }
  }

  return undefined
}

const objectPropertyValue = (object, propertyName, filePath) => {
  const property = object.properties.find((p) =>
    ts.isPropertyAssignment(p) && propertyNameText(p.name) === propertyName
  )
  return property !== undefined && ts.isPropertyAssignment(property)
    ? expressionValue(property.initializer, filePath)
    : undefined
}

const parseToolsFromFile = (filePath) => {
  const source = sourceFor(filePath)
  const tools = []

  const visit = (node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const name = objectPropertyValue(node, "name", filePath)
      const description = objectPropertyValue(node, "description", filePath)
      const category = objectPropertyValue(node, "category", filePath)

      if (typeof name === "string" && typeof description === "string" && typeof category === "string") {
        tools.push({ name, description, category })
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(source)
  return tools
}

const parseResourceTemplatesFromFile = (filePath) => {
  const templates = bindingValue(filePath, "resourceTemplates")
  return Array.isArray(templates) ? templates : []
}

const toolsDir = join(process.cwd(), "src/mcp/tools")
const toolFiles = readdirSync(toolsDir)
  .filter((file) => file.endsWith(".ts") && file !== "index.ts" && file !== "registry.ts")

const allTools = toolFiles.flatMap((file) => parseToolsFromFile(join(toolsDir, file)))
const resourceTemplates = parseResourceTemplatesFromFile(join(process.cwd(), "src/mcp/resources.ts"))

if (allTools.length === 0) {
  throw new Error("README tool generation found no tools")
}

if (resourceTemplates.length === 0) {
  throw new Error("README resource generation found no resource templates")
}

for (const tool of allTools) {
  if (tool.description === tool.name) {
    throw new Error(`README tool generation produced a suspicious self-description for ${tool.name}`)
  }
}

for (const tool of allTools) {
  if (tool.description.includes("${")) {
    throw new Error(`README tool generation left an unevaluated template expression in ${tool.name}`)
  }
}

for (const resource of resourceTemplates) {
  if (typeof resource.uriTemplate !== "string" || typeof resource.name !== "string") {
    throw new Error("README resource generation produced an invalid resource template")
  }
}

const categoryOrder = [
  "projects",
  "issues",
  "comments",
  "milestones",
  "documents",
  "storage",
  "attachments",
  "contacts",
  "channels",
  "calendar",
  "time tracking",
  "search",
  "associations",
  "activity",
  "notifications",
  "workspace"
]

const capitalize = (value) =>
  value.replace(/\b\w/g, (char) => char.toUpperCase())

const toolsByCategory = new Map()
for (const tool of allTools) {
  const existing = toolsByCategory.get(tool.category) ?? []
  existing.push(tool)
  toolsByCategory.set(tool.category, existing)
}

const appendCategory = (output, categoryName, tools) => {
  let nextOutput = output
  nextOutput += `### ${capitalize(categoryName)}\n\n`
  nextOutput += "| Tool | Description |\n"
  nextOutput += "|------|-------------|\n"

  for (const tool of tools) {
    const escapedDesc = tool.description.replace(/\|/g, "\\|").replace(/\n/g, " ")
    nextOutput += `| \`${tool.name}\` | ${escapedDesc} |\n`
  }

  return `${nextOutput}\n`
}

const escapeTableCell = (value) =>
  value.replace(/\|/g, "\\|").replace(/\n/g, " ")

const generateToolsSection = () => {
  const categories = [
    ...categoryOrder.filter((category) => toolsByCategory.has(category)),
    ...[...toolsByCategory.keys()].filter((category) => !categoryOrder.includes(category))
  ]
  let output = "## Available Tools\n\n"
  output += `**\`TOOLSETS\` categories:** ${categories.map((category) => `\`${category}\``).join(", ")}\n\n`

  for (const categoryName of categoryOrder) {
    const tools = toolsByCategory.get(categoryName)
    if (tools === undefined || tools.length === 0) continue
    output = appendCategory(output, categoryName, tools)
  }

  for (const [categoryName, tools] of toolsByCategory) {
    if (categoryOrder.includes(categoryName) || tools.length === 0) continue
    output = appendCategory(output, categoryName, tools)
  }

  return output
}

const generateResourcesSection = () => {
  let output =
    "<!-- AUTO-GENERATED from src/mcp/resources.ts resourceTemplates. Do not edit manually. Run `pnpm update-readme` to regenerate. -->\n"
  output += "| Template | Name | Description | MIME Type |\n"
  output += "|----------|------|-------------|-----------|\n"

  for (const resource of resourceTemplates) {
    output +=
      `| \`${resource.uriTemplate}\` | \`${resource.name}\` | ${escapeTableCell(resource.description)} | \`${resource.mimeType}\` |\n`
  }

  return output
}

const replaceGeneratedSection = (content, startMarker, endMarker, generated) => {
  const startIdx = content.indexOf(startMarker)
  const endIdx = content.indexOf(endMarker)

  if (startIdx === -1 || endIdx === -1) {
    console.error(`Error: Could not find ${startMarker} / ${endMarker} markers in README.md`)
    console.error("Please add the following markers where you want the generated section:")
    console.error(startMarker)
    console.error(endMarker)
    process.exit(1)
  }

  const before = content.substring(0, startIdx + startMarker.length)
  const after = content.substring(endIdx)
  return `${before}\n${generated}${after}`
}

const readmePath = join(process.cwd(), "README.md")
const originalContent = readFileSync(readmePath, "utf-8")
let content = originalContent

const autoGenComment =
  "<!-- AUTO-GENERATED from src/mcp/tools/ descriptions. Do not edit manually. Run `pnpm update-readme` to regenerate. -->"
content = replaceGeneratedSection(
  content,
  "<!-- resources:start -->",
  "<!-- resources:end -->",
  generateResourcesSection()
)
content = replaceGeneratedSection(
  content,
  "<!-- tools:start -->",
  "<!-- tools:end -->",
  `${autoGenComment}\n${generateToolsSection()}`
)

if (checkMode) {
  if (content !== originalContent) {
    console.error("README.md generated sections are stale. Run `pnpm update-readme` and commit the result.")
    process.exit(1)
  }

  console.log(
    `✅ README.md is up to date with ${allTools.length} tools in ${toolsByCategory.size} categories and ${resourceTemplates.length} resource templates`
  )
  process.exit(0)
}

writeFileSync(readmePath, content, "utf-8")
console.log(
  `✅ README.md updated with ${allTools.length} tools in ${toolsByCategory.size} categories and ${resourceTemplates.length} resource templates`
)
