import {
  HulyBacklogIssueNumber,
  type HulyClassRoutingHint,
  HulyMcpToolName
} from "../../domain/schemas/sdk-discovery-configurations.js"
import type { HulyClassToolHint } from "../../domain/schemas/sdk-discovery.js"
import { NonEmptyString, ObjectClassName } from "../../domain/schemas/shared.js"
import {
  board,
  cardPlugin,
  chunter,
  contact,
  core,
  documentPlugin,
  preference,
  tracker,
  view
} from "../huly-plugins.js"

const toolHint = (category: string, exampleTools: ReadonlyArray<string>): HulyClassToolHint => ({
  category: NonEmptyString.make(category),
  exampleTools: exampleTools.map((tool) => NonEmptyString.make(tool))
})

export const firstClassToolHints = new Map<string, ReadonlyArray<HulyClassToolHint>>([
  [String(tracker.class.Project), [toolHint("projects", ["list_projects", "get_project", "create_project"])]],
  [String(tracker.class.Issue), [toolHint("issues", ["list_issues", "get_issue", "create_issue"])]],
  [String(documentPlugin.class.Teamspace), [toolHint("documents", ["list_teamspaces", "create_teamspace"])]],
  [
    String(documentPlugin.class.Document),
    [toolHint("documents", ["list_documents", "get_document", "create_document"])]
  ],
  [
    String(documentPlugin.class.DocumentSnapshot),
    [toolHint("documents", ["list_document_snapshots", "get_document_snapshot"])]
  ],
  [
    String(contact.class.Person),
    [
      toolHint("contacts", [
        "list_persons",
        "get_person",
        "get_person_administration",
        "list_person_comments",
        "list_person_attachments",
        "create_person"
      ])
    ]
  ],
  [String(contact.mixin.Employee), [toolHint("contacts", ["list_employees", "set_employee_position"])]],
  [
    String(contact.class.Organization),
    [toolHint("contacts", ["list_organizations", "get_organization", "create_organization"])]
  ],
  [String(cardPlugin.class.Card), [toolHint("cards", ["list_cards", "get_card", "create_card"])]],
  [String(cardPlugin.class.CardSpace), [toolHint("cards", ["list_card_spaces"])]],
  [String(board.class.Board), [toolHint("boards", ["list_boards", "get_board", "create_board"])]],
  [
    String(board.class.Card),
    [toolHint("boards", ["list_board_cards", "get_board_card", "create_board_card", "list_board_card_labels"])]
  ],
  [String(board.class.MenuPage), [toolHint("boards", ["list_board_menu_pages"])]],
  [String(board.class.CommonBoardPreference), [toolHint("boards", ["get_board_common_preference"])]],
  [String(view.class.FilteredView), [toolHint("views", ["list_filtered_views", "get_filtered_view"])]],
  [String(view.class.Viewlet), [toolHint("views", ["list_viewlets"])]],
  [String(view.class.ViewletDescriptor), [toolHint("views", ["list_viewlets"])]],
  [String(view.class.ViewletPreference), [toolHint("views", ["list_viewlets"])]],
  [
    String(preference.class.SpacePreference),
    [toolHint("preferences", ["list_space_preferences", "get_space_preference"])]
  ],
  [String(chunter.class.ChatMessage), [toolHint("channels", ["list_channel_messages", "send_channel_message"])]],
  [
    String(tracker.class.ProjectTargetPreference),
    [toolHint("projects", ["list_project_target_preferences", "upsert_project_target_preference"])]
  ],
  [
    String(tracker.class.RelatedIssueTarget),
    [toolHint("issues", ["list_related_issue_targets", "set_related_issue_target"])]
  ],
  [
    String(core.class.Status),
    [toolHint("workflow-statuses", ["list_workflow_statuses", "get_workflow_status", "create_workflow_status"])]
  ],
  [
    String(core.class.StatusCategory),
    [toolHint("workflow-statuses", ["list_status_categories", "get_status_category", "create_status_category"])]
  ]
])

const SDK_DISCOVERY_PHASE_2_BACKLOG_ISSUE = 92
const issue92 = HulyBacklogIssueNumber.make(SDK_DISCOVERY_PHASE_2_BACKLOG_ISSUE)

const covered = (safestMcpTools: ReadonlyArray<string>, rationale: string): HulyClassRoutingHint => ({
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
  "Current contacts tools expose person, organization, employee/member, channels, exact-locator person notes and attachments, and person administration. Person administration exposes avatar and birthday, derives contact/workspace status, social identities and channel activity, reads account profile data, and applies only Huly-native account-authoritative SocialIdentity projection repairs; arbitrary identity mutations remain explicitly unsupported. Employee summaries project stable Contact Employee fields including active, role, statuses, position, and personUuid."
const cardCoveredRationale = "Current card tools cover card spaces, master tags, and card CRUD."
const boardCoveredRationale =
  "Current board tools cover board discovery, board create/update/archive, board card list/get/create/update, workflow status/type resolution, assignees, members, location, cover, dates, archived-card deletion, board labels, saved views, menu pages, viewlets, and common board preference reads. Provider integrations and board deletion remain deferred."
const viewCoveredRationale =
  "Current view tools cover read-only saved filtered view discovery/get operations across modules plus viewlet descriptor and ViewletPreference configuration discovery. View and preference writes remain deferred."
const preferenceCoveredRationale =
  "Read-only generic SpacePreference discovery is covered by list_space_preferences and get_space_preference. Generic preference writes remain deferred because the published SDK model exposes no safe typed writable fields beyond attachedTo."
const boardNotMcpFacingRationale =
  "Board card cover values are exposed through board card create/update fields. The CardCover SDK export is the underlying type metadata rather than a separate LLM-facing resource."
const chunterCoveredRationale =
  "Current channel and direct-message tools cover channels, channel messages, one-to-one DM create/list/message list/send/update/delete, thread replies, channel member list/add/remove, join/leave, archive/unarchive, conversation star/closed state, group direct-message create, message attachments, and locator-backed pinned-message list/set workflows."
const coreCoveredRationale =
  "Existing tools expose user statuses, generic workflow statuses and status categories with full CRUD, guarded enum and custom-attribute model CRUD, guarded base permission definitions, typed-space role definitions, class collaborator metadata, full-text search, blobs through storage/download flows, generic association/relation discovery/mutation helpers, class/interface/mixin, attribute, enum, plugin configuration, domain index configuration, sequence, and space type capability discovery."
const coreGapRationale =
  "Remaining core gaps are specialized AttributePermission/ClassPermission definitions, configuration internals, raw system-space types, and built-in model mutation. Generic space discovery/creation, guarded base permission writes, typed-space role creation and permission replacement, class collaborator metadata, safe existing-space metadata updates, member/owner/role-member mutations, object collaborators, guarded enum/custom-attribute CRUD, read-only plugin configuration, domain index configuration, sequence discovery, and generic workflow status/category CRUD are covered."
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
    String(board.class.Board),
    "@hcengineering/board",
    "Board",
    covered(["list_boards", "get_board", "create_board"], boardCoveredRationale)
  ),
  routingRow(
    String(board.class.Card),
    "@hcengineering/board",
    "Card",
    covered(
      [
        "list_board_cards",
        "get_board_card",
        "create_board_card",
        "list_board_card_labels",
        "add_board_card_label",
        "remove_board_card_label"
      ],
      boardCoveredRationale
    )
  ),
  routingRow(
    String(board.class.CommonBoardPreference),
    "@hcengineering/board",
    "CommonBoardPreference",
    covered(["get_board_common_preference"], boardCoveredRationale)
  ),
  routingRow(
    String(preference.class.SpacePreference),
    "@hcengineering/preference",
    "SpacePreference",
    covered(["list_space_preferences", "get_space_preference"], preferenceCoveredRationale)
  ),
  routingRow(
    String(preference.class.Preference),
    "@hcengineering/preference",
    "Preference",
    notMcpFacing(
      "Generic preference rows are broad SDK infrastructure. Use module-specific wrappers such as get_board_common_preference or the viewlet preference configs returned by list_viewlets."
    )
  ),
  routingRow(
    String(board.class.MenuPage),
    "@hcengineering/board",
    "MenuPage",
    covered(["list_board_menu_pages"], boardCoveredRationale)
  ),
  routingRow(
    String(view.class.FilteredView),
    "@hcengineering/view",
    "FilteredView",
    covered(["list_filtered_views", "get_filtered_view"], viewCoveredRationale)
  ),
  routingRow(
    String(view.class.Viewlet),
    "@hcengineering/view",
    "Viewlet",
    covered(["list_viewlets"], viewCoveredRationale)
  ),
  routingRow(
    String(view.class.ViewletDescriptor),
    "@hcengineering/view",
    "ViewletDescriptor",
    covered(["list_viewlets"], viewCoveredRationale)
  ),
  routingRow(
    String(view.class.ViewletPreference),
    "@hcengineering/view",
    "ViewletPreference",
    covered(["list_viewlets"], viewCoveredRationale)
  ),
  routingRow(
    String(board.class.CardCover),
    "@hcengineering/board",
    "CardCover",
    notMcpFacing(boardNotMcpFacingRationale)
  ),
  routingRow(
    String(chunter.class.ChatMessage),
    "@hcengineering/chunter",
    "ChatMessage",
    covered(
      ["list_channel_messages", "send_channel_message", "list_pinned_chat_messages", "set_chat_message_pinned"],
      chunterCoveredRationale
    )
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
    covered(["list_huly_sequences", "create_huly_sequence", "delete_huly_sequence"], coreCoveredRationale)
  ),
  routingRow(
    String(core.class.CustomSequence),
    "@hcengineering/core",
    "CustomSequence",
    covered(
      ["list_huly_sequences", "create_huly_sequence", "update_huly_custom_sequence", "delete_huly_sequence"],
      coreCoveredRationale
    )
  ),
  routingRow(
    String(core.class.Enum),
    "@hcengineering/core",
    "Enum",
    covered(["list_huly_enums", "create_huly_enum", "update_huly_enum", "delete_huly_enum"], coreCoveredRationale)
  ),
  routingRow(
    String(core.class.Attribute),
    "@hcengineering/core",
    "Attribute",
    covered(
      ["list_huly_attributes", "create_huly_attribute", "update_huly_attribute", "delete_huly_attribute"],
      coreCoveredRationale
    )
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
    covered(
      [
        "list_space_permissions",
        "describe_huly_space_type_capabilities",
        "create_huly_permission",
        "update_huly_permission",
        "delete_huly_permission"
      ],
      coreCoveredRationale
    )
  ),
  routingRow(
    String(core.class.Status),
    "@hcengineering/core",
    "Status",
    covered(["list_workflow_statuses", "get_workflow_status", "create_workflow_status"], coreCoveredRationale)
  ),
  routingRow(
    String(core.class.StatusCategory),
    "@hcengineering/core",
    "StatusCategory",
    covered(["list_status_categories", "get_status_category", "create_status_category"], coreCoveredRationale)
  ),
  routingRow(
    String(core.class.Role),
    "@hcengineering/core",
    "Role",
    covered(["get_space_type", "create_space_role", "set_space_role_permissions"], coreCoveredRationale)
  ),
  routingRow(
    String(core.class.ClassCollaborators),
    "@hcengineering/core",
    "ClassCollaborators",
    covered(
      ["get_class_collaborator_metadata", "set_class_collaborator_metadata", "delete_class_collaborator_metadata"],
      coreCoveredRationale
    )
  ),
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
