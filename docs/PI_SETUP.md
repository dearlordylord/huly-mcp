# Pi setup

[Pi](https://github.com/earendil-works/pi) does not include an MCP client by default. Install the
[Pi MCP Adapter](https://github.com/nicobailon/pi-mcp-adapter), then configure Huly MCP as a lazy
stdio server:

Current Pi releases require Node.js 22.19 or newer. Check the runtime before installing or updating
Pi:

```bash
node --version
pi update self
```

```bash
pi install npm:pi-mcp-adapter
```

Restart Pi after installation. Put the following configuration in the user-global
`~/.config/mcp/mcp.json`. Keep real credentials out of project-local `.mcp.json` and `.pi/mcp.json`
files.

```json
{
  "mcpServers": {
    "huly": {
      "command": "npx",
      "args": ["-y", "@firfi/huly-mcp@latest"],
      "lifecycle": "lazy",
      "directTools": [
        "list_tool_categories",
        "search_tools",
        "get_tool_schema",
        "invoke_tool"
      ],
      "env": {
        "MCP_TRANSPORT": "stdio-resident",
        "HULY_URL": "https://your-huly-instance.example.com",
        "HULY_TOKEN": "your-api-token",
        "HULY_WORKSPACE": "yourworkspace",
        "HULY_TOOL_MODE": "auto"
      }
    }
  }
}
```

Use `HULY_EMAIL` and `HULY_PASSWORD` instead of `HULY_TOKEN` only when token authentication is not
available. Restrict the user-global configuration file to your account because it contains Huly
credentials.

```bash
chmod 600 ~/.config/mcp/mcp.json
```

## Why this is the recommended default

The Pi MCP Adapter normally places all MCP servers behind its shared `mcp` proxy. The per-server
`directTools` list above promotes only Huly's four discovery and invocation tools into Pi's native
tool list. Huly MCP remains responsible for searching, describing, and invoking its complete
operation catalog.

`HULY_TOOL_MODE=auto` resolves the Pi adapter's MCP client to proxy mode, so Huly MCP does not send
hundreds of native operation schemas to Pi. In addition to the four proxy tools, Huly MCP keeps its
small `get_version` and `get_huly_context` diagnostics available through the adapter's shared `mcp`
tool.

The first session after enabling `directTools` may initially show only the adapter's proxy while its
metadata cache is populated. Run `/mcp reconnect huly` if the four direct Huly tools do not appear.
If Pi fails to load the adapter with a missing `@earendil-works/pi-ai` compatibility module, update
Pi under Node.js 22.19 or newer; the installed Pi and adapter releases are out of sync.

## Pin common native tools

Pin native Huly operations when a project repeatedly uses the same domains. Change `directTools` to
`true`, then add `TOOLSETS` and optionally `TOOLS` to the Huly server environment:

```json
{
  "mcpServers": {
    "huly": {
      "command": "npx",
      "args": ["-y", "@firfi/huly-mcp@latest"],
      "lifecycle": "lazy",
      "directTools": true,
      "env": {
        "MCP_TRANSPORT": "stdio-resident",
        "HULY_URL": "https://your-huly-instance.example.com",
        "HULY_TOKEN": "your-api-token",
        "HULY_WORKSPACE": "yourworkspace",
        "HULY_TOOL_MODE": "auto",
        "TOOLSETS": "issues,projects,search",
        "TOOLS": "list_documents,create_document"
      }
    }
  }
}
```

With the default `PROXY_OUTPUT_STRICT=false`, these operations become first-class Pi tools while the
rest of Huly remains discoverable through `search_tools` and callable through `invoke_tool`. Set
`PROXY_OUTPUT_STRICT=true` only when `TOOLSETS` and `TOOLS` should be a hard allow-list for both
native exposure and proxy invocation.

Use `TOOLSETS` for categories and `TOOLS` for exact operation names. The complete category list is
in the main [Huly MCP README](../README.md#proxy-meta-tools).

## Verify the setup

1. Run `/mcp reconnect huly` in Pi.
2. Ask Pi to call Huly MCP's `get_huly_context` through the MCP adapter.
3. Confirm that `toolExposure.configuredMode` is `auto`, `resolvedMode` is `proxy`, and
   `proxyToolNames` contains the four `directTools` configured above.
4. Ask Pi to search for an operation such as "list open issues", inspect its schema, and invoke it.
5. Confirm that no credentials appear in the tool result or Pi transcript.

Use `/mcp` to inspect adapter status. After changing MCP configuration, run `/reload` or start a new
Pi session so its registered tool surface is refreshed.

## Verified adapter behavior

This setup was exercised end to end with Pi 0.84.1, Pi MCP Adapter 2.21.2, Node.js 24, and a local
Huly workspace. With `directTools: true`, `TOOLSETS=projects`, `TOOLS=list_documents`, and
`PROXY_OUTPUT_STRICT=false`, Pi registered the proxy tools plus the pinned project and document
operations with the `huly_` prefix. Pi then completed the intended `search_tools` →
`get_tool_schema` → `invoke_tool` flow against local Huly for an operation outside the pinned set.

The adapter's MCP initialization identified itself as `clientInfo.name=pi-mcp-huly` with
`clientInfo.version=1.0.0`. The corresponding `get_huly_context` result reported
`configuredMode=auto`, `resolvedMode=proxy`, `clientKind=unknown`, and the four proxy tool names
`list_tool_categories`, `search_tools`, `get_tool_schema`, and `invoke_tool`. The unknown client
classification is expected: auto mode deliberately defaults unrecognized MCP bridges to the small
proxy surface.

With `PROXY_OUTPUT_STRICT=false`, the cached server surface contained 15 tools. Pi exposed all 15
with the `huly_` prefix plus two cached project-resource readers, for 17 first-class registrations:
the two diagnostics, the four proxy tools, the eight `projects` operations (`list_projects`,
`get_project`, `list_statuses`, `create_project`, `update_project`, `delete_project`,
`list_project_target_preferences`, and `upsert_project_target_preference`), `list_documents`, and the
observed `huly_read_game` and `huly_read_huly` project-resource readers. Resource-reader names vary
with workspace project identifiers. The adapter refresh message was
`MCP: direct tools refreshed (+17, ~0, -0)`.

Repeating the same test with `PROXY_OUTPUT_STRICT=true` produced a nine-operation proxy allow-list:
the eight `projects` operations plus `list_documents`. Strict mode intentionally omitted those nine
native operations from the MCP-advertised direct surface. Pi therefore registered exactly eight
first-class tools: `huly_get_version`, `huly_get_huly_context`, `huly_list_tool_categories`,
`huly_search_tools`, `huly_get_tool_schema`, `huly_invoke_tool`, and the two cached project-resource
readers (`huly_read_game` and `huly_read_huly` in the observed workspace). A search for “list issues”
returned only allowed project/document candidates, while schema
lookup and invocation of `list_issues` both returned `Unknown tool`.

These observations confirm that strict mode keeps the configured operations callable through the
proxy rather than promoting them as native tools, and that `/reload` is the reliable recovery step
when configuration changes alter Pi's direct-tool surface. Reconnect remains appropriate for
reconnecting a server without changing its configuration.
