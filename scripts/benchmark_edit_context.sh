#!/bin/bash
# Benchmark: edit_document search-and-replace vs full replace context savings.
# Measures input payload sizes and validates correctness against local Huly.
# Usage: pnpm build && set -a && source .env.local && set +a && bash scripts/benchmark_edit_context.sh
# Defaults HULY_TOOL_MODE to native because it calls native Huly tools directly.
# Requires: jq, node, HULY_URL/HULY_WORKSPACE/HULY_EMAIL+HULY_PASSWORD env vars
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

if ! command -v jq &>/dev/null; then
  echo "ERROR: jq is required but not found"
  exit 1
fi

if [ -z "$HULY_URL" ]; then
  echo "ERROR: HULY_URL not set. Run: set -a && source .env.local && set +a"
  exit 1
fi

if [ -z "${HULY_TOOL_MODE+x}" ]; then
  export HULY_TOOL_MODE=native
elif [ "$HULY_TOOL_MODE" != "native" ]; then
  echo "ERROR: benchmark_edit_context.sh requires HULY_TOOL_MODE=native because it calls native Huly tools directly."
  echo "Unset HULY_TOOL_MODE to let the script select native mode automatically."
  exit 1
fi

INIT='{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}'
TOOL_TIMEOUT=30
TS="benchmark-edit"

PASSED=0
FAILED=0
ERRORS=""

call_tool() {
  local payload="$1"
  printf '%s\n%s\n' "$INIT" "$payload" | timeout "$TOOL_TIMEOUT" env MCP_AUTO_EXIT=true node dist/index.cjs 2>/dev/null | grep '"id":2'
}

run_capture() {
  local name="$1"
  local payload="$2"
  local result
  result=$(call_tool "$payload")
  if [ -z "$result" ]; then
    echo "FAIL: $name (no response)" >&2
    FAILED=$((FAILED + 1))
    ERRORS="${ERRORS}\n  - ${name}: no response"
    return 1
  fi
  local is_error
  is_error=$(echo "$result" | jq -r '.result.isError // false' 2>/dev/null)
  if [ "$is_error" = "true" ]; then
    local err_text
    err_text=$(echo "$result" | jq -r '.result.content[0].text' 2>/dev/null | head -c 200)
    echo "FAIL: $name => $err_text" >&2
    FAILED=$((FAILED + 1))
    ERRORS="${ERRORS}\n  - ${name}: ${err_text}"
    return 1
  fi
  echo "PASS: $name" >&2
  PASSED=$((PASSED + 1))
  echo "$result" | jq -r '.result.content[0].text' 2>/dev/null
  return 0
}

# Generate text with a unique marker at the start, padded to target length
gen_text() {
  local target_len="$1"
  local marker="$2"
  local base="Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris. "
  local text="UNIQUE_${marker}_MARKER ${base}"
  while [ ${#text} -lt "$target_len" ]; do
    text="${text}${base}"
  done
  echo "${text:0:$target_len}"
}

json_escape() {
  printf '%s' "$1" | jq -Rs '.'
}

# --- Setup: ensure teamspace exists ---
echo "=== Setup ==="
TS_RESULT=$(run_capture "create teamspace" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_teamspace\",\"arguments\":{\"name\":\"$TS\"}},\"id\":2}")
if [ $? -ne 0 ]; then
  echo "ERROR: Cannot create teamspace, aborting."
  exit 1
fi

# --- Results table header ---
printf "\n%-5s %-12s %-22s %12s %12s %10s %s\n" "#" "DocSize" "EditType" "FullBytes" "S&RBytes" "Savings%" "Correct"
printf "%-5s %-12s %-22s %12s %12s %10s %s\n" "---" "----------" "--------------------" "----------" "----------" "--------" "-------"

run_scenario() {
  local num="$1"
  local doc_size_label="$2"
  local edit_type_label="$3"
  local original_content="$4"
  local edited_content="$5"
  local old_text="$6"
  local new_text="$7"
  local doc_title="bench-${num}-$(date +%s)"

  local original_escaped
  original_escaped=$(json_escape "$original_content")
  local edited_escaped
  edited_escaped=$(json_escape "$edited_content")

  # 1. Create document
  local create_result
  create_result=$(run_capture "S${num}: create" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_document\",\"arguments\":{\"teamspace\":\"$TS\",\"title\":\"$doc_title\",\"content\":$original_escaped}},\"id\":2}")
  if [ $? -ne 0 ]; then
    printf "%-5s %-12s %-22s %12s %12s %10s %s\n" "$num" "$doc_size_label" "$edit_type_label" "-" "-" "-" "FAIL(create)"
    return 1
  fi
  local doc_id
  doc_id=$(echo "$create_result" | jq -r '.id // empty' 2>/dev/null)
  if [ -z "$doc_id" ]; then
    printf "%-5s %-12s %-22s %12s %12s %10s %s\n" "$num" "$doc_size_label" "$edit_type_label" "-" "-" "-" "FAIL(no id)"
    return 1
  fi

  # 2. Full replace edit — measure payload size
  local full_replace_args="{\"teamspace\":\"$TS\",\"document\":\"$doc_id\",\"content\":$edited_escaped}"
  local full_replace_bytes=${#full_replace_args}
  run_capture "S${num}: full replace" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"edit_document\",\"arguments\":$full_replace_args},\"id\":2}" >/dev/null
  if [ $? -ne 0 ]; then
    call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_document\",\"arguments\":{\"teamspace\":\"$TS\",\"document\":\"$doc_id\"}},\"id\":2}" >/dev/null
    printf "%-5s %-12s %-22s %12s %12s %10s %s\n" "$num" "$doc_size_label" "$edit_type_label" "$full_replace_bytes" "-" "-" "FAIL(full)"
    return 1
  fi

  # 3. Verify content after full replace
  local get_result_fr
  get_result_fr=$(run_capture "S${num}: verify full" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_document\",\"arguments\":{\"teamspace\":\"$TS\",\"document\":\"$doc_id\"}},\"id\":2}")

  # 4. Reset to original via full replace
  local reset_args="{\"teamspace\":\"$TS\",\"document\":\"$doc_id\",\"content\":$original_escaped}"
  run_capture "S${num}: reset" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"edit_document\",\"arguments\":$reset_args},\"id\":2}" >/dev/null

  # 5. Search-and-replace edit — measure payload size
  local old_text_escaped
  old_text_escaped=$(json_escape "$old_text")
  local new_text_escaped
  new_text_escaped=$(json_escape "$new_text")
  local sar_args="{\"teamspace\":\"$TS\",\"document\":\"$doc_id\",\"old_text\":$old_text_escaped,\"new_text\":$new_text_escaped}"
  local sar_bytes=${#sar_args}
  run_capture "S${num}: search & replace" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"edit_document\",\"arguments\":$sar_args},\"id\":2}" >/dev/null
  if [ $? -ne 0 ]; then
    call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_document\",\"arguments\":{\"teamspace\":\"$TS\",\"document\":\"$doc_id\"}},\"id\":2}" >/dev/null
    printf "%-5s %-12s %-22s %12s %12s %10s %s\n" "$num" "$doc_size_label" "$edit_type_label" "$full_replace_bytes" "$sar_bytes" "-" "FAIL(s&r)"
    return 1
  fi

  # 6. Verify content after s&r matches step 3
  local get_result_sar
  get_result_sar=$(run_capture "S${num}: verify s&r" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_document\",\"arguments\":{\"teamspace\":\"$TS\",\"document\":\"$doc_id\"}},\"id\":2}")

  # 7. Delete document (cleanup)
  call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_document\",\"arguments\":{\"teamspace\":\"$TS\",\"document\":\"$doc_id\"}},\"id\":2}" >/dev/null

  # 8. Compare content from both verifications
  local content_fr
  content_fr=$(echo "$get_result_fr" | jq -r '.content // empty' 2>/dev/null)
  local content_sar
  content_sar=$(echo "$get_result_sar" | jq -r '.content // empty' 2>/dev/null)

  local correct="PASS"
  if [ "$content_fr" != "$content_sar" ]; then
    correct="FAIL(mismatch)"
    FAILED=$((FAILED + 1))
    ERRORS="${ERRORS}\n  - S${num}: content mismatch between full replace and s&r"
  fi

  # Compute savings
  local savings
  if [ "$full_replace_bytes" -gt 0 ]; then
    savings=$(echo "scale=4; x=(1 - $sar_bytes / $full_replace_bytes) * 100; scale=1; x/1" | bc)
  else
    savings="N/A"
  fi

  printf "%-5s %-12s %-22s %12s %12s %9s%% %s\n" "$num" "$doc_size_label" "$edit_type_label" "$full_replace_bytes" "$sar_bytes" "$savings" "$correct"
}

# --- Generate test content ---
CONTENT_500=$(gen_text 500 "S1")
CONTENT_5K_A=$(gen_text 5000 "S2")
CONTENT_5K_B=$(gen_text 5000 "S3")
CONTENT_20K_A=$(gen_text 20000 "S4")

echo ""
echo "=== Benchmark Scenarios ==="

# Scenario 1: 500 chars, change one word
OLD_1="UNIQUE_S1_MARKER"
NEW_1="REPLACED_WORD"
EDITED_500="${CONTENT_500/$OLD_1/$NEW_1}"
run_scenario 1 "500 chars" "change one word" \
  "$CONTENT_500" "$EDITED_500" "$OLD_1" "$NEW_1"

# Scenario 2: 5K chars, fix a typo
OLD_2="UNIQUE_S2_MARKER"
NEW_2="UNIQUE_S2_FIXED"
EDITED_5K_TYPO="${CONTENT_5K_A/$OLD_2/$NEW_2}"
run_scenario 2 "5K chars" "fix a typo" \
  "$CONTENT_5K_A" "$EDITED_5K_TYPO" "$OLD_2" "$NEW_2"

# Scenario 3: 5K chars, rewrite a paragraph
OLD_3="UNIQUE_S3_MARKER Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua."
NEW_3="This paragraph has been completely rewritten with new content that discusses different topics entirely. The replacement text demonstrates paragraph-level edits."
EDITED_5K_PARA="${CONTENT_5K_B/$OLD_3/$NEW_3}"
run_scenario 3 "5K chars" "rewrite paragraph" \
  "$CONTENT_5K_B" "$EDITED_5K_PARA" "$OLD_3" "$NEW_3"

# Scenario 4: 20K chars, one line change
OLD_4="UNIQUE_S4_MARKER"
NEW_4="SINGLE_LINE_FIX"
EDITED_20K_LINE="${CONTENT_20K_A/$OLD_4/$NEW_4}"
run_scenario 4 "20K chars" "one line change" \
  "$CONTENT_20K_A" "$EDITED_20K_LINE" "$OLD_4" "$NEW_4"

# Scenario 5: 20K chars, 3 sequential s&r calls
CONTENT_5=$(gen_text 6000 "S5A")
CONTENT_5="${CONTENT_5} MARKER_S5B_UNIQUE $(gen_text 6000 "S5X")"
CONTENT_5="${CONTENT_5} MARKER_S5C_UNIQUE $(gen_text 6000 "S5Y")"
CONTENT_5="${CONTENT_5:0:20000}"

EDITED_5="$CONTENT_5"
EDITED_5="${EDITED_5/UNIQUE_S5A_MARKER/CHANGE_ONE}"
EDITED_5="${EDITED_5/MARKER_S5B_UNIQUE/CHANGE_TWO}"
EDITED_5="${EDITED_5/MARKER_S5C_UNIQUE/CHANGE_THREE}"

echo "" >&2
DOC_TITLE_5="bench-5-$(date +%s)"
CONTENT_5_ESCAPED=$(json_escape "$CONTENT_5")
EDITED_5_ESCAPED=$(json_escape "$EDITED_5")

CREATE_5=$(run_capture "S5: create" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_document\",\"arguments\":{\"teamspace\":\"$TS\",\"title\":\"$DOC_TITLE_5\",\"content\":$CONTENT_5_ESCAPED}},\"id\":2}")
DOC_ID_5=$(echo "$CREATE_5" | jq -r '.id // empty' 2>/dev/null)

if [ -n "$DOC_ID_5" ]; then
  # Full replace with all 3 changes at once
  FULL_ARGS_5="{\"teamspace\":\"$TS\",\"document\":\"$DOC_ID_5\",\"content\":$EDITED_5_ESCAPED}"
  FULL_BYTES_5=${#FULL_ARGS_5}
  run_capture "S5: full replace" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"edit_document\",\"arguments\":$FULL_ARGS_5},\"id\":2}" >/dev/null

  GET_5_FR=$(run_capture "S5: verify full" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_document\",\"arguments\":{\"teamspace\":\"$TS\",\"document\":\"$DOC_ID_5\"}},\"id\":2}")

  # Reset
  RESET_ARGS_5="{\"teamspace\":\"$TS\",\"document\":\"$DOC_ID_5\",\"content\":$CONTENT_5_ESCAPED}"
  run_capture "S5: reset" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"edit_document\",\"arguments\":$RESET_ARGS_5},\"id\":2}" >/dev/null

  # 3 sequential s&r calls (each marker is unique)
  SAR1_ARGS="{\"teamspace\":\"$TS\",\"document\":\"$DOC_ID_5\",\"old_text\":\"UNIQUE_S5A_MARKER\",\"new_text\":\"CHANGE_ONE\"}"
  SAR2_ARGS="{\"teamspace\":\"$TS\",\"document\":\"$DOC_ID_5\",\"old_text\":\"MARKER_S5B_UNIQUE\",\"new_text\":\"CHANGE_TWO\"}"
  SAR3_ARGS="{\"teamspace\":\"$TS\",\"document\":\"$DOC_ID_5\",\"old_text\":\"MARKER_S5C_UNIQUE\",\"new_text\":\"CHANGE_THREE\"}"
  SAR_TOTAL_BYTES=$(( ${#SAR1_ARGS} + ${#SAR2_ARGS} + ${#SAR3_ARGS} ))

  run_capture "S5: s&r 1/3" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"edit_document\",\"arguments\":$SAR1_ARGS},\"id\":2}" >/dev/null
  run_capture "S5: s&r 2/3" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"edit_document\",\"arguments\":$SAR2_ARGS},\"id\":2}" >/dev/null
  run_capture "S5: s&r 3/3" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"edit_document\",\"arguments\":$SAR3_ARGS},\"id\":2}" >/dev/null

  GET_5_SAR=$(run_capture "S5: verify s&r" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_document\",\"arguments\":{\"teamspace\":\"$TS\",\"document\":\"$DOC_ID_5\"}},\"id\":2}")

  # Cleanup
  call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_document\",\"arguments\":{\"teamspace\":\"$TS\",\"document\":\"$DOC_ID_5\"}},\"id\":2}" >/dev/null

  CONTENT_5_FR=$(echo "$GET_5_FR" | jq -r '.content // empty' 2>/dev/null)
  CONTENT_5_SAR=$(echo "$GET_5_SAR" | jq -r '.content // empty' 2>/dev/null)
  CORRECT_5="PASS"
  if [ "$CONTENT_5_FR" != "$CONTENT_5_SAR" ]; then
    CORRECT_5="FAIL(mismatch)"
    FAILED=$((FAILED + 1))
  fi

  SAVINGS_5=$(echo "scale=4; x=(1 - $SAR_TOTAL_BYTES / $FULL_BYTES_5) * 100; scale=1; x/1" | bc)
  printf "%-5s %-12s %-22s %12s %12s %9s%% %s\n" "5" "20K chars" "3 sequential s&r" "$FULL_BYTES_5" "$SAR_TOTAL_BYTES" "$SAVINGS_5" "$CORRECT_5"
else
  printf "%-5s %-12s %-22s %12s %12s %10s %s\n" "5" "20K chars" "3 sequential s&r" "-" "-" "-" "FAIL(create)"
fi

# --- Cleanup teamspace ---
echo ""
echo "=== Cleanup ==="
call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_teamspace\",\"arguments\":{\"teamspace\":\"$TS\"}},\"id\":2}" >/dev/null
echo "Deleted teamspace: $TS"

# --- Summary ---
echo ""
echo "=== Summary ==="
echo "Passed: $PASSED"
echo "Failed: $FAILED"
if [ -n "$ERRORS" ]; then
  echo -e "Errors:$ERRORS"
fi

if [ "$FAILED" -gt 0 ]; then
  exit 1
fi
exit 0
