# @firfi/huly-mcp

[![npm](https://img.shields.io/npm/v/@firfi/huly-mcp)](https://www.npmjs.com/package/@firfi/huly-mcp)
[![npm downloads](https://img.shields.io/npm/dm/@firfi/huly-mcp)](https://www.npmjs.com/package/@firfi/huly-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![MCP Server](https://badge.mcpx.dev?type=server&features=tools)](https://github.com/dearlordylord/huly-mcp)
[![cooked at Monadical](https://img.shields.io/endpoint?url=https://monadical.com/static/api/cooked-at-monadical.json)](https://monadical.com)

MCP server for [Huly](https://huly.io/) integration.

## Installation

The standard configuration works with most MCP clients:

```json
{
  "mcpServers": {
    "huly": {
      "command": "npx",
      "args": ["-y", "@firfi/huly-mcp@latest"],
      "env": {
        "HULY_URL": "https://huly.app",
        "HULY_EMAIL": "your@email.com",
        "HULY_PASSWORD": "yourpassword",
        "HULY_WORKSPACE": "yourworkspace"
      }
    }
  }
}
```

<details>
<summary>Claude Code</summary>

```bash
claude mcp add huly \
  -e HULY_URL=https://huly.app \
  -e HULY_EMAIL=your@email.com \
  -e HULY_PASSWORD=yourpassword \
  -e HULY_WORKSPACE=yourworkspace \
  -- npx -y @firfi/huly-mcp@latest
```

Or add to `~/.claude.json` using the standard config above.

</details>

<details>
<summary>Claude Desktop</summary>

Add the standard config to your `claude_desktop_config.json`:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

</details>

<details>
<summary>VS Code</summary>

Add to your user settings (`.vscode/mcp.json`) or use Command Palette → "MCP: Add Server":

```json
{
  "servers": {
    "huly": {
      "command": "npx",
      "args": ["-y", "@firfi/huly-mcp@latest"],
      "env": {
        "HULY_URL": "https://huly.app",
        "HULY_EMAIL": "your@email.com",
        "HULY_PASSWORD": "yourpassword",
        "HULY_WORKSPACE": "yourworkspace"
      }
    }
  }
}
```

</details>

<details>
<summary>Cursor</summary>

Add the standard config to `~/.cursor/mcp.json`, or via Settings → Tools & Integrations → New MCP Server.

</details>

<details>
<summary>Windsurf</summary>

Add the standard config to your Windsurf MCP configuration file.

</details>

## HTTP Transport

By default, the server uses stdio transport. For HTTP transport (Streamable HTTP):

```bash
HULY_URL=https://huly.app \
HULY_EMAIL=your@email.com \
HULY_PASSWORD=yourpassword \
HULY_WORKSPACE=yourworkspace \
MCP_TRANSPORT=http \
npx -y @firfi/huly-mcp@latest
```

Server listens on `http://127.0.0.1:3000/mcp` by default.

Configure with `MCP_HTTP_PORT` and `MCP_HTTP_HOST`:

```bash
MCP_TRANSPORT=http MCP_HTTP_PORT=8080 MCP_HTTP_HOST=0.0.0.0 npx -y @firfi/huly-mcp@latest
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `HULY_URL` | Yes | Huly instance URL |
| `HULY_EMAIL` | Auth* | Account email |
| `HULY_PASSWORD` | Auth* | Account password |
| `HULY_TOKEN` | Auth* | API token (alternative to email/password) |
| `HULY_WORKSPACE` | Yes | Workspace identifier |

*Auth: Provide either `HULY_EMAIL` + `HULY_PASSWORD` or `HULY_TOKEN`.
| `HULY_CONNECTION_TIMEOUT` | No | Connection timeout in ms (default: 30000) |
| `MCP_TRANSPORT` | No | Transport type: `stdio` (default) or `http` |
| `MCP_HTTP_PORT` | No | HTTP server port (default: 3000) |
| `MCP_HTTP_HOST` | No | HTTP server host (default: 127.0.0.1) |

<!-- tools:start -->
## Available Tools

### Projects

| Tool | Description |
|------|-------------|
| `list_projects` | List all Huly projects. Returns projects sorted by name. Supports filtering by archived status. |

### Issues

| Tool | Description |
|------|-------------|
| `list_issues` | Query Huly issues with optional filters. Returns issues sorted by modification date (newest first). Supports filtering by project, status, assignee, and milestone. Supports searching by title substring (titleSearch) and description content (descriptionSearch). |
| `get_issue` | Retrieve full details for a Huly issue including markdown description. Use this to view issue content, comments, or full metadata. |
| `create_issue` | Create a new issue in a Huly project. Description supports markdown formatting. Returns the created issue identifier. |
| `update_issue` | Update fields on an existing Huly issue. Only provided fields are modified. Description updates support markdown. |
| `add_issue_label` | Add a tag/label to a Huly issue. Creates the tag if it doesn't exist in the project. |
| `delete_issue` | Permanently delete a Huly issue. This action cannot be undone. |
| `list_components` | List components in a Huly project. Components organize issues by area/feature. Returns components sorted by modification date (newest first). |
| `get_component` | Retrieve full details for a Huly component. Use this to view component content and metadata. |
| `create_component` | Create a new component in a Huly project. Components help organize issues by area/feature. Returns the created component ID and label. |
| `update_component` | Update fields on an existing Huly component. Only provided fields are modified. |
| `set_issue_component` | Set or clear the component on a Huly issue. Pass null for component to clear it. |
| `delete_component` | Permanently delete a Huly component. This action cannot be undone. |
| `list_issue_templates` | List issue templates in a Huly project. Templates define reusable issue configurations. Returns templates sorted by modification date (newest first). |
| `get_issue_template` | Retrieve full details for a Huly issue template. Use this to view template content and default values. |
| `create_issue_template` | Create a new issue template in a Huly project. Templates define default values for new issues. Returns the created template ID and title. |
| `create_issue_from_template` | Create a new issue from a template. Applies template defaults, allowing overrides for specific fields. Returns the created issue identifier. |
| `update_issue_template` | Update fields on an existing Huly issue template. Only provided fields are modified. |
| `delete_issue_template` | Permanently delete a Huly issue template. This action cannot be undone. |

### Comments

| Tool | Description |
|------|-------------|
| `list_comments` | List comments on a Huly issue. Returns comments sorted by creation date (oldest first). |
| `add_comment` | Add a comment to a Huly issue. Comment body supports markdown formatting. |
| `update_comment` | Update an existing comment on a Huly issue. Comment body supports markdown formatting. |
| `delete_comment` | Delete a comment from a Huly issue. This action cannot be undone. |

### Milestones

| Tool | Description |
|------|-------------|
| `list_milestones` | List milestones in a Huly project. Returns milestones sorted by modification date (newest first). |
| `get_milestone` | Retrieve full details for a Huly milestone. Use this to view milestone content and metadata. |
| `create_milestone` | Create a new milestone in a Huly project. Returns the created milestone ID and label. |
| `update_milestone` | Update fields on an existing Huly milestone. Only provided fields are modified. |
| `set_issue_milestone` | Set or clear the milestone on a Huly issue. Pass null for milestone to clear it. |
| `delete_milestone` | Permanently delete a Huly milestone. This action cannot be undone. |

### Documents

| Tool | Description |
|------|-------------|
| `list_teamspaces` | List all Huly document teamspaces. Returns teamspaces sorted by name. Supports filtering by archived status. |
| `list_documents` | List documents in a Huly teamspace. Returns documents sorted by modification date (newest first). Supports searching by title substring (titleSearch) and content (contentSearch). |
| `get_document` | Retrieve full details for a Huly document including markdown content. Use this to view document content and metadata. |
| `create_document` | Create a new document in a Huly teamspace. Content supports markdown formatting. Returns the created document id. |
| `update_document` | Update fields on an existing Huly document. Only provided fields are modified. Content updates support markdown. |
| `delete_document` | Permanently delete a Huly document. This action cannot be undone. |

### Storage

| Tool | Description |
|------|-------------|
| `upload_file` | Upload a file to Huly storage. Provide ONE of: filePath (local file - preferred), fileUrl (fetch from URL), or data (base64 - for small files only). Returns blob ID and URL for referencing the file. |

### Attachments

| Tool | Description |
|------|-------------|
| `list_attachments` | List attachments on a Huly object (issue, document, etc.). Returns attachments sorted by modification date (newest first). |
| `get_attachment` | Retrieve full details for a Huly attachment including download URL. |
| `add_attachment` | Add an attachment to a Huly object. Provide ONE of: filePath (local file - preferred), fileUrl (fetch from URL), or data (base64). Returns the attachment ID and download URL. |
| `update_attachment` | Update attachment metadata (description, pinned status). |
| `delete_attachment` | Permanently delete an attachment. This action cannot be undone. |
| `pin_attachment` | Pin or unpin an attachment. |
| `download_attachment` | Get download URL for an attachment along with file metadata (name, type, size). |
| `add_issue_attachment` | Add an attachment to a Huly issue. Convenience method that finds the issue by project and identifier. Provide ONE of: filePath, fileUrl, or data. |
| `add_document_attachment` | Add an attachment to a Huly document. Convenience method that finds the document by teamspace and title/ID. Provide ONE of: filePath, fileUrl, or data. |

### Contacts

| Tool | Description |
|------|-------------|
| `list_persons` | List all persons in the Huly workspace. Returns persons sorted by modification date (newest first). Supports searching by name substring (nameSearch) and email substring (emailSearch). |
| `get_person` | Retrieve full details for a person including contact channels. Use personId or email to identify the person. |
| `create_person` | Create a new person in Huly. Returns the created person ID. |
| `update_person` | Update fields on an existing person. Only provided fields are modified. |
| `delete_person` | Permanently delete a person from Huly. This action cannot be undone. |
| `list_employees` | List employees (persons who are team members). Returns employees sorted by modification date (newest first). |
| `list_organizations` | List all organizations in the Huly workspace. Returns organizations sorted by modification date (newest first). |
| `create_organization` | Create a new organization in Huly. Optionally add members by person ID or email. Returns the created organization ID. |

### Channels

| Tool | Description |
|------|-------------|
| `list_channels` | List all Huly channels. Returns channels sorted by name. Supports filtering by archived status. Supports searching by name substring (nameSearch) and topic substring (topicSearch). |
| `get_channel` | Retrieve full details for a Huly channel including topic and member list. |
| `create_channel` | Create a new channel in Huly. Returns the created channel ID and name. |
| `update_channel` | Update fields on an existing Huly channel. Only provided fields are modified. |
| `delete_channel` | Permanently delete a Huly channel. This action cannot be undone. |
| `list_channel_messages` | List messages in a Huly channel. Returns messages sorted by date (newest first). |
| `send_channel_message` | Send a message to a Huly channel. Message body supports markdown formatting. |
| `list_direct_messages` | List direct message conversations in Huly. Returns conversations sorted by date (newest first). |
| `list_thread_replies` | List replies in a message thread. Returns replies sorted by date (oldest first). |
| `add_thread_reply` | Add a reply to a message thread. Reply body supports markdown formatting. |
| `update_thread_reply` | Update a thread reply. Only the body can be modified. |
| `delete_thread_reply` | Permanently delete a thread reply. This action cannot be undone. |

### Calendar

| Tool | Description |
|------|-------------|
| `list_events` | List calendar events. Returns events sorted by date. Supports filtering by date range. |
| `get_event` | Retrieve full details for a calendar event including description. Use this to view event content and metadata. |
| `create_event` | Create a new calendar event. Description supports markdown formatting. Returns the created event ID. |
| `update_event` | Update fields on an existing calendar event. Only provided fields are modified. Description updates support markdown. |
| `delete_event` | Permanently delete a calendar event. This action cannot be undone. |
| `list_recurring_events` | List recurring event definitions. Returns recurring events sorted by modification date (newest first). |
| `create_recurring_event` | Create a new recurring calendar event with RFC5545 RRULE rules. Description supports markdown. Returns the created event ID. |
| `list_event_instances` | List instances of a recurring event. Returns instances sorted by date. Supports filtering by date range. Use includeParticipants=true to fetch full participant info (extra lookups). |

### Time Tracking

| Tool | Description |
|------|-------------|
| `log_time` | Log time spent on a Huly issue. Records a time entry with optional description. Time value is in minutes. |
| `get_time_report` | Get time tracking report for a specific Huly issue. Shows total time, estimation, remaining time, and all time entries. |
| `list_time_spend_reports` | List all time entries across issues. Supports filtering by project and date range. Returns entries sorted by date (newest first). |
| `get_detailed_time_report` | Get detailed time breakdown for a project. Shows total time grouped by issue and by employee. Supports date range filtering. |
| `list_work_slots` | List scheduled work slots. Shows planned time blocks attached to ToDos. Supports filtering by employee and date range. |
| `create_work_slot` | Create a scheduled work slot. Attaches a time block to a ToDo for planning purposes. |
| `start_timer` | Start a client-side timer on a Huly issue. Validates the issue exists and returns a start timestamp. Use log_time to record the elapsed time when done. |
| `stop_timer` | Stop a client-side timer on a Huly issue. Returns the stop timestamp. Calculate elapsed time from start/stop timestamps and use log_time to record it. |

### Search

| Tool | Description |
|------|-------------|
| `fulltext_search` | Perform a global fulltext search across all Huly content. Searches issues, documents, messages, and other indexed content. Returns matching items sorted by relevance (newest first). |

### Activity

| Tool | Description |
|------|-------------|
| `list_activity` | List activity messages for a Huly object. Returns activity sorted by date (newest first). |
| `add_reaction` | Add an emoji reaction to an activity message. |
| `remove_reaction` | Remove an emoji reaction from an activity message. |
| `list_reactions` | List reactions on an activity message. |
| `save_message` | Save/bookmark an activity message for later reference. |
| `unsave_message` | Remove an activity message from saved/bookmarks. |
| `list_saved_messages` | List saved/bookmarked activity messages. |
| `list_mentions` | List @mentions of the current user in activity messages. |

### Notifications

| Tool | Description |
|------|-------------|
| `list_notifications` | List inbox notifications. Returns notifications sorted by modification date (newest first). Supports filtering by read/archived status. |
| `get_notification` | Retrieve full details for a notification. Use this to view notification content and metadata. |
| `mark_notification_read` | Mark a notification as read. |
| `mark_all_notifications_read` | Mark all unread notifications as read. Returns the count of notifications marked. |
| `archive_notification` | Archive a notification. Archived notifications are hidden from the main inbox view. |
| `archive_all_notifications` | Archive all notifications. Returns the count of notifications archived. |
| `delete_notification` | Permanently delete a notification. This action cannot be undone. |
| `get_notification_context` | Get notification context for an entity. Returns tracking information for a specific object. |
| `list_notification_contexts` | List notification contexts. Returns contexts sorted by last update timestamp (newest first). Supports filtering by pinned status. |
| `pin_notification_context` | Pin or unpin a notification context. Pinned contexts are highlighted in the inbox. |
| `list_notification_settings` | List notification provider settings. Returns current notification preferences. |
| `update_notification_provider_setting` | Update notification provider setting. Enable or disable notifications for a specific provider. |
| `get_unread_notification_count` | Get the count of unread notifications. |

### Workspace

| Tool | Description |
|------|-------------|
| `list_workspace_members` | List members in the current Huly workspace with their roles. Returns members with account IDs and roles. |
| `update_member_role` | Update a workspace member's role. Requires appropriate permissions. Valid roles: READONLYGUEST, DocGuest, GUEST, USER, MAINTAINER, OWNER, ADMIN. |
| `get_workspace_info` | Get information about the current workspace including name, URL, region, and settings. |
| `list_workspaces` | List all workspaces accessible to the current user. Returns workspace summaries sorted by last visit. |
| `create_workspace` | Create a new Huly workspace. Returns the workspace UUID and URL. Optionally specify a region. |
| `delete_workspace` | Permanently delete the current workspace. This action cannot be undone. Use with extreme caution. |
| `get_user_profile` | Get the current user's profile information including bio, location, and social links. |
| `update_user_profile` | Update the current user's profile. Supports bio, city, country, website, social links, and public visibility. |
| `update_guest_settings` | Update workspace guest settings. Control read-only guest access and guest sign-up permissions. |
| `get_regions` | Get available regions for workspace creation. Returns region codes and display names. |

<!-- tools:end -->
