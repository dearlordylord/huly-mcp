# Smithery Hosted URL Publish

Use this example when publishing an already-hosted HTTP MCP endpoint to Smithery. The server endpoint must be configured with `MCP_TRANSPORT=http`.

Public hosted endpoints should put authentication in front of `/mcp`. To use the built-in shared-secret option, configure `MCP_AUTH_TOKEN` as a server-side deployment secret and configure the MCP client or gateway to send `Authorization: Bearer <MCP_AUTH_TOKEN>`.

`MCP_AUTH_TOKEN` protects only the MCP HTTP endpoint. It is separate from Huly credentials: `HULY_TOKEN` and the hosted `x-huly-token` header still authenticate this MCP server to Huly and do not replace the MCP endpoint bearer token.

```bash
smithery mcp publish "https://your-server.example/mcp" \
  -n "@your-org/huly-mcp" \
  --config-schema docs/smithery-url-config.schema.json
```
