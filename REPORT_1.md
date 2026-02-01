# Research Report: @zubeidhendricks/huly-mcp-server

**Date:** 2026-02-02
**Package:** `@zubeidhendricks/huly-mcp-server` v0.1.0
**Repository:** https://github.com/ZubeidHendricks/huly-mcp
**Author:** Zubeid Hendricks

---

## Executive Summary

This is an **incomplete/prototype implementation** of an MCP server for Huly. The actual Huly API integration is **not implemented** - the codebase runs entirely on mock data. The WebSocket client exists but is never used for real Huly communication. The Activepieces PR was closed because it lacked proper action/trigger implementations.

---

## 1. Connection Methodology

### Intended Architecture
The server is designed to use **WebSocket connections** to Huly's backend:

```
AI Assistant <-> MCP Server (Express HTTP) <-> Huly WebSocket API
```

### Implementation Details

**WebSocket Client** (`src/api/hulyWebSocket.ts`):
```typescript
export class HulyWebSocketClient implements HulyWebSocketConnection {
  private socket: WebSocket | null = null;
  private requestMap = new Map<string, { resolve: Function; reject: Function }>();
  private url: string;
  private mockMode: boolean;

  constructor(url: string) {
    this.url = url;
    this.mockMode = url.startsWith('mock://');
  }

  public async connect(): Promise<void> {
    if (this.mockMode) {
      console.log('Mock: Connected to Huly WebSocket');
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      this.socket = new WebSocket(this.url);

      this.socket.on('open', () => {
        console.log('Connected to Huly WebSocket');
        resolve();
      });

      this.socket.on('message', (data: WebSocket.Data) => {
        const response = JSON.parse(data.toString());
        if (response.id && this.requestMap.has(response.id)) {
          const { resolve } = this.requestMap.get(response.id)!;
          this.requestMap.delete(response.id);
          resolve(response);
        }
      });
    });
  }

  public async send(message: any): Promise<any> {
    if (this.mockMode) {
      return { id: message.id || Date.now().toString(), result: { success: true } };
    }
    // Request-response correlation via requestMap
    const id = message.id || Date.now().toString();
    this.requestMap.set(id, { resolve, reject });
    this.socket!.send(JSON.stringify({ ...message, id }));
  }
}
```

**Key Points:**
- Default URL: `wss://api.huly.io`
- Uses request-response correlation with unique IDs
- 30 second timeout per request
- **Mock mode is always enabled** in the released code

### Critical Issue: Mock Mode Always Active

In `src/index.ts`:
```typescript
const MOCK_MODE = true;  // Hardcoded to true!
const server = new McpServer(PORT, MOCK_MODE);
```

**The WebSocket client is never actually used for real Huly communication.**

---

## 2. Authentication

### Configuration

From `.env.example`:
```bash
PORT=3000
HULY_WS_URL=wss://api.huly.io
# Optional authentication (if needed)
# AUTH_TOKEN=your_auth_token
```

### Current Implementation

**No authentication is implemented.** The code:
- Has a commented placeholder for `AUTH_TOKEN`
- Does not send any authentication headers or tokens
- Does not implement token management or refresh

### Intended Activepieces Auth

From `activepieces/src/index.ts` (stub only):
```typescript
import { hulyAuth } from './lib/auth';
```

The `lib/auth.ts` file does not exist - it's referenced but never created.

---

## 3. API Techniques

### MCP Protocol Implementation

The server exposes a **custom MCP-over-HTTP** interface (not standard MCP stdio):

**Endpoints:**
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check |
| `/mcp` | POST | JSON-RPC 2.0 MCP requests |
| `/manifest` | GET | Function schema manifest |

### JSON-RPC 2.0 Request Format

```typescript
const McpRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]),
  method: z.string(),
  params: z.record(z.any()).optional(),
});
```

### Available Methods

**Search Operations:**
| Method | Parameters | Description |
|--------|------------|-------------|
| `huly.findPerson` | `query?: string` | Search people by name/email |
| `huly.findProject` | `id?: string, name?: string` | Find project by ID or name |
| `huly.findIssue` | `projectId: string` | List issues in project |
| `huly.findDocument` | `teamspaceId: string, name?: string` | Find documents in teamspace |

**Create Operations:**
| Method | Parameters | Description |
|--------|------------|-------------|
| `huly.createPerson` | `name: string, email: string` | Create person with email |
| `huly.createIssue` | `projectId, title, description?, priority?, dueDate?` | Create issue |
| `huly.createMilestone` | `projectId, name, dueDate?, issueIds?` | Create milestone |
| `huly.createDocument` | `teamspaceId, name, content, projectIds?` | Create document |

### Example Request/Response

```typescript
// Request
{
  "jsonrpc": "2.0",
  "id": "1",
  "method": "huly.findPerson",
  "params": { "query": "John" }
}

// Response
{
  "jsonrpc": "2.0",
  "id": "1",
  "result": [
    {
      "id": "person-1",
      "name": "John Doe",
      "channels": [{ "type": "email", "value": "john@example.com" }]
    }
  ]
}
```

### Error Handling

```typescript
function createErrorResponse(id, code, message, data?): McpResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: { code, message, data }
  };
}
```

Error codes used:
- `-32700`: Parse error
- `-32600`: Invalid request
- `-32601`: Method not found
- `-32602`: Invalid params
- `-32603`: Internal error
- `-32000`: Application-specific errors

---

## 4. Data Models

### Type Definitions (`src/types/index.ts`)

**Person:**
```typescript
interface Person {
  id: string;
  name: string;
  channels?: CommunicationChannel[];
}

interface CommunicationChannel {
  type: 'email' | 'phone' | 'linkedin';
  value: string;
}
```

**Project:**
```typescript
interface Project {
  id: string;
  name: string;
  description?: string;
}
```

**Issue:**
```typescript
interface Issue {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high';
  dueDate?: string;
  assigneeId?: string;
  status?: 'open' | 'in-progress' | 'resolved' | 'closed';
  lastModified: string;
}
```

**Milestone:**
```typescript
interface Milestone {
  id: string;
  projectId: string;
  name: string;
  dueDate?: string;
  issues?: string[];  // issue IDs
}
```

**Document:**
```typescript
interface Document {
  id: string;
  teamspaceId: string;
  name: string;
  content: string;
  projectIds?: string[];
}
```

### Notable Differences from Actual Huly

The types are **simplified/custom** and do not match Huly's actual data model:
- No `_class` or `attachedToClass` fields
- No `space` references
- No `_id` ObjectId format
- No Huly-specific identifiers or class hierarchy
- Simplified `status` enum vs Huly's category system

---

## 5. MCP Implementation

### Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                       Express Server                          │
│                      (src/mcp/server.ts)                      │
├──────────────────────────────────────────────────────────────┤
│  /health     │  /mcp              │  /manifest                │
│  GET         │  POST JSON-RPC     │  GET function schemas     │
└──────────────┴───────────┬────────┴───────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                    Request Handlers                           │
│                   (src/mcp/handlers.ts)                       │
│  - Validates params with Zod                                  │
│  - Routes to appropriate API function                         │
│  - Formats JSON-RPC responses                                 │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                      Huly API Layer                           │
│                    (src/api/hulyApi.ts)                       │
│  - findPerson, findProject, findIssue, findDocument          │
│  - createPerson, createIssue, createMilestone, createDocument│
│  - Currently returns MOCK DATA only                           │
└──────────────────────────────────────────────────────────────┘
```

### Server Setup

```typescript
export class McpServer {
  private app: express.Application;
  private port: number;
  private mockMode: boolean;

  constructor(port: number = 3000, mockMode: boolean = false) {
    this.app = express();
    this.port = port;
    this.mockMode = mockMode;
    this.hulyWsUrl = mockMode ? 'mock://huly.local' : 'wss://api.huly.io';
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    this.app.use(json());
    // CORS enabled for all origins
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      // ...
    });
  }
}
```

### Request Handler Pattern

```typescript
async function handleFindPerson(request: McpRequest): Promise<McpResponse> {
  // 1. Validate params with Zod
  const result = FindPersonParamsSchema.safeParse(request.params);
  if (!result.success) {
    return createErrorResponse(request.id, -32602, `Invalid params: ${result.error.message}`);
  }

  // 2. Call the API layer
  const people = await findPerson(result.data.query);

  // 3. Return JSON-RPC response
  return createSuccessResponse(request.id, people);
}
```

### Manifest Endpoint

The `/manifest` endpoint returns OpenAPI-style function schemas:

```typescript
{
  name: 'Huly MCP Server',
  version: '0.1.0',
  description: 'MCP server for Huly project and document management',
  models: ['gpt-4', 'claude-3-opus', 'claude-3-sonnet'],
  functions: [
    {
      name: 'huly.findPerson',
      description: 'Find people and their communication channels',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '...' }
        }
      }
    },
    // ... other functions
  ]
}
```

---

## 6. Key Code Examples

### Complete Request Flow

```typescript
// 1. Entry point (src/mcp/server.ts)
this.app.post('/mcp', async (req: Request, res: Response) => {
  const parseResult = McpRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error' }
    });
  }

  const response = await handleMcpRequest(parseResult.data);
  res.json(response);
});

// 2. Handler routing (src/mcp/handlers.ts)
export async function handleMcpRequest(request: McpRequest): Promise<McpResponse> {
  switch (request.method) {
    case 'huly.findPerson':
      return await handleFindPerson(request);
    case 'huly.createIssue':
      return await handleCreateIssue(request);
    // ...
    default:
      return createErrorResponse(request.id, -32601, `Method not found: ${request.method}`);
  }
}

// 3. API implementation (src/api/hulyApi.ts) - MOCK ONLY
export async function findPerson(query?: string): Promise<Person[]> {
  console.log(`Mock: Finding person with query: ${query}`);

  if (!query) return mockPeople;

  const queryLower = query.toLowerCase();
  return mockPeople.filter(person =>
    person.name.toLowerCase().includes(queryLower)
  );
}
```

### Zod Validation Schemas

```typescript
export const CreateIssueParamsSchema = z.object({
  projectId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  dueDate: z.string().optional(),
});

export const FindDocumentParamsSchema = z.object({
  teamspaceId: z.string(),
  name: z.string().optional(),
});
```

### WebSocket Request-Response Correlation

```typescript
public async send(message: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = message.id || Date.now().toString();
    const requestWithId = { ...message, id };

    // Store handlers for correlation
    this.requestMap.set(id, { resolve, reject });

    this.socket!.send(JSON.stringify(requestWithId));

    // Timeout after 30 seconds
    setTimeout(() => {
      if (this.requestMap.has(id)) {
        this.requestMap.delete(id);
        reject(new Error('Request timed out'));
      }
    }, 30000);
  });
}
```

---

## 7. Dependencies

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.10.0",
    "express": "^4.18.2",
    "ws": "^8.13.0",
    "zod": "^3.21.4"
  }
}
```

Note: `@anthropic-ai/sdk` is listed but **not used** anywhere in the codebase.

---

## 8. Critical Analysis

### What Works
- Clean MCP-over-HTTP architecture
- Proper JSON-RPC 2.0 error handling
- Zod validation for type safety
- Well-structured handler pattern

### What Doesn't Work
1. **No actual Huly API integration** - All data is hardcoded mock data
2. **No authentication** - AUTH_TOKEN placeholder never implemented
3. **Mock mode hardcoded** - Cannot switch to live mode
4. **Incomplete Activepieces integration** - Missing action/trigger implementations
5. **WebSocket protocol unknown** - No evidence of what protocol Huly actually uses

### Missing for Production Use
- Real Huly WebSocket protocol implementation
- Authentication flow (OAuth, API keys, etc.)
- Proper Huly data model classes (`_class`, `space`, etc.)
- Error recovery and reconnection logic
- Rate limiting
- Logging and monitoring

---

## 9. Activepieces PR Status

The [Activepieces PR #7505](https://github.com/activepieces/activepieces/pull/7505) was **closed on May 6, 2025** because:

> The MCP server endpoint was built, but the submission lacked a complete Activepieces "piece" with proper actions and triggers using the framework's properties system.

The maintainers directed to reference [PR #7501 (Jina AI)](https://github.com/activepieces/activepieces/pull/7501) as a structural example.

---

## 10. Conclusions

This package is a **proof-of-concept/scaffold** rather than a working implementation. Key takeaways:

1. **Architecture is sound** - The MCP server pattern is well-designed
2. **No real Huly integration** - Would require reverse-engineering Huly's WebSocket protocol
3. **Useful as reference** - The handler patterns and Zod validation are good examples
4. **Cannot be used as-is** - Requires complete reimplementation of the API layer

For a working Huly MCP implementation, one would need to:
1. Study Huly's actual API (platform-api examples in huly-examples repo)
2. Implement proper authentication
3. Use correct Huly data classes and identifiers
4. Replace mock data with real API calls
