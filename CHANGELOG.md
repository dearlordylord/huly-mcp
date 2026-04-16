# @firfi/huly-mcp

## 0.6.3

### Patch Changes

- dbd3aea: Fix assignee resolution for workspace members whose email exists only as a SocialIdentity by moving the lookup into the shared person resolver and prioritizing it ahead of Channel-based lookups.

## 0.6.2

### Patch Changes

- Fix assignee resolution for workspace members whose email exists only as a SocialIdentity (no Channel doc). Adds SocialIdentity email lookup as the first step in findPersonByEmailOrName, benefiting all person-resolving operations.

## 0.6.1

### Patch Changes

- Fix local-release script to rebuild dist before publish, preventing stale version string in bundle

## 0.6.0

### Minor Changes

- ef56789: Add custom fields support with auto-discovery: `list_custom_fields`, `get_custom_field_values`, and `set_custom_field`. The server now discovers field definitions from Huly's Attribute system without manual configuration and supports Cards, Issues, and other classes with custom fields.

  Harden typed outputs for the new custom-fields, issue-relations, time, and workspace tool surfaces. These tools now validate and encode their MCP responses through Effect schemas at the boundary so branded internal domain values are converted to stable wire output and invalid result shapes fail fast instead of leaking through the transport layer.

## 0.5.4

### Patch Changes

- chore: add pre-publish version string verification to prevent stale dist

## 0.5.3

### Patch Changes

- fix: bake correct version string into published dist

## 0.5.2

### Patch Changes

- fix: add uploadMarkup for milestone collaborative documents (#18), consistent guard and dual-write comment

## 0.5.1

### Patch Changes

- 335a5fa: Fix Markup conversion for issue templates and milestones — descriptions now render markdown formatting correctly in Huly UI. Extract shared markup conversion helpers into dedicated module.
- 3fb294d: fix: consistent uploadMarkup guard and dual-write comment for milestone descriptions

## 0.5.0

### Minor Changes

- 81c6ab2: Add custom fields support with auto-discovery: list_custom_fields, get_custom_field_values, set_custom_field tools. Auto-discovers field definitions from Huly's Attribute system without manual configuration. Works for Cards, Issues, and any class with custom fields.

## 0.4.0

### Minor Changes

- d81267c: feat: add dueDate and estimation support for issue creation and updates

## 0.3.2

### Patch Changes

- fix: move bundled dependencies to devDependencies to fix npx install

## 0.3.1

### Patch Changes

- Pin @hcengineering/\* dependencies to exact versions to avoid broken 0.7.382 release with unresolved workspace: protocol

## 0.3.0

### Minor Changes

- feat: add get_version tool returning current and latest npm version

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
