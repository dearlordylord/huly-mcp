import type { HulyClient } from "../../huly/client.js"
import type { HulyStorageClient } from "../../huly/storage.js"
import type { WorkspaceClient } from "../../huly/workspace-client.js"
import type { McpToolResponse } from "../error-mapping.js"
import { activityTools } from "./activity.js"
import { attachmentTools } from "./attachments.js"
import { calendarTools } from "./calendar.js"
import { channelTools } from "./channels.js"
import { commentTools } from "./comments.js"
import { contactTools } from "./contacts.js"
import { documentTools } from "./documents.js"
import { issueTools } from "./issues.js"
import { milestoneTools } from "./milestones.js"
import { notificationTools } from "./notifications.js"
import { projectTools } from "./projects.js"
import type { RegisteredTool, ToolDefinition } from "./registry.js"
import { searchTools } from "./search.js"
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
  ...attachmentTools,
  ...contactTools,
  ...channelTools,
  ...calendarTools,
  ...timeTools,
  ...searchTools,
  ...activityTools,
  ...notificationTools,
  ...workspaceTools
]

export const CATEGORY_NAMES: ReadonlySet<string> = new Set(
  allTools.map((t) => t.category)
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
  ) => Promise<McpToolResponse | null>
}

type ToolRegistry = ToolRegistryData & ToolRegistryMethods

const buildRegistry = (tools: ReadonlyArray<RegisteredTool>): ToolRegistry => {
  const map = new Map<string, RegisteredTool>(
    tools.map((t) => [t.name, t])
  )
  return {
    tools: map,
    definitions: tools,
    handleToolCall: async (toolName, args, hulyClient, storageClient, workspaceClient) => {
      const tool = map.get(toolName)
      if (!tool) return null
      return tool.handler(args, hulyClient, storageClient, workspaceClient)
    }
  }
}

export const createFilteredRegistry = (categories: ReadonlySet<string>): ToolRegistry =>
  buildRegistry(allTools.filter((t) => categories.has(t.category)))

export const toolRegistry: ToolRegistry = buildRegistry(allTools)

export const TOOL_DEFINITIONS = Object.fromEntries(toolRegistry.tools)
