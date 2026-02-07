# Missing Participants in listEventInstances

## Problem

`listEventInstances` in `src/huly/operations/calendar.ts` only returns `externalParticipants` but not full participant info.

## Why

Building full participant list requires:
1. Additional API calls per instance
2. Joining with contacts to resolve names

## Options

1. Accept current behavior (external participants only)
2. Add optional `includeParticipants` flag that does extra lookups
3. Always include participants (performance cost)

## Priority

Low - feature enhancement, not a bug.
