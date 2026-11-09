---
"@firfi/huly-mcp": minor
"@firfi/huly-cli": minor
---

Add `move_document` (CLI `documents move`) to move a document, with its children, under another parent document in the same teamspace, or to the teamspace root with `parent: null`. The moved document is ranked last among its new siblings. Moving to the current parent is a no-op, and moving a document under itself or one of its descendants fails with `DocumentMoveCycleError`.
