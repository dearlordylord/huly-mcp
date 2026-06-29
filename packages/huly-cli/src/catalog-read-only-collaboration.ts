import type { McpToolName } from "../../../src/mcp/tools/index.js"
import type { CliCommandSpec } from "./catalog-types.js"

export const collaborationReadOnlyCliCommandCatalog = {
  get_activity_message: {
    path: ["activity", "messages", "get"],
    positional: ["messageId"],
    description: "Get Activity Message"
  },
  get_approval_request: {
    path: ["approvals", "get"],
    positional: ["request"],
    description: "Get Approval Request"
  },
  get_board: {
    path: ["boards", "get"],
    positional: ["board"],
    description: "Get Board"
  },
  get_board_card: {
    path: ["boards", "cards", "get"],
    positional: ["board", "card"],
    description: "Get Board Card"
  },
  get_board_common_preference: {
    path: ["boards", "common-preference", "get"],
    positional: [],
    description: "Get Board Common Preference"
  },
  get_board_saved_view: {
    path: ["boards", "saved-views", "get"],
    positional: ["savedView"],
    description: "Get Board Saved View"
  },
  get_channel: {
    path: ["channels", "get"],
    positional: ["channel"],
    description: "Get Channel"
  },
  get_chat_message_attachment: {
    path: ["channels", "messages", "attachments", "get"],
    positional: ["target", "attachmentId"],
    description: "Get Chat Message Attachment"
  },
  get_message_template: {
    path: ["templates", "get"],
    positional: ["template"],
    description: "Get Message Template"
  },
  get_notification: {
    path: ["notifications", "get"],
    positional: ["notificationId"],
    description: "Get Notification"
  },
  get_notification_context: {
    path: ["notifications", "contexts", "get"],
    positional: ["objectId", "objectClass"],
    description: "Get Notification Context"
  },
  get_organization: {
    path: ["contacts", "organizations", "get"],
    positional: ["identifier"],
    description: "Get Organization"
  },
  get_person: {
    path: ["contacts", "persons", "get"],
    positional: [],
    description: "Get Person"
  },
  get_space: {
    path: ["spaces", "get"],
    positional: ["space"],
    description: "Get Space"
  },
  get_space_type: {
    path: ["spaces", "types", "get"],
    positional: ["spaceType"],
    description: "Get Space Type"
  },
  get_unread_notification_count: {
    path: ["notifications", "unread-count", "get"],
    positional: [],
    description: "Get Unread Notification Count"
  },
  list_activity: {
    path: ["activity", "list"],
    positional: [],
    description: "List Activity"
  },
  list_activity_filters: {
    path: ["activity", "filters", "list"],
    positional: [],
    description: "List Activity Filters"
  },
  list_activity_references: {
    path: ["activity", "references", "list"],
    positional: ["objectId", "objectClass"],
    description: "List Activity References"
  },
  list_activity_replies: {
    path: ["activity", "replies", "list"],
    positional: ["messageId"],
    description: "List Activity Replies"
  },
  list_approval_requests: {
    path: ["approvals", "list"],
    positional: [],
    description: "List Approval Requests"
  },
  list_attached_tags: {
    path: ["tags", "attached", "list"],
    positional: [],
    description: "List Attached Tags"
  },
  list_board_card_labels: {
    path: ["boards", "cards", "labels", "list"],
    positional: ["board", "card"],
    description: "List Board Card Labels"
  },
  list_board_cards: {
    path: ["boards", "cards", "list"],
    positional: ["board"],
    description: "List Board Cards"
  },
  list_board_labels: {
    path: ["boards", "labels", "list"],
    positional: [],
    description: "List Board Labels"
  },
  list_board_menu_pages: {
    path: ["boards", "menu-pages", "list"],
    positional: [],
    description: "List Board Menu Pages"
  },
  list_board_saved_views: {
    path: ["boards", "saved-views", "list"],
    positional: [],
    description: "List Board Saved Views"
  },
  list_board_viewlets: {
    path: ["boards", "viewlets", "list"],
    positional: [],
    description: "List Board Viewlets"
  },
  list_boards: {
    path: ["boards", "list"],
    positional: [],
    description: "List Boards"
  },
  list_channel_members: {
    path: ["channels", "members", "list"],
    positional: ["channel"],
    description: "List Channel Members"
  },
  list_channel_messages: {
    path: ["channels", "messages", "list"],
    positional: ["channel"],
    description: "List Channel Messages"
  },
  list_channels: {
    path: ["channels", "list"],
    positional: [],
    description: "List Channels"
  },
  list_chat_message_attachments: {
    path: ["channels", "messages", "attachments", "list"],
    positional: ["target"],
    description: "List Chat Message Attachments"
  },
  list_contact_channel_providers: {
    path: ["contacts", "channel-providers", "list"],
    positional: [],
    description: "List Contact Channel Providers"
  },
  list_direct_messages: {
    path: ["channels", "direct-messages", "list"],
    positional: [],
    description: "List Direct Messages"
  },
  list_dm_messages: {
    path: ["channels", "direct-messages", "messages", "list"],
    positional: ["dm"],
    description: "List Dm Messages"
  },
  list_employees: {
    path: ["contacts", "employees", "list"],
    positional: [],
    description: "List Employees"
  },
  list_external_channel_messages: {
    path: ["channels", "external-messages", "list"],
    positional: ["provider", "channel"],
    description: "List External Channel Messages"
  },
  list_mentions: {
    path: ["activity", "mentions", "list"],
    positional: [],
    description: "List Mentions"
  },
  list_message_template_categories: {
    path: ["templates", "categories", "list"],
    positional: [],
    description: "List Message Template Categories"
  },
  list_message_template_fields: {
    path: ["templates", "fields", "list"],
    positional: [],
    description: "List Message Template Fields"
  },
  list_message_templates: {
    path: ["templates", "list"],
    positional: [],
    description: "List Message Templates"
  },
  list_notification_contexts: {
    path: ["notifications", "contexts", "list"],
    positional: [],
    description: "List Notification Contexts"
  },
  list_notification_providers: {
    path: ["notifications", "providers", "list"],
    positional: [],
    description: "List Notification Providers"
  },
  list_notification_settings: {
    path: ["notifications", "settings", "list"],
    positional: [],
    description: "List Notification Settings"
  },
  list_notification_types: {
    path: ["notifications", "types", "list"],
    positional: [],
    description: "List Notification Types"
  },
  list_notifications: {
    path: ["notifications", "list"],
    positional: [],
    description: "List Notifications"
  },
  list_object_collaborators: {
    path: ["collaborators", "object", "list"],
    positional: [],
    description: "List Object Collaborators"
  },
  list_organization_channels: {
    path: ["contacts", "organizations", "channels", "list"],
    positional: ["organizationId"],
    description: "List Organization Channels"
  },
  list_organization_members: {
    path: ["contacts", "organizations", "members", "list"],
    positional: ["organizationId"],
    description: "List Organization Members"
  },
  list_organizations: {
    path: ["contacts", "organizations", "list"],
    positional: [],
    description: "List Organizations"
  },
  list_person_channels: {
    path: ["contacts", "persons", "channels", "list"],
    positional: ["person"],
    description: "List Person Channels"
  },
  list_person_organizations: {
    path: ["contacts", "persons", "organizations", "list"],
    positional: [],
    description: "List Person Organizations"
  },
  list_persons: {
    path: ["contacts", "persons", "list"],
    positional: [],
    description: "List Persons"
  },
  list_reactions: {
    path: ["activity", "reactions", "list"],
    positional: ["messageId"],
    description: "List Reactions"
  },
  list_saved_messages: {
    path: ["activity", "saved", "list"],
    positional: [],
    description: "List Saved Messages"
  },
  list_space_permissions: {
    path: ["spaces", "permissions", "list"],
    positional: [],
    description: "List Space Permissions"
  },
  list_space_types: {
    path: ["spaces", "types", "list"],
    positional: [],
    description: "List Space Types"
  },
  list_spaces: {
    path: ["spaces", "list"],
    positional: [],
    description: "List Spaces"
  },
  list_tag_categories: {
    path: ["tags", "categories", "list"],
    positional: [],
    description: "List Tag Categories"
  },
  list_tags: {
    path: ["tags", "list"],
    positional: ["targetClass"],
    description: "List Tags"
  },
  list_thread_replies: {
    path: ["channels", "threads", "replies", "list"],
    positional: ["channel", "messageId"],
    description: "List Thread Replies"
  }
} as const satisfies Partial<Record<McpToolName, CliCommandSpec>>
