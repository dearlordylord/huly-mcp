---
"@firfi/huly-mcp": minor
---

Add native Huly reference round-tripping for document content. Markdown links to current-workspace Huly browse URLs now write as native references through `create_document` and `edit_document`, then read back through `get_document` content as normal markdown links while external URLs remain normal links.
