# Inefficient Person Fetching in Channels

## Problem

In `src/huly/operations/channels.ts`:
- `listChannelMessages` fetches all persons to resolve sender names
- `listDirectMessages` fetches all persons to resolve participant names

This is because `AccountUuid` (used in message.modifiedBy) doesn't directly map to `Person._id`.

## Investigation Needed

1. How does Huly map AccountUuid to Person?
2. Is there an API to batch-resolve accounts to persons?
3. Can we use a different field to link them?

## Priority

Medium - performance issue, needs Huly API research.
