# Huly Official API Client Research Report

## 1. Client Initialization

### Package
```
@hcengineering/api-client (version 0.7.18)
```

### Two Connection Methods

**WebSocket Client** (persistent connection):
```typescript
import { connect, ConnectOptions, NodeWebSocketFactory } from '@hcengineering/api-client'

const url = 'https://huly.app'  // or 'http://localhost:8087' for local
const options: ConnectOptions = {
  email: 'user@example.com',
  password: 'password',
  workspace: 'workspace-name',
  socketFactory: NodeWebSocketFactory,  // Required for Node.js
  connectionTimeout: 30000
}

const client = await connect(url, options)
// ... use client
await client.close()
```

**REST Client** (HTTP requests):
```typescript
import { connectRest } from '@hcengineering/api-client'

const client = await connectRest('https://huly.app', {
  email: 'user@example.com',
  password: 'password',
  workspace: 'workspace-name'
})
```

### Authentication Options

1. **Email/Password**:
   ```typescript
   { email: string, password: string, workspace: string }
   ```

2. **Token**:
   ```typescript
   { token: string, workspace: string }
   ```

### Environment Variables (from examples)
```bash
HULY_URL=http://localhost:8087
HULY_EMAIL=user1
HULY_PASSWORD=1234
HULY_WORKSPACE=ws1
```

---

## 2. API Methods

### PlatformClient Interface

```typescript
interface PlatformClient {
  // Hierarchy & Model
  getHierarchy(): Hierarchy
  getModel(): ModelDb
  getAccount(): Account

  // Find Operations
  findOne<T>(class_, query, options?): Promise<T | undefined>
  findAll<T>(class_, query, options?): Promise<FindResult<T>>

  // Document Operations
  createDoc<T>(class_, space, attributes, id?): Promise<Ref<T>>
  updateDoc<T>(class_, space, objectId, operations, retrieve?): Promise<TxResult>
  removeDoc<T>(class_, space, objectId): Promise<TxResult>

  // Collection Operations
  addCollection<T, P>(class_, space, attachedTo, attachedToClass, collection, attributes, id?): Promise<Ref<P>>
  updateCollection<T, P>(class_, space, objectId, attachedTo, attachedToClass, collection, operations, retrieve?): Promise<Ref<T>>
  removeCollection<T, P>(class_, space, objectId, attachedTo, attachedToClass, collection): Promise<Ref<T>>

  // Mixin Operations
  createMixin<D, M>(objectId, objectClass, objectSpace, mixin, attributes): Promise<TxResult>
  updateMixin<D, M>(objectId, objectClass, objectSpace, mixin, operations): Promise<TxResult>

  // Markup Operations
  fetchMarkup(objectClass, objectId, objectAttr, markup, format): Promise<string>
  uploadMarkup(objectClass, objectId, objectAttr, markup, format): Promise<MarkupRef>

  // Lifecycle
  close(): Promise<void>
}
```

### Find Options
```typescript
{
  limit?: number
  sort?: { [field]: SortingOrder }
  lookup?: { [field]: Class }
  projection?: { [field]: 1 | 0 }
  total?: boolean
}
```

---

## 3. Data Models (Types/Classes)

### Domain Packages

| Package | Purpose |
|---------|---------|
| `@hcengineering/core` | Base types: `Doc`, `Ref`, `Space`, `generateId`, `SortingOrder` |
| `@hcengineering/tracker` | Issues, Projects, Milestones, Components |
| `@hcengineering/contact` | Persons, Channels, Organizations |
| `@hcengineering/document` | Documents, Teamspaces |
| `@hcengineering/tags` | Labels (TagElement, TagReference) |
| `@hcengineering/task` | Task types, ProjectTypes |
| `@hcengineering/rank` | Ordering utilities (`makeRank`) |

### Core Types

```typescript
// From @hcengineering/core
type Ref<T> = string & { __ref: T }
interface Doc {
  _id: Ref<Doc>
  _class: Ref<Class<Doc>>
  space: Ref<Space>
  modifiedOn: number
  modifiedBy: Ref<Account>
}

// ID generation
import { generateId } from '@hcengineering/core'
const id: Ref<Issue> = generateId()
```

### Tracker Types

```typescript
import tracker, { Issue, IssuePriority, Milestone, MilestoneStatus } from '@hcengineering/tracker'

// Classes
tracker.class.Project
tracker.class.Issue
tracker.class.Milestone
tracker.class.Component

// Statuses
tracker.status.Done
tracker.status.Canceled

// Task types
tracker.taskTypes.Issue

// Priority enum
IssuePriority.NoPriority
IssuePriority.Urgent
IssuePriority.High
IssuePriority.Medium
IssuePriority.Low
```

### Contact Types

```typescript
import contact, { Person, AvatarType } from '@hcengineering/contact'

// Classes
contact.class.Person
contact.class.Channel
contact.class.Organization

// Spaces
contact.space.Contacts

// Channel providers
contact.channelProvider.Email
contact.channelProvider.Phone
```

### Document Types

```typescript
import document, { Document } from '@hcengineering/document'

// Classes
document.class.Document
document.class.Teamspace

// Special IDs
document.ids.NoParent

// Space types
document.spaceType.DefaultTeamspaceType
```

---

## 4. Usage Patterns (CRUD)

### CREATE

**Create Document**:
```typescript
const id = await client.createDoc(
  contact.class.Person,
  contact.space.Contacts,
  {
    name: 'Doe,John',
    city: 'New York',
    avatarType: AvatarType.COLOR
  },
  generateId()  // optional pre-generated ID
)
```

**Create with Collection (attached docs)**:
```typescript
await client.addCollection(
  tracker.class.Issue,
  project._id,           // space
  project._id,           // attachedTo
  project._class,        // attachedToClass
  'issues',              // collection name
  { title: 'Issue title', ... },
  issueId
)
```

### READ

**Find One**:
```typescript
const project = await client.findOne(
  tracker.class.Project,
  { identifier: 'HULY' },
  { lookup: { type: task.class.ProjectType } }
)
```

**Find All**:
```typescript
const issues = await client.findAll(
  tracker.class.Issue,
  { space: project._id },
  {
    limit: 20,
    sort: { modifiedOn: SortingOrder.Descending }
  }
)
```

**Query with $nin**:
```typescript
const openIssues = await client.findAll(tracker.class.Issue, {
  space: project._id,
  status: { $nin: [tracker.status.Done, tracker.status.Canceled] }
})
```

### UPDATE

**Update Document**:
```typescript
await client.updateDoc(
  tracker.class.Issue,
  project._id,
  issue._id,
  { milestone: milestoneId, dueDate: targetDate }
)
```

**Atomic Increment**:
```typescript
const incResult = await client.updateDoc(
  tracker.class.Project,
  core.space.Space,
  project._id,
  { $inc: { sequence: 1 } },
  true  // retrieve updated doc
)
const newSequence = (incResult as any).object.sequence
```

### DELETE

```typescript
await client.removeDoc(
  contact.class.Person,
  contact.space.Contacts,
  personId
)
```

---

## 5. Code Examples from huly-examples

### Issue Creation (Full Example)

```typescript
import { ConnectOptions, NodeWebSocketFactory, connect } from '@hcengineering/api-client'
import core, { type Ref, SortingOrder, generateId } from '@hcengineering/core'
import { makeRank } from '@hcengineering/rank'
import tracker, { type Issue, IssuePriority } from '@hcengineering/tracker'

async function createIssue() {
  const client = await connect(url, options)
  try {
    // 1. Find project
    const project = await client.findOne(tracker.class.Project, { identifier: 'HULY' })

    // 2. Generate ID
    const issueId: Ref<Issue> = generateId()

    // 3. Get next sequence number
    const incResult = await client.updateDoc(
      tracker.class.Project, core.space.Space, project._id,
      { $inc: { sequence: 1 } }, true
    )
    const sequence = (incResult as any).object.sequence

    // 4. Get rank for ordering
    const lastOne = await client.findOne<Issue>(
      tracker.class.Issue,
      { space: project._id },
      { sort: { rank: SortingOrder.Descending } }
    )

    // 5. Upload markdown content
    const description = await client.uploadMarkup(
      tracker.class.Issue, issueId, 'description',
      '# Title\nContent here', 'markdown'
    )

    // 6. Create issue
    await client.addCollection(
      tracker.class.Issue,
      project._id, project._id, project._class, 'issues',
      {
        title: 'Make coffee',
        description,
        status: project.defaultIssueStatus,
        number: sequence,
        kind: tracker.taskTypes.Issue,
        identifier: `${project.identifier}-${sequence}`,
        priority: IssuePriority.Urgent,
        assignee: null,
        component: null,
        estimation: 0,
        remainingTime: 0,
        reportedTime: 0,
        reports: 0,
        subIssues: 0,
        parents: [],
        childInfo: [],
        dueDate: null,
        rank: makeRank(lastOne?.rank, undefined)
      },
      issueId
    )
  } finally {
    await client.close()
  }
}
```

### Document Creation

```typescript
import document, { Document } from '@hcengineering/document'
import { makeRank } from '@hcengineering/rank'

async function createDocument() {
  const client = await connect(url, options)
  try {
    const teamspace = await client.findOne(document.class.Teamspace, {
      name: 'My Documents',
      archived: false
    })

    const lastOne = await client.findOne<Document>(
      document.class.Document,
      { space: teamspace._id },
      { sort: { rank: SortingOrder.Descending } }
    )

    const documentId: Ref<Document> = generateId()
    const content = await client.uploadMarkup(
      document.class.Document, documentId, 'content',
      '# Title\nContent', 'markdown'
    )

    await client.createDoc(
      document.class.Document,
      teamspace._id,
      {
        title: 'My Document',
        content,
        parent: document.ids.NoParent,
        rank: makeRank(lastOne?.rank, undefined)
      },
      documentId
    )
  } finally {
    await client.close()
  }
}
```

### Person with Email Channel

```typescript
import contact, { Person, AvatarType } from '@hcengineering/contact'

async function createPerson() {
  const client = await connect(url, options)
  try {
    const personId = generateId<Person>()

    await client.createDoc(
      contact.class.Person,
      contact.space.Contacts,
      {
        name: 'Doe,John',  // Note: "LastName,FirstName" format
        city: 'New York',
        avatarType: AvatarType.COLOR
      },
      personId
    )

    await client.addCollection(
      contact.class.Channel,
      contact.space.Contacts,
      personId,
      contact.class.Person,
      'channels',
      {
        provider: contact.channelProvider.Email,
        value: 'john.doe@example.com'
      }
    )
  } finally {
    await client.close()
  }
}
```

### Labels on Issues

```typescript
import tags, { type TagElement } from '@hcengineering/tags'

// Create label
const labelId: Ref<TagElement> = generateId()
await client.createDoc(
  tags.class.TagElement,
  core.space.Workspace,
  {
    title: 'bug',
    description: '',
    targetClass: tracker.class.Issue,
    color: 11,
    category: tracker.category.Other
  },
  labelId
)

// Assign label to issue
await client.addCollection(
  tags.class.TagReference,
  project._id,
  issueId,
  tracker.class.Issue,
  'labels',
  { title: 'bug', color: 11, tag: labelId }
)
```

---

## Key Observations

1. **Workspace-centric**: All operations happen within a workspace context
2. **Class-based queries**: Every find/create uses class references like `tracker.class.Issue`
3. **Spaces**: Documents belong to spaces (Projects, Teamspaces, etc.)
4. **Collections**: Child documents use `addCollection` pattern (issues->project, channels->person)
5. **Ranking**: Use `makeRank()` from `@hcengineering/rank` for ordering
6. **Sequence numbers**: Manually increment with `$inc` and retrieve
7. **Markup**: Rich text stored via `uploadMarkup`/`fetchMarkup` with 'markdown' format
8. **ID generation**: Use `generateId<Type>()` before creation for references

## Sources

- GitHub: https://github.com/hcengineering/huly-examples/tree/main/platform-api
- Package: https://www.npmjs.com/package/@hcengineering/api-client
- Source: https://github.com/hcengineering/huly.core/tree/main/packages/api-client
