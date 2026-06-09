---
"@firfi/huly-mcp": minor
---

Add Planner ToDo MCP tools for listing, reading, creating, updating, completing, reopening, deleting, scheduling, and unscheduling Huly ToDos.

Planner scheduling now uses `schedule_todo`, which accepts either a raw `todoId` locator or human-friendly ToDo locators. The older low-level `create_work_slot` tool is removed from the MCP surface; use `schedule_todo` to create work slots and `list_work_slots` to inspect scheduled slots.
