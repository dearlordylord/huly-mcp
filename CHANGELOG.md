# @firfi/huly-mcp

## 0.2.0

### Minor Changes

- Add link_document_to_issue and unlink_document_from_issue tools for associating documents with tracker issues. Enhance list_issue_relations to return linked documents with resolved titles and teamspace names.

## 0.1.62

### Patch Changes

- feat: add `list_statuses` and `list_inline_comments` tools

  - `list_statuses`: returns project statuses with isDone, isCanceled, isDefault flags — useful for LLMs to pick valid statuses when creating/updating issues
  - `list_inline_comments`: extracts inline comment threads from document markup with optional thread reply fetching including sender names

## 0.1.61

### Patch Changes

- Remove unnecessary browser polyfills (fake-indexeddb, window, navigator) — all @hcengineering packages guard these with typeof checks. The window mock was actively harmful, defeating browser-detection guards.

## 0.1.60

### Patch Changes

- chore: bump tsconfig lib to ES2023, ban type assertions, add review rules

## 0.1.59

### Patch Changes

- lint: ban Date.now() and new Date(), use Effect Clock.currentTimeMillis

## 0.1.58

### Patch Changes

- ac18b40: chore(deps): bump @modelcontextprotocol/sdk from 1.26.0 to 1.27.1

## 0.1.57

### Patch Changes

- Add author field, format/check-format/check-all scripts, prepublishOnly safety gate, and init changesets for versioning
