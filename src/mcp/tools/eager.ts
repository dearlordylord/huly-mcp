import type { RegisteredTool } from "./registry.js"
import { activityTools } from "./activity.js"
import { approvalRequestTools } from "./approval-requests.js"
import { attachmentTools } from "./attachments.js"
import { boardTools } from "./boards.js"
import { calendarTools } from "./calendar.js"
import { cardCommentTools } from "./card-comments.js"
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
import { externalIssuePublicationTools } from "./external-issue-publication.js"
import { genericAssociationTools } from "./generic-associations.js"
import { hrDepartmentTools } from "./hr-departments.js"
import { hrRequestTools } from "./hr-requests.js"
import { hrRequestMediaTools } from "./hr-request-media.js"
import { inventoryMediaTools } from "./inventory-media.js"
import { inventoryTools } from "./inventory.js"
import { issueTools } from "./issues.js"
import { labelTools } from "./labels.js"
import { leadTools } from "./leads.js"
import { leadCollaborationTools } from "./lead-collaboration.js"
import { mailTools } from "./mail.js"
import { messageTemplateTools } from "./message-templates.js"
import { modelAdministrationTools } from "./model-administration.js"
import { milestoneTools } from "./milestones.js"
import { moduleLabelTools } from "./module-labels.js"
import { notificationTools } from "./notifications.js"
import { plannerTools } from "./planner.js"
import { preferenceTools } from "./preferences.js"
import { processTools } from "./processes.js"
import { projectTargetPreferenceTools } from "./project-target-preferences.js"
import { projectTools } from "./projects.js"
import { recruitingTools } from "./recruiting.js"
import { relatedIssueTargetTools } from "./related-issue-targets.js"
import { sdkDiscoveryTools } from "./sdk-discovery.js"
import { searchTools } from "./search.js"
import { securityAdministrationTools } from "./security-administration.js"
import { sequenceAdministrationTools } from "./sequence-administration.js"
import { spaceTools } from "./spaces.js"
import { storageTools } from "./storage.js"
import { supportTools } from "./support.js"
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
import { workflowStatusTools } from "./workflow-statuses.js"
import { workbenchTools } from "./workbench.js"
export const toolGroups = {
  activityTools,
  approvalRequestTools,
  attachmentTools,
  boardTools,
  calendarTools,
  cardCommentTools,
  cardTools,
  channelTools,
  collaboratorTools,
  commentTools,
  contactTools,
  customFieldTools,
  deletionTools,
  documentSnapshotTools,
  documentTools,
  driveTools,
  externalIssuePublicationTools,
  genericAssociationTools,
  hrDepartmentTools,
  hrRequestTools,
  hrRequestMediaTools,
  inventoryMediaTools,
  inventoryTools,
  issueTools,
  labelTools,
  leadTools,
  leadCollaborationTools,
  mailTools,
  messageTemplateTools,
  modelAdministrationTools,
  milestoneTools,
  moduleLabelTools,
  notificationTools,
  plannerTools,
  preferenceTools,
  processTools,
  projectTargetPreferenceTools,
  projectTools,
  recruitingTools,
  relatedIssueTargetTools,
  sdkDiscoveryTools,
  searchTools,
  securityAdministrationTools,
  sequenceAdministrationTools,
  spaceTools,
  storageTools,
  supportTools,
  tagCategoryTools,
  tagTools,
  taskManagementTools,
  testManagementCoreTools,
  testManagementPlansTools,
  timeTools,
  userStatusTools,
  viewTools,
  virtualOfficeTools,
  workspaceTools,
  workflowStatusTools,
  workbenchTools
}
export const allTools = [
  ...projectTools,
  ...projectTargetPreferenceTools,
  ...issueTools,
  ...externalIssuePublicationTools,
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
  ...moduleLabelTools,
  ...documentSnapshotTools,
  ...driveTools,
  ...genericAssociationTools,
  ...hrDepartmentTools,
  ...hrRequestTools,
  ...hrRequestMediaTools,
  ...inventoryTools,
  ...inventoryMediaTools,
  ...spaceTools,
  ...sdkDiscoveryTools,
  ...modelAdministrationTools,
  ...securityAdministrationTools,
  ...sequenceAdministrationTools,
  ...storageTools,
  ...supportTools,
  ...attachmentTools,
  ...contactTools,
  ...channelTools,
  ...mailTools,
  ...boardTools,
  ...viewTools,
  ...cardTools,
  ...cardCommentTools,
  ...leadTools,
  ...leadCollaborationTools,
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
  ...workflowStatusTools,
  ...workbenchTools,
  ...taskManagementTools,
  ...testManagementCoreTools,
  ...testManagementPlansTools
] as const satisfies ReadonlyArray<RegisteredTool>

export type McpToolName = (typeof allTools)[number]["name"]
