# TraceX MCP status

Checked 2026-09-13, after pushing README commit `3fe93934`.

**Yes: TraceX maintains a public MCP server implementation.** Its repository contains a [TraceX MCP Service README](https://github.com/TraceX-dev/TraceX/blob/develop/services/mcp/pod-mcp/README.md), Docker build instructions, and client configuration. This is a server exposing workspace operations, not merely an AI assistant consuming external MCP tools.

The service provides Streamable HTTP at `/mcp` (documented local port 4020), requires a workspace bearer token, and scopes access to that token. Its [implementation](https://github.com/TraceX-dev/TraceX/blob/develop/services/mcp/pod-mcp/src/server.ts) identifies itself as `tracex-mcp` version `0.1.0` and registers the shared AI tool catalog using the official MCP SDK v2.

The current [tool catalog](https://github.com/TraceX-dev/TraceX/blob/develop/services/ai-bot/ai-tools/src/index.ts) registers 13 tools, counted from its four exported arrays:

- [Cards](https://github.com/TraceX-dev/TraceX/blob/develop/services/ai-bot/ai-tools/src/tools/card/index.ts): seven tools for spaces, card types, retrieval, search, creation, and updates.
- [Fulltext](https://github.com/TraceX-dev/TraceX/blob/develop/services/ai-bot/ai-tools/src/tools/fulltext/index.ts): one search tool.
- [Objects](https://github.com/TraceX-dev/TraceX/blob/develop/services/ai-bot/ai-tools/src/tools/object/index.ts): one lookup tool.
- [Current user/workspace](https://github.com/TraceX-dev/TraceX/blob/develop/services/ai-bot/ai-tools/src/tools/me/index.ts): four account, workspace, inbox, and mark-inbox-read tools.

The package names TraceX as its author and defines the Docker image build target `tracexapp/mcp` in [package.json](https://github.com/TraceX-dev/TraceX/blob/develop/services/mcp/pod-mcp/package.json). These are confirmed source and deployment instructions; this check did not verify a publicly hosted MCP endpoint or a published container tag.

The [marketing website](https://tracex.co/) emphasizes its general API, and the [AI page](https://tracex.co/ai) describes Hulia. Searching those pages alone missed the concrete MCP implementation. Repository files were fetched through the live GitHub API because the browser index did not have the MCP README cached.
