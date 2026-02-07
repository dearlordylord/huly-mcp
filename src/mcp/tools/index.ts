import type { HulyClient } from "../../huly/client.js"
import type { HulyStorageClient } from "../../huly/storage.js"
import type { McpToolResponse } from "../error-mapping.js"
import { contactTools } from "./contacts.js"
import { documentTools } from "./documents.js"
import { issueTools } from "./issues.js"
import { projectTools } from "./projects.js"
import type { RegisteredTool, ToolDefinition } from "./registry.js"
import { storageTools } from "./storage.js"

const allTools: ReadonlyArray<RegisteredTool> = [
  ...projectTools,
  ...issueTools,
  ...documentTools,
  ...storageTools,
  ...contactTools
]

const toolMap = new Map<string, RegisteredTool>(
  allTools.map((t) => [t.name, t])
)

type ToolRegistryData = {
  readonly tools: ReadonlyMap<string, RegisteredTool>
  readonly definitions: ReadonlyArray<ToolDefinition>
}

type ToolRegistryMethods = {
  readonly handleToolCall: (
    toolName: string,
    args: unknown,
    hulyClient: HulyClient["Type"],
    storageClient: HulyStorageClient["Type"]
  ) => Promise<McpToolResponse> | null
}

export type ToolRegistry = ToolRegistryData & ToolRegistryMethods

export const toolRegistry: ToolRegistry = {
  tools: toolMap,
  definitions: allTools,
  handleToolCall: (toolName, args, hulyClient, storageClient) => {
    const tool = toolMap.get(toolName)
    if (!tool) return null
    return tool.handler(args, hulyClient, storageClient)
  }
}

export const TOOL_DEFINITIONS = Object.fromEntries(toolMap) as Record<string, RegisteredTool>

export type { RegisteredTool, ToolDefinition } from "./registry.js"
