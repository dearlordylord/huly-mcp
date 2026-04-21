---
"@firfi/huly-mcp": minor
---

Add `update_channel_message` and `delete_channel_message` tools so edits to channel posts (e.g. fixing a bad link after send) no longer require a second message stacked on top. Mirrors the existing thread-reply edit/delete surface, reuses the existing `MessageNotFoundError` and `ChannelNotFoundError` error classes, and places the operations in `channels-messages.ts` alongside the pattern used by `documents-edit.ts`.
