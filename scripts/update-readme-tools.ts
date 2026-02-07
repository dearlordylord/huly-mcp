#!/usr/bin/env tsx

import { readFileSync, writeFileSync } from "fs"
import { join } from "path"

interface Tool {
  name: string
  description: string
}

const parseToolsFromFile = (filePath: string): Tool[] => {
  const content = readFileSync(filePath, "utf-8")
  const tools: Tool[] = []

  const objectPattern = /\{[\s\S]*?name:\s*"([^"]+)"[\s\S]*?description:\s*"([^"]+)"[\s\S]*?\}/g

  let match
  while ((match = objectPattern.exec(content)) !== null) {
    tools.push({
      name: match[1],
      description: match[2]
    })
  }

  return tools
}

const categories = [
  { name: "Projects", file: "projects.ts" },
  { name: "Issues", file: "issues.ts" },
  { name: "Comments", file: "comments.ts" },
  { name: "Milestones", file: "milestones.ts" },
  { name: "Documents", file: "documents.ts" },
  { name: "Storage", file: "storage.ts" },
  { name: "Contacts", file: "contacts.ts" },
  { name: "Channels", file: "channels.ts" },
  { name: "Calendar", file: "calendar.ts" },
  { name: "Time Tracking", file: "time.ts" }
].map(({ name, file }) => ({
  name,
  tools: parseToolsFromFile(join(process.cwd(), "src/mcp/tools", file))
}))

const generateToolsSection = (): string => {
  let output = "## Available Tools\n\n"

  for (const category of categories) {
    if (category.tools.length === 0) continue

    output += `### ${category.name}\n\n`
    output += "| Tool | Description |\n"
    output += "|------|-------------|\n"

    for (const tool of category.tools) {
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
  console.log("✅ README.md updated with tools documentation")
}

updateReadme()
