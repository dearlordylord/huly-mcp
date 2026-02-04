# Parallel Development Work Plan

**STATUS**: ✅ COMPLETED (2026-02-04)

**Strategy**: Git worktrees with feature branches, coarse-grained tasks

**Approach**: Upfront master preparation, then parallel agent work with minimal dependencies

---

## Completion Summary

**Phase 0**: ✅ Merged (commit: 0aadf06)
- Added @hcengineering/account-client, attachment, notification packages
- Created query-helpers.ts (addSubstringSearch, withLookup, addFulltextSearch, addRegexSearch)
- Created query.ts schemas
- Added PaginationOptions, SearchOptions, LookupOptions types

**Phase 1**: ✅ All 8 tasks completed and merged

| Task | Branch | Commit | Tools Added | Status |
|------|--------|--------|-------------|--------|
| Task 1: Search | feature/search-operators | e3623e7 | 1 + search params | ✅ Merged |
| Task 2: Workspace | feature/workspace-management | bcb0251 | 10 | ✅ Merged |
| Task 3: Attachments | feature/attachment-metadata | 163b700 | 9 | ✅ Merged |
| Task 4: Issue Org | feature/issue-organization | 2de9658 | 12 | ✅ Merged |
| Task 5: Activity | feature/activity-feeds | 28a59b6 | 8 | ✅ Merged |
| Task 6: Threads | feature/threaded-messaging | 8dd0d85 | 4 | ✅ Merged |
| Task 7: Notifications | feature/notifications | b8835d8 | 13 | ✅ Merged |
| Task 8: Performance | feature/performance-lookups | 03d8c26 | 0 (optimization) | ✅ Merged |

**Final Master**: commit 77d63d3

**Tool Count**: 56 → 114 (doubled)

**Build**: Passing (pnpm build succeeds)

**Worktrees**: All removed

---

## Phase 0: Master Branch Preparation

**Goal**: Set up shared infrastructure that all agents will use

**Branch**: `main` → merge before creating task branches

### Tasks

#### 0.1: Add Missing Packages

```bash
pnpm add @hcengineering/account-client@^0.7
pnpm add @hcengineering/attachment@^0.7
pnpm add @hcengineering/notification@^0.7
```

**Files modified**:
- `package.json`
- `pnpm-lock.yaml`

#### 0.2: Create Shared Query Helpers

**New file**: `src/huly/operations/query-helpers.ts`

```typescript
import type { DocumentQuery, FindOptions } from "@hcengineering/core"

/**
 * Add substring search to query using $like operator
 */
export const addSubstringSearch = <T>(
  query: DocumentQuery<T>,
  field: keyof T,
  searchTerm: string | undefined
): DocumentQuery<T> => {
  if (!searchTerm) return query
  return {
    ...query,
    [field]: { $like: `%${searchTerm}%` }
  }
}

/**
 * Add lookup to FindOptions for relationship joins
 */
export const withLookup = <T>(
  options: FindOptions<T> | undefined,
  lookups: Record<string, any>
): FindOptions<T> => {
  return {
    ...options,
    lookup: {
      ...options?.lookup,
      ...lookups
    }
  }
}

/**
 * Add fulltext search to query
 */
export const addFulltextSearch = <T>(
  query: DocumentQuery<T>,
  searchTerm: string | undefined
): DocumentQuery<T> => {
  if (!searchTerm) return query
  return {
    ...query,
    $search: searchTerm
  }
}
```

**Files created**:
- `src/huly/operations/query-helpers.ts`

#### 0.3: Shared Schema Extensions

**New file**: `src/domain/schemas/query.ts`

```typescript
import { Schema } from "@effect/schema"

export const SearchParamsSchema = Schema.Struct({
  query: Schema.optional(Schema.String.pipe(Schema.trimmed())),
  limit: Schema.optional(
    Schema.Number.pipe(Schema.positive(), Schema.lessThanOrEqualTo(200))
  )
})

export const SubstringSearchSchema = Schema.Struct({
  search: Schema.optional(Schema.String.pipe(Schema.trimmed()))
})
```

**Files created**:
- `src/domain/schemas/query.ts`

#### 0.4: Update Common Types

**File**: `src/huly/operations/shared.ts`

Add:
```typescript
export interface PaginationOptions {
  limit?: number
  offset?: number
}

export interface SearchOptions {
  query?: string
  fulltext?: boolean
}

export interface LookupOptions<T> {
  lookup?: Record<string, any>
}
```

**Files modified**:
- `src/huly/operations/shared.ts`

### Completion Criteria

- [x] All 3 packages installed and building
- [x] Query helpers file created with tests
- [x] Shared schema extensions created
- [x] Types updated
- [x] `pnpm build` succeeds
- [x] `pnpm test` passes
- [x] Committed to `main` branch

---

## Phase 1: Parallel Task Execution

**Prerequisite**: Phase 0 complete and merged to `main`

All tasks in Phase 1 can run **simultaneously** with minimal risk of conflicts.

---

## Task 1: Search & Query Infrastructure

**Branch**: `feature/search-operators`

**Worktree**: `../hulymcp-search`

### Context

Add substring search ($like), regex search ($regex), and fulltext search capabilities across all list operations.

### Implementation Checklist

#### 1.1: Update Issue Operations

**File**: `src/huly/operations/issues.ts`

Add to `listIssues()`:
- `titleSearch?: string` parameter
- Use `addSubstringSearch(query, 'title', titleSearch)`
- Optional: `descriptionSearch?: string` with fulltext

**File**: `src/domain/schemas/issues.ts`

Update `ListIssuesParamsSchema`:
- Add `titleSearch: Schema.optional(Schema.String)`
- Add `descriptionSearch: Schema.optional(Schema.String)`

**File**: `src/mcp/tools/issues.ts`

Update tool definition:
- Add search parameters to inputSchema
- Update description to mention search capability

#### 1.2: Update Document Operations

**Files**:
- `src/huly/operations/documents.ts` - Add `titleSearch`, `contentSearch` to `listDocuments()`
- `src/domain/schemas/documents.ts` - Update schemas
- `src/mcp/tools/documents.ts` - Update tool definitions

#### 1.3: Update Contact Operations

**Files**:
- `src/huly/operations/contacts.ts` - Add `nameSearch`, `emailSearch` to `listPersons()`
- `src/domain/schemas/contacts.ts` - Update schemas
- `src/mcp/tools/contacts.ts` - Update tool definitions

#### 1.4: Update Channel Operations

**Files**:
- `src/huly/operations/channels.ts` - Add `nameSearch`, `topicSearch` to `listChannels()`
- `src/domain/schemas/channels.ts` - Update schemas
- `src/mcp/tools/channels.ts` - Update tool definitions

#### 1.5: Add Fulltext Search Operation

**New file**: `src/huly/operations/search.ts`

```typescript
export const searchFulltext = (query: string) =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    return yield* Effect.tryPromise({
      try: () => client.searchFulltext({ query }, { limit: 50 }),
      catch: (error) => new FulltextSearchError({ cause: error })
    })
  })
```

**New file**: `src/mcp/tools/search.ts`

Add global search tool.

### Files Modified

- `src/huly/operations/issues.ts`
- `src/huly/operations/documents.ts`
- `src/huly/operations/contacts.ts`
- `src/huly/operations/channels.ts`
- `src/domain/schemas/issues.ts`
- `src/domain/schemas/documents.ts`
- `src/domain/schemas/contacts.ts`
- `src/domain/schemas/channels.ts`
- `src/mcp/tools/issues.ts`
- `src/mcp/tools/documents.ts`
- `src/mcp/tools/contacts.ts`
- `src/mcp/tools/channels.ts`

### Files Created

- `src/huly/operations/search.ts`
- `src/mcp/tools/search.ts`

### Testing Requirements

- [ ] Can search issues by title substring
- [ ] Can search documents by title and content
- [ ] Can search persons by name
- [ ] Can search channels by name/topic
- [ ] Fulltext search returns results across all types
- [ ] Empty search term returns all results (no crash)
- [ ] Special characters in search are properly escaped

### Dependencies

- Phase 0 (query helpers)

---

## Task 2: Workspace Management

**Branch**: `feature/workspace-management`

**Worktree**: `../hulymcp-workspace`

### Context

Add complete workspace and member management using @hcengineering/account-client.

### Implementation Checklist

#### 2.1: Create Workspace Operations

**New file**: `src/huly/operations/workspace.ts`

Operations to implement:
- `listWorkspaceMembers()` - List members with roles
- `updateMemberRole(accountId, role)` - Change member role
- `getWorkspaceInfo()` - Get current workspace metadata
- `listWorkspaces()` - List accessible workspaces
- `createWorkspace(name, region?)` - Create new workspace
- `deleteWorkspace(workspaceId)` - Delete workspace
- `getUserProfile()` - Get current user profile
- `updateUserProfile(data)` - Update user profile
- `updateGuestSettings(allowReadOnly, allowSignUp)` - Configure guest access

#### 2.2: Create Workspace Client Service

**New file**: `src/huly/workspace-client.ts`

```typescript
import { Context, Effect, Layer } from "effect"
import type { AccountClient } from "@hcengineering/account-client"
import { getAccountClient } from "@hcengineering/account-client"

export class WorkspaceClient extends Context.Tag("WorkspaceClient")<
  WorkspaceClient,
  { readonly client: AccountClient }
>() {}

export const WorkspaceClientLive = Layer.effect(
  WorkspaceClient,
  Effect.gen(function* () {
    const client = yield* Effect.tryPromise({
      try: () => getAccountClient(...),
      catch: (error) => new WorkspaceClientError({ cause: error })
    })
    return { client }
  })
)
```

#### 2.3: Create Workspace Schemas

**New file**: `src/domain/schemas/workspace.ts`

Schemas for:
- `ListWorkspaceMembersParams`
- `UpdateMemberRoleParams`
- `CreateWorkspaceParams`
- `UpdateUserProfileParams`
- `UpdateGuestSettingsParams`

#### 2.4: Create MCP Tools

**New file**: `src/mcp/tools/workspace.ts`

Tools to export:
- `list_workspace_members`
- `update_member_role`
- `get_workspace_info`
- `list_workspaces`
- `create_workspace`
- `delete_workspace`
- `get_user_profile`
- `update_user_profile`
- `update_guest_settings`

### Files Created

- `src/huly/operations/workspace.ts`
- `src/huly/workspace-client.ts`
- `src/domain/schemas/workspace.ts`
- `src/mcp/tools/workspace.ts`

### Files Modified

- `src/mcp/tools/index.ts` - Register workspace tools

### Testing Requirements

- [ ] Can list workspace members
- [ ] Can update member roles
- [ ] Can get workspace info
- [ ] Can list accessible workspaces
- [ ] Can create workspace (integration test only)
- [ ] Can get user profile
- [ ] Can update user profile
- [ ] Proper error handling for permission errors

### Dependencies

- Phase 0 (account-client package)

---

## Task 3: Attachment Metadata

**Branch**: `feature/attachment-metadata`

**Worktree**: `../hulymcp-attachments`

### Context

Add structured attachment management using @hcengineering/attachment, replacing basic file upload.

### Implementation Checklist

#### 3.1: Create Attachment Operations

**New file**: `src/huly/operations/attachments.ts`

Operations to implement:
- `listAttachments(parentId, parentClass)` - List attachments on an entity
- `getAttachment(attachmentId)` - Get attachment details
- `addAttachment(parentId, parentClass, file, metadata)` - Add attachment with metadata
- `updateAttachment(attachmentId, metadata)` - Update description, pinned, readonly
- `deleteAttachment(attachmentId)` - Remove attachment
- `pinAttachment(attachmentId)` - Pin/unpin attachment
- `downloadAttachment(attachmentId)` - Get download URL

Integration operations:
- `addIssueAttachment(project, issueId, file, metadata)` - Convenience for issues
- `addDocumentAttachment(teamspace, documentId, file, metadata)` - Convenience for documents

#### 3.2: Create Attachment Schemas

**New file**: `src/domain/schemas/attachments.ts`

Schemas for:
- `ListAttachmentsParams`
- `AddAttachmentParams` (with file upload + metadata)
- `UpdateAttachmentParams` (description, pinned, readonly)
- `AttachmentMetadata` (name, description, pinned, readonly)

#### 3.3: Extend Storage Client

**File**: `src/huly/storage.ts`

Add attachment-aware upload:
- Upload file to blob storage
- Create Attachment document
- Link to parent entity

#### 3.4: Create MCP Tools

**New file**: `src/mcp/tools/attachments.ts`

Tools:
- `list_attachments`
- `get_attachment`
- `add_attachment`
- `update_attachment`
- `delete_attachment`
- `pin_attachment`
- `add_issue_attachment` (convenience)
- `add_document_attachment` (convenience)

### Files Created

- `src/huly/operations/attachments.ts`
- `src/domain/schemas/attachments.ts`
- `src/mcp/tools/attachments.ts`

### Files Modified

- `src/huly/storage.ts` - Extend with attachment operations
- `src/mcp/tools/index.ts` - Register attachment tools

### Testing Requirements

- [ ] Can add attachment to issue with metadata
- [ ] Can list attachments on an issue
- [ ] Can update attachment description
- [ ] Can pin/unpin attachments
- [ ] Can mark attachments as readonly
- [ ] Can delete attachments
- [ ] File upload integration works
- [ ] Download URLs are valid

### Dependencies

- Phase 0 (attachment package)
- Optional: Task 1 (for searching attachments by name)

---

## Task 4: Issue Organization (Components & Templates)

**Branch**: `feature/issue-organization`

**Worktree**: `../hulymcp-issue-org`

### Context

Add Components (organize issues by area) and Issue Templates from @hcengineering/tracker.

### Implementation Checklist

#### 4.1: Add Component Operations

**File**: `src/huly/operations/issues.ts`

Add operations:
- `listComponents(projectId)` - List components in project
- `getComponent(componentId)` - Get component details
- `createComponent(projectId, name, description?, leadId?)` - Create component
- `updateComponent(componentId, updates)` - Update component
- `deleteComponent(componentId)` - Delete component
- `setIssueComponent(issueId, componentId?)` - Set/clear component on issue

#### 4.2: Add Template Operations

**File**: `src/huly/operations/issues.ts`

Add operations:
- `listIssueTemplates(projectId)` - List templates
- `getIssueTemplate(templateId)` - Get template details
- `createIssueTemplate(projectId, template)` - Create template
- `createIssueFromTemplate(projectId, templateId, overrides?)` - Create issue from template
- `updateIssueTemplate(templateId, updates)` - Update template
- `deleteIssueTemplate(templateId)` - Delete template

#### 4.3: Update Issue Schemas

**File**: `src/domain/schemas/issues.ts`

Add schemas:
- `ComponentSchema` (name, description, lead)
- `CreateComponentParams`
- `UpdateComponentParams`
- `IssueTemplateSchema` (title, description, priority, assignee, component, labels)
- `CreateIssueTemplateParams`
- `CreateIssueFromTemplateParams`

Update `ListIssuesParams`:
- Add `component?: string` filter

#### 4.4: Create MCP Tools

**File**: `src/mcp/tools/issues.ts`

Add tools:
- `list_components`
- `create_component`
- `update_component`
- `delete_component`
- `set_issue_component`
- `list_issue_templates`
- `create_issue_template`
- `create_issue_from_template`
- `update_issue_template`
- `delete_issue_template`

### Files Modified

- `src/huly/operations/issues.ts` - Add 11 new operations
- `src/domain/schemas/issues.ts` - Add component and template schemas
- `src/mcp/tools/issues.ts` - Add 10 new tools

### Testing Requirements

- [ ] Can create component in project
- [ ] Can list components
- [ ] Can assign component to issue
- [ ] Can filter issues by component
- [ ] Can create issue template
- [ ] Can create issue from template with defaults applied
- [ ] Template overrides work correctly
- [ ] Can update/delete templates and components

### Dependencies

- Phase 0 (shared types)
- Soft dependency: Task 1 (component/template name search)

---

## Task 5: Activity Feeds

**Branch**: `feature/activity-feeds`

**Worktree**: `../hulymcp-activity`

### Context

Add activity feed, reactions, and mentions using @hcengineering/activity (currently imported but unused).

### Implementation Checklist

#### 5.1: Create Activity Operations

**New file**: `src/huly/operations/activity.ts`

Operations:
- `listActivity(objectId, objectClass)` - Get activity feed for an entity
- `addActivityMessage(objectId, objectClass, message, type?)` - Add activity message
- `addReaction(messageId, emoji)` - React to message
- `removeReaction(messageId, emoji)` - Remove reaction
- `saveMessage(messageId)` - Bookmark message
- `unsaveMessage(messageId)` - Remove bookmark
- `listSavedMessages()` - List user's saved messages
- `addMention(messageId, personId)` - Track mention
- `listMentions()` - List user's mentions

#### 5.2: Create Activity Schemas

**New file**: `src/domain/schemas/activity.ts`

Schemas:
- `ListActivityParams` (objectId, objectClass, limit)
- `AddActivityMessageParams` (message, type)
- `AddReactionParams` (emoji, custom icon)
- `ActivityMessageType` enum

#### 5.3: Create MCP Tools

**New file**: `src/mcp/tools/activity.ts`

Tools:
- `list_activity` - Get activity feed
- `add_activity_message` - Add custom activity
- `add_reaction` - React to message
- `remove_reaction` - Remove reaction
- `save_message` - Bookmark
- `list_saved_messages` - List bookmarks
- `list_mentions` - List @mentions

### Files Created

- `src/huly/operations/activity.ts`
- `src/domain/schemas/activity.ts`
- `src/mcp/tools/activity.ts`

### Files Modified

- `src/mcp/tools/index.ts` - Register activity tools

### Testing Requirements

- [ ] Can get activity feed for an issue
- [ ] Can add custom activity message
- [ ] Can add emoji reaction
- [ ] Can remove reaction
- [ ] Can bookmark messages
- [ ] Can list bookmarked messages
- [ ] Can list mentions
- [ ] Activity feed sorted by date

### Dependencies

- Phase 0 (shared types)

---

## Task 6: Threaded Messaging

**Branch**: `feature/threaded-messaging`

**Worktree**: `../hulymcp-threads`

### Context

Add ThreadMessage support to enable nested replies in channels/chats.

### Implementation Checklist

#### 6.1: Add Thread Operations

**File**: `src/huly/operations/channels.ts`

Add operations:
- `listThreads(messageId)` - List replies to a message
- `addThreadReply(messageId, content)` - Reply to message
- `updateThreadReply(replyId, content)` - Update reply
- `deleteThreadReply(replyId)` - Delete reply

#### 6.2: Update Channel Schemas

**File**: `src/domain/schemas/channels.ts`

Add:
- `ThreadMessageSchema`
- `AddThreadReplyParams` (messageId, content)
- `UpdateThreadReplyParams`

#### 6.3: Update MCP Tools

**File**: `src/mcp/tools/channels.ts`

Add tools:
- `list_thread_replies`
- `add_thread_reply`
- `update_thread_reply`
- `delete_thread_reply`

Update `send_channel_message` to optionally return thread-capable message ID.

### Files Modified

- `src/huly/operations/channels.ts` - Add 4 operations
- `src/domain/schemas/channels.ts` - Add thread schemas
- `src/mcp/tools/channels.ts` - Add 4 tools

### Testing Requirements

- [ ] Can reply to a channel message
- [ ] Can list replies (threads) for a message
- [ ] Can update thread reply
- [ ] Can delete thread reply
- [ ] Thread replies sorted correctly
- [ ] Threads isolated per parent message

### Dependencies

- Phase 0 (shared types)

---

## Task 7: Notification Management

**Branch**: `feature/notifications`

**Worktree**: `../hulymcp-notifications`

### Context

Add notification and inbox management using @hcengineering/notification.

### Implementation Checklist

#### 7.1: Create Notification Operations

**New file**: `src/huly/operations/notifications.ts`

Operations:
- `listNotifications(limit?)` - List user's inbox notifications
- `getNotification(notificationId)` - Get notification details
- `markAsRead(notificationId)` - Mark notification read
- `markAllAsRead()` - Mark all notifications read
- `archiveNotification(notificationId)` - Archive notification
- `archiveAllNotifications()` - Archive all
- `deleteNotification(notificationId)` - Delete notification
- `getNotificationContext(objectId, objectClass)` - Get notification context for entity
- `updateNotificationSettings(objectClass, settings)` - Update notification preferences

#### 7.2: Create Notification Schemas

**New file**: `src/domain/schemas/notifications.ts`

Schemas:
- `NotificationSchema` (title, body, objectRef, read, archived)
- `ListNotificationsParams`
- `NotificationSettingsSchema`
- `UpdateNotificationSettingsParams`

#### 7.3: Create MCP Tools

**New file**: `src/mcp/tools/notifications.ts`

Tools:
- `list_notifications`
- `get_notification`
- `mark_notification_read`
- `mark_all_notifications_read`
- `archive_notification`
- `archive_all_notifications`
- `delete_notification`
- `get_notification_settings`
- `update_notification_settings`

### Files Created

- `src/huly/operations/notifications.ts`
- `src/domain/schemas/notifications.ts`
- `src/mcp/tools/notifications.ts`

### Files Modified

- `src/mcp/tools/index.ts` - Register notification tools

### Testing Requirements

- [ ] Can list notifications
- [ ] Can mark notification as read
- [ ] Can mark all notifications as read
- [ ] Can archive notifications
- [ ] Can delete notifications
- [ ] Can get notification settings for entity type
- [ ] Can update notification preferences
- [ ] Unread count correct

### Dependencies

- Phase 0 (notification package)

---

## Task 8: Performance Optimization (Lookup Joins)

**Branch**: `feature/performance-lookups`

**Worktree**: `../hulymcp-performance`

### Context

Fix N+1 query problems in issues and time tracking by using lookup joins.

### Implementation Checklist

#### 8.1: Fix listIssues N+1 Query

**File**: `src/huly/operations/issues.ts`

**Current code** (lines 217-222):
```typescript
const issues = await client.findAll(tracker.class.Issue, {...})
// Then separate queries for assignees
```

**Fix**:
```typescript
const issues = await client.findAll(
  tracker.class.Issue,
  query,
  withLookup(options, {
    assignee: contact.class.Person,
    milestone: tracker.class.Milestone
  })
)
// Access via issue.$lookup.assignee
```

#### 8.2: Fix listTimeSpendReports N+1

**File**: `src/huly/operations/time.ts` (lines 180-200)

Add lookups:
```typescript
withLookup(options, {
  attachedTo: tracker.class.Issue,
  user: contact.class.Person
})
```

#### 8.3: Fix getDetailedTimeReport N+1

**File**: `src/huly/operations/time.ts` (lines 233-253)

Add lookups to initial queries to avoid separate issue/person fetches.

#### 8.4: Update Response Types

**Files**:
- `src/domain/schemas/issues.ts` - Add optional $lookup fields to response types
- `src/domain/schemas/time.ts` - Add optional $lookup fields

Update schemas to handle `WithLookup<T>` response types.

### Files Modified

- `src/huly/operations/issues.ts` - Fix listIssues
- `src/huly/operations/time.ts` - Fix time reports
- `src/domain/schemas/issues.ts` - Update response types
- `src/domain/schemas/time.ts` - Update response types

### Testing Requirements

- [ ] listIssues returns assignee data without extra queries
- [ ] Time reports include issue/person data
- [ ] Detailed time report doesn't make N+1 queries
- [ ] Performance: Measure query count before/after
- [ ] All existing tests still pass
- [ ] Response shape unchanged (backward compatible)

### Dependencies

- Phase 0 (withLookup helper)

---

## Common Context for All Agents

### Documentation
- `COMPARISON.md` - Feature gaps and API documentation
- `CLAUDE.md` - Project coding standards
- `README.md` - Project overview
- `.reference/huly-examples/` - Official API examples

### Code Patterns

**Effect operation pattern**:
```typescript
export const operationName = (params: ParamsType) =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    return yield* Effect.tryPromise({
      try: () => client.apiMethod(params),
      catch: (error) => new DomainError({ cause: error })
    })
  })
```

**MCP tool registration pattern**:
```typescript
export const toolName: RegisteredTool = {
  name: "tool_name",
  description: "Clear description of what this does",
  inputSchema: ParamsSchema.to("json-schema"),
  handler: createToolHandler(
    "tool_name",
    (input) => Schema.decode(ParamsSchema)(input),
    operationName
  )
}
```

**Schema pattern**:
```typescript
export const ParamsSchema = Schema.Struct({
  required: Schema.String.pipe(Schema.trimmed()),
  optional: Schema.optional(Schema.String),
  limit: Schema.optional(
    Schema.Number.pipe(Schema.positive(), Schema.lessThanOrEqualTo(200))
  )
})

export type Params = Schema.Schema.Type<typeof ParamsSchema>
```

### Verification

Each task must:
- Add unit tests for new operations
- Add integration tests for new MCP tools
- Ensure `pnpm test` passes
- Ensure `pnpm build` succeeds

---

## Dependency Graph (DAG)

```
Phase 0: Master Prep
  ├─ 0.1: Add packages
  ├─ 0.2: Query helpers
  ├─ 0.3: Schema extensions
  └─ 0.4: Shared types
        ↓
        └─> Phase 1 (all parallel):
              ├─> Task 1: Search & Query
              ├─> Task 2: Workspace Management
              ├─> Task 3: Attachments
              ├─> Task 4: Issue Organization
              ├─> Task 5: Activity Feeds
              ├─> Task 6: Threaded Messaging
              ├─> Task 7: Notifications
              └─> Task 8: Performance

All Phase 1 tasks are independent and can merge in any order.
```

**Soft dependencies** (nice-to-have but not blocking):
- Task 1 → Task 3: Search in attachments by filename
- Task 1 → Task 4: Search components/templates by name
- Task 4 → Task 1: Filter issues by component uses updated query builder

These are handled by:
- If Task 1 merges first: Others use search helpers
- If others merge first: Task 1 adds search to their operations

---

## Merge Strategy

Phase 1 tasks can merge in **any order** as they touch mostly different files.

**Potential conflicts**:
- Task 1 and Task 4 both modify `issues.ts`
- Task 1 and Task 6 both modify `channels.ts`
- Task 1 and Task 8 both modify `issues.ts`

**Resolution**:
- If conflicts occur, later PR rebases on main
- File conflicts are minimal (different functions/sections)
- Git should auto-resolve most conflicts
