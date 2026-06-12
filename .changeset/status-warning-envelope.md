---
"@firfi/huly-mcp": minor
---

Add model-backed workflow status metadata fallback for workspaces where Huly status document lookups fail or return incomplete data. Affected project, issue, task-management, lead, and resource reads now try local model status metadata before degrading to ref-derived status names.

When fallback metadata is still incomplete, surface explicit agent-visible MCP warnings instead of silently returning degraded status names/categories. Error envelopes remain schema-valid by omitting `structuredContent`, while successful degraded results include warnings in the documented warning channel.
