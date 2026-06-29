import type { McpToolName } from "../../../src/mcp/tools/index.js"
import type { CliCommandSpec } from "./catalog-types.js"

export const collaborationMutationCliCommandCatalogB = {
  remove_board_card_label: {
    path: ["boards", "cards", "labels", "remove"],
    positional: ["board", "card", "label"],
    description: "Remove Board Card Label",
    behavior: {
      confirmation: {
        type: "requires-yes",
        message: "boards cards labels remove requires --yes."
      }
    }
  },
  remove_channel_members: {
    path: ["channels", "members", "remove"],
    positional: ["channel", "members"],
    description: "Remove Channel Members",
    behavior: {
      confirmation: {
        type: "requires-yes",
        message: "channels members remove requires --yes."
      }
    }
  },
  remove_organization_channel: {
    path: ["contacts", "organizations", "channels", "remove"],
    positional: ["organizationId"],
    description: "Remove Organization Channel",
    behavior: {
      confirmation: {
        type: "requires-yes",
        message: "contacts organizations channels remove requires --yes."
      }
    }
  },
  remove_organization_member: {
    path: ["contacts", "organizations", "members", "remove"],
    positional: ["organizationId", "personIdentifier"],
    description: "Remove Organization Member",
    behavior: {
      confirmation: {
        type: "requires-yes",
        message: "contacts organizations members remove requires --yes."
      }
    }
  },
  remove_person_channel: {
    path: ["contacts", "persons", "channels", "remove"],
    positional: ["person"],
    description: "Remove Person Channel",
    behavior: {
      confirmation: {
        type: "requires-yes",
        message: "contacts persons channels remove requires --yes."
      }
    }
  },
  remove_reaction: {
    path: ["activity", "reactions", "remove"],
    positional: ["messageId", "emoji"],
    description: "Remove Reaction",
    behavior: {
      confirmation: {
        type: "requires-yes",
        message: "activity reactions remove requires --yes."
      }
    }
  },
  save_message: {
    path: ["activity", "messages", "save"],
    positional: ["messageId"],
    description: "Save Message"
  },
  set_conversation_closed: {
    path: ["channels", "conversations", "closed", "set"],
    positional: ["closed"],
    description: "Set Conversation Closed"
  },
  set_conversation_starred: {
    path: ["channels", "conversations", "starred", "set"],
    positional: ["starred"],
    description: "Set Conversation Starred"
  },
  unarchive_board: {
    path: ["boards", "unarchive"],
    positional: ["board"],
    description: "Unarchive Board"
  },
  unarchive_board_card: {
    path: ["boards", "cards", "unarchive"],
    positional: ["board", "card"],
    description: "Unarchive Board Card"
  },
  unarchive_channel: {
    path: ["channels", "unarchive"],
    positional: ["channel"],
    description: "Unarchive Channel"
  },
  unarchive_notification: {
    path: ["notifications", "unarchive"],
    positional: ["notificationId"],
    description: "Unarchive Notification"
  },
  unarchive_notification_context: {
    path: ["notifications", "contexts", "unarchive"],
    positional: ["contextId"],
    description: "Unarchive Notification Context"
  },
  unsave_message: {
    path: ["activity", "messages", "unsave"],
    positional: ["messageId"],
    description: "Unsave Message"
  },
  update_activity_reply: {
    path: ["activity", "replies", "update"],
    positional: ["replyId", "body"],
    description: "Update Activity Reply",
    behavior: {
      fileInput: { fields: ["body"] }
    }
  },
  update_board: {
    path: ["boards", "update"],
    positional: ["board"],
    description: "Update Board",
    behavior: {
      fileInput: { fields: ["description"] }
    }
  },
  update_board_card: {
    path: ["boards", "cards", "update"],
    positional: ["board", "card"],
    description: "Update Board Card",
    behavior: {
      fileInput: { fields: ["description"] }
    }
  },
  update_board_label: {
    path: ["boards", "labels", "update"],
    positional: ["label"],
    description: "Update Board Label",
    behavior: {
      fileInput: { fields: ["description"] }
    }
  },
  update_channel: {
    path: ["channels", "update"],
    positional: ["channel"],
    description: "Update Channel"
  },
  update_chat_message_attachment: {
    path: ["channels", "messages", "attachments", "update"],
    positional: ["target", "attachmentId"],
    description: "Update Chat Message Attachment",
    behavior: {
      fileInput: { fields: ["description"] }
    }
  },
  update_notification_provider_setting: {
    path: ["notifications", "providers", "settings", "update"],
    positional: ["providerId", "enabled"],
    description: "Update Notification Provider Setting"
  },
  update_notification_type_setting: {
    path: ["notifications", "types", "settings", "update"],
    positional: ["providerId", "typeId", "enabled"],
    description: "Update Notification Type Setting"
  },
  update_organization: {
    path: ["contacts", "organizations", "update"],
    positional: ["identifier"],
    description: "Update Organization",
    behavior: {
      fileInput: { fields: ["description"] }
    }
  },
  update_organization_channel: {
    path: ["contacts", "organizations", "channels", "update"],
    positional: ["organizationId"],
    description: "Update Organization Channel"
  },
  update_person: {
    path: ["contacts", "persons", "update"],
    positional: ["personId"],
    description: "Update Person"
  },
  update_person_channel: {
    path: ["contacts", "persons", "channels", "update"],
    positional: ["person"],
    description: "Update Person Channel"
  },
  update_tag: {
    path: ["tags", "update"],
    positional: ["targetClass", "tag"],
    description: "Update Tag",
    behavior: {
      fileInput: { fields: ["description"] }
    }
  },
  update_tag_category: {
    path: ["tags", "categories", "update"],
    positional: ["category"],
    description: "Update Tag Category"
  }
} as const satisfies Partial<Record<McpToolName, CliCommandSpec>>
