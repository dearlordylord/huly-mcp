import type { HulyClient } from "../../huly/client.js"
import type { HulyStorageClient } from "../../huly/storage.js"
import type { WorkspaceClient } from "../../huly/workspace-client.js"
import type { McpToolResponse } from "../error-mapping.js"
import { calendarTools } from "./calendar.js"
import { channelTools } from "./channels.js"
import { commentTools } from "./comments.js"
import { contactTools } from "./contacts.js"
import { documentTools } from "./documents.js"
import { issueTools } from "./issues.js"
import { milestoneTools } from "./milestones.js"
import { projectTools } from "./projects.js"
import type { RegisteredTool, ToolDefinition } from "./registry.js"
import { storageTools } from "./storage.js"
import { timeTools } from "./time.js"
import { workspaceTools } from "./workspace.js"

const allTools: ReadonlyArray<RegisteredTool> = [
  ...projectTools,
  ...issueTools,
  ...commentTools,
  ...milestoneTools,
  ...documentTools,
  ...storageTools,
  ...contactTools,
  ...channelTools,
  ...calendarTools,
  ...timeTools,
  ...workspaceTools
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
    storageClient: HulyStorageClient["Type"],
    workspaceClient?: WorkspaceClient["Type"]
  ) => Promise<McpToolResponse> | null
}

export type ToolRegistry = ToolRegistryData & ToolRegistryMethods

export const toolRegistry: ToolRegistry = {
  tools: toolMap,
  definitions: allTools,
  handleToolCall: (toolName, args, hulyClient, storageClient, workspaceClient) => {
    const tool = toolMap.get(toolName)
    if (!tool) return null
    return tool.handler(args, hulyClient, storageClient, workspaceClient)
  }
}

export const TOOL_DEFINITIONS = Object.fromEntries(toolMap) as Record<string, RegisteredTool>

export type { RegisteredTool, ToolDefinition } from "./registry.js"
