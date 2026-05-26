#!/usr/bin/env node

import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const parseToolsFromFile = (filePath) => {
  const content = readFileSync(filePath, "utf-8")
  const tools = []

  const categoryMatch = content.match(/const CATEGORY = "([^"]+)" as const/)
  if (!categoryMatch) return tools

  const category = categoryMatch[1]
  const toolPattern = /\{\s*name:\s*"([^"]+)"[\s\S]*?description:[\s\S]*?"([^"]+)"[\s\S]*?category:\s*CATEGORY/g

  let match
  while ((match = toolPattern.exec(content)) !== null) {
    tools.push({
      name: match[1],
      description: match[2],
      category
    })
  }

  return tools
}

const toolsDir = join(process.cwd(), "src/mcp/tools")
const toolFiles = readdirSync(toolsDir)
  .filter((file) => file.endsWith(".ts") && file !== "index.ts" && file !== "registry.ts")

const allTools = toolFiles.flatMap((file) => parseToolsFromFile(join(toolsDir, file)))

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

const readmePath = join(process.cwd(), "README.md")
const content = readFileSync(readmePath, "utf-8")

const startMarker = "<!-- tools:start -->"
const endMarker = "<!-- tools:end -->"

const startIdx = content.indexOf(startMarker)
const endIdx = content.indexOf(endMarker)

if (startIdx === -1 || endIdx === -1) {
  console.error("Error: Could not find tools markers in README.md")
  console.error("Please add the following markers where you want the tools section:")
  console.error("<!-- tools:start -->")
  console.error("<!-- tools:end -->")
  process.exit(1)
}

const autoGenComment =
  "<!-- AUTO-GENERATED from src/mcp/tools/ descriptions. Do not edit manually. Run `pnpm update-readme` to regenerate. -->"
const before = content.substring(0, startIdx + startMarker.length)
const after = content.substring(endIdx)
const newContent = `${before}\n${autoGenComment}\n${generateToolsSection()}${after}`

writeFileSync(readmePath, newContent, "utf-8")
console.log(`✅ README.md updated with ${allTools.length} tools in ${toolsByCategory.size} categories`)
