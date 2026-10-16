---
"@firfi/huly-mcp": patch
"@firfi/huly-cli": patch
---

Separate tool discovery from lazy handler loading, prewarm the stdio Huly model in the background, and list projects without waiting for the full model. Share initialization across concurrent callers and safely release clients that finish loading after shutdown.
