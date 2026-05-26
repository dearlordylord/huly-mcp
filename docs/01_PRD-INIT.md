# Huly MCP Server - Product Requirements Document

## Overview

This project implements a Model Context Protocol (MCP) server that exposes Huly platform issue tracking capabilities to AI assistants. The server wraps the Huly Platform API in an Effect-based architecture, providing type-safe, composable operations for issue management.

## Background

### Huly Platform
Huly is a project management platform with APIs for issues, documents, contacts, and projects. The platform uses a hierarchical data model:
- Workspaces contain Projects
- Projects contain Issues
- Issues have metadata: status, priority, assignee, labels, milestones
- Content fields (descriptions) use a markup system with markdown support

### MCP (Model Context Protocol)
MCP enables AI assistants to interact with external systems through standardized tool definitions. Tools accept structured JSON parameters and return results. MCP servers can expose resources (read-only data) and tools (operations).

### Architecture Choice: Effect
Effect provides:
- Type-safe service dependency injection via Context/Layer
- Composable error handling with tagged errors
- Schema-based validation and serialization
- Built-in retry/timeout/resource management patterns

## Scope

### MVP Deliverable
Issue management operations exposed via MCP:
- **List issues** - Query issues with filters (project, status, assignee, milestone)
- **Get issue** - Retrieve single issue with full details
- **Create issue** - Create new issue with title, description, metadata
- **Update issue** - Modify existing issue fields (status, assignee, priority, description)
- **Add label** - Attach tag to issue

### Explicit Non-Goals (MVP)
- Project CRUD operations (read-only project info acceptable)
- Document management
- Contact/person management (except as lookup data)
- Milestone CRUD (read-only milestone info acceptable)
- Real-time subscriptions/webhooks
- Bulk operations
- Token-based authentication

### Future Expansion Candidates
- Project operations
- Document operations
- Advanced query capabilities (full-text search, complex filters)
- Batch operations
- Token authentication
- Webhook support for change notifications
- MCP resource subscriptions/listChanged notifications after stateful sessions and a Huly change source exist

## Technical Architecture

### Layer Structure

```
┌─────────────────────────────────────┐
│     MCP Server Layer                │
│  - Tool definitions                 │
│  - JSON Schema validation           │
│  - Transport (stdio/HTTP)           │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│   Domain Operations Layer           │
│  - Issue operations                 │
│  - Type-safe transformations        │
│  - Business logic                   │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│    Huly Client Service              │
│  - Connection management            │
│  - Authentication                   │
│  - Low-level API calls              │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  @hcengineering/api-client          │
│  (Huly official client)             │
└─────────────────────────────────────┘
```

### Service Dependencies

**HulyClient Service**
- Responsibilities: Manage authenticated connection, expose client instance to operations
- Context requirements: `HulyConfig` (connection parameters)
- Lifecycle: Acquire connection on first use, maintain for server lifetime, close on shutdown
- Error scenarios: Connection failures, authentication failures, network timeouts

**HulyConfig**
- Source: Environment variables or config file
- Fields: `url`, `email`, `password`, `workspace` (default), `connectionTimeout`
- Validation: Effect Schema with sensible defaults

### Directory Structure

```
src/
├── huly/
│   ├── client.ts           # HulyClient service (Context.Tag + Layer)
│   ├── config.ts           # Config schema + validation
│   ├── errors.ts           # Tagged error hierarchy
│   └── operations/
│       ├── issues.ts       # Issue domain operations
│       └── types.ts        # Shared schemas for Huly domain types
│
├── mcp/
│   ├── server.ts           # MCP server initialization
│   ├── transports.ts       # Stdio + HTTP transport setup
│   ├── tools/
│   │   ├── issues.ts       # Issue tool definitions + handlers
│   │   └── registry.ts     # Tool registration
│   └── schemas.ts          # JSON Schema generation from Effect schemas
│
├── test/
│   ├── huly/
│   │   └── operations/
│   │       └── issues.test.ts
│   └── mcp/
│       └── tools/
│           └── issues.test.ts
│
└── index.ts                # CLI entry point
```

## API Surface

### Huly Platform API - Relevant Operations

Based on `.reference/huly-examples/platform-api/`:

**Connection**
```typescript
import { connect, NodeWebSocketFactory } from '@hcengineering/api-client'

const client = await connect(url, {
  email: string,
  password: string,
  workspace: string,
  socketFactory: NodeWebSocketFactory,
  connectionTimeout: number
})
```

**Query Pattern**
```typescript
// Find multiple
await client.findAll(
  tracker.class.Issue,
  { space: projectRef, status: { $nin: doneStatuses } },
  { limit: 50, sort: { modifiedOn: SortingOrder.Descending } }
)

// Find one with lookup
await client.findOne(
  tracker.class.Issue,
  { identifier: 'HULY-123' },
  { lookup: { assignee: contact.class.Person } }
)
```

**Create Pattern**
```typescript
const issueId = generateId<Issue>()

// Upload markdown content first
const description = await client.uploadMarkup(
  tracker.class.Issue,
  issueId,
  'description',
  '# Description\nMarkdown content...',
  'markdown'
)

// Create issue
await client.createDoc(
  tracker.class.Issue,
  projectRef,
  {
    title: 'Issue title',
    description,
    status: statusRef,
    priority: IssuePriority.High,
    assignee: personRef,
    rank: makeRank(lastIssue?.rank, undefined)
  },
  issueId
)
```

**Update Pattern**
```typescript
await client.updateDoc(
  tracker.class.Issue,
  projectRef,
  issueId,
  { status: newStatusRef }
)

// For markdown fields, upload then update
const newContent = await client.uploadMarkup(...)
await client.updateDoc(..., { description: newContent })
```

**Label Pattern**
```typescript
// Create tag reference (attachment)
await client.addCollection(
  tags.class.TagReference,
  projectRef,
  issueId,
  tracker.class.Issue,
  'labels',
  {
    title: tagElement.title,
    color: tagElement.color,
    tag: tagElement._id
  }
)
```

**Fetch Markdown**
```typescript
const markdown = await client.fetchMarkup(
  issue._class,
  issue._id,
  'description',
  issue.description, // markup ID
  'markdown'
)
```

### MCP Tool Definitions

**Tool: list_issues**
- Description: "Query Huly issues with optional filters. Returns issues sorted by modification date (newest first). Supports filtering by project, status, assignee, and milestone."
- Parameters:
  - `workspace` (string, optional): Workspace ID (uses default from config if omitted)
  - `project` (string, required): Project identifier (e.g., "HULY")
  - `status` (string, optional): Status filter - "open", "done", "canceled", or status name
  - `assignee` (string, optional): Assignee email or person name
  - `milestone` (string, optional): Milestone label
  - `limit` (number, optional, default: 50, max: 200): Maximum results
- Returns: Array of issue summaries with `identifier`, `title`, `status`, `assignee`, `priority`, `modifiedOn`

**Tool: get_issue**
- Description: "Retrieve full details for a Huly issue including markdown description. Use this to view issue content, comments, or full metadata."
- Parameters:
  - `workspace` (string, optional): Workspace ID
  - `project` (string, required): Project identifier
  - `identifier` (string, required): Issue identifier (e.g., "HULY-123") or number (e.g., 123)
- Returns: Full issue object with description rendered as markdown, all metadata, lookup data for assignee/milestone

**Tool: create_issue**
- Description: "Create a new issue in a Huly project. Description supports markdown formatting. Returns the created issue identifier."
- Parameters:
  - `workspace` (string, optional): Workspace ID
  - `project` (string, required): Project identifier
  - `title` (string, required): Issue title
  - `description` (string, optional): Markdown description
  - `priority` (string, optional): Priority - "urgent", "high", "medium", "low" (default: "medium")
  - `assignee` (string, optional): Assignee email or name
  - `status` (string, optional): Initial status (default: project's default status)
  - `milestone` (string, optional): Milestone label
- Returns: Created issue identifier (e.g., "HULY-123")

**Tool: update_issue**
- Description: "Update fields on an existing Huly issue. Only provided fields are modified. Description updates support markdown."
- Parameters:
  - `workspace` (string, optional): Workspace ID
  - `project` (string, required): Project identifier
  - `identifier` (string, required): Issue identifier or number
  - `title` (string, optional): New title
  - `description` (string, optional): New markdown description
  - `status` (string, optional): New status
  - `priority` (string, optional): New priority
  - `assignee` (string, optional): New assignee email/name (null to unassign)
  - `milestone` (string, optional): New milestone label (null to remove)
- Returns: Success confirmation

**Tool: add_issue_label**
- Description: "Add a tag/label to a Huly issue. Creates the tag if it doesn't exist in the project."
- Parameters:
  - `workspace` (string, optional): Workspace ID
  - `project` (string, required): Project identifier
  - `identifier` (string, required): Issue identifier or number
  - `label` (string, required): Label/tag name
  - `color` (number, optional): Color code (0-9, default: 0)
- Returns: Success confirmation

## Type Safety Strategy

### Schema Definitions

Use `@effect/schema` (part of Effect 3.10+) for all data validation:

```typescript
import { Schema } from "effect"

// Config
const HulyConfigSchema = Schema.Struct({
  url: Schema.String.pipe(Schema.nonEmptyString()),
  email: Schema.String.pipe(Schema.nonEmptyString()),
  password: Schema.String.pipe(Schema.nonEmptyString()),
  workspace: Schema.String.pipe(Schema.nonEmptyString()),
  connectionTimeout: Schema.Number.pipe(Schema.positive()).pipe(Schema.optional())
})

// Domain types
const IssuePrioritySchema = Schema.Literal("urgent", "high", "medium", "low")

const IssueSchema = Schema.Struct({
  identifier: Schema.String,
  title: Schema.String,
  description: Schema.optional(Schema.String),
  status: Schema.String,
  priority: Schema.optional(IssuePrioritySchema),
  assignee: Schema.optional(Schema.String),
  // ... other fields
})

// Tool parameters
const ListIssuesParamsSchema = Schema.Struct({
  workspace: Schema.optional(Schema.String),
  project: Schema.String,
  status: Schema.optional(Schema.String),
  // ...
})
```

### JSON Schema Generation for MCP

MCP requires JSON Schema for tool parameters. Effect Schema can generate JSON Schema:

```typescript
import { JSONSchema } from "@effect/schema"

const jsonSchema = JSONSchema.make(ListIssuesParamsSchema)
// Returns JSON Schema draft-07 compatible object
```

### Type Extraction

```typescript
type HulyConfig = Schema.Schema.Type<typeof HulyConfigSchema>
type Issue = Schema.Schema.Type<typeof IssueSchema>
type ListIssuesParams = Schema.Schema.Type<typeof ListIssuesParamsSchema>
```

## Error Handling

### Error Hierarchy

```typescript
import { Schema } from "effect"

// Base error
class HulyError extends Schema.TaggedError<HulyError>()("HulyError", {
  message: Schema.String
}) {}

// Connection errors
class HulyConnectionError extends Schema.TaggedError<HulyConnectionError>()(
  "HulyConnectionError",
  { message: Schema.String, cause: Schema.Unknown }
) {}

class HulyAuthError extends Schema.TaggedError<HulyAuthError>()(
  "HulyAuthError",
  { message: Schema.String }
) {}

// Domain errors
class IssueNotFoundError extends Schema.TaggedError<IssueNotFoundError>()(
  "IssueNotFoundError",
  { identifier: Schema.String, project: Schema.String }
) {}

class ProjectNotFoundError extends Schema.TaggedError<ProjectNotFoundError>()(
  "ProjectNotFoundError",
  { identifier: Schema.String }
) {}

class InvalidStatusError extends Schema.TaggedError<InvalidStatusError>()(
  "InvalidStatusError",
  { status: Schema.String, project: Schema.String }
) {}
```

### Error Mapping to MCP

MCP uses standard error codes: -32600 (Invalid Request), -32601 (Method not found), -32602 (Invalid params), -32603 (Internal error).

Map Effect errors to MCP errors:
- `ParseError`, `InvalidStatusError` → -32602 (Invalid params)
- `IssueNotFoundError`, `ProjectNotFoundError` → -32602 with descriptive message
- `HulyConnectionError`, `HulyAuthError` → -32603 (Internal error)
- Other errors → -32603 with sanitized message

## Testing Strategy

### Test Infrastructure

Use `@effect/vitest` for Effect-aware testing:

```typescript
import { Effect, Layer } from "effect"
import { describe, it, expect } from "vitest"
import { HulyClient } from "./client"

// Mock layer for testing
const TestHulyClient = Layer.succeed(HulyClient, {
  findAll: Effect.succeed([/* mock data */]),
  // ... other mocked methods
})

describe("Issue Operations", () => {
  it.effect("lists issues", () =>
    Effect.gen(function* () {
      const issues = yield* listIssues({ project: "TEST" })
      expect(issues).toHaveLength(2)
    }).pipe(Effect.provide(TestHulyClient))
  )
})
```

### Test Coverage

**Unit Tests**
- Schema validation (parsing valid/invalid inputs)
- Error construction and matching
- Type transformations (Huly types → MCP responses)
- Config parsing

**Integration Tests** (with mocked HulyClient)
- Each domain operation (list, get, create, update)
- Error handling paths
- Workspace switching
- Filter combinations

**End-to-End Tests** (optional, requires test Huly instance)
- Full tool execution flow
- MCP protocol compliance
- Transport layer (stdio/HTTP)

### Test Data Strategy

Create fixture builders:
```typescript
const makeIssue = (overrides?: Partial<Issue>): Issue => ({
  identifier: "TEST-1",
  title: "Test issue",
  status: "Open",
  // ... defaults
  ...overrides
})
```

Mock Huly API responses at the client layer boundary, not at network level.

## Dependencies

### Production Dependencies

```json
{
  "dependencies": {
    "effect": "^3.19.15",
    "@effect/platform": "^0.94.2",
    "@modelcontextprotocol/sdk": "^1.0.4",
    "@hcengineering/api-client": "^0.7.3",
    "@hcengineering/core": "^0.7.4",
    "@hcengineering/tracker": "^0.7.0",
    "@hcengineering/contact": "^0.7.0",
    "@hcengineering/tags": "^0.7.0",
    "@hcengineering/task": "^0.7.0",
    "@hcengineering/rank": "^0.7.3"
  }
}
```

### Development Dependencies

```json
{
  "devDependencies": {
    "@effect/language-service": "^0.72.0",
    "@effect/vitest": "latest",
    "typescript": "^5.9.3",
    "vitest": "latest"
  }
}
```

## Configuration

### Environment Variables

```bash
# Required
HULY_URL=https://huly.app          # or http://localhost:8087 for local dev
HULY_EMAIL=user@example.com
HULY_PASSWORD=secret
HULY_WORKSPACE=default             # Default workspace

# Optional
HULY_CONNECTION_TIMEOUT=30000      # Connection timeout in ms (default: 30000)
MCP_TRANSPORT=stdio                # Transport mode: stdio | http | both (default: stdio)
MCP_HTTP_PORT=3000                 # HTTP port if http transport (default: 3000)
```

### Config File (Optional)

Support `.hulyrc.json` for non-sensitive config:
```json
{
  "url": "https://huly.app",
  "workspace": "default",
  "connectionTimeout": 30000
}
```

Credentials always from env vars (security).

## Implementation Considerations

### Workspace Handling

**Default workspace**: From `HULY_WORKSPACE` env var or config
**Per-request workspace**: Tools accept optional `workspace` parameter
**Implementation**: Pass workspace to each Huly client call, don't create separate clients per workspace

### Identifier Resolution

Issues can be referenced by:
- Full identifier string: "HULY-123"
- Numeric ID: 123 (within project context)

Implementation: Try full identifier first, fall back to numeric lookup within project.

### Status Handling

Statuses are project-specific. Common patterns:
- "open" → match status type (not done/canceled)
- "done" → match project's done statuses
- "canceled" → match canceled status
- Specific status name → exact match

Require project lookup to resolve status names to refs.

### Priority Mapping

Huly uses `IssuePriority` enum (Urgent, High, Medium, Low, NoPriority).
MCP tools use lowercase strings: "urgent", "high", "medium", "low".

### Assignee Resolution

Accept email or person name:
1. Query persons by email (channel lookup)
2. Fall back to name search
3. Error if multiple matches or not found

Consider caching person lookups within request scope.

### Markdown Handling

Huly stores descriptions as markup IDs, not inline text:
- **Create/Update**: Upload markdown via `uploadMarkup`, store returned ID
- **Read**: Fetch markdown via `fetchMarkup` using stored ID
- Always use 'markdown' format parameter

### Ranking

New issues need rank for ordering. Pattern from examples:
```typescript
const lastIssue = await client.findOne(
  tracker.class.Issue,
  { space: projectRef },
  { sort: { rank: SortingOrder.Descending } }
)
const rank = makeRank(lastIssue?.rank, undefined)
```

Append to end of list by default.

### Connection Lifecycle

- Acquire connection lazily on first operation
- Keep connection alive for server lifetime
- Implement graceful shutdown (close connection on SIGTERM/SIGINT)
- Handle reconnection on connection loss (Effect retry policies)

### MCP Server Setup

Reference `@modelcontextprotocol/sdk` patterns:
```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"

const server = new Server({
  name: "huly-mcp",
  version: "1.0.0"
}, {
  capabilities: {
    tools: {}
  }
})

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [/* tool definitions */]
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // Route to appropriate handler
})

// Start transport
const transport = new StdioServerTransport()
await server.connect(transport)
```

## References

### Documentation
- Effect Solutions: `effect-solutions show services-and-layers error-handling testing`
- Huly API Examples: `.reference/huly-examples/platform-api/examples/`
- MCP Specification: https://modelcontextprotocol.io/
- Effect documentation: `.reference/effect/`

### Key Example Files
- Connection: `.reference/huly-examples/platform-api/examples/issue-list.ts:1-20`
- Issue creation: `.reference/huly-examples/platform-api/examples/issue-create.ts`
- Issue updates: `.reference/huly-examples/platform-api/examples/issue-update.ts`
- Label operations: `.reference/huly-examples/platform-api/examples/issue-labels.ts`

### Type References
- `@hcengineering/tracker` - Issue, Project, Milestone types
- `@hcengineering/core` - Core types (Ref, SortingOrder, etc.)
- `@hcengineering/tags` - TagElement, TagReference types
- `@hcengineering/contact` - Person type

## Success Criteria

### Functional Requirements
- All 5 MCP tools implemented and functional
- Tools return correct data for valid inputs
- Tools return appropriate errors for invalid inputs
- Workspace switching works correctly
- Markdown content preserved in round-trips

### Non-Functional Requirements
- Type-safe throughout (no `any` types except for external library interfaces)
- All operations have unit tests
- Integration tests cover happy path + error cases
- Effect patterns followed (consult effect-solutions before implementing)
- Code compiles without TypeScript errors
- Effect Language Service shows no diagnostics

### Quality Metrics
- Test coverage >80% for domain operations
- Zero TypeScript `any` in src/ (devDependencies OK)
- All Effect operations properly tagged with error types
- Tool descriptions clear enough for AI to use correctly
