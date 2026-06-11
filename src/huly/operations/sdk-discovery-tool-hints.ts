import {
  HulyBacklogIssueNumber,
  type HulyClassRoutingHint,
  HulyMcpToolName
} from "../../domain/schemas/sdk-discovery-configurations.js"
import type { HulyClassToolHint } from "../../domain/schemas/sdk-discovery.js"
import { NonEmptyString, ObjectClassName } from "../../domain/schemas/shared.js"
import { cardPlugin, chunter, contact, core, documentPlugin, tracker } from "../huly-plugins.js"

const toolHint = (category: string, exampleTools: ReadonlyArray<string>): HulyClassToolHint => ({
  category: NonEmptyString.make(category),
  exampleTools: exampleTools.map((tool) => NonEmptyString.make(tool))
})

export const firstClassToolHints = new Map<string, ReadonlyArray<HulyClassToolHint>>([
  [String(tracker.class.Project), [toolHint("projects", ["list_projects", "get_project", "create_project"])]],
  [String(tracker.class.Issue), [toolHint("issues", ["list_issues", "get_issue", "create_issue"])]],
  [
    String(documentPlugin.class.Teamspace),
    [toolHint("documents", ["list_teamspaces", "create_teamspace"])]
  ],
  [
    String(documentPlugin.class.Document),
    [toolHint("documents", ["list_documents", "get_document", "create_document"])]
  ],
  [
    String(documentPlugin.class.DocumentSnapshot),
    [toolHint("documents", ["list_document_snapshots", "get_document_snapshot"])]
  ],
  [String(contact.class.Person), [toolHint("contacts", ["list_persons", "get_person", "create_person"])]],
  [
    String(contact.class.Organization),
    [toolHint("contacts", ["list_organizations", "get_organization", "create_organization"])]
  ],
  [String(cardPlugin.class.Card), [toolHint("cards", ["list_cards", "get_card", "create_card"])]],
  [String(cardPlugin.class.CardSpace), [toolHint("cards", ["list_card_spaces"])]],
  [String(chunter.class.ChatMessage), [toolHint("channels", ["list_channel_messages", "send_channel_message"])]],
  [
    String(tracker.class.ProjectTargetPreference),
    [toolHint("projects", ["list_project_target_preferences", "upsert_project_target_preference"])]
  ],
  [
    String(tracker.class.RelatedIssueTarget),
    [toolHint("issues", ["list_related_issue_targets", "set_related_issue_target"])]
  ]
])

const SDK_DISCOVERY_PHASE_2_BACKLOG_ISSUE = 92
const issue92 = HulyBacklogIssueNumber.make(SDK_DISCOVERY_PHASE_2_BACKLOG_ISSUE)

const covered = (
  safestMcpTools: ReadonlyArray<string>,
  rationale: string
): HulyClassRoutingHint => ({
  status: "covered",
  safestMcpTools: safestMcpTools.map((tool) => HulyMcpToolName.make(tool)),
  rationale: NonEmptyString.make(rationale)
})

const gap = (rationale: string): HulyClassRoutingHint => ({
  status: "gap",
  backlogIssue: issue92,
  rationale: NonEmptyString.make(rationale)
})

const notMcpFacing = (rationale: string): HulyClassRoutingHint => ({
  status: "not-mcp-facing",
  rationale: NonEmptyString.make(rationale)
})

interface RuntimeParityRoutingRow {
  readonly classId: ObjectClassName
  readonly packageName: NonEmptyString
  readonly exportName: NonEmptyString
  readonly hint: HulyClassRoutingHint
}

const trackerCoveredRationale =
  "Current project, issue, component, milestone, issue-template, status, relation, related-issue target, project target preference, and time-reporting tools cover core tracker resources. GitHub sync metadata, PDF export, saved views, and broader workflow automation remain deferred."
const documentCoveredRationale =
  "Current document tools cover non-controlled document teamspaces, document CRUD/content operations, and read-only snapshot/history listing plus markdown retrieval. Snapshot restore and document PDF/export remain deferred."
const contactCoveredRationale =
  "Current contacts tools expose person, organization, employee/member, and organization-channel operations."
const cardCoveredRationale = "Current card tools cover card spaces, master tags, and card CRUD."
const chunterCoveredRationale =
  "Current channel and direct-message tools cover channels, channel messages, one-to-one DM listing, and thread replies."
const coreCoveredRationale =
  "Existing tools expose user statuses, full-text search, blobs through storage/download flows, generic association/relation discovery/mutation helpers, class/interface/mixin, attribute, enum, plugin configuration, domain index configuration, sequence, and space type capability discovery."
const coreGapRationale =
  "Remaining core write-side configuration, role/permission definition writes, generic space creation, class collaborator metadata, statuses, and write-side model management are represented as matrix gaps. Generic space discovery, space type/permission reads, safe existing-space metadata updates, member mutations, owner replacement, typed-space role member mutations, object collaborators, read-only plugin configuration, domain index configuration, and sequence discovery are covered."
const coreNotMcpFacingRationale =
  "Core primitive model infrastructure, transaction classes, type wrappers, and versioning internals are not LLM-facing product resources by themselves."

const routingRow = (
  classId: string,
  packageName: string,
  exportName: string,
  hint: HulyClassRoutingHint
): RuntimeParityRoutingRow => ({
  classId: ObjectClassName.make(classId),
  packageName: NonEmptyString.make(packageName),
  exportName: NonEmptyString.make(exportName),
  hint
})

export const runtimeParityRoutingRows: ReadonlyArray<RuntimeParityRoutingRow> = [
  routingRow(
    String(tracker.class.Project),
    "@hcengineering/tracker",
    "Project",
    covered(["list_projects", "get_project", "create_project"], trackerCoveredRationale)
  ),
  routingRow(
    String(tracker.class.Issue),
    "@hcengineering/tracker",
    "Issue",
    covered(["list_issues", "get_issue", "create_issue"], trackerCoveredRationale)
  ),
  routingRow(
    String(documentPlugin.class.Teamspace),
    "@hcengineering/document",
    "Teamspace",
    covered(["list_teamspaces", "create_teamspace"], documentCoveredRationale)
  ),
  routingRow(
    String(documentPlugin.class.Document),
    "@hcengineering/document",
    "Document",
    covered(["list_documents", "get_document", "create_document"], documentCoveredRationale)
  ),
  routingRow(
    String(documentPlugin.class.DocumentSnapshot),
    "@hcengineering/document",
    "DocumentSnapshot",
    covered(["list_document_snapshots", "get_document_snapshot"], documentCoveredRationale)
  ),
  routingRow(
    String(contact.class.Person),
    "@hcengineering/contact",
    "Person",
    covered(["list_persons", "get_person", "create_person"], contactCoveredRationale)
  ),
  routingRow(
    String(contact.class.Organization),
    "@hcengineering/contact",
    "Organization",
    covered(["list_organizations", "get_organization", "create_organization"], contactCoveredRationale)
  ),
  routingRow(
    String(cardPlugin.class.Card),
    "@hcengineering/card",
    "Card",
    covered(["list_cards", "get_card", "create_card"], cardCoveredRationale)
  ),
  routingRow(
    String(cardPlugin.class.CardSpace),
    "@hcengineering/card",
    "CardSpace",
    covered(["list_card_spaces"], cardCoveredRationale)
  ),
  routingRow(
    String(chunter.class.ChatMessage),
    "@hcengineering/chunter",
    "ChatMessage",
    covered(["list_channel_messages", "send_channel_message"], chunterCoveredRationale)
  ),
  routingRow(
    String(tracker.class.ProjectTargetPreference),
    "@hcengineering/tracker",
    "ProjectTargetPreference",
    covered(["list_project_target_preferences", "upsert_project_target_preference"], trackerCoveredRationale)
  ),
  routingRow(
    String(tracker.class.RelatedIssueTarget),
    "@hcengineering/tracker",
    "RelatedIssueTarget",
    covered(
      ["list_related_issue_targets", "set_related_issue_target", "delete_related_issue_space_target"],
      trackerCoveredRationale
    )
  ),
  routingRow(
    String(core.class.PluginConfiguration),
    "@hcengineering/core",
    "PluginConfiguration",
    covered(["list_huly_plugin_configurations"], coreCoveredRationale)
  ),
  routingRow(
    String(core.class.DomainIndexConfiguration),
    "@hcengineering/core",
    "DomainIndexConfiguration",
    covered(["list_huly_domain_index_configurations"], coreCoveredRationale)
  ),
  routingRow(
    String(core.class.Sequence),
    "@hcengineering/core",
    "Sequence",
    covered(["list_huly_sequences"], coreCoveredRationale)
  ),
  routingRow(
    String(core.class.CustomSequence),
    "@hcengineering/core",
    "CustomSequence",
    covered(["list_huly_sequences"], coreCoveredRationale)
  ),
  routingRow(
    String(core.class.SpaceType),
    "@hcengineering/core",
    "SpaceType",
    covered(["describe_huly_space_type_capabilities", "get_space_type"], coreCoveredRationale)
  ),
  routingRow(
    String(core.class.SpaceTypeDescriptor),
    "@hcengineering/core",
    "SpaceTypeDescriptor",
    covered(["describe_huly_space_type_capabilities", "get_space_type"], coreCoveredRationale)
  ),
  routingRow(
    String(core.class.Permission),
    "@hcengineering/core",
    "Permission",
    covered(["list_space_permissions", "describe_huly_space_type_capabilities"], coreCoveredRationale)
  ),
  routingRow(String(core.class.Role), "@hcengineering/core", "Role", gap(coreGapRationale)),
  routingRow(
    String(core.class.AttributePermission),
    "@hcengineering/core",
    "AttributePermission",
    gap(coreGapRationale)
  ),
  routingRow(String(core.class.ClassPermission), "@hcengineering/core", "ClassPermission", gap(coreGapRationale)),
  routingRow(String(core.class.Configuration), "@hcengineering/core", "Configuration", gap(coreGapRationale)),
  routingRow(String(core.class.SystemSpace), "@hcengineering/core", "SystemSpace", gap(coreGapRationale)),
  routingRow(String(core.class.TypedSpace), "@hcengineering/core", "TypedSpace", gap(coreGapRationale)),
  routingRow(String(core.class.Doc), "@hcengineering/core", "Doc", notMcpFacing(coreNotMcpFacingRationale))
]

export const parityRoutingHints = new Map<string, ReadonlyArray<HulyClassRoutingHint>>(
  runtimeParityRoutingRows.map((row) => [row.classId, [row.hint]])
)
