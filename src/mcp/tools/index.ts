import type { HulyClient } from "../../huly/client.js"
import type { HulyStorageClient } from "../../huly/storage.js"
import type { WorkspaceClientOperations } from "../../huly/workspace-client.js"
import type { McpToolResponse } from "../error-mapping.js"
import { activityTools } from "./activity.js"
import { approvalRequestTools } from "./approval-requests.js"
import { attachmentTools } from "./attachments.js"
import { boardTools } from "./boards.js"
import { calendarTools } from "./calendar.js"
import { cardTools } from "./cards.js"
import { channelTools } from "./channels.js"
import { collaboratorTools } from "./collaborators.js"
import { commentTools } from "./comments.js"
import { contactTools } from "./contacts.js"
import { customFieldTools } from "./custom-fields.js"
import { deletionTools } from "./deletion.js"
import { documentSnapshotTools } from "./document-snapshots.js"
import { documentTools } from "./documents.js"
import { driveTools } from "./drive.js"
import { genericAssociationTools } from "./generic-associations.js"
import { inventoryMediaTools } from "./inventory-media.js"
import { inventoryTools } from "./inventory.js"
import { issueTools } from "./issues.js"
import { labelTools } from "./labels.js"
import { leadTools } from "./leads.js"
import { messageTemplateTools } from "./message-templates.js"
import { milestoneTools } from "./milestones.js"
import { notificationTools } from "./notifications.js"
import { plannerTools } from "./planner.js"
import { preferenceTools } from "./preferences.js"
import { processTools } from "./processes.js"
import { projectTargetPreferenceTools } from "./project-target-preferences.js"
import { projectTools } from "./projects.js"
import { recruitingTools } from "./recruiting.js"
import type { RegisteredTool, ToolCategory, ToolDefinition, ToolName } from "./registry.js"
import {
  createMissingArgumentsError,
  createUnexpectedArgumentsError,
  isEmptyArgumentsObject,
  isNoArgumentTool,
  requiresArgumentsObject,
  resolveAnnotations
} from "./registry.js"
import { relatedIssueTargetTools } from "./related-issue-targets.js"
import { sdkDiscoveryTools } from "./sdk-discovery.js"
import { searchTools } from "./search.js"
import { spaceTools } from "./spaces.js"
import { storageTools } from "./storage.js"
import { tagCategoryTools } from "./tag-categories.js"
import { tagTools } from "./tags.js"
import { taskManagementTools } from "./task-management.js"
import { testManagementCoreTools } from "./test-management-core.js"
import { testManagementPlansTools } from "./test-management-plans.js"
import { timeTools } from "./time.js"
import { userStatusTools } from "./user-statuses.js"
import { viewTools } from "./views.js"
import { virtualOfficeTools } from "./virtual-office.js"
import { workspaceTools } from "./workspace.js"

const allTools: ReadonlyArray<RegisteredTool> = [
  ...projectTools,
  ...projectTargetPreferenceTools,
  ...issueTools,
  ...relatedIssueTargetTools,
  ...labelTools,
  ...tagTools,
  ...tagCategoryTools,
  ...messageTemplateTools,
  ...commentTools,
  ...collaboratorTools,
  ...deletionTools,
  ...milestoneTools,
  ...documentTools,
  ...documentSnapshotTools,
  ...driveTools,
  ...genericAssociationTools,
  ...inventoryTools,
  ...inventoryMediaTools,
  ...spaceTools,
  ...sdkDiscoveryTools,
  ...storageTools,
  ...attachmentTools,
  ...contactTools,
  ...channelTools,
  ...boardTools,
  ...viewTools,
  ...cardTools,
  ...leadTools,
  ...recruitingTools,
  ...customFieldTools,
  ...calendarTools,
  ...timeTools,
  ...plannerTools,
  ...preferenceTools,
  ...approvalRequestTools,
  ...searchTools,
  ...activityTools,
  ...notificationTools,
  ...userStatusTools,
  ...virtualOfficeTools,
  ...processTools,
  ...workspaceTools,
  ...taskManagementTools,
  ...testManagementCoreTools,
  ...testManagementPlansTools
]

export const CATEGORY_NAMES: ReadonlySet<ToolCategory> = new Set(
  allTools.map((t) => t.category)
)

type ToolRegistryData = {
  readonly tools: ReadonlyMap<ToolName, RegisteredTool>
  readonly definitions: ReadonlyArray<ToolDefinition>
}

type ToolRegistryMethods = {
  readonly handleToolCall: (
    toolName: ToolName,
    args: unknown,
    hulyClient: HulyClient["Type"],
    storageClient: HulyStorageClient["Type"],
    workspaceClient?: WorkspaceClientOperations
  ) => Promise<McpToolResponse | null>
}

export type ToolRegistry = ToolRegistryData & ToolRegistryMethods

interface ToolRegistryScope {
  readonly filteringActive: boolean
  readonly categories: ReadonlySet<ToolCategory>
  readonly toolNames: ReadonlySet<ToolName>
}

const buildRegistry = (tools: ReadonlyArray<RegisteredTool>): ToolRegistry => {
  const map = new Map<ToolName, RegisteredTool>(
    tools.map((t) => [t.name, t])
  )
  return {
    tools: map,
    definitions: tools,
    handleToolCall: async (toolName, args, hulyClient, storageClient, workspaceClient) => {
      const tool = map.get(toolName)
      if (!tool) return null
      if (isNoArgumentTool(tool) && !isEmptyArgumentsObject(args)) {
        return createUnexpectedArgumentsError(toolName)
      }
      if (args === undefined && requiresArgumentsObject(tool)) {
        return createMissingArgumentsError(toolName)
      }
      return tool.handler(args ?? {}, hulyClient, storageClient, workspaceClient)
    }
  }
}

export const toolRegistry: ToolRegistry = buildRegistry(allTools)

export const createScopedRegistry = (scope: ToolRegistryScope): ToolRegistry => {
  if (!scope.filteringActive) return toolRegistry

  return buildRegistry(
    allTools.filter((t) => scope.categories.has(t.category) || scope.toolNames.has(t.name))
  )
}

export const createFilteredRegistry = (categories: ReadonlySet<ToolCategory>): ToolRegistry =>
  createScopedRegistry({
    filteringActive: true,
    categories,
    toolNames: new Set<ToolName>()
  })

export { resolveAnnotations }

export const TOOL_DEFINITIONS = Object.fromEntries(toolRegistry.tools)
