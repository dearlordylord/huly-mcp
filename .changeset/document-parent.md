---
"@firfi/huly-mcp": minor
"@firfi/huly-cli": minor
---

`list_documents` and `get_document` (CLI `documents list` and `documents get`) now return `parent`: the parent document ID, or `null` for a document at the teamspace root. Agents can see the document tree without extra calls, and pass the ID straight to `move_document`.
