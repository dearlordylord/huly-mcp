# @firfi/huly-mcp

MCP server for Huly integration with Claude Code.

## Installation

### Claude Code CLI

```bash
claude mcp add huly \
  -e HULY_URL=https://huly.app \
  -e HULY_EMAIL=your@email.com \
  -e HULY_PASSWORD=yourpassword \
  -e HULY_WORKSPACE=yourworkspace \
  -- npx @firfi/huly-mcp
```

### JSON Config

Add to `~/.claude.json` or `.mcp.json`:

```json
{
  "mcpServers": {
    "huly": {
      "command": "npx",
      "args": ["@firfi/huly-mcp"],
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

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `HULY_URL` | Yes | Huly instance URL |
| `HULY_EMAIL` | Yes | Account email |
| `HULY_PASSWORD` | Yes | Account password |
| `HULY_WORKSPACE` | Yes | Workspace identifier |
| `HULY_CONNECTION_TIMEOUT` | No | Connection timeout in ms (default: 30000) |

## Verify

```bash
claude mcp list
# or inside Claude Code:
/mcp
```
