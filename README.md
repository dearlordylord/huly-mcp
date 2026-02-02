# @firfi/huly-mcp

[![npm](https://img.shields.io/npm/v/@firfi/huly-mcp)](https://www.npmjs.com/package/@firfi/huly-mcp)

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
| `HULY_EMAIL` | Yes | Account email |
| `HULY_PASSWORD` | Yes | Account password |
| `HULY_WORKSPACE` | Yes | Workspace identifier |
| `HULY_CONNECTION_TIMEOUT` | No | Connection timeout in ms (default: 30000) |
| `MCP_TRANSPORT` | No | Transport type: `stdio` (default) or `http` |
| `MCP_HTTP_PORT` | No | HTTP server port (default: 3000) |
| `MCP_HTTP_HOST` | No | HTTP server host (default: 127.0.0.1) |
