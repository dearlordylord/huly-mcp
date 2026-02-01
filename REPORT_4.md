# Huly Platform API Architecture Report

Research based on official source code at https://github.com/hcengineering/platform

## 1. API Architecture

### Dual Protocol Design

Huly implements **both WebSocket and REST** APIs:

**WebSocket (Primary)**
- Real-time bidirectional communication for live updates
- Used for collaborative editing, live queries, and transaction streaming
- Browser client: native WebSocket API
- Node.js client: `ws` package wrapped via `NodeWebSocketFactory`
- Location: `foundations/core/packages/api-client/src/socket/`

**REST API**
- Stateless HTTP requests for simpler integrations
- Implements rate limiting with progressive backoff
- Converts WebSocket endpoints to HTTP automatically
- Location: `foundations/core/packages/api-client/src/rest/`

### Server Architecture

```
pods/server/          # Main server pod entry point
  -> foundations/server/packages/server/  # Server implementation
       -> sessionManager.ts   # Connection/session handling
       -> starter.ts          # HTTP server initialization
```

The server uses a **middleware pipeline** architecture. Requests flow through ~25 middleware layers:

```
LookupMiddleware -> NormalizeTxMiddleware -> IdentityMiddleware
  -> ModifiedMiddleware -> FindSecurityMiddleware -> SpaceSecurityMiddleware
  -> ... -> DBAdapterMiddleware -> DomainFindMiddleware
```

Key middleware categories:
- **Security**: `FindSecurityMiddleware`, `SpaceSecurityMiddleware`, `PrivateMiddleware`
- **Data Processing**: `VersioningMiddleware`, `TriggersMiddleware`, `FullTextMiddleware`
- **Database**: `DBAdapterMiddleware`, `DomainFindMiddleware`
- **Events**: `BroadcastMiddleware`, `TriggersMiddleware`

## 2. Authentication Flow

### Token-Based Authentication

1. **Client requests token** from Account Service via JSON-RPC
2. **Account Service** validates credentials (password, OTP, or social login)
3. **JWT token** returned containing account UUID and workspace context
4. **Token used** as Bearer auth for all subsequent requests

### Account Client (`foundations/core/packages/account-client/`)

```typescript
interface AccountClient {
  // Authentication
  login(email: string, password: string): Promise<LoginInfo>
  loginOtp(email: string): Promise<void>
  validateOtp(email: string, code: string): Promise<LoginInfo>

  // Workspace access
  selectWorkspace(workspace: string, token: string): Promise<WorkspaceLoginInfo>
  listWorkspaces(token: string): Promise<WorkspaceInfo[]>
}
```

### Auth Methods Supported

- **Password-based**: Traditional email/password with failed attempt tracking
- **OTP (One-Time Password)**: Passwordless email verification
- **Social Login**: GitHub, Google, OIDC providers via `SocialId` types
- **Guest Access**: Limited functionality for unauthenticated users

### Account Lockout

After multiple failed login attempts, accounts are temporarily locked. Tracked via:
```typescript
interface Account {
  lastFailedAttempt?: number
  failedAttempts?: number
}
```

## 3. Transaction System

### Core Transaction Types (`foundations/core/packages/core/src/tx.ts`)

**TxCreateDoc** - Create new documents
```typescript
interface TxCreateDoc<T extends Doc> extends TxCUD<T> {
  attributes: Data<T>
}
```

**TxUpdateDoc** - Modify existing documents
```typescript
interface TxUpdateDoc<T extends Doc> extends TxCUD<T> {
  operations: DocumentUpdate<T>
}

// DocumentUpdate supports:
interface DocumentUpdate<T> {
  $push?: Partial<T>      // Array append
  $pull?: Partial<T>      // Array remove
  $inc?: Partial<T>       // Numeric increment
  $unset?: Partial<T>     // Field removal
  // Plus partial field updates
}
```

**TxRemoveDoc** - Delete documents
```typescript
interface TxRemoveDoc<T extends Doc> extends TxCUD<T> {
  // Only needs objectId, objectClass, objectSpace
}
```

**TxMixin** - Apply mixins to documents
```typescript
interface TxMixin<D extends Doc, M extends D> extends TxCUD<D> {
  mixin: Ref<Mixin<M>>
  attributes: MixinUpdate<D, M>
}
```

### Transaction Base (`TxCUD`)

```typescript
interface TxCUD<T extends Doc> extends Tx {
  objectId: Ref<T>
  objectClass: Ref<Class<T>>
  objectSpace: Ref<Space>
  // For attached documents:
  attachedTo?: Ref<Doc>
  attachedToClass?: Ref<Class<Doc>>
  collection?: string
}
```

### Conditional Transactions (`TxApplyIf`)

Batch operations with preconditions:
```typescript
interface TxApplyIf extends Tx {
  scope: string
  match: DocumentQuery<Doc>[]      // Must match
  notMatch: DocumentQuery<Doc>[]   // Must not match
  txes: TxCUD<Doc>[]               // Transactions to apply
}
```

### TxFactory Usage

```typescript
const factory = new TxFactory(account)

// Create
const tx = factory.createTxCreateDoc(
  tracker.class.Issue,
  spaceId,
  { title: 'Bug', priority: 1 }
)

// Update
const tx = factory.createTxUpdateDoc(
  tracker.class.Issue,
  spaceId,
  issueId,
  { priority: 2 }
)

// Auto-generates: _id, modifiedOn, modifiedBy
```

## 4. Core Data Model

### Document Hierarchy

```
Obj (_class)
  └── Doc (_id, space, modifiedOn, modifiedBy, createdOn?, createdBy?)
       └── AttachedDoc (attachedTo, attachedToClass, collection)
       └── Space (name, description, private, members, owners, archived)
```

### Key Interfaces

**Doc** - Base document
```typescript
interface Doc extends Obj {
  _id: Ref<this>
  space: Ref<Space>
  modifiedOn: Timestamp
  modifiedBy: PersonId
  createdBy?: PersonId
  createdOn?: Timestamp
}
```

**AttachedDoc** - Child document pattern
```typescript
interface AttachedDoc<Parent extends Doc> extends Doc {
  attachedTo: Ref<Parent>
  attachedToClass: Ref<Class<Parent>>
  collection: string  // e.g., "comments", "attachments"
}
```

**Space** - Workspace container
```typescript
interface Space extends Doc {
  name: string
  description: string
  private: boolean
  members: AccountUuid[]
  owners?: AccountUuid[]
  archived: boolean
  autoJoin?: boolean
}
```

### Classification System

```typescript
interface Class<T extends Obj> {
  extends?: Ref<Class<Obj>>  // Inheritance
  domain?: Domain            // Storage domain
}

interface Mixin<T extends Doc> extends Class<T> {
  // Dynamically composable attributes
}

interface Interface<T extends Doc> extends Class<T> {
  // Multiple inheritance support
}
```

### Hierarchy Class

Manages class relationships via `Hierarchy` class:
```typescript
hierarchy.isDerived(childClass, parentClass)  // Check inheritance
hierarchy.getAncestors(cls)                    // Get parent chain
hierarchy.getDescendants(cls)                  // Get children
hierarchy.as(doc, mixin)                       // Cast to mixin type
```

### Domain Constants

```typescript
const DOMAIN_MODEL = 'model'       // Schema definitions
const DOMAIN_SPACE = 'space'       // Spaces
const DOMAIN_BLOB = 'blob'         // Binary data
const DOMAIN_TRANSIENT = 'transient'
const DOMAIN_TX = 'tx'             // Transactions
```

## 5. Client-Server Protocol

### RPC Message Format (`foundations/core/packages/rpc/`)

**Request**
```typescript
interface Request<P> {
  method: string
  params: P
  // Optional metadata
}

interface HelloRequest extends Request<void> {
  binary: boolean      // Use msgpack vs JSON
  compression: boolean // Enable compression
}
```

**Response**
```typescript
interface Response<R> {
  result?: R
  error?: Status          // Error details
  time?: number           // Request duration
  chunk?: number          // For chunked responses
  rateLimiting?: {
    remaining: number
    reset: number
  }
}
```

### Serialization

Two modes:
1. **JSON**: Human-readable, uses `rpcJSONReplacer/Receiver` for special types
2. **Binary**: msgpack via `Packr` with `structuredClone: true`

### Storage Interface

```typescript
interface Storage {
  findAll<T extends Doc>(
    _class: Ref<Class<T>>,
    query: DocumentQuery<T>,
    options?: FindOptions<T>
  ): Promise<FindResult<T>>

  tx(tx: Tx): Promise<TxResult>
}
```

### Query Operations

```typescript
interface DocumentQuery<T> {
  // Field selectors
  $in?: T[]
  $nin?: T[]
  $ne?: T
  $exists?: boolean

  // Numeric comparisons
  $gt?: number
  $gte?: number
  $lt?: number
  $lte?: number

  // String matching
  $like?: string
  $regex?: string

  // Array operations
  $all?: T[]

  // Full-text
  $search?: string
}

interface FindOptions<T> {
  sort?: SortingQuery<T>
  limit?: number
  skip?: number
  projection?: Projection<T>
  lookup?: Lookup<T>
}
```

### Session Management

```typescript
interface Session {
  findAll: Storage['findAll']
  searchFulltext: (query) => Promise<SearchResult>
  tx: (tx: Tx) => Promise<TxResult>
}

// Rate limits (default)
// Standard users: 1500 requests / 30 seconds
// System accounts: 5000 requests / 30 seconds
```

## 6. Key Files/Modules

### Core Package (`foundations/core/packages/core/`)

| File | Purpose |
|------|---------|
| `src/classes.ts` | Doc, Space, AttachedDoc, Permission types |
| `src/tx.ts` | Transaction types (TxCreateDoc, TxUpdateDoc, etc.) |
| `src/storage.ts` | Storage interface, query types |
| `src/hierarchy.ts` | Class hierarchy management |
| `src/operations.ts` | TxOperations high-level API |
| `src/client.ts` | Client interface definition |

### Server Core (`foundations/server/packages/`)

| Package | Purpose |
|---------|---------|
| `server/` | Session manager, server starter |
| `core/` | Pipeline, types, storage adapters |
| `middleware/` | ~31 middleware implementations |
| `mongo/` | MongoDB adapter |
| `postgres/` | PostgreSQL adapter |
| `elastic/` | Elasticsearch integration |

### API Client (`foundations/core/packages/api-client/`)

| File | Purpose |
|------|---------|
| `src/client.ts` | PlatformClient implementation |
| `src/socket/` | WebSocket clients (browser/node) |
| `src/rest/` | REST API client |
| `src/config.ts` | Server config loading |

### Account Service (`server/account/`)

| File | Purpose |
|------|---------|
| `src/operations.ts` | Login, signup, workspace management |
| `src/types.ts` | Account, LoginInfo, Token types |

### Server Pipeline (`server/server-pipeline/`)

| File | Purpose |
|------|---------|
| `src/pipeline.ts` | Middleware stack construction |

## Summary

Huly's architecture is characterized by:

1. **Transaction-centric**: All mutations are transactions, enabling audit trails and undo
2. **Class-based polymorphism**: Mixins and inheritance for flexible data modeling
3. **Space isolation**: Documents belong to spaces with membership-based access
4. **Attached document pattern**: Parent-child relationships via `attachedTo`
5. **Middleware pipeline**: Pluggable processing layers for security, triggers, search
6. **Dual protocols**: WebSocket for real-time, REST for simple integrations
7. **Token authentication**: JWT-based with multiple auth methods
