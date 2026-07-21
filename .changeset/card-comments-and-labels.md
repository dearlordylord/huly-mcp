---
"@firfi/huly-mcp": minor
---

Read-path fixes and card comments:

- `get_issue` now returns attached labels (title + color); previously labels were write-only.
- `list_issues` gains a `label` filter (case-insensitive tag title match).
- New card comment tools: `list_card_comments`, `add_card_comment`, `update_card_comment`, `delete_card_comment`.
- `list_activity` no longer fails with "produced invalid output" when Huly's CockroachDB backend returns `null` for `isPinned`, `replies`, or `reactions`.
