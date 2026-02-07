# N+1 Query Pattern

## Problem

`listPersons` and `listEmployees` in `src/huly/operations/contacts.ts` fetch channels for each person individually to get email addresses.

```typescript
// For each person:
const channels = await hulyClient.findAll(contact.class.Channel, { attachedTo: person._id })
```

## Impact

O(n) queries where n = number of persons returned.

## Solution Options

1. Batch query: fetch all channels for all person IDs in one query
2. Use `$lookup` if Huly API supports it
3. Accept the performance hit for small result sets (current limit: 50)

## Priority

Medium - affects performance but has a limit cap.
