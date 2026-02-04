#!/usr/bin/env tsx

import { readdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"

interface Tool {
  name: string
  description: string
  category: string
}

const parseToolsFromFile = (filePath: string): Tool[] => {
  const content = readFileSync(filePath, "utf-8")
  const tools: Tool[] = []

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
  .filter((f) => f.endsWith(".ts") && f !== "index.ts" && f !== "registry.ts")

const allTools = toolFiles.flatMap((file) => parseToolsFromFile(join(toolsDir, file)))

const categoryOrder = [
  "Projects",
  "Issues",
  "Comments",
  "Milestones",
  "Documents",
  "Storage",
  "Attachments",
  "Contacts",
  "Channels",
  "Calendar",
  "Time Tracking",
  "Search",
  "Activity",
  "Notifications",
  "Workspace"
]

const toolsByCategory = new Map<string, Tool[]>()
for (const tool of allTools) {
  const existing = toolsByCategory.get(tool.category) ?? []
  existing.push(tool)
  toolsByCategory.set(tool.category, existing)
}

const generateToolsSection = (): string => {
  let output = "## Available Tools\n\n"

  for (const categoryName of categoryOrder) {
    const tools = toolsByCategory.get(categoryName)
    if (!tools || tools.length === 0) continue

    output += `### ${categoryName}\n\n`
    output += "| Tool | Description |\n"
    output += "|------|-------------|\n"

    for (const tool of tools) {
      const escapedDesc = tool.description.replace(/\|/g, "\\|").replace(/\n/g, " ")
      output += `| \`${tool.name}\` | ${escapedDesc} |\n`
    }

    output += "\n"
  }

  for (const [categoryName, tools] of toolsByCategory) {
    if (categoryOrder.includes(categoryName)) continue
    if (tools.length === 0) continue

    output += `### ${categoryName}\n\n`
    output += "| Tool | Description |\n"
    output += "|------|-------------|\n"

    for (const tool of tools) {
      const escapedDesc = tool.description.replace(/\|/g, "\\|").replace(/\n/g, " ")
      output += `| \`${tool.name}\` | ${escapedDesc} |\n`
    }

    output += "\n"
  }

  return output
}

const updateReadme = (): void => {
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

  const toolsSection = generateToolsSection()

  const before = content.substring(0, startIdx + startMarker.length)
  const after = content.substring(endIdx)

  const newContent = `${before}\n${toolsSection}${after}`

  writeFileSync(readmePath, newContent, "utf-8")
  console.log(`✅ README.md updated with ${allTools.length} tools in ${toolsByCategory.size} categories`)
}

updateReadme()
