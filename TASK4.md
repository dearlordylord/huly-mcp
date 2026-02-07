# Type-Unsafe Casts in Time Tracking

## Problem

In `src/huly/operations/time.ts`, `createWorkSlot` uses unsafe casts:

```typescript
calendar: null as unknown as WorkSlot["calendar"],
user: null as unknown as WorkSlot["user"],
```

## Questions

1. What values does Huly expect for these fields?
2. Does the current implementation actually work?
3. Can we get proper values from the auth context?

## Investigation Needed

- Check Huly API docs/examples for WorkSlot creation
- Test actual behavior with null values
- Find how to resolve current user's calendar/account

## Priority

Medium - may cause runtime issues.
