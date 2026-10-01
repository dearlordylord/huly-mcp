---
"@firfi/huly-mcp": minor
"@firfi/huly-cli": minor
---

Share saved local profiles between CLI and explicitly configured stdio MCP. Add CLI `--profile` / `HULY_PROFILE` selection, bind saved tokens to their login destination, and reject incomplete or conflicting credential overrides before forwarding secrets. Existing unbound tokens require another login; file defaults and environment-only/HTTP configuration remain supported.
