import type { McpToolName } from "../../../src/mcp/tools/index.js"
import { mutationCliCommandCatalog } from "./catalog-mutations.js"
import { readOnlyCliCommandCatalog } from "./catalog-read-only.js"
import type { CliCommandSpec } from "./catalog-types.js"
import { ignoredBusinessMcpTools } from "./ignored-tools-business.js"
import { ignoredCollaborationMcpTools } from "./ignored-tools-collaboration.js"
import { ignoredCoreMcpTools } from "./ignored-tools-core.js"
import { ignoredPlatformMcpTools } from "./ignored-tools-platform.js"

export const cliCommandCatalog = {
  list_projects: {
    path: ["projects", "list"],
    positional: [],
    description: "List projects"
  },
  get_project: {
    path: ["projects", "get"],
    positional: ["project"],
    description: "Get a project"
  },
  list_statuses: {
    path: ["projects", "statuses"],
    positional: ["project"],
    description: "List project issue statuses"
  },
  list_issues: {
    path: ["issues", "list"],
    positional: [],
    description: "List issues"
  },
  get_issue: {
    path: ["issues", "get"],
    positional: ["project", "identifier"],
    description: "Get an issue"
  },
  create_issue: {
    path: ["issues", "create"],
    positional: [],
    description: "Create an issue",
    behavior: {
      fileInput: { fields: ["description"] }
    }
  },
  update_issue: {
    path: ["issues", "update"],
    positional: ["project", "identifier"],
    description: "Update an issue",
    behavior: {
      fileInput: { fields: ["description"] }
    }
  },
  move_issue: {
    path: ["issues", "move"],
    positional: ["project", "identifier"],
    description: "Move an issue"
  },
  add_issue_label: {
    path: ["issues", "labels", "add"],
    positional: [],
    description: "Add an issue label"
  },
  remove_issue_label: {
    path: ["issues", "labels", "remove"],
    positional: [],
    description: "Remove an issue label"
  },
  set_issue_milestone: {
    path: ["issues", "milestone", "set"],
    positional: [],
    description: "Set or clear an issue milestone"
  },
  set_issue_component: {
    path: ["issues", "component", "set"],
    positional: [],
    description: "Set or clear an issue component"
  },
  list_issue_relations: {
    path: ["issues", "relations", "list"],
    positional: [],
    description: "List issue relations"
  },
  add_issue_relation: {
    path: ["issues", "relations", "add"],
    positional: [],
    description: "Add an issue relation"
  },
  remove_issue_relation: {
    path: ["issues", "relations", "remove"],
    positional: [],
    description: "Remove an issue relation"
  },
  link_document_to_issue: {
    path: ["issues", "documents", "link"],
    positional: [],
    description: "Link a document to an issue"
  },
  unlink_document_from_issue: {
    path: ["issues", "documents", "unlink"],
    positional: [],
    description: "Unlink a document from an issue"
  },
  list_comments: {
    path: ["comments", "list"],
    positional: [],
    description: "List issue comments"
  },
  add_comment: {
    path: ["comments", "add"],
    positional: [],
    description: "Add an issue comment",
    behavior: {
      fileInput: { fields: ["body"] }
    }
  },
  update_comment: {
    path: ["comments", "update"],
    positional: [],
    description: "Update an issue comment",
    behavior: {
      fileInput: { fields: ["body"] }
    }
  },
  delete_comment: {
    path: ["comments", "delete"],
    positional: [],
    description: "Delete an issue comment",
    behavior: {
      confirmation: {
        type: "requires-yes",
        message: "comments delete requires --yes."
      }
    }
  },
  list_attachments: {
    path: ["attachments", "list"],
    positional: [],
    description: "List attachments"
  },
  get_attachment: {
    path: ["attachments", "get"],
    positional: ["attachmentId"],
    description: "Get attachment metadata"
  },
  download_attachment: {
    path: ["attachments", "download"],
    positional: ["attachmentId"],
    description: "Resolve or download an attachment",
    behavior: {
      fileOutput: {
        attachmentIdField: "attachmentId",
        type: "attachment-download"
      }
    }
  },
  add_issue_attachment: {
    path: ["attachments", "add-to-issue"],
    positional: [],
    description: "Add an attachment to an issue",
    behavior: {
      fileInput: { fields: ["description"] }
    }
  },
  add_document_attachment: {
    path: ["attachments", "add-to-document"],
    positional: [],
    description: "Add an attachment to a document",
    behavior: {
      fileInput: { fields: ["description"] }
    }
  },
  list_documents: {
    path: ["documents", "list"],
    positional: [],
    description: "List documents"
  },
  get_document: {
    path: ["documents", "get"],
    positional: [],
    description: "Get a document"
  },
  create_document: {
    path: ["documents", "create"],
    positional: [],
    description: "Create a document",
    behavior: {
      fileInput: { fields: ["content"] }
    }
  },
  edit_document: {
    path: ["documents", "edit"],
    positional: [],
    description: "Edit a document",
    behavior: {
      fileInput: { fields: ["content", "old_text", "new_text"] }
    }
  },
  list_inline_comments: {
    path: ["documents", "comments"],
    positional: [],
    description: "List document inline comments"
  },
  list_teamspaces: {
    path: ["teamspaces", "list"],
    positional: [],
    description: "List teamspaces"
  },
  get_teamspace: {
    path: ["teamspaces", "get"],
    positional: ["teamspace"],
    description: "Get a teamspace"
  },
  list_labels: {
    path: ["labels", "list"],
    positional: [],
    description: "List labels"
  },
  list_milestones: {
    path: ["milestones", "list"],
    positional: [],
    description: "List milestones"
  },
  get_milestone: {
    path: ["milestones", "get"],
    positional: [],
    description: "Get a milestone"
  },
  list_components: {
    path: ["components", "list"],
    positional: [],
    description: "List components"
  },
  get_component: {
    path: ["components", "get"],
    positional: [],
    description: "Get a component"
  },
  fulltext_search: {
    path: ["search"],
    positional: ["query"],
    description: "Search Huly"
  },
  ...readOnlyCliCommandCatalog,
  ...mutationCliCommandCatalog
} as const satisfies Partial<Record<McpToolName, CliCommandSpec>>

export type CliToolName = keyof typeof cliCommandCatalog

export const isCliToolName = (name: string): name is CliToolName => Object.hasOwn(cliCommandCatalog, name)

type ImplementedMcpTool = keyof typeof cliCommandCatalog

export const ignoredMcpTools = [
  ...ignoredCoreMcpTools,
  ...ignoredCollaborationMcpTools,
  ...ignoredBusinessMcpTools,
  ...ignoredPlatformMcpTools
] as const satisfies ReadonlyArray<Exclude<McpToolName, ImplementedMcpTool>>

type IgnoredMcpTool = typeof ignoredMcpTools[number]
type AssertNever<T extends never> = T

type MissingMcpToolDecision = Exclude<McpToolName, ImplementedMcpTool | IgnoredMcpTool>
type StaleIgnoredMcpTool = Exclude<IgnoredMcpTool, McpToolName>
type ImplementedAndIgnoredMcpTool = Extract<ImplementedMcpTool, IgnoredMcpTool>
type NonexistentImplementedMcpTool = Exclude<ImplementedMcpTool, McpToolName>

type CatalogSyncAssertions = readonly [
  AssertNever<MissingMcpToolDecision>?,
  AssertNever<StaleIgnoredMcpTool>?,
  AssertNever<ImplementedAndIgnoredMcpTool>?,
  AssertNever<NonexistentImplementedMcpTool>?
]

export const catalogSyncAssertions: CatalogSyncAssertions = []
