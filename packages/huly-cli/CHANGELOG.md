# @firfi/huly-cli

## 0.48.3

### Patch Changes

- 1136846: Allow direct issue create, update, and list assignee inputs to resolve exact agent UserProfile titles to their linked Person. Correct generated CLI pattern guidance so constraints from only one union branch are not presented as universal.

## 0.48.2

### Patch Changes

- 1533987: Complete the direct Effect 4.0.0-rc.108 cutover with certified MCP, HTTP, CLI, schema, lifecycle, package, and local-Huly parity. The supported Node.js floor is now `>=22.19.0`; releases remain reproducibly built and certified on Node 22.22.2 and 24.15.0. No MCP wire or CLI command contract changes are intended. This remains a patch release because it completes the already-announced release-candidate migration while preserving those public contracts.

## 0.48.1

### Patch Changes

- 16d9cb2: Rank exact Huly class discovery matches before applying result limits, and allow generic typed-space creation when Huly's role collection counter is stale but the role and assignment metadata are consistent.

## 0.48.0

### Minor Changes

- d10dffd: Add Effect CLI authentication and profile commands, stable structured failures, terminal-aware
  catalog rendering, and a generated installable agent skill.

## 0.47.3

### Patch Changes

- c13e9f1: Make CLI help progressive and terminal-safe, and improve package discovery metadata for self-hosted Huly automation and AI-agent workflows.

## 0.47.2

### Patch Changes

- 9f20cab: Improve CLI search discovery with a dedicated website, focused usage guides, richer npm keywords, and stronger links between documentation surfaces.

## 0.47.1

### Patch Changes

- 8488ab2: Present Huly CLI as a feature-complete command-line interface with full Huly operation parity, clearer installation and automation guidance, package trust metadata, and an approachable generated command reference.

## 0.47.0

### Minor Changes

- 041b76d: Expose all 522 shared Huly operations through 522 native CLI routes with generated schema-aware help, structured and file-backed input, binary/image output, agent-visible warnings, and typed errors. Consequential actions now require `--yes`; behavior/risk coverage, generated documentation, and packed-package dependency closure are permanent release gates.

  The parity boundary is the shared Huly operation registry. JSON-RPC discovery, MCP resources/prompts, proxy discovery, MCP toolsets, and MCP multimodal envelopes remain protocol-only; the CLI provides native help, flags and ordered JSON sources, terminal/file rendering, warning output, and binary/image file output instead.

  Release evidence: `pnpm check-all` passed; the packed CLI live behavior/risk suite passed against local Huly; the full MCP suite and its packed-CLI mirror each passed the same 1,095 tests with 0 failures and 27 intentional skips; fresh tarballs installed and passed smoke tests with both pnpm and npm; and the packed 522-route CLI passed on Node 20, 22, 24, and 26.

- 7367dcc: Add human-oriented document and Planner ToDo label tools that hide raw tag target classes, object classes, spaces, and collection fields while preserving generic tag tools as the SDK-level fallback.
- a53f5e8: Discover read-only Workbench application and navigation declarations by human URL alias, including caller-scoped hidden preference state, without exposing private browser-local tabs or widget internals.
- 7a71c3e: Add read-only Huly Mail thread metadata discovery with human-resolved spaces, neutral channel titles, and bounded child subject summaries through both MCP and CLI.
- 0677da4: Add read-only support-system discovery and authenticated-account stored widget status, with explicit missing and ambiguous setup states and no provider-freshness or message-content claim.
- b51b017: Read persisted legacy Telegram contact-channel messages by exact stored value or stable Huly ID, with Markdown content and explicit model/channel unavailability while keeping sends and provider-freshness claims unsupported.

## 0.46.1

### Patch Changes

- cc387f9: Declare the Gmail plugin runtime dependency so packed CLI installations can start successfully.

## 0.46.0

### Minor Changes

- 29a2b13: Add an explicit Gmail/Telegram message compatibility assessment. Gmail reports `supported=false` because Huly does not expose the live deployment-wide writer version needed to distinguish current v1 records from stale data after a v2 upgrade; Telegram remains unsupported without a compatible published package.
- 6dfa416: Add locator-backed pinned channel and direct-message workflows, plus explicit unsupported results for channel request-access and browser-only translation.
- 3dc27ca: Add guarded Huly enum and custom-attribute model administration with name-aware resolution, reference checks, and safe hide/unhide support.
- 798c2b2: Add guarded permission definitions, typed-space role definition writes, and class collaborator metadata administration with clear-name resolution and local-Huly lifecycle coverage.
- bd19f35: Add generic workflow status and status-category CRUD tools with relationship-aware resolution and lifecycle safeguards.
- cec66fb: Add guarded Sequence and CustomSequence administration with atomic retry protection, identifier resolution, and local-Huly rollback coverage.
- a9436d0: Add metadata-gated generic typed-space creation and global space-admin discovery and replacement tools.

## 0.45.0

### Minor Changes

- e8dc993: Clarify upload source locations across file tools and add `read_attachment_content`, which returns supported images as a single MCP image block through native and proxy invocation with metadata-only structured content, bounded storage reads, redacted failures, CLI image descriptors, and a 4 MiB safety limit.
- d38cf78: Add complete card-comment CRUD with friendly card-space and card locators, compatible Huly-native comment reads, markdown native-reference preservation, pagination, and actionable not-found errors.
- bb3044d: Expose coherent card version metadata and truthful, deterministic, read-only card version history.

### Patch Changes

- 9553bc7: Parse date custom-field inputs into finite Unix-millisecond values before Huly writes, with strict documented ISO calendar-date and epoch-millisecond forms plus actionable typed failures for invalid values.

## 0.44.0

### Minor Changes

- 0befdbe: Publish the first standalone Huly CLI package backed by the shared operation registry.

### Patch Changes

- 2e060eb: Add optional CLI telemetry and tag PostHog events with package/surface discriminators.
