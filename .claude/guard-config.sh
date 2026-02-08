#!/bin/bash
# Blocks Edit/Write to protected config files without explicit user approval.
# Protected: eslint.config.mjs, .jscpd.json, tsconfig*.json
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

case "$FILE_PATH" in
  *eslint.config.mjs|*.jscpd.json|*tsconfig*.json)
    echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Protected config file. Ask user for explicit approval before modifying."}}'
    exit 0
    ;;
esac

exit 0
