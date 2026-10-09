---
"@firfi/huly-mcp": patch
"@firfi/huly-cli": patch
---

Keep Drive listing, item retrieval, and version history usable when Huly stores an empty file-version MIME type. Preserve file size and download URLs with an application/octet-stream fallback, and record the substitution in operator diagnostics without adding agent-facing warnings.
