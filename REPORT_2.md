# Analysis Report: hha-nguyen/huly-mcp-server

**Repository:** https://github.com/hha-nguyen/huly-mcp-server
**Package:** `@kesorn/huly-mcp-server`
**Language:** TypeScript (98%)
**License:** MIT

## 1. Connection Methodology

The implementation uses a **hybrid approach** combining three connection methods:

### 1.1 HTTP REST for Authentication

Authentication occurs via HTTP POST to the `/_accounts` endpoint:

```typescript
private async getWorkspaceToken(): Promise<string> {
  const baseUrl = this.config.url.replace(/\/$/, '');
  const accountUrl = `${baseUrl}/_accounts`;

  // Step 1: Login
  const loginPayload = {
    method: 'login',
    params: { email: this.config.email, password: this.config.password }
  };
  const loginResponse = await this.httpPost(accountUrl, loginPayload);

  // Step 2: Select workspace
  const selectPayload = {
    method: 'selectWorkspace',
    params: { workspaceUrl: workspaceName, kind: 'external' }
  };
  const selectResponse = await this.httpPost(accountUrl, selectPayload, loginResult.token);

  return selectResult.token; // Workspace-specific token
}
```

### 1.2 WebSocket for Real-Time API

After obtaining a workspace token, it connects via WebSocket:

```typescript
private async connectWithToken(token: string): Promise<void> {
  const baseUrl = this.config.url.replace('https://', '').replace('http://', '');
  const wsUrl = `wss://${baseUrl}/${token}`;

  this.ws = new WebSocket(wsUrl);
  // ... message handlers
}
```

The WebSocket is used for:
- Listing projects (`tracker:class:Project`)
- Listing issues (`tracker:class:Issue`)
- Listing labels (`tags:class:TagElement`)
- Listing milestones (`tracker:class:Milestone`)

### 1.3 Direct PostgreSQL/CockroachDB Access

**Critical:** This implementation directly manipulates the database:

```typescript
private async initDatabase(): Promise<void> {
  this.pgPool = new pg.Pool({
    host: this.config.dbHost || 'cockroach',
    port: this.config.dbPort || 26257,
    user: this.config.dbUser || 'selfhost',
    password: this.config.dbPassword || '',
    database: this.config.dbName || 'defaultdb',
    ssl: false,
  });
}
```

Direct SQL operations are used for:
- Creating issues (INSERT into `task` table)
- Creating transaction records (INSERT into `tx` table)
- Creating activity records (INSERT into `activity` table)
- Updating issues (UPDATE `task` table)
- Deleting issues (DELETE from `task` table)
- Querying labels, statuses, and task details

### 1.4 Huly API Client (Optional)

For description markup, it optionally uses the official Huly API client:

```typescript
import apiClientPkg from '@hcengineering/api-client';
const { connect, NodeWebSocketFactory } = apiClientPkg;

this.apiClient = await connect(this.config.url, {
  email: this.config.email,
  password: this.config.password,
  workspace: this.config.workspace || 'Teaser Software',
  socketFactory: NodeWebSocketFactory,
  connectionTimeout: 30000,
});

// Used for uploading markdown descriptions
const markupRef = await apiClient.uploadMarkup(
  tracker.class.Issue,
  issueId,
  'description',
  issue.description,
  'markdown'
);
```

---

## 2. Authentication

### Environment Variables Required

```
HULY_URL=https://your-huly-instance.com
HULY_EMAIL=your-email@example.com
HULY_PASSWORD=your-password
HULY_WORKSPACE=YourWorkspaceName
DB_HOST=cockroach
DB_PORT=26257
DB_USER=selfhost
DB_PASSWORD=
DB_NAME=defaultdb
```

### Authentication Flow

1. **Login** - POST to `/_accounts` with `method: 'login'`, receives a session token and `socialId`/`account` identifier
2. **Workspace Selection** - POST to `/_accounts` with `method: 'selectWorkspace'` and the login token, receives a workspace-specific token
3. **WebSocket Connection** - Connect to `wss://host/${workspace_token}`
4. **Database Connection** - Direct connection to CockroachDB (no auth token, uses DB credentials)

### User Identity Handling

The implementation tracks user identity for `modifiedBy` and `createdBy` fields:

```typescript
this.accountId = loginResult.socialId || loginResult.account || null;
```

User mappings are hardcoded for assignee resolution:

```typescript
// user-mapping.ts
export const USER_MAPPING: Record<string, string> = {
  'Bach Duong': '1109002067483623425',
  'Ha Nguyen': '1109002067077464065',
  // ...
};

export const ASSIGNEE_MAPPING: Record<string, string> = {
  'Bach Duong': '687e6a659ba7a6c5c6961fc3',
  'Ha Nguyen': '687a2fd4e0d4f15d4d8e2c30',
  // ...
};
```

---

## 3. API Techniques

### 3.1 WebSocket Message Protocol

For querying data via WebSocket:

```typescript
const listMessage = {
  method: 'findAll',
  params: {
    _class: 'tracker:class:Project',
    query: {},
    options: {},
  },
  id: `msg-${this.messageCounter}`,
};
this.ws.send(JSON.stringify(listMessage));
```

### 3.2 Direct SQL Operations

**Create Issue:**
```typescript
await this.pgPool.query(
  `INSERT INTO task ("workspaceId", _id, _class, space, "modifiedBy", "createdBy",
   "modifiedOn", "createdOn", "attachedTo", "%hash%", data)
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
  [workspaceId, issueId, 'tracker:class:Issue', project._id, creatorId,
   creatorId, now, now, project._id, hash, dataJson]
);
```

**Create Transaction Record:**
```typescript
await this.pgPool.query(
  `INSERT INTO tx ("workspaceId", _id, _class, space, "modifiedBy", "createdBy",
   "modifiedOn", "createdOn", "attachedTo", "%hash%", "objectSpace", "objectId", data)
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
  [workspaceId, txId, 'core:class:TxCreateDoc', 'core:space:Tx', creatorId,
   creatorId, now, now, project._id, txHash, project._id, issueId, JSON.stringify(txData)]
);
```

### 3.3 ID Generation

Custom ID generation mimicking Huly's internal format:

```typescript
private generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

private generateHash(data: string, id: string, timestamp: number): string {
  const hash = crypto.createHash('md5').update(data + id + timestamp.toString()).digest('hex');
  return hash.substring(0, 11);
}
```

### 3.4 Rank Generation (for ordering)

```typescript
const rankHex = sequence.toString(16).padStart(6, '0');
const rank = `0|i${rankHex}:`;
```

---

## 4. Data Models

### 4.1 Key Classes Referenced

| Class | Purpose |
|-------|---------|
| `tracker:class:Issue` | Issues/tasks |
| `tracker:class:Project` | Projects/spaces |
| `tracker:class:Milestone` | Milestones |
| `tags:class:TagElement` | Labels |
| `core:class:TxCreateDoc` | Create transaction |
| `core:class:TxUpdateDoc` | Update transaction |
| `core:class:TxRemoveDoc` | Delete transaction |
| `activity:class:DocUpdateMessage` | Activity record |
| `activity:class:DocRemoveMessage` | Delete activity |
| `chunter:class:ChatMessage` | Comments |

### 4.2 Issue Data Structure

```typescript
const data: Record<string, unknown> = {
  title: issue.title,
  description: descriptionId || '',          // Reference to markup
  identifier: `${project.identifier}-${sequence}`,
  number: sequence,
  priority: this.mapPriority(issue.priority || 'medium'), // 0-3
  status: project.defaultIssueStatus,        // e.g., 'tracker:status:Backlog'
  kind: project.kind || 'tracker:taskTypes:Issue',
  estimation: 0,
  remainingTime: 0,
  reportedTime: 0,
  reports: 0,
  subIssues: 0,
  parents: [],
  childInfo: [],
  rank: rank,                                // Ordering
  comments: 0,
  docUpdateMessages: 1,
  relations: [],
  labels: labelCount,
  attachedToClass: 'tracker:class:Project',  // CRITICAL: Correct value
  collection: 'issues',                       // CRITICAL: Correct value
};
```

### 4.3 Critical Field Mappings

The README specifically mentions bug fixes for these fields:

| Field | Correct Value | Purpose |
|-------|---------------|---------|
| `attachedToClass` | `'tracker:class:Project'` | Specifies parent class type |
| `collection` | `'issues'` | Collection within parent |
| `kind` | Project-specific (e.g., `'6976d5c8dfe597052a795607'`) | Task type identifier |

### 4.4 Database Tables Used

| Table | Purpose |
|-------|---------|
| `task` | Issues, stored with `_class: 'tracker:class:Issue'` |
| `tx` | Transaction log for all operations |
| `activity` | Activity feed entries |
| `document` | Documents |
| `tags` | Labels (searched but rarely found here) |

---

## 5. MCP Implementation

### 5.1 Server Setup

Uses the official MCP SDK with stdio transport:

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server(
  { name: 'huly-mcp-server', version: '1.0.0' },
  { capabilities: { tools: {}, resources: {} } }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
```

### 5.2 Available Tools

| Tool | Description |
|------|-------------|
| `create_issue` | Create issue with correct field configuration |
| `delete_issue` | Delete issue by identifier |
| `update_issue` | Update estimation, status, assignee, etc. |
| `add_comment` | Add comment to issue |
| `list_comments` | List comments on issue |
| `delete_comment` | Delete a comment |
| `list_issues` | List issues, optionally filtered by project |
| `list_projects` | List all projects |
| `list_labels` | List labels in project |
| `list_milestones` | List milestones in project |
| `list_statuses` | List issue statuses |
| `create_document` | Create document in workspace |
| `create_label` | Create new label |
| `list_labels_db` | Debug: query labels from DB |
| `explore_labels_db` | Debug: comprehensive label search |
| `query_task_db` | Debug: query task details |

### 5.3 Tool Schema Example

```typescript
{
  name: 'create_issue',
  description: 'Create a new issue in Huly workspace',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Issue title' },
      description: { type: 'string', description: 'Issue description' },
      priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low'] },
      project: { type: 'string', description: 'Project name or identifier' },
      assignee: { type: 'string', description: 'Assignee name (e.g. "Ha Nguyen")' },
      assigner: { type: 'string', description: 'Assigner/creator name' },
      estimation: { type: 'number', description: 'Estimated hours' },
      label: { type: 'string', description: 'Label ID' },
      milestone: { type: 'string', description: 'Milestone ID' },
    },
    required: ['title', 'project', 'description'],
  },
}
```

---

## 6. Code Examples

### 6.1 Complete Issue Creation Flow

```typescript
async createIssue(issue: HulyIssue): Promise<{ id: string; number: number; identifier: string }> {
  await this.connect();

  // 1. Get project info and determine kind
  const project = await this.getProjectInfo(issue.project);

  // 2. Get next issue number
  const issues = await this.listIssues(project._id);
  const maxNumber = Math.max(...issues.map(i => {
    const match = i.identifier?.match(/-(\d+)$/);
    return match ? parseInt(match[1], 10) : 0;
  }));
  const sequence = maxNumber + 1;

  // 3. Generate IDs
  const issueId = this.generateId();
  const identifier = `${project.identifier}-${sequence}`;

  // 4. Upload description if present (via API client)
  let descriptionId = '';
  if (issue.description) {
    const apiClient = await this.initApiClient();
    descriptionId = await apiClient.uploadMarkup(
      tracker.class.Issue, issueId, 'description', issue.description, 'markdown'
    );
  }

  // 5. Prepare data with CORRECT field mappings
  const data = {
    title: issue.title,
    description: descriptionId,
    attachedToClass: 'tracker:class:Project',  // Bug fix
    collection: 'issues',                       // Bug fix
    kind: project.kind,                         // Auto-resolved
    // ... other fields
  };

  // 6. Insert into task table
  await this.pgPool.query(
    `INSERT INTO task (...) VALUES (...)`,
    [workspaceId, issueId, 'tracker:class:Issue', ...]
  );

  // 7. Insert transaction record
  await this.pgPool.query(
    `INSERT INTO tx (...) VALUES (...)`,
    [workspaceId, txId, 'core:class:TxCreateDoc', ...]
  );

  // 8. Insert activity record
  await this.pgPool.query(
    `INSERT INTO activity (...) VALUES (...)`,
    [workspaceId, activityId, 'activity:class:DocUpdateMessage', ...]
  );

  return { id: issueId, number: sequence, identifier };
}
```

### 6.2 WebSocket Query Pattern

```typescript
async listProjects(): Promise<Array<ProjectInfo>> {
  const listMessage = {
    method: 'findAll',
    params: {
      _class: 'tracker:class:Project',
      query: {},
      options: {},
    },
    id: `msg-${this.messageCounter++}`,
  };

  return new Promise((resolve, reject) => {
    this.messageQueue.set(listMessage.id, {
      resolve: (msg) => {
        // Handle response - may be array or { docs: [] }
        const data = (msg as { result?: unknown }).result;
        if (Array.isArray(data)) {
          resolve(this.mapProjects(data));
        } else if (data?.docs) {
          resolve(this.mapProjects(data.docs));
        }
      },
      reject
    });
    this.ws.send(JSON.stringify(listMessage));
  });
}
```

### 6.3 ProseMirror Document Conversion

For comments, content is converted to ProseMirror JSON:

```typescript
private plainTextToProseMirrorDoc(content: string): string {
  const blocks = [];
  const lines = content.split(/\n/);

  for (const line of lines) {
    const bulletMatch = line.match(/^[-*]\s*(.*)$/);
    if (bulletMatch) {
      // Create bulletList item
      currentBullets.push({
        type: 'listItem',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: bulletMatch[1] }] }]
      });
    } else {
      // Create paragraph
      blocks.push({ type: 'paragraph', content: [{ type: 'text', text: line }] });
    }
  }

  return JSON.stringify({ type: 'doc', content: blocks });
}
```

---

## 7. Bug Fixes vs Other Implementations

### 7.1 Claimed Bug Fixes

From the README:

> "No dependencies on buggy `huly-mcp` package"
>
> "Fixes field mapping issues with `attachedToClass`, `collection`, and `kind` attributes"
>
> "Automatically gets correct task type for each project"

### 7.2 Specific Technical Fixes

#### 7.2.1 Correct `attachedToClass` Value

**Problem:** Other implementations might use incorrect values.
**Fix:** Always uses `'tracker:class:Project'`

#### 7.2.2 Correct `collection` Value

**Problem:** Missing or incorrect collection field.
**Fix:** Always uses `'issues'`

#### 7.2.3 Dynamic `kind` Resolution

**Problem:** Hardcoded task types don't work across different projects.
**Fix:** Queries existing issues to determine the correct `kind` for each project:

```typescript
async getProjectInfo(projectName: string): Promise<ProjectInfo> {
  // First try: get kind from existing task in database
  const result = await this.pgPool.query(
    'SELECT data->>\'kind\' as kind FROM task WHERE space = $1 LIMIT 1',
    [project._id]
  );

  // Second try: get kind from listIssues
  if (!kind) {
    const issues = await this.listIssues(project._id);
    kind = issues.length > 0 ? issues[0].kind : undefined;
  }

  // Fallback to default
  kind = kind || '6976d5c8dfe597052a795607';
}
```

#### 7.2.4 Transaction Record Creation

**Problem:** Issues may not appear in UI without proper tx records.
**Fix:** Creates both `tx` (transaction) and `activity` records alongside the task.

### 7.3 Commit History Evidence

Recent commits show iterative bug fixing:

```
Fix createIssue: use correct attachedToClass, collection, and API method
Fix createIssue: use addCollection method with correct parameters
Try createDoc method instead of addCollection
Fix createIssue: use correct tx transaction format
Try using socialId instead of account UUID for modifiedBy
Use socialId from login for modifiedBy, don't overwrite
```

---

## 8. Architecture Concerns

### 8.1 Direct Database Access

The implementation bypasses Huly's API layer and directly manipulates CockroachDB. This:

- **Pros:** Full control, bypasses API limitations
- **Cons:**
  - Brittle (schema changes break it)
  - No validation
  - May corrupt data
  - Requires database credentials
  - Only works for self-hosted instances

### 8.2 Hardcoded User Mappings

User resolution relies on hardcoded mappings:

```typescript
export const ASSIGNEE_MAPPING: Record<string, string> = {
  'Bach Duong': '687e6a659ba7a6c5c6961fc3',
  // ...
};
```

This requires manual updates for each workspace.

### 8.3 Error Handling for Buffer Issues

Silently catches buffer-related errors:

```typescript
process.on('uncaughtException', (err) => {
  if (err.message?.includes('Data read, but end of buffer not reached')) {
    return; // Silently ignore
  }
  throw err;
});
```

---

## 9. Dependencies

```json
{
  "dependencies": {
    "@hcengineering/api-client": "^0.7.1",
    "@hcengineering/core": "^0.7.1",
    "@hcengineering/rank": "^0.7.1",
    "@hcengineering/tracker": "^0.7.1",
    "@modelcontextprotocol/sdk": "^1.0.0",
    "pg": "^8.x",
    "ws": "^8.x"
  }
}
```

---

## 10. Summary

The `hha-nguyen/huly-mcp-server` implementation is a comprehensive but unconventional solution that:

1. **Uses direct database access** instead of relying solely on the Huly API
2. **Fixes specific field mapping bugs** (`attachedToClass`, `collection`, `kind`)
3. **Implements dynamic kind resolution** by querying existing issues
4. **Provides extensive debugging tools** for exploring database structure
5. **Requires self-hosted Huly** with database access

This approach trades maintainability and portability for reliability in creating issues with correct metadata. It's specifically designed to work around limitations or bugs in the official `huly-mcp` package for self-hosted deployments.
