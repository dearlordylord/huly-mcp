---
"@firfi/huly-mcp": patch
"@firfi/huly-cli": patch
---

Resolve collaborative-content endpoints from workspace selection when provided, retaining the global Huly configuration fallback. This enables connection and document operations on Intabia deployments that omit COLLABORATOR_URL and returns a typed error for invalid endpoint discovery.
