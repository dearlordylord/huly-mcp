# Huly-Vibe Sync Implementation Report

**Repository**: [oculairmedia/huly-vibe-sync](https://github.com/oculairmedia/huly-vibe-sync)

A bidirectional synchronization service connecting Huly project management with Vibe Kanban and Beads (git-backed issue tracker).

---

## 1. Connection Methodology

### Primary: REST API
The project primarily uses **REST API** connections, not WebSocket or MCP streaming:

```javascript
// lib/HulyRestClient.js
export class HulyRestClient {
  constructor(baseUrl, options = {}) {
    // REST API runs on port 3458
    this.baseUrl = baseUrl
      .replace(/\/mcp$/, '')   // Remove /mcp suffix if present
      .replace(/\/api$/, '')   // Remove /api suffix if present
      .replace(/:\d+/, ':3458') // Set port to 3458
      + '/api';                 // Add /api suffix
    this.timeout = options.timeout || 60000;
  }
}
```

### Huly API Endpoints Used
- `GET /api/projects` - List projects
- `GET /api/projects/{id}/issues` - List issues with incremental sync support
- `POST /api/issues/bulk-by-projects` - Bulk fetch issues from multiple projects
- `POST /api/issues` - Create issue
- `PUT /api/issues/{id}` - Update issue field
- `GET /api/issues/{id}/subissues` - Get sub-issues
- `POST /api/issues/{id}/subissues` - Create sub-issue
- `GET /api/projects/{id}/tree` - Get issue hierarchy tree
- `GET /health` - Health check

### Vibe Kanban API (port 3105)
```javascript
// lib/VibeRestClient.js
this.baseUrl = baseUrl
  .replace(/:\d+/, ':3105')
  + '/api';
```

### Webhook-Based Real-Time Updates
For real-time sync, the project uses a webhook system via `huly-change-watcher` service:

```javascript
// lib/HulyWebhookHandler.js
const DEFAULT_CHANGE_WATCHER_URL =
  process.env.HULY_CHANGE_WATCHER_URL || 'http://huly-change-watcher:3459';

async subscribe() {
  const response = await fetch(`${this.changeWatcherUrl}/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: this.callbackUrl,
      events: ['task.changed', 'project.changed'],
    }),
  });
}
```

---

## 2. Authentication

**No explicit authentication is implemented**. The project assumes access to internal Huly/Vibe instances:

```javascript
// lib/config.js
huly: {
  apiUrl: process.env.HULY_API_URL || 'http://192.168.50.90:3457/api',
  useRestApi: process.env.HULY_USE_REST !== 'false',
},
```

Authentication appears to be network-level (internal IPs) rather than token-based.

For BookStack integration, token authentication is used:
```javascript
bookstack: {
  tokenId: process.env.BOOKSTACK_TOKEN_ID || '',
  tokenSecret: process.env.BOOKSTACK_TOKEN_SECRET || '',
}
```

---

## 3. API Techniques

### Incremental Sync with Timestamps
```javascript
// lib/HulyRestClient.js - listIssues()
async listIssues(projectIdentifier, options = {}) {
  const params = new URLSearchParams();
  const modifiedSince = options.modifiedSince || options.modifiedAfter;
  if (modifiedSince) {
    params.append('modifiedSince', modifiedSince);
  }
  // ...
}
```

### Bulk Fetching for Performance
```javascript
// lib/HulyRestClient.js
async listIssuesBulk(projectIdentifiers, options = {}) {
  const url = `${this.baseUrl}/issues/bulk-by-projects`;
  const body = {
    projects: projectIdentifiers,
    modifiedSince: options.modifiedSince,
    limit: options.limit,
  };
  // POST to fetch multiple projects at once
}
```

### Connection Pooling
```javascript
// lib/http.js - fetchWithPool()
import { fetchWithPool } from './http.js';

// All API calls use pooled connections for efficiency
const response = await fetchWithPool(url, {
  method: 'GET',
  headers: { 'Content-Type': 'application/json' },
  signal: AbortSignal.timeout(this.timeout),
});
```

### Latency Monitoring
```javascript
// lib/HulyService.js
import { recordApiLatency } from './HealthService.js';

const startTime = Date.now();
const projects = await hulyClient.listProjects();
recordApiLatency('huly', 'listProjects', Date.now() - startTime);
```

### MCP Fallback (Legacy)
The code supports MCP protocol as fallback, but REST is preferred:

```javascript
// lib/HulyService.js
if (typeof hulyClient.updateIssue === 'function') {
  // HulyRestClient
  await hulyClient.updateIssue(issueIdentifier, 'status', status);
} else if (typeof hulyClient.callTool === 'function') {
  // MCPClient fallback
  await hulyClient.callTool('huly_issue_ops', {
    operation: 'update',
    issue_identifier: issueIdentifier,
    update: { field: 'status', value: status },
  });
}
```

---

## 4. Data Models

### Database Schema (SQLite)
```sql
-- lib/database.js
CREATE TABLE projects (
  identifier TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  huly_id TEXT,
  vibe_id INTEGER,
  last_sync_at INTEGER,
  issue_count INTEGER DEFAULT 0,
  filesystem_path TEXT,
  git_url TEXT,
  status TEXT DEFAULT 'active',
  letta_agent_id TEXT,
  description_hash TEXT
);

CREATE TABLE issues (
  identifier TEXT PRIMARY KEY,
  project_identifier TEXT NOT NULL,
  huly_id TEXT,
  vibe_task_id INTEGER,
  beads_issue_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT,
  priority TEXT,
  parent_huly_id TEXT,
  parent_vibe_id TEXT,
  parent_beads_id TEXT,
  sub_issue_count INTEGER DEFAULT 0,
  content_hash TEXT,
  huly_modified_at INTEGER,
  vibe_modified_at INTEGER,
  beads_modified_at INTEGER,
  deleted_from_huly INTEGER DEFAULT 0,
  deleted_from_vibe INTEGER DEFAULT 0,
  deleted_from_beads INTEGER DEFAULT 0,
  FOREIGN KEY (project_identifier) REFERENCES projects(identifier)
);
```

### Huly Class References
```javascript
// lib/HulyWebhookHandler.js
const issueChanges = changes.filter(c => c.class === 'tracker:class:Issue');
const projectChanges = changes.filter(c => c.class === 'tracker:class:Project');
```

### Status Mapping
```javascript
// lib/statusMapper.js
export function mapHulyStatusToVibe(hulyStatus) {
  const status = hulyStatus.toLowerCase();
  if (status.includes('backlog') || status.includes('todo')) return 'todo';
  if (status.includes('progress')) return 'inprogress';
  if (status.includes('review')) return 'inreview';
  if (status.includes('done') || status.includes('completed')) return 'done';
  if (status.includes('cancel')) return 'cancelled';
  return 'todo';
}

export function mapVibeStatusToHuly(vibeStatus) {
  const statusMap = {
    todo: 'Backlog',
    inprogress: 'In Progress',
    inreview: 'In Review',
    done: 'Done',
    cancelled: 'Canceled', // Huly uses one 'l'
  };
  return statusMap[vibeStatus] || 'Backlog';
}
```

---

## 5. Sync Techniques

### Four-Phase Bidirectional Sync
```javascript
// lib/SyncOrchestrator.js (deprecated - Temporal workflows preferred)

// Phase 1: Huly -> Vibe (Primary direction)
// Phase 2: Vibe -> Huly (Reverse sync with conflict resolution)
// Phase 3: Beads (Git-backed issue tracking)
// Phase 4: BookStack (Documentation sync)
```

### Conflict Resolution (Timestamp-Based)
```javascript
// lib/SyncOrchestrator.js - syncVibeTaskToHuly()
async function syncVibeTaskToHuly(hulyClient, vibeTask, hulyIssues, ...) {
  // Skip if updated in Phase 1 (prevent ping-pong)
  if (phase1UpdatedTasks.has(vibeTask.id)) {
    return;
  }

  // Timestamp-based conflict resolution
  const vibeModifiedAt = vibeTask.updated_at ? new Date(vibeTask.updated_at).getTime() : null;
  const beadsModifiedAt = dbIssue?.beads_modified_at || null;

  // Beads wins if more recent
  if (beadsModifiedAt && vibeModifiedAt && beadsModifiedAt > vibeModifiedAt) {
    log.info('Vibe→Huly: Skipping - Beads has more recent change');
    return;
  }
  // ... proceed with sync
}
```

### Content Hash for Change Detection
```javascript
// lib/database/utils.js
import { computeIssueContentHash, hasIssueContentChanged } from './database/utils.js';
```

### Cursor-Based Incremental Sync
```javascript
// lib/HulyService.js
export async function fetchHulyIssues(hulyClient, projectIdentifier, config, db) {
  // Get sync cursor from database
  const syncCursor = db?.getHulySyncCursor?.(projectIdentifier);

  if (isIncremental) {
    options.modifiedSince = syncCursor;
  }

  const result = await hulyClient.listIssues(projectIdentifier, options);

  // Update cursor for next sync
  if (db && syncMeta.latestModified) {
    db.setHulySyncCursor(projectIdentifier, syncMeta.latestModified);
  }
}
```

### Webhook Debouncing
```javascript
// lib/HulyWebhookHandler.js
constructor() {
  this._debounceWindowMs = 5000; // 5 second debounce
  this._pendingChanges = [];
  this._debounceTimer = null;
}
```

---

## 6. MCP Usage

**MCP is NOT the primary integration method**. The project name mentions MCP, but implementation favors REST API:

### MCP as Configuration Option
```javascript
// .env.example
HULY_API_URL=http://192.168.50.90:3457/api
HULY_USE_REST=true  // Default: use REST, not MCP
HULY_MCP_URL=http://192.168.50.90:3457/mcp  // Fallback option
```

### MCP Tool Calling (Fallback)
```javascript
// lib/HulyRestClient.js - callTool()
async callTool(toolName, args = {}) {
  const url = `${this.baseUrl}/tools/${toolName}`;
  const response = await fetchWithPool(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ arguments: args }),
  });

  // Extract text from MCP-style content array
  const toolResult = result.data.result;
  if (toolResult?.content && Array.isArray(toolResult.content)) {
    // MCP format: {content: [{type: "text", text: "..."}]}
    const textContent = toolResult.content.find(c => c.type === 'text');
    if (textContent) return textContent.text;
  }
}
```

### MCP for Letta AI Integration
MCP URLs are specifically used for Letta AI agent integration:
```javascript
// lib/config.js
letta: {
  hulyMcpUrl: process.env.HULY_MCP_URL || 'http://192.168.50.90:3457/mcp',
  vibeMcpUrl: process.env.VIBE_MCP_URL,
}
```

---

## 7. Code Examples

### Complete Huly Issue Update Flow
```javascript
// lib/HulyService.js
export async function updateHulyIssueStatus(hulyClient, issueIdentifier, status, config) {
  if (config.sync?.dryRun) {
    console.log(`[DRY RUN] Would update ${issueIdentifier} status to: ${status}`);
    return true;
  }

  const startTime = Date.now();
  try {
    if (typeof hulyClient.updateIssue === 'function') {
      await hulyClient.updateIssue(issueIdentifier, 'status', status);
    } else if (typeof hulyClient.callTool === 'function') {
      await hulyClient.callTool('huly_issue_ops', {
        operation: 'update',
        issue_identifier: issueIdentifier,
        update: { field: 'status', value: status },
      });
    }
    recordApiLatency('huly', 'updateIssue', Date.now() - startTime);
    return true;
  } catch (error) {
    recordApiLatency('huly', 'updateIssue', Date.now() - startTime);
    console.error(`Error updating ${issueIdentifier}:`, error.message);
    return false;
  }
}
```

### Webhook Handler Processing
```javascript
// lib/HulyWebhookHandler.js
async handleWebhook(payload) {
  // Handle change-watcher format: { source, timestamp, events: [...] }
  if (payload.events && Array.isArray(payload.events)) {
    return await this.handleChangeWatcherPayload(payload, result);
  }

  // Handle legacy format: { type, timestamp, changes: [...] }
  switch (payload.type) {
    case 'task.changed':
    case 'task.updated':
      return await this.handleTaskChanges(payload.changes || [], result);
    case 'project.created':
    case 'project.updated':
      return await this.handleProjectChanges(payload.changes || [], result);
  }
}

async handleChangeWatcherPayload(payload, result) {
  // Transform events to handler format
  const transformedChanges = events.map(event => ({
    id: event.data?.id,
    class: event.data?.class,
    modifiedOn: event.data?.modifiedOn,
    data: {
      identifier: event.data?.identifier,
      title: event.data?.title,
      status: event.data?.status,
      space: event.data?.space,
    },
    _eventType: event.type,
  }));

  // Route to appropriate handlers
  const issueTaskChanges = transformedChanges.filter(
    c => c._eventType === 'issue.updated' || c._eventType === 'task.updated'
  );
  // ...
}
```

### Temporal Workflow Integration
```javascript
// lib/SyncOrchestrator.js
async function syncIssueToVibeWithFallback(vibeClient, vibeProjectId, hulyIssue, ...) {
  const temporal = await getTemporalClient();

  if (temporal) {
    try {
      const { workflowId } = await temporal.scheduleSingleIssueSync({
        issue: {
          identifier: hulyIssue.identifier,
          title: hulyIssue.title,
          description: hulyIssue.description,
          status: hulyIssue.status,
          priority: hulyIssue.priority,
          modifiedOn: hulyIssue.modifiedOn,
        },
        context: {
          projectIdentifier: context.projectIdentifier,
          vibeProjectId: vibeProjectId,
          gitRepoPath: context.gitRepoPath,
        },
        existingVibeTaskId: existingTaskId,
        syncToVibe: true,
        syncToBeads: !!context.gitRepoPath,
      });
      return { id: workflowId, temporal: true };
    } catch (err) {
      console.warn('Temporal failed, falling back to legacy:', err.message);
    }
  }
  // Legacy direct sync fallback...
}
```

---

## 8. Architecture Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                     Huly-Vibe Sync Service                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    REST API     ┌─────────────────────────┐   │
│  │    Huly     │◄──────────────►│   HulyRestClient.js     │   │
│  │  (port 3458)│                 │   HulyService.js        │   │
│  └─────────────┘                 └─────────────────────────┘   │
│                                            │                    │
│  ┌─────────────┐    Webhooks     ┌────────▼────────────────┐   │
│  │ Change      │────────────────►│  HulyWebhookHandler.js  │   │
│  │ Watcher     │                 └────────┬────────────────┘   │
│  │ (port 3459) │                          │                    │
│  └─────────────┘                          │                    │
│                                  ┌────────▼────────────────┐   │
│                                  │   SyncOrchestrator.js   │   │
│                                  │   (or Temporal workflows)│   │
│                                  └────────┬────────────────┘   │
│                                           │                    │
│  ┌─────────────┐    REST API     ┌────────▼────────────────┐   │
│  │ Vibe Kanban │◄──────────────►│   VibeRestClient.js     │   │
│  │  (port 3105)│                 │   VibeService.js        │   │
│  └─────────────┘                 └─────────────────────────┘   │
│                                                                 │
│  ┌─────────────┐                 ┌─────────────────────────┐   │
│  │   SQLite    │◄───────────────►│   database.js           │   │
│  │   (WAL)     │                 │   (sync state, cursors) │   │
│  └─────────────┘                 └─────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 9. Key Takeaways

1. **REST over MCP**: Despite being named "using MCP", the implementation primarily uses REST API for performance reasons. MCP is a fallback.

2. **No Built-in Auth**: Relies on network-level access control (internal IPs). No token/OAuth implementation for Huly.

3. **Huly REST API Assumptions**: The project assumes a Huly REST API exists on port 3458 with specific endpoints (`/api/projects`, `/api/issues`, etc.). This may be a custom extension or proxy.

4. **Three-Way Sync**: Huly <-> Vibe <-> Beads with timestamp-based conflict resolution.

5. **Temporal Integration**: Moving toward Temporal workflows for durable, recoverable sync operations.

6. **Performance Focus**: Bulk fetching, connection pooling, incremental sync with cursors, and parallel processing (5 workers default).

7. **Webhook for Real-Time**: Uses a separate `huly-change-watcher` service for real-time push notifications rather than polling.
