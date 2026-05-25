# Smithery Hosted URL Publish

Use this example when publishing an already-hosted HTTP MCP endpoint to Smithery. The server endpoint must be configured with `MCP_TRANSPORT=http`.

```bash
smithery mcp publish "https://your-server.example/mcp" \
  -n "@your-org/huly-mcp" \
  --config-schema '{
    "type": "object",
    "required": ["hulyUrl", "hulyWorkspace", "hulyToken"],
    "properties": {
      "hulyUrl": {
        "type": "string",
        "title": "Huly URL",
        "description": "Base URL for the Huly instance, such as https://huly.app.",
        "x-from": { "header": "x-huly-url" }
      },
      "hulyWorkspace": {
        "type": "string",
        "title": "Workspace",
        "description": "Huly workspace identifier.",
        "x-from": { "header": "x-huly-workspace" }
      },
      "hulyToken": {
        "type": "string",
        "title": "API token",
        "description": "Huly API token.",
        "x-from": { "header": "x-huly-token" }
      },
      "hulyConnectionTimeout": {
        "type": "number",
        "title": "Connection timeout",
        "description": "Maximum Huly connection wait time in milliseconds.",
        "default": 30000,
        "x-from": { "header": "x-huly-connection-timeout" }
      }
    }
  }'
```
