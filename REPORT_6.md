# Huly MCP and API Client Implementations Report

## Executive Summary

This report documents Huly MCP servers and API client implementations found beyond the already-covered projects (@zubeidhendricks/huly-mcp-server, hha-nguyen/huly-mcp-server, oculairmedia/huly-vibe-sync, @firfi/huly-mcp).

---

## 1. Official Huly API Packages

### @hcengineering/api-client

**URL:** https://github.com/hcengineering/huly.core

**API Approach:**
- **Dual protocol support**: WebSocket AND REST
- TypeScript client library
- Part of official Huly monorepo

**Key Packages in huly.core:**
| Package | Purpose |
|---------|---------|
| `@hcengineering/core` | Core data models, types |
| `@hcengineering/platform` | Plugin system, dependency injection |
| `@hcengineering/client` | Client-side data sync |
| `@hcengineering/api-client` | WebSocket + REST API client |
| `@hcengineering/account-client` | Account management |
| `@hcengineering/collaborator-client` | Real-time collaboration |
| `@hcengineering/hulylake-client` | Data warehouse access |

**Key Techniques:**
- Typed interfaces for all operations
- Framework-agnostic design
- Modular package structure
- GitHub Packages distribution (requires PAT for npm install)

**Installation:**
```bash
npm install @hcengineering/api-client@0.7.252
```

---

## 2. Activepieces Huly MCP Integration

**URL:** https://github.com/activepieces/activepieces/issues/7491

**Status:** Open issue (#7491) with PR #7505 pending

**API Approach:**
- WebSocket-only (no REST)
- JSON-RPC 2.0 protocol via MCP
- Bridge between AI assistants and Huly WebSocket APIs

**Proposed Features (8 actions, 4 triggers):**
- Find/Create Person
- Find/Create Project
- Find/Create Issue
- Find/Create Document
- Find/Create Milestone
- Triggers for each entity type

**Key Technique:**
- All Activepieces pieces become auto-available as MCP servers
- Usable with Claude Desktop, Cursor, Windsurf
- 280+ pieces available as MCPs

**Bounty:** $200 (good first issue)

---

## 3. Foundation Fork (haiodo/foundation)

**URL:** https://github.com/haiodo/foundation

**Description:** Fork of Huly Platform by original authors

**API Approach:**
- API compatibility with Platform on initial steps
- May introduce minimal changes for stability
- API packages "ready soon" (under development)

**Key Differences from Huly:**
- Focus on Tracker stability
- New experimental packages: `foundations/hulylake`, `packages/audio-dsp`
- Updated Docker/build scripts
- Removed legacy plugins

**Key Technique:**
- Same tech stack (Node.js v20.11.0, Rush monorepo)
- Self-hosting and API client docs forthcoming

---

## 4. Huly Examples Repository

**URL:** https://github.com/hcengineering/huly-examples

**API Approach:**
- Official examples for Huly API usage
- Two authentication methods:
  1. Email/password credentials
  2. Token-based

**Example Connection:**
```typescript
// Email/password
const client = await connect('http://localhost:8087', {
  email: 'user1',
  password: '1234',
  workspace: 'ws1'
})

// Token
const client = await connect('http://localhost:8087', {
  token: '...',
  workspace: 'ws1'
})
```

**Key Techniques:**
- CRUD operations on issues
- Person/contact handling
- Document operations

---

## 5. Huly Server Backend (hcengineering/huly.server)

**URL:** https://github.com/hcengineering/huly.server

**Description:** Server-side packages extracted from Huly Platform

**Backend Components:**
| Package | Function |
|---------|----------|
| `@hcengineering/server-core` | Core server infrastructure |
| `@hcengineering/server-storage` | Storage abstraction |
| `@hcengineering/minio` | MinIO storage provider |
| `@hcengineering/s3` | AWS S3 compatible storage |
| `@hcengineering/kafka` | Apache Kafka integration |
| `@hcengineering/collaboration` | Real-time collab infrastructure |

**Key Technique:**
- Database adapters: MongoDB, PostgreSQL, Elasticsearch
- Modular, scalable, production-ready

---

## 6. MCP Directory Listings

### Glama.ai

**URL:** https://glama.ai/mcp/servers/@hha-nguyen/huly-mcp-server

**Listed:** Yes (hha-nguyen implementation)

**API Endpoint:**
```bash
curl -X GET 'https://glama.ai/api/mcp/v1/servers/hha-nguyen/huly-mcp-server'
```

### awesome-mcp-servers (punkpeye, wong2, appcypher)

**Status:** No Huly servers listed

### PulseMCP.com

**Status:** No Huly servers found (searched 7,800+ servers)

### MCP.so

**Status:** 404 - Project not found

### MCPMarket.com

**Status:** No specific Huly listing found

### Smithery.ai

**Status:** No Huly server found

---

## 7. GitHub Topic: huly

**URL:** https://github.com/topics/huly

**Repositories (5 total):**

1. **haiodo/foundation** - Fork by original authors (covered above)
2. **Sahilmd01/GenAxis** - AI app inspired by Huly.io design (not API-related)
3. **vuongthai91/huly-caddy** - Self-hosted deployment with Caddy/Coolify
4. **Developer-Zahid/Huly-Animated-Gradient-Glow-Border** - CSS demo (not relevant)
5. **oculairmedia/huly-vibe-sync** - MCP sync service (already covered)

---

## 8. Native Integrations

### GitHub Integration

**URL:** https://docs.huly.io/integrations/github/

**Features:**
- Two-way sync with GitHub repositories
- PRs appear in Huly Tracker
- Bi-directional comment sync
- Sprint creation from GitHub issues

### Telegram Bot

- Notification channel (one-way: Huly -> Telegram)
- No interactive control

---

## 9. External Automation Platforms

### n8n

**Status:** No native Huly integration
**Workaround:** HTTP Request nodes can call Huly API

### Elest.io

**URL:** https://elest.io/open-source/huly

**Offering:** Managed Huly hosting with potential for n8n integration

---

## Key Findings

### API Approaches Used:

| Project | WebSocket | REST | MCP |
|---------|-----------|------|-----|
| @hcengineering/api-client | Yes | Yes | No |
| Activepieces integration | Yes | No | Yes |
| hha-nguyen server | Yes | No | Yes (stdio) |
| Foundation fork | TBD | TBD | No |
| huly-vibe-sync | Yes | Yes | Yes |

### Common Techniques:

1. **WebSocket-first** - Huly's native protocol
2. **JSON-RPC 2.0** - Standard for MCP implementations
3. **Auto-resolve IDs** - Converting project names to space IDs
4. **Task type queries** - Getting correct kind IDs per project
5. **Typed interfaces** - TypeScript throughout

### Gaps Identified:

1. No Python SDK for Huly
2. No listing in major MCP directories (except Glama)
3. Activepieces integration still pending merge
4. Foundation fork API not yet released

---

## Sources

- https://github.com/hcengineering/huly.core
- https://github.com/hcengineering/huly-examples
- https://github.com/hcengineering/huly.server
- https://github.com/activepieces/activepieces/issues/7491
- https://github.com/activepieces/activepieces/pull/7505
- https://github.com/haiodo/foundation
- https://github.com/topics/huly
- https://glama.ai/mcp/servers/@hha-nguyen/huly-mcp-server
- https://docs.huly.io/getting-started/api-tools/
- https://docs.huly.io/integrations/github/
