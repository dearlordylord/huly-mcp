import type { McpToolName } from "../../../src/mcp/tools/index.js"
import type { CliCommandSpec } from "./catalog-types.js"

export const collaborationMutationCliCommandCatalogA = {
  add_activity_reply: {
    path: ["activity", "replies", "add"],
    positional: ["messageId", "body"],
    description: "Add Activity Reply",
    behavior: {
      fileInput: { fields: ["body"] }
    }
  },
  add_approval_request_comment: {
    path: ["approvals", "comments", "add"],
    positional: ["request", "body"],
    description: "Add Approval Request Comment",
    behavior: {
      fileInput: { fields: ["body"] }
    }
  },
  add_board_card_label: {
    path: ["boards", "cards", "labels", "add"],
    positional: ["board", "card", "label"],
    description: "Add Board Card Label"
  },
  add_channel_members: {
    path: ["channels", "members", "add"],
    positional: ["channel", "members"],
    description: "Add Channel Members"
  },
  add_organization_channel: {
    path: ["contacts", "organizations", "channels", "add"],
    positional: ["provider", "value", "organizationId"],
    description: "Add Organization Channel"
  },
  add_organization_member: {
    path: ["contacts", "organizations", "members", "add"],
    positional: ["organizationId", "personIdentifier"],
    description: "Add Organization Member"
  },
  add_person_channel: {
    path: ["contacts", "persons", "channels", "add"],
    positional: ["provider", "value", "person"],
    description: "Add Person Channel"
  },
  add_reaction: {
    path: ["activity", "reactions", "add"],
    positional: ["messageId", "emoji"],
    description: "Add Reaction"
  },
  archive_board: {
    path: ["boards", "archive"],
    positional: ["board"],
    description: "Archive Board"
  },
  archive_board_card: {
    path: ["boards", "cards", "archive"],
    positional: ["board", "card"],
    description: "Archive Board Card"
  },
  archive_channel: {
    path: ["channels", "archive"],
    positional: ["channel"],
    description: "Archive Channel"
  },
  archive_notification: {
    path: ["notifications", "archive"],
    positional: ["notificationId"],
    description: "Archive Notification"
  },
  archive_notification_context: {
    path: ["notifications", "contexts", "archive"],
    positional: ["contextId"],
    description: "Archive Notification Context"
  },
  cancel_approval_request: {
    path: ["approvals", "cancel"],
    positional: ["request"],
    description: "Cancel Approval Request",
    behavior: {
      confirmation: {
        type: "requires-yes",
        message: "approvals cancel requires --yes."
      }
    }
  },
  create_board: {
    path: ["boards", "create"],
    positional: ["name"],
    description: "Create Board",
    behavior: {
      fileInput: { fields: ["description"] }
    }
  },
  create_board_card: {
    path: ["boards", "cards", "create"],
    positional: ["board", "title"],
    description: "Create Board Card",
    behavior: {
      fileInput: { fields: ["description"] }
    }
  },
  create_board_label: {
    path: ["boards", "labels", "create"],
    positional: ["title"],
    description: "Create Board Label",
    behavior: {
      fileInput: { fields: ["description"] }
    }
  },
  create_channel: {
    path: ["channels", "create"],
    positional: ["name"],
    description: "Create Channel"
  },
  create_direct_message: {
    path: ["channels", "direct-messages", "create"],
    positional: ["person"],
    description: "Create Direct Message"
  },
  create_group_direct_message: {
    path: ["channels", "group-direct-messages", "create"],
    positional: ["people"],
    description: "Create Group Direct Message"
  },
  create_organization: {
    path: ["contacts", "organizations", "create"],
    positional: ["name"],
    description: "Create Organization"
  },
  create_person: {
    path: ["contacts", "persons", "create"],
    positional: ["firstName", "lastName"],
    description: "Create Person"
  },
  create_tag: {
    path: ["tags", "create"],
    positional: ["targetClass", "title"],
    description: "Create Tag",
    behavior: {
      fileInput: { fields: ["description"] }
    }
  },
  create_tag_category: {
    path: ["tags", "categories", "create"],
    positional: ["label"],
    description: "Create Tag Category"
  },
  delete_activity_reply: {
    path: ["activity", "replies", "delete"],
    positional: ["replyId"],
    description: "Delete Activity Reply",
    behavior: {
      confirmation: {
        type: "requires-yes",
        message: "activity replies delete requires --yes."
      }
    }
  },
  delete_board_card: {
    path: ["boards", "cards", "delete"],
    positional: ["board", "card"],
    description: "Delete Board Card",
    behavior: {
      confirmation: {
        type: "requires-yes",
        message: "boards cards delete requires --yes."
      }
    }
  },
  delete_board_label: {
    path: ["boards", "labels", "delete"],
    positional: ["label"],
    description: "Delete Board Label",
    behavior: {
      confirmation: {
        type: "requires-yes",
        message: "boards labels delete requires --yes."
      }
    }
  },
  delete_channel: {
    path: ["channels", "delete"],
    positional: ["channel"],
    description: "Delete Channel",
    behavior: {
      confirmation: {
        type: "requires-yes",
        message: "channels delete requires --yes."
      }
    }
  },
  delete_chat_message_attachment: {
    path: ["channels", "messages", "attachments", "delete"],
    positional: ["target", "attachmentId"],
    description: "Delete Chat Message Attachment",
    behavior: {
      confirmation: {
        type: "requires-yes",
        message: "channels messages attachments delete requires --yes."
      }
    }
  },
  delete_notification: {
    path: ["notifications", "delete"],
    positional: ["notificationId"],
    description: "Delete Notification",
    behavior: {
      confirmation: {
        type: "requires-yes",
        message: "notifications delete requires --yes."
      }
    }
  },
  delete_organization: {
    path: ["contacts", "organizations", "delete"],
    positional: ["identifier"],
    description: "Delete Organization",
    behavior: {
      confirmation: {
        type: "requires-yes",
        message: "contacts organizations delete requires --yes."
      }
    }
  },
  delete_person: {
    path: ["contacts", "persons", "delete"],
    positional: ["personId"],
    description: "Delete Person",
    behavior: {
      confirmation: {
        type: "requires-yes",
        message: "contacts persons delete requires --yes."
      }
    }
  },
  delete_tag: {
    path: ["tags", "delete"],
    positional: ["targetClass", "tag"],
    description: "Delete Tag",
    behavior: {
      confirmation: {
        type: "requires-yes",
        message: "tags delete requires --yes."
      }
    }
  },
  delete_tag_category: {
    path: ["tags", "categories", "delete"],
    positional: ["category"],
    description: "Delete Tag Category",
    behavior: {
      confirmation: {
        type: "requires-yes",
        message: "tags categories delete requires --yes."
      }
    }
  },
  hide_notification_context: {
    path: ["notifications", "contexts", "hide"],
    positional: ["contextId", "hidden"],
    description: "Hide Notification Context"
  },
  join_channel: {
    path: ["channels", "join"],
    positional: ["channel"],
    description: "Join Channel"
  },
  leave_channel: {
    path: ["channels", "leave"],
    positional: ["channel"],
    description: "Leave Channel"
  },
  make_organization_customer: {
    path: ["contacts", "organizations", "customer", "make"],
    positional: ["identifier"],
    description: "Make Organization Customer"
  },
  mark_notification_read: {
    path: ["notifications", "read", "mark"],
    positional: ["notificationId"],
    description: "Mark Notification Read"
  },
  mark_notification_unread: {
    path: ["notifications", "unread", "mark"],
    positional: ["notificationId"],
    description: "Mark Notification Unread"
  },
  pin_activity_message: {
    path: ["activity", "messages", "pin"],
    positional: ["messageId", "pinned"],
    description: "Pin Activity Message"
  },
  pin_notification_context: {
    path: ["notifications", "contexts", "pin"],
    positional: ["contextId", "pinned"],
    description: "Pin Notification Context"
  }
} as const satisfies Partial<Record<McpToolName, CliCommandSpec>>
