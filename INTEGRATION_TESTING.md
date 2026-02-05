# Integration Testing Guide

## Prerequisites

```bash
pnpm build
```

## Environment Variables

```bash
# Source from .env.production or set manually:
source .env.production

# Required variables:
# HULY_URL, HULY_WORKSPACE, and either HULY_TOKEN or (HULY_EMAIL + HULY_PASSWORD)
```

## Quick Smoke Test

```bash
printf '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}
{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_projects","arguments":{}},"id":2}
' | MCP_AUTO_EXIT=true node dist/index.cjs 2>&1 | grep '"id":2'
```

Expected: JSON with `"projects": [...]`

**Note**: `MCP_AUTO_EXIT=true` makes the server exit when stdin closes (for testing only).

## Eventual Consistency

**Important**: Huly REST API is eventually consistent. Reads immediately after writes may return stale data. When testing update-then-read sequences, add a ~2 second delay between operations:

```bash
# Update
printf '...update...' | MCP_AUTO_EXIT=true node dist/index.cjs

# Wait for propagation
sleep 2

# Read (separate connection)
printf '...get...' | MCP_AUTO_EXIT=true node dist/index.cjs
```

## Full Test Suite

Run all operations in one batch:

```bash
printf '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}
{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_projects","arguments":{}},"id":2}
{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_issues","arguments":{"project":"YOUR_PROJECT","limit":2}},"id":3}
{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_teamspaces","arguments":{}},"id":4}
{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_persons","arguments":{"limit":3}},"id":5}
{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_channels","arguments":{}},"id":6}
{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_milestones","arguments":{"project":"YOUR_PROJECT"}},"id":7}
{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_events","arguments":{"limit":3}},"id":8}
' | MCP_AUTO_EXIT=true node dist/index.cjs 2>&1 | grep -E '"id":[2-8]'
```

## Individual Operation Tests

### Projects & Issues

```bash
# List projects
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_projects","arguments":{}},"id":2}\n' | node dist/index.cjs

# List issues (replace PROJECT with actual identifier)
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_issues","arguments":{"project":"PROJECT","limit":5}},"id":2}\n' | node dist/index.cjs

# Create issue
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"create_issue","arguments":{"project":"PROJECT","title":"Test Issue"}},"id":2}\n' | node dist/index.cjs

# Get issue
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_issue","arguments":{"project":"PROJECT","identifier":"1"}},"id":2}\n' | node dist/index.cjs

# Delete issue
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"delete_issue","arguments":{"project":"PROJECT","identifier":"123"}},"id":2}\n' | node dist/index.cjs
```

### Issue CRUD with Update (requires delay)

```bash
# Create issue
INIT='{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}'

printf "$INIT"'\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"create_issue","arguments":{"project":"PROJECT","title":"Test Issue","priority":"low"}},"id":2}\n' | MCP_AUTO_EXIT=true node dist/index.cjs 2>/dev/null | grep '"id":2'
# Note the identifier (e.g., PROJECT-123)

# Update issue
printf "$INIT"'\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"update_issue","arguments":{"project":"PROJECT","identifier":"123","title":"Updated Title","priority":"high"}},"id":2}\n' | MCP_AUTO_EXIT=true node dist/index.cjs 2>/dev/null | grep '"id":2'

# IMPORTANT: Wait for eventual consistency
sleep 2

# Verify update (separate connection after delay)
printf "$INIT"'\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_issue","arguments":{"project":"PROJECT","identifier":"123"}},"id":2}\n' | MCP_AUTO_EXIT=true node dist/index.cjs 2>/dev/null | grep '"id":2'

# Cleanup
printf "$INIT"'\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"delete_issue","arguments":{"project":"PROJECT","identifier":"123"}},"id":2}\n' | MCP_AUTO_EXIT=true node dist/index.cjs 2>/dev/null | grep '"id":2'
```

### Documents

```bash
# List teamspaces
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_teamspaces","arguments":{}},"id":2}\n' | node dist/index.cjs

# List documents
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_documents","arguments":{"teamspace":"TEAMSPACE_NAME"}},"id":2}\n' | node dist/index.cjs

# Create document
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"create_document","arguments":{"teamspace":"TEAMSPACE_NAME","title":"Test Doc","content":"# Hello"}},"id":2}\n' | node dist/index.cjs
```

### Contacts

```bash
# List persons (tests N+1 batch fix)
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_persons","arguments":{"limit":5}},"id":2}\n' | node dist/index.cjs

# List employees
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_employees","arguments":{"limit":5}},"id":2}\n' | node dist/index.cjs
```

### Channels

```bash
# List channels
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_channels","arguments":{}},"id":2}\n' | node dist/index.cjs

# Get channel (tests member name resolution)
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_channel","arguments":{"channel":"general"}},"id":2}\n' | node dist/index.cjs

# List messages
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_channel_messages","arguments":{"channel":"general","limit":5}},"id":2}\n' | node dist/index.cjs
```

### Milestones

```bash
# List milestones
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_milestones","arguments":{"project":"PROJECT"}},"id":2}\n' | node dist/index.cjs

# Create milestone (targetDate is Unix timestamp in ms)
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"create_milestone","arguments":{"project":"PROJECT","label":"Test","targetDate":1772467200000}},"id":2}\n' | node dist/index.cjs
```

### Calendar & Time

```bash
# List events
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_events","arguments":{"limit":5}},"id":2}\n' | node dist/index.cjs

# List work slots
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_work_slots","arguments":{"limit":5}},"id":2}\n' | node dist/index.cjs
```

## Initialize Payload

For brevity, `..initialize..` in examples above means:

```json
{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}
```

## New Capabilities Test Suite (2026-02-04)

**Focus**: Easily testable, fully cleanable CRUD operations from recent work.

### Test Pattern

Each test follows: **Create → Read → Delete** to ensure clean state.

---

### 1. Search Operations (Read-Only)

**Safe**: No mutations, no cleanup needed.

```bash
# Search issues by title
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_issues","arguments":{"project":"PROJECT","titleSearch":"bug","limit":3}},"id":2}\n' | MCP_AUTO_EXIT=true node dist/index.cjs

# Search documents by content
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_documents","arguments":{"teamspace":"TEAMSPACE","contentSearch":"api","limit":3}},"id":2}\n' | MCP_AUTO_EXIT=true node dist/index.cjs

# Search persons by name
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_persons","arguments":{"nameSearch":"john","limit":3}},"id":2}\n' | MCP_AUTO_EXIT=true node dist/index.cjs

# Global fulltext search
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"fulltext_search","arguments":{"query":"authentication","limit":5}},"id":2}\n' | MCP_AUTO_EXIT=true node dist/index.cjs
```

---

### 2. Components (Full CRUD Cycle)

**Cleanup**: Delete component at end.

```bash
# Create component
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"create_component","arguments":{"project":"PROJECT","label":"Test Component","description":"Integration test component"}},"id":2}\n' | MCP_AUTO_EXIT=true node dist/index.cjs | tee /tmp/component.json

# Extract component ID from response
COMPONENT_ID=$(jq -r '.result.content[0].text | fromjson | .id' /tmp/component.json)

# List components (verify created)
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_components","arguments":{"project":"PROJECT"}},"id":2}\n' | MCP_AUTO_EXIT=true node dist/index.cjs

# Get component details
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_component","arguments":{"project":"PROJECT","component":"'$COMPONENT_ID'"}},"id":2}\n' | MCP_AUTO_EXIT=true node dist/index.cjs

# CLEANUP: Delete component
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"delete_component","arguments":{"project":"PROJECT","component":"'$COMPONENT_ID'"}},"id":2}\n' | MCP_AUTO_EXIT=true node dist/index.cjs
```

---

### 3. Issue Templates (Full CRUD + Usage Cycle)

**Cleanup**: Delete template and created issue at end.

```bash
# Create issue template
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"create_issue_template","arguments":{"project":"PROJECT","title":"Bug Report Template","description":"## Steps to Reproduce\n\n## Expected\n\n## Actual","priority":"high"}},"id":2}\n' | MCP_AUTO_EXIT=true node dist/index.cjs | tee /tmp/template.json

TEMPLATE_ID=$(jq -r '.result.content[0].text | fromjson | .id' /tmp/template.json)

# List templates (verify created)
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_issue_templates","arguments":{"project":"PROJECT"}},"id":2}\n' | MCP_AUTO_EXIT=true node dist/index.cjs

# Create issue from template
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"create_issue_from_template","arguments":{"project":"PROJECT","template":"'$TEMPLATE_ID'","title":"Actual Bug: Login fails"}},"id":2}\n' | MCP_AUTO_EXIT=true node dist/index.cjs | tee /tmp/issue_from_template.json

ISSUE_ID=$(jq -r '.result.content[0].text | fromjson | .identifier' /tmp/issue_from_template.json)

# Verify issue has template defaults (priority=high, description from template)
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_issue","arguments":{"project":"PROJECT","identifier":"'$ISSUE_ID'"}},"id":2}\n' | MCP_AUTO_EXIT=true node dist/index.cjs

# CLEANUP: Delete issue and template
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"delete_issue","arguments":{"project":"PROJECT","identifier":"'$ISSUE_ID'"}},"id":2}\n' | MCP_AUTO_EXIT=true node dist/index.cjs

printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"delete_issue_template","arguments":{"project":"PROJECT","template":"'$TEMPLATE_ID'"}},"id":2}\n' | MCP_AUTO_EXIT=true node dist/index.cjs
```

---

### 4. Thread Replies (Full CRUD Cycle)

**Cleanup**: Delete thread reply at end.

```bash
# List channel messages to get a message ID
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_channel_messages","arguments":{"channel":"general","limit":1}},"id":2}\n' | MCP_AUTO_EXIT=true node dist/index.cjs | tee /tmp/messages.json

MESSAGE_ID=$(jq -r '.result.content[0].text | fromjson | .messages[0].id' /tmp/messages.json)

# Add thread reply
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"add_thread_reply","arguments":{"channel":"general","messageId":"'$MESSAGE_ID'","body":"This is a test reply"}},"id":2}\n' | MCP_AUTO_EXIT=true node dist/index.cjs | tee /tmp/reply.json

REPLY_ID=$(jq -r '.result.content[0].text | fromjson | .id' /tmp/reply.json)

# List thread replies (verify created)
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_thread_replies","arguments":{"channel":"general","messageId":"'$MESSAGE_ID'"}},"id":2}\n' | MCP_AUTO_EXIT=true node dist/index.cjs

# CLEANUP: Delete thread reply
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"delete_thread_reply","arguments":{"channel":"general","messageId":"'$MESSAGE_ID'","replyId":"'$REPLY_ID'"}},"id":2}\n' | MCP_AUTO_EXIT=true node dist/index.cjs
```

---

### 5. Activity Reactions (Add/Remove Cycle)

**Cleanup**: Remove reaction at end.

```bash
# List activity to get a message ID
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_issues","arguments":{"project":"PROJECT","limit":1}},"id":2}\n' | MCP_AUTO_EXIT=true node dist/index.cjs | tee /tmp/issue_for_activity.json

ISSUE_ID=$(jq -r '.result.content[0].text | fromjson | .issues[0].id' /tmp/issue_for_activity.json)

# Get activity for issue
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_activity","arguments":{"objectId":"'$ISSUE_ID'","objectClass":"tracker:class:Issue","limit":1}},"id":2}\n' | MCP_AUTO_EXIT=true node dist/index.cjs | tee /tmp/activity.json

ACTIVITY_MSG_ID=$(jq -r '.result.content[0].text | fromjson | .messages[0].id' /tmp/activity.json)

# Add reaction
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"add_reaction","arguments":{"messageId":"'$ACTIVITY_MSG_ID'","emoji":"👍"}},"id":2}\n' | MCP_AUTO_EXIT=true node dist/index.cjs

# List reactions (verify added)
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_reactions","arguments":{"messageId":"'$ACTIVITY_MSG_ID'"}},"id":2}\n' | MCP_AUTO_EXIT=true node dist/index.cjs

# CLEANUP: Remove reaction
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"remove_reaction","arguments":{"messageId":"'$ACTIVITY_MSG_ID'","emoji":"👍"}},"id":2}\n' | MCP_AUTO_EXIT=true node dist/index.cjs
```

---

### 6. Notifications (Read-Only Operations)

**Safe**: Read operations only, no cleanup needed.

```bash
# List notifications
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_notifications","arguments":{"limit":5}},"id":2}\n' | MCP_AUTO_EXIT=true node dist/index.cjs

# Get unread count
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_unread_notification_count","arguments":{}},"id":2}\n' | MCP_AUTO_EXIT=true node dist/index.cjs

# List notification contexts
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_notification_contexts","arguments":{"limit":5}},"id":2}\n' | MCP_AUTO_EXIT=true node dist/index.cjs
```

---

### 7. Attachments (Full CRUD Cycle)

**Cleanup**: Delete attachment at end.

```bash
# Create test file
echo "Test attachment content" > /tmp/test_attachment.txt

# Add attachment to issue
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"add_issue_attachment","arguments":{"project":"PROJECT","identifier":"1","filePath":"/tmp/test_attachment.txt","filename":"test.txt","contentType":"text/plain","description":"Test attachment"}},"id":2}\n' | MCP_AUTO_EXIT=true node dist/index.cjs | tee /tmp/attachment.json

ATTACHMENT_ID=$(jq -r '.result.content[0].text | fromjson | .id' /tmp/attachment.json)

# List attachments (verify created)
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_attachments","arguments":{"objectId":"ISSUE_REF","objectClass":"tracker:class:Issue"}},"id":2}\n' | MCP_AUTO_EXIT=true node dist/index.cjs

# Get attachment details
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_attachment","arguments":{"attachmentId":"'$ATTACHMENT_ID'"}},"id":2}\n' | MCP_AUTO_EXIT=true node dist/index.cjs

# CLEANUP: Delete attachment
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"delete_attachment","arguments":{"attachmentId":"'$ATTACHMENT_ID'"}},"id":2}\n' | MCP_AUTO_EXIT=true node dist/index.cjs

rm /tmp/test_attachment.txt
```

---

### 8. Performance Optimization Verification

**Test**: Verify lookup joins eliminate extra queries (requires logging/profiling).

```bash
# List issues (now uses lookup for assignee)
# Should make 1 query instead of 2
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_issues","arguments":{"project":"PROJECT","limit":10}},"id":2}\n' | MCP_AUTO_EXIT=true node dist/index.cjs

# List time reports (now uses lookups for issue + person)
# Should make 1 query instead of 3
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_time_spend_reports","arguments":{"project":"PROJECT","limit":10}},"id":2}\n' | MCP_AUTO_EXIT=true node dist/index.cjs
```

**Verification**: Enable Huly client debug logging to count queries (implementation-specific).

---

## Automated Test Script

Complete test cycle for new capabilities:

```bash
#!/bin/bash
set -e

PROJECT="YOUR_PROJECT"
TEAMSPACE="YOUR_TEAMSPACE"
CHANNEL="general"

echo "=== Testing New Capabilities ==="

# 1. Search (read-only)
echo "1. Search operations..."
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"fulltext_search","arguments":{"query":"test","limit":3}},"id":2}\n' | MCP_AUTO_EXIT=true node dist/index.cjs > /dev/null
echo "✓ Fulltext search"

# 2. Components (create/delete)
echo "2. Component lifecycle..."
COMPONENT_RESULT=$(printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"create_component","arguments":{"project":"'$PROJECT'","label":"IntegrationTest"}},"id":2}\n' | MCP_AUTO_EXIT=true node dist/index.cjs)
COMPONENT_ID=$(echo "$COMPONENT_RESULT" | grep '"id":2' | jq -r '.result.content[0].text | fromjson | .id')
echo "✓ Created component: $COMPONENT_ID"

printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"delete_component","arguments":{"project":"'$PROJECT'","component":"'$COMPONENT_ID'"}},"id":2}\n' | MCP_AUTO_EXIT=true node dist/index.cjs > /dev/null
echo "✓ Deleted component"

# 3. Issue Templates (create/use/delete)
echo "3. Issue template lifecycle..."
TEMPLATE_RESULT=$(printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"create_issue_template","arguments":{"project":"'$PROJECT'","title":"Test Template","priority":"high"}},"id":2}\n' | MCP_AUTO_EXIT=true node dist/index.cjs)
TEMPLATE_ID=$(echo "$TEMPLATE_RESULT" | grep '"id":2' | jq -r '.result.content[0].text | fromjson | .id')
echo "✓ Created template: $TEMPLATE_ID"

ISSUE_RESULT=$(printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"create_issue_from_template","arguments":{"project":"'$PROJECT'","template":"'$TEMPLATE_ID'","title":"Test from Template"}},"id":2}\n' | MCP_AUTO_EXIT=true node dist/index.cjs)
ISSUE_ID=$(echo "$ISSUE_RESULT" | grep '"id":2' | jq -r '.result.content[0].text | fromjson | .identifier')
echo "✓ Created issue from template: $ISSUE_ID"

printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"delete_issue","arguments":{"project":"'$PROJECT'","identifier":"'$ISSUE_ID'"}},"id":2}\n' | MCP_AUTO_EXIT=true node dist/index.cjs > /dev/null
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"delete_issue_template","arguments":{"project":"'$PROJECT'","template":"'$TEMPLATE_ID'"}},"id":2}\n' | MCP_AUTO_EXIT=true node dist/index.cjs > /dev/null
echo "✓ Cleaned up issue and template"

# 4. Thread Replies (create/delete)
echo "4. Thread reply lifecycle..."
# (Requires existing message - skip if no messages available)

# 5. Activity Reactions (add/remove)
echo "5. Activity reactions..."
# (Requires existing activity message - skip if no activity)

# 6. Notifications (read-only)
echo "6. Notification operations..."
printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_notifications","arguments":{"limit":1}},"id":2}\n' | MCP_AUTO_EXIT=true node dist/index.cjs > /dev/null
echo "✓ Listed notifications"

printf '..initialize..\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_unread_notification_count","arguments":{}},"id":2}\n' | MCP_AUTO_EXIT=true node dist/index.cjs > /dev/null
echo "✓ Got unread count"

echo "=== All Tests Passed ==="
```

**Usage**:
```bash
chmod +x test_new_capabilities.sh
./test_new_capabilities.sh
```

---

## How It Works

When `MCP_AUTO_EXIT=true`, the server exits when stdin closes (when printf finishes). Without this flag, the server runs indefinitely (normal MCP behavior for production use with clients like Claude Desktop).

For testing, set `MCP_AUTO_EXIT=true` either in environment or inline with each command.

## Checking Results

Filter for specific response:
```bash
... | grep '"id":2'
```

Check for errors:
```bash
... | grep '"isError":true'
```

Pretty print JSON:
```bash
... | grep '"id":2' | jq -r '.result.content[0].text' | jq .
```
