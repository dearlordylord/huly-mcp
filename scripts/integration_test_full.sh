#!/bin/bash
# Full integration test suite for Huly MCP server.
# Usage: set -a && source .env.local && set +a && bash scripts/integration_test_full.sh
# This suite defaults HULY_TOOL_MODE to native because it calls native Huly tools directly.
# Requires: jq, node, HULY_URL/HULY_WORKSPACE and HULY_TOKEN or HULY_EMAIL+HULY_PASSWORD.
# Employee position lifecycle selection uses HULY_EMPLOYEE_ID (preferred),
# HULY_EMPLOYEE_EMAIL, or the password-auth HULY_EMAIL fallback.
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

if [ "${1:-}" = "--list-tool-cases" ]; then
  exec node scripts/run-bundled.mjs scripts/list-full-integration-cases.ts \
    scripts/integration_test_full.sh mcp bundled-mcp
fi

if ! command -v jq &>/dev/null; then
  echo "ERROR: jq is required but not found"
  exit 1
fi

INTEGRATION_TRANSPORT="${INTEGRATION_TRANSPORT:-stdio}"
INTEGRATION_SURFACE="${INTEGRATION_SURFACE:-mcp}"
INTEGRATION_HTTP_CONFIG="${INTEGRATION_HTTP_CONFIG:-env}"
INTEGRATION_HTTP_HOST="${INTEGRATION_HTTP_HOST:-127.0.0.1}"
INTEGRATION_HTTP_PORT="${INTEGRATION_HTTP_PORT:-19888}"
HTTP_ENDPOINT="http://${INTEGRATION_HTTP_HOST}:${INTEGRATION_HTTP_PORT}/mcp"
HTTP_SERVER_PID=""
HTTP_SERVER_STDOUT=""
HTTP_SERVER_STDERR=""
HTTP_CURL_CONFIG=""
GENERIC_ASSOCIATION_CLEANUP_IDS=""
DRIVE_CLEANUP_ITEMS=""
DRIVE_CLEANUP_DRIVES=""
INVENTORY_CLEANUP_CATEGORY_ID=""
INVENTORY_CLEANUP_CHILD_CATEGORY_ID=""
INVENTORY_CLEANUP_PRODUCT_ID=""
INVENTORY_CLEANUP_VARIANT_ID=""
INVENTORY_CLEANUP_ATTACHMENT_ID=""
INVENTORY_CLEANUP_PHOTO_ID=""
INVENTORY_CLEANUP_COMMENT_ID=""
RECRUITING_CLEANUP_VACANCY_ID=""
RECRUITING_CLEANUP_APPLICANT_ID=""
RECRUITING_CLEANUP_REVIEW_ID=""
RECRUITING_CLEANUP_OPINION_ID=""
RECRUITING_CLEANUP_COMMENT_ID=""
RECRUITING_CLEANUP_ATTACHMENT_ID=""
RECRUITING_CLEANUP_RELATED_ISSUE_ID=""
RECRUITING_CLEANUP_PERSON_ID=""
RECRUITING_CLEANUP_PERSON_EMAIL=""
RECRUITING_CLEANUP_SKILL=""
BOARD_CLEANUP_BOARD_ID=""
BOARD_CLEANUP_LABEL_ID=""
BOARD_CLEANUP_CARD_LABEL_ID=""
FUNNEL_CLEANUP_ID=""
LEAD_CLEANUP_ID=""
LEAD_CLEANUP_FUNNEL_ID=""
LEAD_DESTINATION_FUNNEL_CLEANUP_ID=""
LEAD_PERSON_CLEANUP_ID=""
LEAD_PERSON_AMBIGUOUS_CLEANUP_ID=""
LEAD_LABEL_DEFINITION_CLEANUP_ID=""
LEAD_LABEL_TITLE=""
CUSTOM_FIELD_DATE_CLEANUP_ISSUE_ID=""
CUSTOM_FIELD_DATE_CLEANUP_FIELD_ID=""
CUSTOM_FIELD_DATE_CLEANUP_FIELD_NAME=""
CARD_VERSION_CLEANUP_BASE_ID=""
CARD_UNVERSIONED_CLEANUP_ID=""
MAIL_THREAD_CLEANUP_OUTER_ID=""
MAIL_THREAD_CLEANUP_CHILD_ID=""
TELEGRAM_CLEANUP_CHANNEL_ID=""
TELEGRAM_CLEANUP_MESSAGE_ID=""
ISSUE_AGENT_CLEANUP_ISSUE_ID=""
ISSUE_AGENT_CLEANUP_PROFILE_ID=""
ISSUE_AGENT_CLEANUP_PERSON_ID=""
HR_CLEANUP_DEPARTMENT_ID=""
HR_CLEANUP_REQUEST_ID=""
HR_CLEANUP_HOLIDAY_IDS=""
HR_STAFF_RESTORE_EMPLOYEE=""
HR_STAFF_RESTORE_DEPARTMENT=""
TM_TASK_TYPE_NAME=""
TM_STATUS_NAME=""
WORKFLOW_CLEANED=false
GLOBAL_ADMINS_CLEANUP_JSON=""
GENERIC_WORKFLOW_STATUS_CLEANUP_ID=""
GENERIC_WORKFLOW_CATEGORY_CLEANUP_ID=""
MODEL_ATTRIBUTE_CLEANUP_ID=""
MODEL_ENUM_CLEANUP_ID=""
SEQUENCE_CLEANUP_ENTRIES=""
SECURITY_PERMISSION_CLEANUP_ID=""
CLASS_COLLABORATOR_CLEANUP_CLASS=""
SPACE_ROLE_CLEANUP_SPACE_TYPE=""
SPACE_ROLE_CLEANUP_ROLE=""
SPACE_ROLE_CLEANUP_PERMISSIONS_JSON=""
SPACE_ROLE_CREATED_CLEANUP_SPACE_TYPE=""
SPACE_ROLE_CREATED_CLEANUP_ROLE=""
EMPLOYEE_POSITION_CLEANUP_ID=""
EMPLOYEE_POSITION_CLEANUP_ORIGINAL_POSITION_JSON=""
EMPLOYEE_POSITION_CLEANUP_PENDING=false
PERSON_ADMIN_CLEANUP_ID=""
PERSON_ADMIN_DUPLICATE_CLEANUP_ID=""
PERSON_ADMIN_COMMENT_CLEANUP_ID=""
PERSON_ADMIN_ATTACHMENT_CLEANUP_ID=""
PERSON_MERGE_SOURCE_CLEANUP_ID=""
PERSON_MERGE_SURVIVOR_CLEANUP_ID=""
EMPLOYEE_LIFECYCLE_CLEANUP_PERSON_ID=""

if [ -z "$HULY_URL" ]; then
  echo "ERROR: HULY_URL not set. Run: set -a && source .env.local && set +a"
  exit 1
fi

if [ "$INTEGRATION_SURFACE" != "mcp" ] && [ "$INTEGRATION_SURFACE" != "cli" ]; then
  echo "ERROR: INTEGRATION_SURFACE must be 'mcp' or 'cli'"
  exit 1
fi

if [ "$INTEGRATION_SURFACE" = "cli" ] \
  && { [ -z "${HULY_CLI_INTEGRATION_EXECUTABLE:-}" ] \
    || [ -z "${HULY_CLI_MIRROR_ADAPTER:-}" ] \
    || [ -z "${HULY_CLI_MIRROR_IMAGE_PATH:-}" ]; }; then
  echo "ERROR: CLI integration surface requires its executable, adapter, and image output path."
  exit 1
fi

# This suite calls native Huly tools directly. In auto mode, generic integration
# client identities intentionally resolve to proxy mode, where those tools are
# reachable only through invoke_tool. Keep proxy/auto surface checks in
# scripts/integration_test_tool_scope.sh and force this suite to native mode.
if [ -z "${HULY_TOOL_MODE+x}" ]; then
  export HULY_TOOL_MODE=native
elif [ "$HULY_TOOL_MODE" != "native" ]; then
  echo "ERROR: integration_test_full.sh requires HULY_TOOL_MODE=native because it calls native Huly tools directly."
  echo "Unset HULY_TOOL_MODE to let the script select native mode automatically."
  exit 1
fi

if [ "$INTEGRATION_TRANSPORT" != "stdio" ] && [ "$INTEGRATION_TRANSPORT" != "http" ]; then
  echo "ERROR: INTEGRATION_TRANSPORT must be 'stdio' or 'http'"
  exit 1
fi

if [ "$INTEGRATION_HTTP_CONFIG" != "env" ] && [ "$INTEGRATION_HTTP_CONFIG" != "headers" ]; then
  echo "ERROR: INTEGRATION_HTTP_CONFIG must be 'env' or 'headers'"
  exit 1
fi

if [ "$INTEGRATION_TRANSPORT" = "http" ] && ! command -v curl &>/dev/null; then
  echo "ERROR: curl is required for INTEGRATION_TRANSPORT=http"
  exit 1
fi

if [ "$INTEGRATION_TRANSPORT" = "http" ] && [ "$INTEGRATION_HTTP_CONFIG" = "headers" ] && [ -z "${HULY_WORKSPACE:-}" ]; then
  echo "ERROR: INTEGRATION_HTTP_CONFIG=headers requires HULY_WORKSPACE."
  exit 1
fi

if [ "$INTEGRATION_TRANSPORT" = "http" ] && [ "$INTEGRATION_HTTP_CONFIG" = "headers" ] && [ -z "${HULY_TOKEN:-}" ]; then
  echo "ERROR: INTEGRATION_HTTP_CONFIG=headers requires HULY_TOKEN. URL header config v1 does not support email/password headers."
  exit 1
fi

MCP_2026_META='{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"hulymcp-integration","version":"1.0"},"io.modelcontextprotocol/clientCapabilities":{}}'
PROJECT="HULY"
RUN_ID="$(date +%s)-$$"
PASSED=0
FAILED=0
SKIPPED=0
ERRORS=""

TOOL_TIMEOUT=30

cleanup_http_transport() {
  if [ -n "$HTTP_SERVER_PID" ]; then
    kill "$HTTP_SERVER_PID" 2>/dev/null || true
    wait "$HTTP_SERVER_PID" 2>/dev/null || true
  fi
  if [ -n "$HTTP_SERVER_STDOUT" ]; then
    rm -f "$HTTP_SERVER_STDOUT"
  fi
  if [ -n "$HTTP_SERVER_STDERR" ]; then
    rm -f "$HTTP_SERVER_STDERR"
  fi
  if [ -n "$HTTP_CURL_CONFIG" ]; then
    rm -f "$HTTP_CURL_CONFIG"
  fi
}

cleanup_generic_associations() {
  if [ -n "$GENERIC_ASSOCIATION_CLEANUP_IDS" ]; then
    for association_id in $GENERIC_ASSOCIATION_CLEANUP_IDS; do
      association_json=$(json_string "$association_id")
      relations_result=$(call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_relations\",\"arguments\":{\"association\":$association_json,\"limit\":200}},\"id\":2}" 2>/dev/null || true)
      if [ -n "$relations_result" ]; then
        relations_text=$(echo "$relations_result" | jq -r '.result.content[0].text // empty' 2>/dev/null)
        if [ -n "$relations_text" ]; then
          while IFS= read -r relation_id; do
            if [ -n "$relation_id" ]; then
              relation_json=$(json_string "$relation_id")
              call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_relation\",\"arguments\":{\"relation\":$relation_json}},\"id\":2}" >/dev/null 2>&1 || true
            fi
          done < <(printf '%s\n' "$relations_text" | jq -r '.relations[]?.relationId // empty' 2>/dev/null)
        fi
      fi
      call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_association\",\"arguments\":{\"association\":$association_json}},\"id\":2}" >/dev/null 2>&1 || true
    done
  fi
}

cleanup_employee_lifecycle_artifacts() {
  if [ -n "$EMPLOYEE_LIFECYCLE_CLEANUP_PERSON_ID" ]; then
    local person_json email_json target_result target_text delete_result read_result employee_result attempt
    person_json=$(json_string "$EMPLOYEE_LIFECYCLE_CLEANUP_PERSON_ID")
    email_json=$(json_string "$EMPLOYEE_LIFECYCLE_EMAIL")
    target_result=$(call_tool_fresh_session "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_person\",\"arguments\":{\"personId\":$person_json}},\"id\":2}" 2>/dev/null) || return 1
    target_text=$(printf '%s\n' "$target_result" | jq -r '.result.content[0].text // empty' 2>/dev/null)
    if ! printf '%s\n' "$target_text" | jq -e --arg person "$EMPLOYEE_LIFECYCLE_CLEANUP_PERSON_ID" \
      --arg name "$EMPLOYEE_LIFECYCLE_NAME" --arg email "$EMPLOYEE_LIFECYCLE_EMAIL" \
      '.id == $person and .name == $name and .email == $email' >/dev/null 2>&1; then
      return 1
    fi
    delete_result=$(call_tool_fresh_session "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_person\",\"arguments\":{\"personId\":$person_json}},\"id\":2}" 2>/dev/null) || return 1
    if printf '%s\n' "$delete_result" | jq -e '.result.isError == true' >/dev/null 2>&1; then
      return 1
    fi
    attempt=1
    while [ "$attempt" -le 8 ]; do
      read_result=$(call_tool_fresh_session "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_person\",\"arguments\":{\"personId\":$person_json}},\"id\":2}" 2>/dev/null || true)
      employee_result=$(call_tool_fresh_session "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"deactivate_employee\",\"arguments\":{\"employee\":{\"email\":$email_json},\"action\":\"deactivate\"}},\"id\":2}" 2>/dev/null || true)
      if [ "$(printf '%s\n' "$read_result" | jq -r '.result.isError // false' 2>/dev/null)" = "true" ] \
        && printf '%s\n' "$read_result" | jq -er '.result.content[0].text | test("not found"; "i")' >/dev/null 2>&1 \
        && [ "$(printf '%s\n' "$employee_result" | jq -r '.result.isError // false' 2>/dev/null)" = "true" ] \
        && printf '%s\n' "$employee_result" | jq -er '.result.content[0].text | test("not found"; "i")' >/dev/null 2>&1; then
        EMPLOYEE_LIFECYCLE_CLEANUP_PERSON_ID=""
        return 0
      fi
      sleep 1
      attempt=$((attempt + 1))
    done
    return 1
  fi
  return 0
}

cleanup_drive_artifacts() {
  if [ -n "$DRIVE_CLEANUP_ITEMS" ]; then
    while IFS=$'\t' read -r drive_id item_path; do
      if [ -n "$drive_id" ] && [ -n "$item_path" ]; then
        drive_json=$(json_string "$drive_id")
        item_path_json=$(json_string "$item_path")
        call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_drive_item\",\"arguments\":{\"drive\":$drive_json,\"path\":$item_path_json}},\"id\":2}" >/dev/null 2>&1 || true
      fi
    done <<<"$DRIVE_CLEANUP_ITEMS"
  fi
  if [ -n "$DRIVE_CLEANUP_DRIVES" ]; then
    for drive_id in $DRIVE_CLEANUP_DRIVES; do
      if [ -n "$drive_id" ]; then
        drive_json=$(json_string "$drive_id")
        call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_drive\",\"arguments\":{\"drive\":$drive_json}},\"id\":2}" >/dev/null 2>&1 || true
      fi
    done
  fi
}

cleanup_inventory_artifacts() {
  if [ -n "$INVENTORY_CLEANUP_COMMENT_ID" ] && [ -n "$INVENTORY_CLEANUP_PRODUCT_ID" ]; then
    product_json=$(json_string "$INVENTORY_CLEANUP_PRODUCT_ID")
    comment_json=$(json_string "$INVENTORY_CLEANUP_COMMENT_ID")
    call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_inventory_product_comment\",\"arguments\":{\"product\":$product_json,\"commentId\":$comment_json}},\"id\":2}" >/dev/null 2>&1 || true
  fi
  if [ -n "$INVENTORY_CLEANUP_ATTACHMENT_ID" ] && [ -n "$INVENTORY_CLEANUP_PRODUCT_ID" ]; then
    product_json=$(json_string "$INVENTORY_CLEANUP_PRODUCT_ID")
    attachment_json=$(json_string "$INVENTORY_CLEANUP_ATTACHMENT_ID")
    call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_inventory_product_attachment\",\"arguments\":{\"product\":$product_json,\"attachmentId\":$attachment_json}},\"id\":2}" >/dev/null 2>&1 || true
  fi
  if [ -n "$INVENTORY_CLEANUP_PHOTO_ID" ] && [ -n "$INVENTORY_CLEANUP_PRODUCT_ID" ]; then
    product_json=$(json_string "$INVENTORY_CLEANUP_PRODUCT_ID")
    photo_json=$(json_string "$INVENTORY_CLEANUP_PHOTO_ID")
    call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_inventory_product_photo\",\"arguments\":{\"product\":$product_json,\"photoId\":$photo_json}},\"id\":2}" >/dev/null 2>&1 || true
  fi
  if [ -n "$INVENTORY_CLEANUP_VARIANT_ID" ]; then
    variant_json=$(json_string "$INVENTORY_CLEANUP_VARIANT_ID")
    call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_inventory_variant\",\"arguments\":{\"variant\":$variant_json}},\"id\":2}" >/dev/null 2>&1 || true
  fi
  if [ -n "$INVENTORY_CLEANUP_PRODUCT_ID" ]; then
    product_json=$(json_string "$INVENTORY_CLEANUP_PRODUCT_ID")
    call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_inventory_product\",\"arguments\":{\"product\":$product_json}},\"id\":2}" >/dev/null 2>&1 || true
  fi
  if [ -n "$INVENTORY_CLEANUP_CHILD_CATEGORY_ID" ]; then
    child_category_json=$(json_string "$INVENTORY_CLEANUP_CHILD_CATEGORY_ID")
    call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_inventory_category\",\"arguments\":{\"category\":$child_category_json}},\"id\":2}" >/dev/null 2>&1 || true
  fi
  if [ -n "$INVENTORY_CLEANUP_CATEGORY_ID" ]; then
    category_json=$(json_string "$INVENTORY_CLEANUP_CATEGORY_ID")
    call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_inventory_category\",\"arguments\":{\"category\":$category_json}},\"id\":2}" >/dev/null 2>&1 || true
  fi
}

cleanup_recruiting_artifacts() {
  if [ -n "$RECRUITING_CLEANUP_COMMENT_ID" ] && [ -n "$RECRUITING_CLEANUP_VACANCY_ID" ]; then
    vacancy_json=$(json_string "$RECRUITING_CLEANUP_VACANCY_ID")
    comment_json=$(json_string "$RECRUITING_CLEANUP_COMMENT_ID")
    call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_recruiting_comment\",\"arguments\":{\"target\":{\"kind\":\"vacancy\",\"vacancy\":$vacancy_json},\"commentId\":$comment_json}},\"id\":2}" >/dev/null 2>&1 || true
  fi
  if [ -n "$RECRUITING_CLEANUP_ATTACHMENT_ID" ] && [ -n "$RECRUITING_CLEANUP_VACANCY_ID" ]; then
    vacancy_json=$(json_string "$RECRUITING_CLEANUP_VACANCY_ID")
    attachment_json=$(json_string "$RECRUITING_CLEANUP_ATTACHMENT_ID")
    call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_recruiting_attachment\",\"arguments\":{\"target\":{\"kind\":\"vacancy\",\"vacancy\":$vacancy_json},\"attachmentId\":$attachment_json}},\"id\":2}" >/dev/null 2>&1 || true
  fi
  if [ -n "$RECRUITING_CLEANUP_RELATED_ISSUE_ID" ] && [ -n "$RECRUITING_CLEANUP_VACANCY_ID" ]; then
    vacancy_json=$(json_string "$RECRUITING_CLEANUP_VACANCY_ID")
    issue_json=$(json_string "$RECRUITING_CLEANUP_RELATED_ISSUE_ID")
    call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"remove_recruiting_related_issue\",\"arguments\":{\"target\":{\"kind\":\"vacancy\",\"vacancy\":$vacancy_json},\"issue\":$issue_json}},\"id\":2}" >/dev/null 2>&1 || true
  fi
  if [ -n "$RECRUITING_CLEANUP_RELATED_ISSUE_ID" ]; then
    issue_json=$(json_string "$RECRUITING_CLEANUP_RELATED_ISSUE_ID")
    call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":$issue_json}},\"id\":2}" >/dev/null 2>&1 || true
  fi
  if [ -n "$RECRUITING_CLEANUP_OPINION_ID" ]; then
    opinion_json=$(json_string "$RECRUITING_CLEANUP_OPINION_ID")
    call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_recruiting_opinion\",\"arguments\":{\"opinion\":$opinion_json}},\"id\":2}" >/dev/null 2>&1 || true
  fi
  if [ -n "$RECRUITING_CLEANUP_REVIEW_ID" ]; then
    review_json=$(json_string "$RECRUITING_CLEANUP_REVIEW_ID")
    call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_recruiting_review\",\"arguments\":{\"review\":$review_json}},\"id\":2}" >/dev/null 2>&1 || true
  fi
  if [ -n "$RECRUITING_CLEANUP_APPLICANT_ID" ]; then
    applicant_json=$(json_string "$RECRUITING_CLEANUP_APPLICANT_ID")
    call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_recruiting_applicant\",\"arguments\":{\"applicant\":$applicant_json}},\"id\":2}" >/dev/null 2>&1 || true
  fi
  if [ -n "$RECRUITING_CLEANUP_SKILL" ] && [ -n "$RECRUITING_CLEANUP_PERSON_EMAIL" ]; then
    skill_json=$(json_string "$RECRUITING_CLEANUP_SKILL")
    person_json=$(json_string "$RECRUITING_CLEANUP_PERSON_EMAIL")
    call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"remove_recruiting_candidate_skill\",\"arguments\":{\"candidate\":$person_json,\"skill\":$skill_json}},\"id\":2}" >/dev/null 2>&1 || true
  fi
  if [ -n "$RECRUITING_CLEANUP_VACANCY_ID" ]; then
    vacancy_json=$(json_string "$RECRUITING_CLEANUP_VACANCY_ID")
    call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"archive_recruiting_vacancy\",\"arguments\":{\"vacancy\":$vacancy_json}},\"id\":2}" >/dev/null 2>&1 || true
  fi
  if [ -n "$RECRUITING_CLEANUP_PERSON_ID" ]; then
    person_json=$(json_string "$RECRUITING_CLEANUP_PERSON_ID")
    call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_person\",\"arguments\":{\"personId\":$person_json}},\"id\":2}" >/dev/null 2>&1 || true
  fi
}

cleanup_board_artifacts() {
  if [ -n "$BOARD_CLEANUP_CARD_LABEL_ID" ]; then
    card_label_json=$(json_string "$BOARD_CLEANUP_CARD_LABEL_ID")
    call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_board_label\",\"arguments\":{\"label\":$card_label_json}},\"id\":2}" >/dev/null 2>&1 || true
  fi
  if [ -n "$BOARD_CLEANUP_LABEL_ID" ]; then
    label_json=$(json_string "$BOARD_CLEANUP_LABEL_ID")
    call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_board_label\",\"arguments\":{\"label\":$label_json}},\"id\":2}" >/dev/null 2>&1 || true
  fi
  if [ -n "$BOARD_CLEANUP_BOARD_ID" ]; then
    board_json=$(json_string "$BOARD_CLEANUP_BOARD_ID")
    call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"archive_board\",\"arguments\":{\"board\":$board_json}},\"id\":2}" >/dev/null 2>&1 || true
  fi
}

wait_for_tool_error_quiet() {
  local payload="$1" expected="$2" attempts="${3:-20}" attempt=1 response is_error text
  while [ "$attempt" -le "$attempts" ]; do
    response=$(call_tool_fresh_session "$payload" 2>/dev/null || true)
    is_error=$(echo "$response" | jq -r '.result.isError // false' 2>/dev/null)
    text=$(echo "$response" | jq -r '.result.content[0].text // empty' 2>/dev/null)
    if [ "$is_error" = "true" ] && printf '%s\n' "$text" | grep -qF -- "$expected"; then
      return 0
    fi
    if [ "$attempt" -lt "$attempts" ]; then
      sleep 0.5
    fi
    attempt=$((attempt + 1))
  done
  return 1
}

wait_for_tool_field_quiet() {
  local payload="$1" jq_expr="$2" expected="$3" attempts="${4:-20}" attempt=1 response text value
  while [ "$attempt" -le "$attempts" ]; do
    response=$(call_tool_fresh_session "$payload" 2>/dev/null || true)
    text=$(echo "$response" | jq -r '.result.content[0].text // empty' 2>/dev/null)
    value=$(printf '%s\n' "$text" | jq -r "$jq_expr // empty" 2>/dev/null)
    if [ "$value" = "$expected" ]; then
      return 0
    fi
    if [ "$attempt" -lt "$attempts" ]; then
      sleep 0.5
    fi
    attempt=$((attempt + 1))
  done
  return 1
}

tool_response_succeeded() {
  local response="$1"
  printf '%s\n' "$response" | jq -e '
    (has("error") | not)
      and ((.result | type) == "object")
      and (.result.isError != true)
  ' >/dev/null 2>&1
}

wait_for_lead_label_absence_quiet() {
  local label_id="$1" label_title="$2" attempts="${3:-20}" label_id_json label_title_json payload jq_expr
  label_id_json=$(json_string "$label_id")
  label_title_json=$(json_string "$label_title")
  payload="{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_lead_label_definitions\",\"arguments\":{\"titleSearch\":$label_title_json,\"limit\":1}},\"id\":2}"
  jq_expr="(.truncated == false) and ((.labels | length) == .total) and (all(.labels[]; .id != $label_id_json))"
  wait_for_tool_field_quiet "$payload" "$jq_expr" 'true' "$attempts"
}

cleanup_funnel_artifacts() {
  if [ -n "$FUNNEL_CLEANUP_ID" ]; then
    local funnel_json archive_response delete_response read_payload
    funnel_json=$(json_string "$FUNNEL_CLEANUP_ID")
    read_payload="{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_funnel\",\"arguments\":{\"funnel\":$funnel_json}},\"id\":2}"
    if wait_for_tool_error_quiet "$read_payload" "not found" 1; then
      FUNNEL_CLEANUP_ID=""
      return 0
    fi
    archive_response=$(call_tool_fresh_session "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"archive_funnel\",\"arguments\":{\"funnel\":$funnel_json}},\"id\":2}" 2>/dev/null || true)
    if ! tool_response_succeeded "$archive_response" \
      || ! wait_for_tool_field_quiet "$read_payload" '.archived' 'true'; then
      return 1
    fi
    delete_response=$(call_tool_fresh_session "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_funnel\",\"arguments\":{\"funnel\":$funnel_json,\"expectedLeads\":0,\"expectedComments\":0,\"expectedAttachments\":0}},\"id\":2}" 2>/dev/null || true)
    if tool_response_succeeded "$delete_response" \
      && wait_for_tool_error_quiet "$read_payload" "not found"; then
      FUNNEL_CLEANUP_ID=""
      return 0
    fi
    return 1
  fi
  return 0
}

cleanup_lead_artifacts() {
  local cleanup_failed=0
  if [ -n "$LEAD_CLEANUP_ID" ] && [ -n "$LEAD_CLEANUP_FUNNEL_ID" ]; then
    local lead_json funnel_json preview preview_text comments attachments labels delete_response read_payload
    lead_json=$(json_string "$LEAD_CLEANUP_ID")
    funnel_json=$(json_string "$LEAD_CLEANUP_FUNNEL_ID")
    read_payload="{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_lead\",\"arguments\":{\"funnel\":$funnel_json,\"identifier\":$lead_json}},\"id\":2}"
    if wait_for_tool_error_quiet "$read_payload" "not found" 1; then
      LEAD_CLEANUP_ID=""
      LEAD_CLEANUP_FUNNEL_ID=""
    else
      preview=$(call_tool_fresh_session "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_lead\",\"arguments\":{\"funnel\":$funnel_json,\"identifier\":$lead_json}},\"id\":2}" 2>/dev/null || true)
      preview_text=$(echo "$preview" | jq -r '.result.content[0].text // empty' 2>/dev/null)
      comments=$(echo "$preview_text" | jq -r '.impact.comments // empty' 2>/dev/null)
      attachments=$(echo "$preview_text" | jq -r '.impact.attachments // empty' 2>/dev/null)
      labels=$(echo "$preview_text" | jq -r '.impact.labels // empty' 2>/dev/null)
      if [ -n "$comments" ] && [ -n "$attachments" ] && [ -n "$labels" ]; then
        delete_response=$(call_tool_fresh_session "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_lead\",\"arguments\":{\"funnel\":$funnel_json,\"identifier\":$lead_json,\"execute\":true,\"expectedComments\":$comments,\"expectedAttachments\":$attachments,\"expectedLabels\":$labels}},\"id\":2}" 2>/dev/null || true)
        if tool_response_succeeded "$delete_response" \
          && wait_for_tool_error_quiet "$read_payload" "not found"; then
          LEAD_CLEANUP_ID=""
          LEAD_CLEANUP_FUNNEL_ID=""
        else
          cleanup_failed=1
        fi
      else
        cleanup_failed=1
      fi
    fi
  fi
  if [ -n "$LEAD_PERSON_CLEANUP_ID" ] && [ -z "$LEAD_CLEANUP_ID" ]; then
    local person_json delete_person_response person_read_payload
    person_json=$(json_string "$LEAD_PERSON_CLEANUP_ID")
    person_read_payload="{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_person\",\"arguments\":{\"personId\":$person_json}},\"id\":2}"
    if wait_for_tool_error_quiet "$person_read_payload" "not found" 1; then
      LEAD_PERSON_CLEANUP_ID=""
    else
      delete_person_response=$(call_tool_fresh_session "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_person\",\"arguments\":{\"personId\":$person_json}},\"id\":2}" 2>/dev/null || true)
      if tool_response_succeeded "$delete_person_response" \
        && wait_for_tool_error_quiet "$person_read_payload" "not found"; then
        LEAD_PERSON_CLEANUP_ID=""
      else
        cleanup_failed=1
      fi
    fi
  fi
  if [ -n "$LEAD_PERSON_AMBIGUOUS_CLEANUP_ID" ]; then
    local ambiguous_person_json ambiguous_delete_response ambiguous_person_read_payload
    ambiguous_person_json=$(json_string "$LEAD_PERSON_AMBIGUOUS_CLEANUP_ID")
    ambiguous_person_read_payload="{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_person\",\"arguments\":{\"personId\":$ambiguous_person_json}},\"id\":2}"
    if wait_for_tool_error_quiet "$ambiguous_person_read_payload" "not found" 1; then
      LEAD_PERSON_AMBIGUOUS_CLEANUP_ID=""
    else
      ambiguous_delete_response=$(call_tool_fresh_session "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_person\",\"arguments\":{\"personId\":$ambiguous_person_json}},\"id\":2}" 2>/dev/null || true)
      if tool_response_succeeded "$ambiguous_delete_response" \
        && wait_for_tool_error_quiet "$ambiguous_person_read_payload" "not found"; then
        LEAD_PERSON_AMBIGUOUS_CLEANUP_ID=""
      else
        cleanup_failed=1
      fi
    fi
  fi
  if [ -n "$LEAD_LABEL_DEFINITION_CLEANUP_ID" ]; then
    local label_json label_delete_response
    if [ -z "$LEAD_LABEL_TITLE" ]; then
      return 1
    fi
    label_json=$(json_string "$LEAD_LABEL_DEFINITION_CLEANUP_ID")
    label_delete_response=$(call_tool_fresh_session "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_tag\",\"arguments\":{\"targetClass\":\"lead:class:Lead\",\"tag\":$label_json}},\"id\":2}" 2>/dev/null || true)
    if tool_response_succeeded "$label_delete_response" \
      && wait_for_lead_label_absence_quiet "$LEAD_LABEL_DEFINITION_CLEANUP_ID" "$LEAD_LABEL_TITLE"; then
      LEAD_LABEL_DEFINITION_CLEANUP_ID=""
      LEAD_LABEL_TITLE=""
    else
      cleanup_failed=1
    fi
  fi
  return "$cleanup_failed"
}

cleanup_custom_field_date_artifacts() {
  if [ -n "$CUSTOM_FIELD_DATE_CLEANUP_ISSUE_ID" ] \
    && [ -n "$CUSTOM_FIELD_DATE_CLEANUP_FIELD_ID" ] \
    && [ -n "$CUSTOM_FIELD_DATE_CLEANUP_FIELD_NAME" ]; then
    local cleanup_attempt
    for cleanup_attempt in 1 2 3; do
      if pnpm exec tsx scripts/integration-custom-field-date.ts \
        --mode cleanup \
        --issueId "$CUSTOM_FIELD_DATE_CLEANUP_ISSUE_ID" \
        --fieldId "$CUSTOM_FIELD_DATE_CLEANUP_FIELD_ID" \
        --fieldName "$CUSTOM_FIELD_DATE_CLEANUP_FIELD_NAME" >/dev/null 2>&1; then
        return 0
      fi
    done
    echo "WARNING: date custom-field fixture cleanup failed after 3 attempts; retry markers retained" >&2
    return 1
  fi
  return 0
}

cleanup_card_version_artifacts() {
  local cleanup_failed=0
  if [ -n "$CARD_UNVERSIONED_CLEANUP_ID" ]; then
    local card_json cleanup_response cleanup_attempt
    card_json=$(json_string "$CARD_UNVERSIONED_CLEANUP_ID")
    for cleanup_attempt in 1 2 3; do
      cleanup_response=$(call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_card\",\"arguments\":{\"cardSpace\":\"Default\",\"card\":$card_json}},\"id\":2}" 2>/dev/null) || continue
      if printf '%s\n' "$cleanup_response" \
        | jq -e '(.error == null) and (.result != null) and ((.result.isError // false) == false)' >/dev/null 2>&1; then
        CARD_UNVERSIONED_CLEANUP_ID=""
        break
      fi
    done
    if [ -n "$CARD_UNVERSIONED_CLEANUP_ID" ]; then
      echo "WARNING: unversioned card fixture cleanup failed after 3 attempts; retry marker retained" >&2
      cleanup_failed=1
    fi
  fi
  if [ -n "$CARD_VERSION_CLEANUP_BASE_ID" ]; then
    local version_cleanup_attempt
    for version_cleanup_attempt in 1 2 3; do
      if pnpm exec tsx scripts/integration-card-version-history.ts \
        --mode cleanup \
        --cardSpace "Default" \
        --baseId "$CARD_VERSION_CLEANUP_BASE_ID" >/dev/null 2>&1; then
        CARD_VERSION_CLEANUP_BASE_ID=""
        break
      fi
    done
    if [ -n "$CARD_VERSION_CLEANUP_BASE_ID" ]; then
      echo "WARNING: card version fixture cleanup failed after 3 attempts; retry marker retained" >&2
      cleanup_failed=1
    fi
  fi
  return "$cleanup_failed"
}

cleanup_mail_thread_artifacts() {
  if [ -z "$MAIL_THREAD_CLEANUP_OUTER_ID" ] || [ -z "$MAIL_THREAD_CLEANUP_CHILD_ID" ]; then
    return 0
  fi
  local cleanup_attempt
  for cleanup_attempt in 1 2 3; do
    if pnpm exec tsx scripts/integration-mail-threads.ts \
      --mode cleanup \
      --outerId "$MAIL_THREAD_CLEANUP_OUTER_ID" \
      --childId "$MAIL_THREAD_CLEANUP_CHILD_ID" >/dev/null 2>&1; then
      MAIL_THREAD_CLEANUP_OUTER_ID=""
      MAIL_THREAD_CLEANUP_CHILD_ID=""
      return 0
    fi
  done
  echo "WARNING: Mail thread fixture cleanup failed after 3 attempts; retry markers retained" >&2
  return 1
}

cleanup_telegram_message_artifacts() {
  if [ -z "$TELEGRAM_CLEANUP_CHANNEL_ID" ] || [ -z "$TELEGRAM_CLEANUP_MESSAGE_ID" ]; then
    return 0
  fi
  local cleanup_attempt
  for cleanup_attempt in 1 2 3; do
    if pnpm exec tsx scripts/integration-telegram-messages.ts \
      --mode cleanup \
      --channelId "$TELEGRAM_CLEANUP_CHANNEL_ID" \
      --messageId "$TELEGRAM_CLEANUP_MESSAGE_ID" >/dev/null 2>&1; then
      TELEGRAM_CLEANUP_CHANNEL_ID=""
      TELEGRAM_CLEANUP_MESSAGE_ID=""
      return 0
    fi
  done
  echo "WARNING: Telegram message fixture cleanup failed after 3 attempts; retry markers retained" >&2
  return 1
}

cleanup_global_space_admins() {
  if [ -z "$GLOBAL_ADMINS_CLEANUP_JSON" ]; then
    return 0
  fi
  local cleanup_attempt cleanup_response
  for cleanup_attempt in 1 2 3; do
    cleanup_response=$(call_tool \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"set_global_space_admins\",\"arguments\":{\"admins\":$GLOBAL_ADMINS_CLEANUP_JSON}},\"id\":2}" \
      2>/dev/null) || continue
    if printf '%s\n' "$cleanup_response" \
      | jq -e '(.error == null) and (.result != null) and ((.result.isError // false) == false)' >/dev/null 2>&1; then
      GLOBAL_ADMINS_CLEANUP_JSON=""
      return 0
    fi
  done
  echo "WARNING: global space-admin cleanup failed after 3 attempts" >&2
  return 1
}

cleanup_generic_workflow_artifacts() {
  if [ -n "$GENERIC_WORKFLOW_STATUS_CLEANUP_ID" ] && [ -n "$GENERIC_WORKFLOW_CATEGORY_CLEANUP_ID" ]; then
    local status_json
    status_json=$(json_string "$GENERIC_WORKFLOW_STATUS_CLEANUP_ID")
    call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_workflow_status\",\"arguments\":{\"status\":$status_json,\"category\":null}},\"id\":2}" >/dev/null 2>&1 || true
  fi
  if [ -n "$GENERIC_WORKFLOW_CATEGORY_CLEANUP_ID" ]; then
    local category_json
    category_json=$(json_string "$GENERIC_WORKFLOW_CATEGORY_CLEANUP_ID")
    call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_status_category\",\"arguments\":{\"category\":$category_json}},\"id\":2}" >/dev/null 2>&1 || true
    GENERIC_WORKFLOW_CATEGORY_CLEANUP_ID=""
  fi
  if [ -n "$GENERIC_WORKFLOW_STATUS_CLEANUP_ID" ]; then
    local status_json
    status_json=$(json_string "$GENERIC_WORKFLOW_STATUS_CLEANUP_ID")
    call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_workflow_status\",\"arguments\":{\"status\":$status_json}},\"id\":2}" >/dev/null 2>&1 || true
    GENERIC_WORKFLOW_STATUS_CLEANUP_ID=""
  fi
}

cleanup_model_administration_artifacts() {
  if [ -n "$MODEL_ATTRIBUTE_CLEANUP_ID" ]; then
    local attribute_json
    attribute_json=$(json_string "$MODEL_ATTRIBUTE_CLEANUP_ID")
    call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_huly_attribute\",\"arguments\":{\"attribute\":$attribute_json,\"confirm\":true}},\"id\":2}" >/dev/null 2>&1 || true
    MODEL_ATTRIBUTE_CLEANUP_ID=""
  fi
  if [ -n "$MODEL_ENUM_CLEANUP_ID" ]; then
    local enum_json
    enum_json=$(json_string "$MODEL_ENUM_CLEANUP_ID")
    call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_huly_enum\",\"arguments\":{\"enum\":$enum_json,\"confirm\":true}},\"id\":2}" >/dev/null 2>&1 || true
    MODEL_ENUM_CLEANUP_ID=""
  fi
}

cleanup_sequence_administration_artifacts() {
  if [ -z "$SEQUENCE_CLEANUP_ENTRIES" ]; then
    return 0
  fi
  local cleanup_entry sequence_id expected_value cleanup_method sequence_json cleanup_attempt cleaned
  local remaining_entries=""
  while IFS= read -r cleanup_entry; do
    [ -z "$cleanup_entry" ] && continue
    sequence_id=$(printf '%s\n' "$cleanup_entry" | jq -r '.sequenceId')
    expected_value=$(printf '%s\n' "$cleanup_entry" | jq -r '.expectedCurrentValue')
    cleanup_method=$(printf '%s\n' "$cleanup_entry" | jq -r '.method')
    sequence_json=$(json_string "$sequence_id")
    cleaned=false
    for cleanup_attempt in 1 2 3; do
      if [ "$cleanup_method" = "owned-sdk-delete" ]; then
        if pnpm tsx scripts/integration-sequence.ts --action delete-owned --sequence "$sequence_id" >/dev/null 2>&1; then
          cleaned=true
          break
        fi
      elif run_capture_only "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_huly_sequence\",\"arguments\":{\"sequence\":$sequence_json,\"expectedCurrentValue\":$expected_value,\"confirm\":true}},\"id\":2}" >/dev/null 2>&1; then
        cleaned=true
        break
      fi
    done
    if [ "$cleaned" != "true" ]; then
      remaining_entries="${remaining_entries}${cleanup_entry}"$'\n'
      echo "WARNING: sequence fixture '$sequence_id' cleanup failed after 3 attempts; retry marker retained" >&2
    fi
  done <<<"$SEQUENCE_CLEANUP_ENTRIES"
  SEQUENCE_CLEANUP_ENTRIES="$remaining_entries"
}

cleanup_security_administration_artifacts() {
  if [ -n "$SPACE_ROLE_CREATED_CLEANUP_SPACE_TYPE" ] && [ -n "$SPACE_ROLE_CREATED_CLEANUP_ROLE" ]; then
    if pnpm tsx scripts/integration-security-role.ts --action delete --spaceType "$SPACE_ROLE_CREATED_CLEANUP_SPACE_TYPE" --role "$SPACE_ROLE_CREATED_CLEANUP_ROLE" >/dev/null 2>&1; then
      SPACE_ROLE_CREATED_CLEANUP_SPACE_TYPE=""
      SPACE_ROLE_CREATED_CLEANUP_ROLE=""
    fi
  fi
  if [ -n "$SPACE_ROLE_CLEANUP_SPACE_TYPE" ] && [ -n "$SPACE_ROLE_CLEANUP_ROLE" ] && [ -n "$SPACE_ROLE_CLEANUP_PERMISSIONS_JSON" ]; then
    local space_type_json role_json
    space_type_json=$(json_string "$SPACE_ROLE_CLEANUP_SPACE_TYPE")
    role_json=$(json_string "$SPACE_ROLE_CLEANUP_ROLE")
    if run_capture_only "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"set_space_role_permissions\",\"arguments\":{\"spaceType\":$space_type_json,\"role\":$role_json,\"permissions\":$SPACE_ROLE_CLEANUP_PERMISSIONS_JSON,\"confirm\":true}},\"id\":2}" >/dev/null 2>&1; then
      SPACE_ROLE_CLEANUP_SPACE_TYPE=""
      SPACE_ROLE_CLEANUP_ROLE=""
      SPACE_ROLE_CLEANUP_PERMISSIONS_JSON=""
    fi
  fi
  if [ -n "$CLASS_COLLABORATOR_CLEANUP_CLASS" ]; then
    local class_json
    class_json=$(json_string "$CLASS_COLLABORATOR_CLEANUP_CLASS")
    if run_capture_only "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_class_collaborator_metadata\",\"arguments\":{\"class\":$class_json,\"confirm\":true}},\"id\":2}" >/dev/null 2>&1; then
      CLASS_COLLABORATOR_CLEANUP_CLASS=""
    fi
  fi
  if [ -n "$SECURITY_PERMISSION_CLEANUP_ID" ]; then
    local permission_json
    permission_json=$(json_string "$SECURITY_PERMISSION_CLEANUP_ID")
    if run_capture_only "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_huly_permission\",\"arguments\":{\"permission\":$permission_json,\"confirm\":true}},\"id\":2}" >/dev/null 2>&1; then
      SECURITY_PERMISSION_CLEANUP_ID=""
    fi
  fi
}

cleanup_issue_agent_assignee_artifacts() {
  local cleanup_failed=0
  if [ -n "$ISSUE_AGENT_CLEANUP_ISSUE_ID" ]; then
    local issue_json
    issue_json=$(json_string "$ISSUE_AGENT_CLEANUP_ISSUE_ID")
    if call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":$issue_json}},\"id\":2}" >/dev/null 2>&1; then
      ISSUE_AGENT_CLEANUP_ISSUE_ID=""
    else
      cleanup_failed=1
    fi
  fi
  if [ -z "$ISSUE_AGENT_CLEANUP_ISSUE_ID" ] && [ -n "$ISSUE_AGENT_CLEANUP_PROFILE_ID" ]; then
    if pnpm exec tsx scripts/integration-issue-agent-profile.ts \
      --mode cleanup --profileId "$ISSUE_AGENT_CLEANUP_PROFILE_ID" >/dev/null 2>&1; then
      ISSUE_AGENT_CLEANUP_PROFILE_ID=""
    else
      cleanup_failed=1
    fi
  fi
  if [ -z "$ISSUE_AGENT_CLEANUP_PROFILE_ID" ] && [ -n "$ISSUE_AGENT_CLEANUP_PERSON_ID" ]; then
    local person_json
    person_json=$(json_string "$ISSUE_AGENT_CLEANUP_PERSON_ID")
    if call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_person\",\"arguments\":{\"personId\":$person_json}},\"id\":2}" >/dev/null 2>&1; then
      ISSUE_AGENT_CLEANUP_PERSON_ID=""
    else
      cleanup_failed=1
    fi
  fi
  return "$cleanup_failed"
}

cleanup_hr_artifacts() {
  local cleanup_failed=0
  if [ -n "$HR_CLEANUP_REQUEST_ID" ]; then
    local request_json request_readback
    request_json=$(json_string "$HR_CLEANUP_REQUEST_ID")
    call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_hr_request\",\"arguments\":{\"request\":$request_json}},\"id\":2}" >/dev/null 2>&1 || true
    restart_http_transport_if_needed "after HR request cleanup" >/dev/null 2>&1 || cleanup_failed=1
    request_readback=$(call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_hr_request\",\"arguments\":{\"request\":$request_json}},\"id\":2}" 2>/dev/null || true)
    if [ "$(echo "$request_readback" | jq -r '(.result.isError // false) and ((.result.content[0].text // "") | contains("not found"))' 2>/dev/null)" = "true" ]; then
      HR_CLEANUP_REQUEST_ID=""
    else
      cleanup_failed=1
    fi
  fi
  if [ -n "$HR_CLEANUP_HOLIDAY_IDS" ]; then
    local remaining_holidays="" holiday_id holiday_json holiday_readback
    for holiday_id in $HR_CLEANUP_HOLIDAY_IDS; do
      holiday_json=$(json_string "$holiday_id")
      call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_public_holiday\",\"arguments\":{\"holiday\":$holiday_json}},\"id\":2}" >/dev/null 2>&1 || true
      restart_http_transport_if_needed "after public holiday cleanup" >/dev/null 2>&1 || cleanup_failed=1
      holiday_readback=$(call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_public_holiday\",\"arguments\":{\"holiday\":$holiday_json}},\"id\":2}" 2>/dev/null || true)
      if [ "$(echo "$holiday_readback" | jq -r '(.result.isError // false) and ((.result.content[0].text // "") | contains("not found"))' 2>/dev/null)" != "true" ]; then
        remaining_holidays="$remaining_holidays $holiday_id"
        cleanup_failed=1
      fi
    done
    HR_CLEANUP_HOLIDAY_IDS="${remaining_holidays# }"
  fi
  if [ -n "$HR_STAFF_RESTORE_EMPLOYEE" ]; then
    local employee_json restore_json restore_response staff_response staff_text restored_department restored_present
    employee_json=$(json_string "$HR_STAFF_RESTORE_EMPLOYEE")
    if [ -n "$HR_STAFF_RESTORE_DEPARTMENT" ]; then
      restore_json=$(json_string "$HR_STAFF_RESTORE_DEPARTMENT")
    else
      restore_json="null"
    fi
    restore_response=$(call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"assign_staff_department\",\"arguments\":{\"employee\":$employee_json,\"department\":$restore_json}},\"id\":2}" 2>/dev/null || true)
    restart_http_transport_if_needed "after HR Staff restoration" >/dev/null 2>&1 || cleanup_failed=1
    staff_response=$(call_tool '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_staff","arguments":{"limit":200}},"id":2}' 2>/dev/null || true)
    staff_text=$(echo "$staff_response" | jq -r '.result.content[0].text // empty' 2>/dev/null)
    restored_department=$(echo "$staff_text" | jq -r --arg employee "$HR_STAFF_RESTORE_EMPLOYEE" '.staff[] | select(.id == $employee) | .department.id // empty' 2>/dev/null)
    restored_present=$(echo "$staff_text" | jq -r --arg employee "$HR_STAFF_RESTORE_EMPLOYEE" '[.staff[] | select(.id == $employee)] | length' 2>/dev/null)
    if [ -n "$restore_response" ] && [ "$restored_present" = "1" ] && [ "$restored_department" = "$HR_STAFF_RESTORE_DEPARTMENT" ]; then
      HR_STAFF_RESTORE_EMPLOYEE=""
      HR_STAFF_RESTORE_DEPARTMENT=""
    else
      cleanup_failed=1
    fi
  fi
  if [ -z "$HR_STAFF_RESTORE_EMPLOYEE" ] && [ -n "$HR_CLEANUP_DEPARTMENT_ID" ]; then
    local department_json preview preview_text descendants staff delete_response readback
    department_json=$(json_string "$HR_CLEANUP_DEPARTMENT_ID")
    preview=$(call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_department\",\"arguments\":{\"department\":$department_json}},\"id\":2}" 2>/dev/null || true)
    preview_text=$(echo "$preview" | jq -r '.result.content[0].text // empty' 2>/dev/null)
    descendants=$(echo "$preview_text" | jq -r '.impact.subdepartments // 0' 2>/dev/null)
    staff=$(echo "$preview_text" | jq -r '.impact.assignedStaff // 0' 2>/dev/null)
    delete_response=$(call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_department\",\"arguments\":{\"department\":$department_json,\"execute\":true,\"expectedSubdepartments\":$descendants,\"expectedAssignedStaff\":$staff}},\"id\":2}" 2>/dev/null || true)
    restart_http_transport_if_needed "after HR department cleanup" >/dev/null 2>&1 || cleanup_failed=1
    readback=$(call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_department\",\"arguments\":{\"department\":$department_json}},\"id\":2}" 2>/dev/null || true)
    if [ "$(echo "$delete_response" | jq -r '.result.isError // false' 2>/dev/null)" = "false" ] \
      && [ "$(echo "$readback" | jq -r '(.result.isError // false) and ((.result.content[0].text // "") | contains("not found"))' 2>/dev/null)" = "true" ]; then
      HR_CLEANUP_DEPARTMENT_ID=""
    else
      cleanup_failed=1
    fi
  fi
  return "$cleanup_failed"
}

run_capture_only_fresh() {
  local payload="$1"
  local result
  result=$(call_tool "$payload")
  if [ -z "$result" ]; then
    return 1
  fi
  local is_error
  is_error=$(echo "$result" | jq -r '.result.isError // false' 2>/dev/null)
  if [ "$is_error" = "true" ]; then
    return 1
  fi
  echo "$result" | jq -r '.result.content[0].text' 2>/dev/null
  return 0
}

employee_position_read_payload() {
  printf '%s\n' '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_employees","arguments":{"limit":200}},"id":2}'
}

wait_for_employee_position() {
  local name="$1" expected_json="$2" count_result="${3:-true}" attempts=10 attempt=1 text=""
  while [ "$attempt" -le "$attempts" ]; do
    # Restart in the parent shell so HTTP_SERVER_PID tracks the replacement.
    # A restart inside text=$(...) would be lost with the command subshell.
    restart_http_transport_if_needed "employee position verification" >&2 || return 1
    text=$(run_capture_only_fresh "$(employee_position_read_payload)" 2>/dev/null || true)
    if [ -n "$text" ] && printf '%s\n' "$text" | jq -e --arg id "$EMPLOYEE_POSITION_CLEANUP_ID" \
      --argjson expected "$expected_json" \
      '([.[] | select(.id == $id) | (.position // null)]) as $positions | (($positions | length) == 1 and $positions[0] == $expected)' >/dev/null 2>&1; then
      if [ "$count_result" = "true" ]; then
        echo "PASS: $name"
        PASSED=$((PASSED + 1))
      fi
      return 0
    fi
    if [ "$attempt" -lt "$attempts" ]; then
      sleep 1
    fi
    attempt=$((attempt + 1))
  done
  if [ "$count_result" = "true" ]; then
    echo "FAIL: $name (position did not persist after ${attempts} attempts)"
    FAILED=$((FAILED + 1))
    ERRORS="${ERRORS}\\n  - ${name}: position did not persist after ${attempts} attempts"
  fi
  return 1
}

restore_employee_position() {
  if [ "$EMPLOYEE_POSITION_CLEANUP_PENDING" != "true" ]; then
    return 0
  fi
  local employee_json restore_payload restore_result
  employee_json=$(json_string "$EMPLOYEE_POSITION_CLEANUP_ID")
  restore_payload="{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"set_employee_position\",\"arguments\":{\"employee\":{\"id\":$employee_json},\"position\":$EMPLOYEE_POSITION_CLEANUP_ORIGINAL_POSITION_JSON}},\"id\":2}"
  restart_http_transport_if_needed "employee position restoration" >&2 || return 1
  restore_result=$(call_tool "$restore_payload" 2>/dev/null || true)
  if [ -z "$restore_result" ] || [ "$(printf '%s\n' "$restore_result" | jq -r '.result.isError // false' 2>/dev/null)" = "true" ]; then
    echo "WARNING: employee position restore did not return success; cleanup marker retained" >&2
    return 1
  fi
  if wait_for_employee_position "set_employee_position restore persisted" "$EMPLOYEE_POSITION_CLEANUP_ORIGINAL_POSITION_JSON" false; then
    EMPLOYEE_POSITION_CLEANUP_ID=""
    EMPLOYEE_POSITION_CLEANUP_ORIGINAL_POSITION_JSON=""
    EMPLOYEE_POSITION_CLEANUP_PENDING=false
    return 0
  fi
  echo "WARNING: employee position restore was not confirmed; cleanup marker retained" >&2
  return 1
}

cleanup_person_admin_artifacts() {
  local attachment_json cleanup_failed=0 comment_json person_json readback readback_text
  if [ -n "$PERSON_ADMIN_CLEANUP_ID" ]; then
    person_json=$(json_string "$PERSON_ADMIN_CLEANUP_ID")
  fi
  if [ -n "$PERSON_ADMIN_ATTACHMENT_CLEANUP_ID" ] && [ -n "$PERSON_ADMIN_CLEANUP_ID" ]; then
    attachment_json=$(json_string "$PERSON_ADMIN_ATTACHMENT_CLEANUP_ID")
    call_tool_fresh_session "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_person_attachment\",\"arguments\":{\"person\":{\"id\":$person_json},\"attachmentId\":$attachment_json}},\"id\":2}" >/dev/null 2>&1 || true
    readback=$(call_tool_fresh_session "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_person_attachment\",\"arguments\":{\"person\":{\"id\":$person_json},\"attachmentId\":$attachment_json}},\"id\":2}" 2>/dev/null || true)
    if [ "$(printf '%s\n' "$readback" | jq -r '.result.isError // false' 2>/dev/null)" = "true" ]; then
      PERSON_ADMIN_ATTACHMENT_CLEANUP_ID=""
    else
      cleanup_failed=1
    fi
  fi
  if [ -n "$PERSON_ADMIN_COMMENT_CLEANUP_ID" ] && [ -n "$PERSON_ADMIN_CLEANUP_ID" ]; then
    comment_json=$(json_string "$PERSON_ADMIN_COMMENT_CLEANUP_ID")
    call_tool_fresh_session "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_person_comment\",\"arguments\":{\"person\":{\"id\":$person_json},\"commentId\":$comment_json}},\"id\":2}" >/dev/null 2>&1 || true
    readback=$(call_tool_fresh_session "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_person_comments\",\"arguments\":{\"person\":{\"id\":$person_json}}},\"id\":2}" 2>/dev/null || true)
    readback_text=$(printf '%s\n' "$readback" | jq -r '.result.content[0].text // empty' 2>/dev/null)
    if [ -n "$readback_text" ] && ! printf '%s\n' "$readback_text" | jq -e --arg id "$PERSON_ADMIN_COMMENT_CLEANUP_ID" '.comments[]? | select(.id == $id)' >/dev/null 2>&1; then
      PERSON_ADMIN_COMMENT_CLEANUP_ID=""
    else
      cleanup_failed=1
    fi
  fi
  if [ -n "$PERSON_ADMIN_CLEANUP_ID" ] && [ -z "$PERSON_ADMIN_ATTACHMENT_CLEANUP_ID" ] && [ -z "$PERSON_ADMIN_COMMENT_CLEANUP_ID" ]; then
    call_tool_fresh_session "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_person\",\"arguments\":{\"personId\":$person_json}},\"id\":2}" >/dev/null 2>&1 || true
    readback=$(call_tool_fresh_session "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_person\",\"arguments\":{\"personId\":$person_json}},\"id\":2}" 2>/dev/null || true)
    if [ "$(printf '%s\n' "$readback" | jq -r '.result.isError // false' 2>/dev/null)" = "true" ]; then
      PERSON_ADMIN_CLEANUP_ID=""
    else
      cleanup_failed=1
    fi
  fi
  if [ -n "$PERSON_ADMIN_DUPLICATE_CLEANUP_ID" ]; then
    person_json=$(json_string "$PERSON_ADMIN_DUPLICATE_CLEANUP_ID")
    call_tool_fresh_session "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_person\",\"arguments\":{\"personId\":$person_json}},\"id\":2}" >/dev/null 2>&1 || true
    readback=$(call_tool_fresh_session "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_person\",\"arguments\":{\"personId\":$person_json}},\"id\":2}" 2>/dev/null || true)
    if [ "$(printf '%s\n' "$readback" | jq -r '.result.isError // false' 2>/dev/null)" = "true" ]; then
      PERSON_ADMIN_DUPLICATE_CLEANUP_ID=""
    else
      cleanup_failed=1
    fi
  fi
  for merge_person_var in PERSON_MERGE_SOURCE_CLEANUP_ID PERSON_MERGE_SURVIVOR_CLEANUP_ID; do
    merge_person_id="${!merge_person_var}"
    if [ -n "$merge_person_id" ]; then
      person_json=$(json_string "$merge_person_id")
      call_tool_fresh_session "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_person\",\"arguments\":{\"personId\":$person_json}},\"id\":2}" >/dev/null 2>&1 || true
      readback=$(call_tool_fresh_session "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_person\",\"arguments\":{\"personId\":$person_json}},\"id\":2}" 2>/dev/null || true)
      if [ "$(printf '%s\n' "$readback" | jq -r '.result.isError // false' 2>/dev/null)" = "true" ]; then
        printf -v "$merge_person_var" '%s' ""
      else
        cleanup_failed=1
      fi
    fi
  done
  return "$cleanup_failed"
}

cleanup_retained_merge_source() {
  if [ -z "$PERSON_MERGE_SOURCE_CLEANUP_ID" ]; then
    return 0
  fi
  local person_json
  person_json=$(json_string "$PERSON_MERGE_SOURCE_CLEANUP_ID")
  restart_http_transport_if_needed "person merge retained source cleanup" >/dev/null 2>&1 || return 1
  run_test "delete_person(person merge retained source:$PERSON_MERGE_SOURCE_CLEANUP_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_person\",\"arguments\":{\"personId\":$person_json}},\"id\":2}" || true
  if wait_for_error_contains "get_person(person merge retained source cleanup)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_person\",\"arguments\":{\"personId\":$person_json}},\"id\":2}" \
    "not found"; then
    PERSON_MERGE_SOURCE_CLEANUP_ID=""
    return 0
  fi
  echo "WARNING: retained person merge source deletion was not confirmed; cleanup marker retained" >&2
  return 1
}

cleanup_all() {
  local original_exit_status=$?
  local cleanup_failed=0
  if ! restore_employee_position; then
    fail_test "set_employee_position restore cleanup" "employee position restore failed; cleanup marker retained"
    cleanup_failed=1
  fi
  if ! cleanup_hr_artifacts; then
    fail_test "HR fixture cleanup" "restoration or deletion failed; cleanup markers retained"
    cleanup_failed=1
  fi
  if ! cleanup_person_admin_artifacts; then
    fail_test "person administration cleanup" "delete/readback was not confirmed; cleanup markers retained"
    cleanup_failed=1
  fi
  cleanup_issue_agent_assignee_artifacts || true
  cleanup_security_administration_artifacts
  cleanup_sequence_administration_artifacts
  cleanup_model_administration_artifacts
  cleanup_generic_workflow_artifacts
  cleanup_global_space_admins || true
  cleanup_card_version_artifacts || true
  cleanup_mail_thread_artifacts || true
  cleanup_telegram_message_artifacts || true
  cleanup_custom_field_date_artifacts || true
  cleanup_board_artifacts || true
  if ! cleanup_lead_artifacts; then
    fail_test "lead fixture cleanup" "deletion or person cleanup failed; lead markers retained"
    cleanup_failed=1
  fi
  if ! cleanup_funnel_artifacts; then
    fail_test "funnel fixture cleanup" "deletion failed; funnel marker retained"
    cleanup_failed=1
  fi
  if [ -n "$LEAD_DESTINATION_FUNNEL_CLEANUP_ID" ]; then
    local saved_funnel_cleanup_id="$FUNNEL_CLEANUP_ID"
    FUNNEL_CLEANUP_ID="$LEAD_DESTINATION_FUNNEL_CLEANUP_ID"
    if ! cleanup_funnel_artifacts; then
      fail_test "lead destination funnel cleanup" "deletion failed; destination funnel marker retained"
      cleanup_failed=1
    fi
    LEAD_DESTINATION_FUNNEL_CLEANUP_ID="$FUNNEL_CLEANUP_ID"
    FUNNEL_CLEANUP_ID="$saved_funnel_cleanup_id"
  fi
  cleanup_recruiting_artifacts || true
  if ! cleanup_employee_lifecycle_artifacts; then
    fail_test "employee lifecycle cleanup" "delete/readback was not confirmed; cleanup marker retained"
    cleanup_failed=1
  fi
  cleanup_generic_associations
  cleanup_workflow_artifacts || true
  cleanup_inventory_artifacts || true
  cleanup_drive_artifacts || true
  cleanup_http_transport
  trap - EXIT
  if [ "$original_exit_status" -ne 0 ]; then
    exit "$original_exit_status"
  fi
  if [ "$cleanup_failed" -ne 0 ]; then
    exit 1
  fi
  exit 0
}
trap cleanup_all EXIT

cleanup_workflow_artifacts() {
  if [ "$WORKFLOW_CLEANED" = "true" ]; then
    return 0
  fi
  if [ -n "$TM_TASK_TYPE_NAME" ] || [ -n "$TM_STATUS_NAME" ]; then
    echo "=== cleanup: task-management workflow artifacts ===" >&2
    cleanup_args=("--delete-test-issues")
    if [ -n "$TM_TASK_TYPE_NAME" ]; then
      cleanup_args+=("--task-type-name" "$TM_TASK_TYPE_NAME")
    fi
    if [ -n "$TM_STATUS_NAME" ]; then
      cleanup_args+=("--status-name" "$TM_STATUS_NAME")
    fi
    if pnpm exec tsx scripts/cleanup-workflow-artifacts.ts "${cleanup_args[@]}" >&2; then
      WORKFLOW_CLEANED=true
      return 0
    fi
    return 1
  fi
  WORKFLOW_CLEANED=true
  return 0
}

write_http_header_config() {
  HTTP_CURL_CONFIG="$(mktemp)"
  chmod 600 "$HTTP_CURL_CONFIG"
  {
    printf '%s\n' 'header = "content-type: application/json"'
    printf '%s\n' 'header = "accept: application/json, text/event-stream"'
    if [ "$INTEGRATION_HTTP_CONFIG" = "headers" ]; then
      printf 'header = "x-huly-url: %s"\n' "$HULY_URL"
      printf 'header = "x-huly-workspace: %s"\n' "$HULY_WORKSPACE"
      printf 'header = "x-huly-token: %s"\n' "$HULY_TOKEN"
      if [ -n "${HULY_CONNECTION_TIMEOUT:-}" ]; then
        printf 'header = "x-huly-connection-timeout: %s"\n' "$HULY_CONNECTION_TIMEOUT"
      fi
    fi
  } >"$HTTP_CURL_CONFIG"
}

start_http_transport() {
  HTTP_SERVER_STDOUT="$(mktemp)"
  HTTP_SERVER_STDERR="$(mktemp)"
  write_http_header_config

  if [ "$INTEGRATION_HTTP_CONFIG" = "headers" ]; then
    env -u HULY_URL -u HULY_WORKSPACE -u HULY_EMAIL -u HULY_PASSWORD -u HULY_TOKEN -u HULY_CONNECTION_TIMEOUT \
      MCP_TRANSPORT=http MCP_HTTP_PORT="$INTEGRATION_HTTP_PORT" MCP_HTTP_HOST="$INTEGRATION_HTTP_HOST" \
      node dist/index.cjs >"$HTTP_SERVER_STDOUT" 2>"$HTTP_SERVER_STDERR" &
  else
    env MCP_TRANSPORT=http MCP_HTTP_PORT="$INTEGRATION_HTTP_PORT" MCP_HTTP_HOST="$INTEGRATION_HTTP_HOST" \
      node dist/index.cjs >"$HTTP_SERVER_STDOUT" 2>"$HTTP_SERVER_STDERR" &
  fi
  HTTP_SERVER_PID=$!

  for _ in $(seq 1 100); do
    if grep -q "MCP HTTP server listening" "$HTTP_SERVER_STDERR"; then
      echo "HTTP integration transport listening at $HTTP_ENDPOINT (config: $INTEGRATION_HTTP_CONFIG)"
      return 0
    fi
    if ! kill -0 "$HTTP_SERVER_PID" 2>/dev/null; then
      echo "ERROR: HTTP integration transport exited during startup"
      cat "$HTTP_SERVER_STDERR"
      return 1
    fi
    sleep 0.1
  done

  echo "ERROR: HTTP integration transport did not start"
  cat "$HTTP_SERVER_STDERR"
  return 1
}

restart_http_transport_if_needed() {
  local reason="$1"
  if [ "$INTEGRATION_SURFACE" != "mcp" ] || [ "$INTEGRATION_TRANSPORT" != "http" ]; then
    return 0
  fi
  echo "Restarting HTTP integration transport ($reason)"
  cleanup_http_transport
  start_http_transport
}

extract_http_json_response() {
  local response="$1"
  local data
  data=$(printf '%s\n' "$response" | awk '/^data: / { sub(/^data: /, ""); print }' | tail -n 1)
  if [ -n "$data" ]; then
    printf '%s\n' "$data"
  else
    printf '%s\n' "$response"
  fi
}

select_tool_response() {
  local response
  response=$(jq -Rc 'fromjson? | select(.jsonrpc == "2.0" and .id == 2)' | tail -n 1)
  [ -n "$response" ] || return 1
  printf '%s\n' "$response"
}

call_tool_stdio() {
  local payload="$1"
  local request_payload
  request_payload=$(printf '%s\n' "$payload" | jq -c --argjson meta "$MCP_2026_META" '.params = ((.params // {}) + {"_meta": $meta})')
  printf '%s\n' "$request_payload" \
    | timeout "$TOOL_TIMEOUT" env MCP_AUTO_EXIT=true node dist/index.cjs 2>/dev/null \
    | select_tool_response
}

call_tool_http() {
  local payload="$1"
  local response
  local request_payload="$payload"
  local method
  local curl_args=(-sS --max-time "$TOOL_TIMEOUT" --config "$HTTP_CURL_CONFIG" --request POST)
  method=$(printf '%s\n' "$request_payload" | jq -r '.method')
  local name
  request_payload=$(printf '%s\n' "$payload" | jq -c --argjson meta "$MCP_2026_META" '.params = ((.params // {}) + {"_meta": $meta})')
  name=$(printf '%s\n' "$request_payload" | jq -r 'if .method == "tools/call" then .params.name elif .method == "resources/read" then .params.uri else empty end')
  curl_args+=(
    --header "MCP-Protocol-Version: 2026-07-28"
    --header "Mcp-Method: $method"
  )
  if [ -n "$name" ]; then
    curl_args+=(--header "Mcp-Name: $name")
  fi
  response=$(curl "${curl_args[@]}" --data "$request_payload" "$HTTP_ENDPOINT" 2>/dev/null)
  extract_http_json_response "$response" | select_tool_response
}

call_tool_cli() {
  local payload="$1"
  timeout "$TOOL_TIMEOUT" node "$HULY_CLI_MIRROR_ADAPTER" \
    "$HULY_CLI_INTEGRATION_EXECUTABLE" \
    "$payload" \
    "$HULY_CLI_MIRROR_IMAGE_PATH" \
    | select_tool_response
}

call_tool() {
  local payload="$1"
  if [ "$INTEGRATION_SURFACE" = "cli" ]; then
    call_tool_cli "$payload"
  elif [ "$INTEGRATION_TRANSPORT" = "http" ]; then
    call_tool_http "$payload"
  else
    call_tool_stdio "$payload"
  fi
}

call_tool_fresh_session() {
  local payload="$1"
  if [ "$INTEGRATION_SURFACE" = "cli" ]; then
    call_tool_cli "$payload"
  else
    # A one-shot stdio process owns a new Huly client and is already bounded by
    # TOOL_TIMEOUT. This also avoids mutating the parent HTTP server lifecycle
    # when callers capture the response through command substitution.
    call_tool_stdio "$payload"
  fi
}

if [ "$INTEGRATION_SURFACE" = "mcp" ] && [ "$INTEGRATION_TRANSPORT" = "http" ]; then
  start_http_transport || exit 1
fi

run_test() {
  local name="$1"
  local payload="$2"
  local result
  result=$(call_tool "$payload")
  if [ -z "$result" ]; then
    echo "FAIL: $name (no response)"
    FAILED=$((FAILED + 1))
    ERRORS="${ERRORS}\n  - ${name}: no response"
    return 1
  fi
  local rpc_error
  rpc_error=$(echo "$result" | jq -r '.error.message // empty' 2>/dev/null)
  if [ -n "$rpc_error" ]; then
    echo "FAIL: $name => $rpc_error"
    FAILED=$((FAILED + 1))
    ERRORS="${ERRORS}\n  - ${name}: ${rpc_error}"
    return 1
  fi
  local is_error
  is_error=$(echo "$result" | jq -r '.result.isError // false' 2>/dev/null)
  if [ "$is_error" = "true" ]; then
    local err_text
    err_text=$(echo "$result" | jq -r '.result.content[0].text' 2>/dev/null | head -c 200)
    echo "FAIL: $name => $err_text"
    FAILED=$((FAILED + 1))
    ERRORS="${ERRORS}\n  - ${name}: ${err_text}"
    return 1
  fi
  echo "PASS: $name"
  PASSED=$((PASSED + 1))
  return 0
}

run_shell_test() {
  local name="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    echo "PASS: $name"
    PASSED=$((PASSED + 1))
    return 0
  fi
  echo "FAIL: $name"
  FAILED=$((FAILED + 1))
  ERRORS="${ERRORS}\n  - ${name}: command failed"
  return 1
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
  local rpc_error
  rpc_error=$(echo "$result" | jq -r '.error.message // empty' 2>/dev/null)
  if [ -n "$rpc_error" ]; then
    echo "FAIL: $name => $rpc_error" >&2
    FAILED=$((FAILED + 1))
    ERRORS="${ERRORS}\n  - ${name}: ${rpc_error}"
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

run_capture_to_var_with_runner() {
  local runner="$1" output_var="$2" name="$3" payload="$4"
  local result
  result=$("$runner" "$payload")
  if [ -z "$result" ]; then
    echo "FAIL: $name (no response)" >&2
    FAILED=$((FAILED + 1))
    ERRORS="${ERRORS}\n  - ${name}: no response"
    printf -v "$output_var" '%s' ""
    return 1
  fi
  local rpc_error
  rpc_error=$(echo "$result" | jq -r '.error.message // empty' 2>/dev/null)
  if [ -n "$rpc_error" ]; then
    echo "FAIL: $name => $rpc_error" >&2
    FAILED=$((FAILED + 1))
    ERRORS="${ERRORS}\n  - ${name}: ${rpc_error}"
    printf -v "$output_var" '%s' ""
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
    printf -v "$output_var" '%s' ""
    return 1
  fi
  echo "PASS: $name" >&2
  PASSED=$((PASSED + 1))
  printf -v "$output_var" '%s' "$(echo "$result" | jq -r '.result.content[0].text' 2>/dev/null)"
  return 0
}

run_capture_to_var() {
  run_capture_to_var_with_runner call_tool "$@"
}

run_capture_to_var_fresh() {
  restart_http_transport_if_needed "employee position mutation" >&2 || return 1
  run_capture_to_var_with_runner call_tool "$@"
}

run_employee_invitation_step() {
  local output_var="$1" name="$2" payload="$3" result is_error text
  restart_http_transport_if_needed "employee invitation lifecycle" >&2 || return 1
  result=$(call_tool "$payload")
  is_error=$(printf '%s\n' "$result" | jq -r '.result.isError // false' 2>/dev/null)
  text=$(printf '%s\n' "$result" | jq -r '.result.content[0].text // empty' 2>/dev/null)
  if [ "$is_error" = "false" ] || printf '%s\n' "$text" \
    | grep -Eq "(but (sendInvite|resendInvite) failed after:|Connection error while communicating with Huly: (sendInvite|resendInvite) failed\.)"; then
    echo "PASS: $name" >&2
    PASSED=$((PASSED + 1))
    printf -v "$output_var" '%s' "$text"
    return 0
  fi
  fail_test "$name" "unexpected invitation lifecycle response"
  printf -v "$output_var" '%s' "$text"
  return 1
}

extract_employee_lifecycle_person_id() {
  local text="$1"
  if printf '%s\n' "$text" | jq -e \
    'type == "object" and (.personId | type == "string" and length > 0)' >/dev/null 2>&1; then
    printf '%s\n' "$text" | jq -r '.personId'
    return 0
  fi
  printf '%s\n' "$text" \
    | sed -n "s/^Employee '\([^']\+\)' was prepared for '[^']\+', but \(sendInvite\|resendInvite\) failed after:.*$/\1/p"
}

capture_paginated_hr_reports() {
  local output_var="$1" name="$2" department="$3" start_date="$4" end_date="$5" output
  if ! output=$(timeout 90 pnpm exec tsx scripts/integration-hr-report-pagination-fixture.ts \
    "$department" "$start_date" "$end_date" 2>/dev/null); then
    printf -v "$output_var" '%s' ""
    fail_test "$name" "internal page-size-one report adapter failed"
    return 1
  fi
  if ! printf '%s\n' "$output" | jq -e \
    '.schedule.complete == true and .table.complete == true and .summary.complete == true' >/dev/null 2>&1; then
    printf -v "$output_var" '%s' "$output"
    fail_test "$name" "internal report adapter returned an invalid or incomplete result"
    return 1
  fi
  printf -v "$output_var" '%s' "$output"
  echo "PASS: $name"
  PASSED=$((PASSED + 1))
}

wait_for_department_path() {
  local output_var="$1" payload="$2" expected_id="$3" name="${4:-get_department(path)}" attempts=10 attempt=1 result="" text=""
  while [ "$attempt" -le "$attempts" ]; do
    # One-shot stdio/CLI calls own a genuinely fresh Huly client without
    # disturbing a parent HTTP transport that may serve the rest of the suite.
    result=$(call_tool_fresh_session "$payload" 2>/dev/null || true)
    text=$(echo "$result" | jq -r '.result.content[0].text // empty' 2>/dev/null)
    if [ "$(echo "$result" | jq -r '.result.isError == true or .error != null' 2>/dev/null)" = "false" ] \
      && [ "$(echo "$text" | jq -r '.id // empty' 2>/dev/null)" = "$expected_id" ]; then
      printf -v "$output_var" '%s' "$text"
      echo "PASS: $name"
      PASSED=$((PASSED + 1))
      return 0
    fi
    if [ "$attempt" -lt "$attempts" ]; then
      sleep 1
    fi
    attempt=$((attempt + 1))
  done
  printf -v "$output_var" '%s' "$text"
  fail_test "$name" "exact department was not visible after ${attempts} fresh-session attempts"
}

run_result_to_var() {
  local output_var="$1" name="$2" payload="$3"
  local result
  result=$(call_tool "$payload")
  if [ -z "$result" ]; then
    echo "FAIL: $name (no response)" >&2
    FAILED=$((FAILED + 1))
    ERRORS="${ERRORS}\n  - ${name}: no response"
    printf -v "$output_var" '%s' ""
    return 1
  fi
  local rpc_error
  rpc_error=$(echo "$result" | jq -r '.error.message // empty' 2>/dev/null)
  if [ -n "$rpc_error" ]; then
    echo "FAIL: $name => $rpc_error" >&2
    FAILED=$((FAILED + 1))
    ERRORS="${ERRORS}\n  - ${name}: ${rpc_error}"
    printf -v "$output_var" '%s' ""
    return 1
  fi
  echo "PASS: $name" >&2
  PASSED=$((PASSED + 1))
  printf -v "$output_var" '%s' "$(echo "$result" | jq -c '.result' 2>/dev/null)"
  return 0
}

skip_test() {
  local name="$1"
  local reason="$2"
  echo "SKIP: $name ($reason)"
  SKIPPED=$((SKIPPED + 1))
}

fail_test() {
  local name="$1"
  local reason="$2"
  echo "FAIL: $name ($reason)"
  FAILED=$((FAILED + 1))
  ERRORS="${ERRORS}\n  - ${name}: ${reason}"
}

wait_for_person_detail() {
  local output_var="$1" name="$2" person_id="$3" expected_email="$4"
  local attempts=20 attempt=1 person_json response text=""
  person_json=$(json_string "$person_id")
  while [ "$attempt" -le "$attempts" ]; do
    response=$(call_tool_fresh_session \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_person\",\"arguments\":{\"personId\":$person_json}},\"id\":2}" \
      2>/dev/null || true)
    text=$(echo "$response" | jq -r '.result.content[0].text // empty' 2>/dev/null)
    if [ "$(printf '%s\n' "$text" | jq -r '.id // empty' 2>/dev/null)" = "$person_id" ] \
      && [ "$(printf '%s\n' "$text" | jq -r '.email // empty' 2>/dev/null)" = "$expected_email" ]; then
      printf -v "$output_var" '%s' "$text"
      echo "PASS: $name"
      PASSED=$((PASSED + 1))
      return 0
    fi
    if [ "$attempt" -lt "$attempts" ]; then
      sleep 0.5
    fi
    attempt=$((attempt + 1))
  done
  printf -v "$output_var" '%s' "$text"
  fail_test "$name" "person and exact email were not visible after $attempts fresh-session attempts"
  return 1
}

wait_for_person_customer_noop() {
  local output_var="$1" name="$2" identifier="$3" attempts=20 attempt=1 identifier_json response text=""
  identifier_json=$(json_string "$identifier")
  # Repeating createMixin before its projection settles can keep advancing the
  # same document. Give the first committed write a read-only visibility window.
  sleep 3
  while [ "$attempt" -le "$attempts" ]; do
    response=$(call_tool_fresh_session \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"make_person_customer\",\"arguments\":{\"identifier\":$identifier_json}},\"id\":2}" \
      2>/dev/null || true)
    text=$(echo "$response" | jq -r '.result.content[0].text // empty' 2>/dev/null)
    if [ "$(printf '%s\n' "$text" | jq -r '.applied' 2>/dev/null)" = "false" ]; then
      printf -v "$output_var" '%s' "$text"
      echo "PASS: $name"
      PASSED=$((PASSED + 1))
      return 0
    fi
    if [ "$attempt" -lt "$attempts" ]; then
      sleep 2
    fi
    attempt=$((attempt + 1))
  done
  printf -v "$output_var" '%s' "$text"
  fail_test "$name" "Customer mixin was not visible after $attempts fresh-session attempts"
  return 1
}

wait_for_lead_update_noop() {
  local output_var="$1" name="$2" payload="$3" attempts=20 attempt=1 response text=""
  # Customer markup and its mixin reference settle independently.
  sleep 3
  while [ "$attempt" -le "$attempts" ]; do
    response=$(call_tool_fresh_session "$payload" 2>/dev/null || true)
    text=$(echo "$response" | jq -r '.result.content[0].text // empty' 2>/dev/null)
    if [ "$(printf '%s\n' "$text" | jq -r '.updated' 2>/dev/null)" = "false" ]; then
      printf -v "$output_var" '%s' "$text"
      echo "PASS: $name"
      PASSED=$((PASSED + 1))
      return 0
    fi
    if [ "$attempt" -lt "$attempts" ]; then
      sleep 2
    fi
    attempt=$((attempt + 1))
  done
  printf -v "$output_var" '%s' "$text"
  fail_test "$name" "idempotent update remained changed after $attempts fresh-session attempts"
  return 1
}

wait_for_lead_projection() {
  local name="$1" funnel="$2" identifier="$3" title="$4" description_mode="${5:-unchanged}"
  local expected_status="${6:-}" expected_assignee="${7:-}" expected_start_date="${8:-}" expected_due_date="${9:-}"
  local expected_customer_description="${10:-}" attempts=10 attempt=1 detail=""
  local funnel_json identifier_json
  funnel_json=$(json_string "$funnel")
  identifier_json=$(json_string "$identifier")
  while [ "$attempt" -le "$attempts" ]; do
    detail=$(run_capture_only_fresh \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_lead\",\"arguments\":{\"funnel\":$funnel_json,\"identifier\":$identifier_json}},\"id\":2}" \
      2>/dev/null || true)
    if [ -n "$detail" ] && printf '%s\n' "$detail" | jq -e \
      --arg funnel "$funnel" --arg identifier "$identifier" --arg title "$title" \
      --arg description_mode "$description_mode" --arg status "$expected_status" --arg assignee "$expected_assignee" \
      --arg start_date "$expected_start_date" --arg due_date "$expected_due_date" \
      --arg customer_description "$expected_customer_description" \
      '.funnel == $funnel
        and .identifier == $identifier
        and .title == $title
        and ($description_mode != "clear" or .description == null)
        and ($status == "" or .status == $status)
        and ($assignee == "" or .assignee == $assignee)
        and ($start_date == "" or .startDate == ($start_date | tonumber))
        and ($due_date == "" or .dueDate == ($due_date | tonumber))
        and ($customer_description == "" or .customerDescription == $customer_description)' >/dev/null 2>&1; then
      echo "PASS: $name"
      PASSED=$((PASSED + 1))
      return 0
    fi
    if [ "$attempt" -lt "$attempts" ]; then
      sleep 1
    fi
    attempt=$((attempt + 1))
  done
  fail_test "$name" "lead projection did not persist after ${attempts} attempts"
  return 1
}

wait_for_lead_deleted() {
  local name="$1" funnel="$2" identifier="$3" attempts=10 attempt=1 response=""
  local funnel_json identifier_json
  funnel_json=$(json_string "$funnel")
  identifier_json=$(json_string "$identifier")
  while [ "$attempt" -le "$attempts" ]; do
    response=$(call_tool_fresh_session \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_lead\",\"arguments\":{\"funnel\":$funnel_json,\"identifier\":$identifier_json}},\"id\":2}" \
      2>/dev/null || true)
    if [ "$(echo "$response" | jq -r '(.result.isError // false) and ((.result.content[0].text // "") | contains("not found"))' 2>/dev/null)" = "true" ]; then
      echo "PASS: $name"
      PASSED=$((PASSED + 1))
      return 0
    fi
    if [ "$attempt" -lt "$attempts" ]; then
      sleep 1
    fi
    attempt=$((attempt + 1))
  done
  fail_test "$name" "deleted lead remained visible after ${attempts} attempts"
  return 1
}

verify_http_tool_discovery() {
  if [ "$INTEGRATION_SURFACE" != "mcp" ] || [ "$INTEGRATION_TRANSPORT" != "http" ]; then
    return 0
  fi

  local response
  local json
  local request_payload
  request_payload=$(jq -cn --argjson meta "$MCP_2026_META" \
    '{"jsonrpc":"2.0","method":"tools/list","params":{"_meta":$meta},"id":1}')
  response=$(curl -sS --max-time "$TOOL_TIMEOUT" --config "$HTTP_CURL_CONFIG" --request POST \
    --header "MCP-Protocol-Version: 2026-07-28" \
    --header "Mcp-Method: tools/list" \
    --data "$request_payload" \
    "$HTTP_ENDPOINT" 2>/dev/null)
  json=$(extract_http_json_response "$response")
  if printf '%s\n' "$json" | jq -e '.result.tools | length > 0' >/dev/null 2>&1; then
    echo "PASS: MCP 2026-07-28 HTTP tools/list"
    PASSED=$((PASSED + 1))
    return 0
  fi

  fail_test "MCP 2026-07-28 HTTP tools/list" "no tool catalog returned"
}

# Like run_capture but does NOT count toward PASS/FAIL — used only for extracting data
run_capture_only() {
  local payload="$1"
  local result
  result=$(call_tool "$payload")
  if [ -z "$result" ]; then
    return 1
  fi
  local is_error
  is_error=$(echo "$result" | jq -r '.result.isError // false' 2>/dev/null)
  if [ "$is_error" = "true" ]; then
    return 1
  fi
  echo "$result" | jq -r '.result.content[0].text' 2>/dev/null
  return 0
}

assert_json_field_nonempty() {
  local name="$1" json="$2" jq_expr="$3"
  local value
  value=$(printf '%s\n' "$json" | jq -r "$jq_expr // empty" 2>/dev/null)
  if [ -n "$value" ]; then
    echo "PASS: $name"
    PASSED=$((PASSED + 1))
    return 0
  fi
  echo "FAIL: $name (field missing: $jq_expr)"
  FAILED=$((FAILED + 1))
  ERRORS="${ERRORS}\n  - ${name}: field missing (${jq_expr})"
  return 1
}

assert_json_field_equals() {
  local name="$1" json="$2" jq_expr="$3" expected="$4"
  local value
  value=$(printf '%s\n' "$json" | jq -r "$jq_expr" 2>/dev/null)
  if [ "$value" = "$expected" ]; then
    echo "PASS: $name"
    PASSED=$((PASSED + 1))
    return 0
  fi
  echo "FAIL: $name (expected $expected, got ${value:-<empty>})"
  FAILED=$((FAILED + 1))
  ERRORS="${ERRORS}\n  - ${name}: expected ${expected}, got ${value:-<empty>}"
  return 1
}

assert_json_field_contains() {
  local name="$1" json="$2" jq_expr="$3" expected="$4"
  local value
  value=$(printf '%s\n' "$json" | jq -r "$jq_expr // empty" 2>/dev/null)
  if printf '%s\n' "$value" | grep -qF -- "$expected"; then
    echo "PASS: $name"
    PASSED=$((PASSED + 1))
    return 0
  fi
  echo "FAIL: $name (field $jq_expr missing substring: $expected)"
  FAILED=$((FAILED + 1))
  ERRORS="${ERRORS}\n  - ${name}: field ${jq_expr} missing substring"
  return 1
}

assert_json_array_contains() {
  local name="$1" json="$2" jq_expr="$3" expected="$4"
  if printf '%s\n' "$json" | jq -e --arg expected "$expected" "($jq_expr) | any(.[]?; . == \$expected)" >/dev/null 2>&1; then
    echo "PASS: $name"
    PASSED=$((PASSED + 1))
    return 0
  fi
  echo "FAIL: $name (array $jq_expr does not contain $expected)"
  FAILED=$((FAILED + 1))
  ERRORS="${ERRORS}\n  - ${name}: array ${jq_expr} does not contain ${expected}"
  return 1
}

wait_for_json_array_contains_to_var() {
  local output_var="$1" name="$2" payload="$3" jq_expr="$4" expected="$5"
  local attempts="${6:-10}" delay="${7:-1}"
  local attempt=1 text=""
  while [ "$attempt" -le "$attempts" ]; do
    text=$(run_capture_only "$payload" 2>/dev/null || true)
    if [ -n "$text" ] && printf '%s\n' "$text" | jq -e --arg expected "$expected" "($jq_expr) | any(.[]?; . == \$expected)" >/dev/null 2>&1; then
      echo "PASS: $name"
      PASSED=$((PASSED + 1))
      printf -v "$output_var" '%s' "$text"
      return 0
    fi
    if [ "$attempt" -lt "$attempts" ]; then
      sleep "$delay"
    fi
    attempt=$((attempt + 1))
  done
  echo "FAIL: $name (array $jq_expr does not contain $expected after ${attempts} attempts)"
  FAILED=$((FAILED + 1))
  ERRORS="${ERRORS}\n  - ${name}: array ${jq_expr} does not contain ${expected} after ${attempts} attempts"
  printf -v "$output_var" '%s' "$text"
  return 1
}

assert_json_array_not_contains() {
  local name="$1" json="$2" jq_expr="$3" expected="$4"
  if printf '%s\n' "$json" | jq -e --arg expected "$expected" "($jq_expr) | all(.[]?; . != \$expected)" >/dev/null 2>&1; then
    echo "PASS: $name"
    PASSED=$((PASSED + 1))
    return 0
  fi
  echo "FAIL: $name (array $jq_expr contains $expected)"
  FAILED=$((FAILED + 1))
  ERRORS="${ERRORS}\n  - ${name}: array ${jq_expr} contains ${expected}"
  return 1
}

assert_json_array_same_set() {
  local name="$1" json="$2" jq_expr="$3" expected_json="$4"
  if printf '%s\n' "$json" | jq -e --argjson expected "$expected_json" "($jq_expr | sort) == (\$expected | sort)" >/dev/null 2>&1; then
    echo "PASS: $name"
    PASSED=$((PASSED + 1))
    return 0
  fi
  echo "FAIL: $name (array $jq_expr does not match $expected_json)"
  FAILED=$((FAILED + 1))
  ERRORS="${ERRORS}\n  - ${name}: array ${jq_expr} does not match ${expected_json}"
  return 1
}

assert_json_role_members_same_set() {
  local name="$1" json="$2" role_id="$3" expected_json="$4"
  if printf '%s\n' "$json" | jq -e --arg role_id "$role_id" --argjson expected "$expected_json" \
    '((.roleAssignments // []) | map(select(.roleId == $role_id)) | first | .members // [] | sort) == ($expected | sort)' >/dev/null 2>&1; then
    echo "PASS: $name"
    PASSED=$((PASSED + 1))
    return 0
  fi
  echo "FAIL: $name (role $role_id members do not match $expected_json)"
  FAILED=$((FAILED + 1))
  ERRORS="${ERRORS}\n  - ${name}: role ${role_id} members do not match ${expected_json}"
  return 1
}

assert_json_role_members_contains() {
  local name="$1" json="$2" role_id="$3" expected="$4"
  if printf '%s\n' "$json" | jq -e --arg role_id "$role_id" --arg expected "$expected" \
    '(.roleAssignments // []) | map(select(.roleId == $role_id)) | first | .members // [] | any(. == $expected)' >/dev/null 2>&1; then
    echo "PASS: $name"
    PASSED=$((PASSED + 1))
    return 0
  fi
  echo "FAIL: $name (role $role_id members do not contain $expected)"
  FAILED=$((FAILED + 1))
  ERRORS="${ERRORS}\n  - ${name}: role ${role_id} members do not contain ${expected}"
  return 1
}

assert_json_role_members_not_contains() {
  local name="$1" json="$2" role_id="$3" expected="$4"
  if printf '%s\n' "$json" | jq -e --arg role_id "$role_id" --arg expected "$expected" \
    '(.roleAssignments // []) | map(select(.roleId == $role_id)) | first | .members // [] | all(. != $expected)' >/dev/null 2>&1; then
    echo "PASS: $name"
    PASSED=$((PASSED + 1))
    return 0
  fi
  echo "FAIL: $name (role $role_id members contain $expected)"
  FAILED=$((FAILED + 1))
  ERRORS="${ERRORS}\n  - ${name}: role ${role_id} members contain ${expected}"
  return 1
}

assert_json_field_count() {
  local name="$1" json="$2" jq_expr="$3" expected="$4"
  local value
  value=$(printf '%s\n' "$json" | jq -r "$jq_expr" 2>/dev/null)
  if [ "$value" = "$expected" ]; then
    echo "PASS: $name"
    PASSED=$((PASSED + 1))
    return 0
  fi
  echo "FAIL: $name (expected count $expected, got ${value:-<empty>})"
  FAILED=$((FAILED + 1))
  ERRORS="${ERRORS}\n  - ${name}: expected count ${expected}, got ${value:-<empty>}"
  return 1
}

assert_json_issue_summary_contains_issue_id() {
  local name="$1" json="$2" identifier="$3" issue_id="$4"
  if printf '%s\n' "$json" | jq -e --arg identifier "$identifier" --arg issue_id "$issue_id" \
    'any(.[]?; .identifier == $identifier and .issueId == $issue_id)' >/dev/null 2>&1; then
    echo "PASS: $name"
    PASSED=$((PASSED + 1))
    return 0
  fi
  echo "FAIL: $name (issue summary missing issueId)"
  FAILED=$((FAILED + 1))
  ERRORS="${ERRORS}\n  - ${name}: issue summary missing issueId"
  return 1
}

assert_json_association_has_expected_class_label() {
  local name="$1" json="$2" class_id="$3" expected_label="$4"
  if printf '%s\n' "$json" | jq -e --arg class_id "$class_id" --arg expected_label "$expected_label" \
    'any(.associations[]?; (.sourceClass == $class_id and .sourceClassLabel == $expected_label) or (.targetClass == $class_id and .targetClassLabel == $expected_label))' >/dev/null 2>&1; then
    echo "PASS: $name"
    PASSED=$((PASSED + 1))
    return 0
  fi
  echo "FAIL: $name (expected label $expected_label for $class_id)"
  FAILED=$((FAILED + 1))
  ERRORS="${ERRORS}\n  - ${name}: expected label ${expected_label} for ${class_id}"
  return 1
}

assert_json_blocks_contains_identifier() {
  local name="$1" json="$2" expected="$3"
  if printf '%s\n' "$json" | jq -e --arg expected "$expected" 'any(.blocks[]?; .identifier == $expected)' >/dev/null 2>&1; then
    echo "PASS: $name"
    PASSED=$((PASSED + 1))
    return 0
  fi
  echo "FAIL: $name (blocks missing identifier: $expected)"
  FAILED=$((FAILED + 1))
  ERRORS="${ERRORS}\n  - ${name}: blocks missing identifier ${expected}"
  return 1
}

assert_json_activity_contains_object_id() {
  local name="$1" json="$2" expected="$3"
  if printf '%s\n' "$json" | jq -e --arg expected "$expected" 'any(.[]?; .objectId == $expected)' >/dev/null 2>&1; then
    echo "PASS: $name"
    PASSED=$((PASSED + 1))
    return 0
  fi
  echo "FAIL: $name (activity missing objectId: $expected)"
  FAILED=$((FAILED + 1))
  ERRORS="${ERRORS}\n  - ${name}: activity missing objectId ${expected}"
  return 1
}

json_string() {
  jq -Rn --arg value "$1" '$value'
}

select_workspace_member_employee_emails() {
  local employees="$1" members="$2" self="$3" limit="$4"
  jq -cn --argjson employees "$employees" --argjson members "$members" --arg self "$self" --argjson limit "$limit" '
    [$employees[] as $employee
      | select(
          $employee.active == true
          and ($employee.email // "") != ""
          and $employee.email != $self
          and ($employee.personUuid // "") != ""
        )
      | select(
          [$members[] as $member | select($employee.personUuid == $member.personId)]
          | length == 1
        )
      | $employee.email]
    | sort
    | group_by(.)
    | map(select(length == 1) | .[0])
    | .[:$limit]
  '
}

run_chat_attachment_lifecycle() {
  local label="$1" target_json="$2"
  local data_json filename_json desc_json updated_desc_json
  local CHAT_ATTACHMENT_TEXT CHAT_LIST_ATTACHMENTS_TEXT CHAT_GET_ATTACHMENT_TEXT CHAT_UPDATE_ATTACHMENT_TEXT CHAT_DELETE_ATTACHMENT_TEXT
  local attachment_id attachment_id_json

  data_json=$(json_string "Y2hhdCBtZXNzYWdlIGF0dGFjaG1lbnQ=")
  filename_json=$(json_string "chat-message-attachment.txt")
  desc_json=$(json_string "Chat message attachment")
  updated_desc_json=$(json_string "Updated chat message attachment")

  run_capture_to_var CHAT_ATTACHMENT_TEXT "add_chat_message_attachment($label)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_chat_message_attachment\",\"arguments\":{\"target\":$target_json,\"filename\":$filename_json,\"contentType\":\"text/plain\",\"data\":$data_json,\"description\":$desc_json}},\"id\":2}"
  attachment_id=$(echo "$CHAT_ATTACHMENT_TEXT" | jq -r '.attachmentId // empty' 2>/dev/null)
  if [ -z "$attachment_id" ]; then
    skip_test "list/get/update/delete chat message attachment ($label)" "add_chat_message_attachment did not return an attachment id"
    return 0
  fi

  attachment_id_json=$(json_string "$attachment_id")
  wait_for_json_array_contains_to_var CHAT_LIST_ATTACHMENTS_TEXT "list_chat_message_attachments includes attachment ($label)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_chat_message_attachments\",\"arguments\":{\"target\":$target_json,\"limit\":20}},\"id\":2}" \
    ".attachments | map(.id)" "$attachment_id"
  run_capture_to_var CHAT_GET_ATTACHMENT_TEXT "get_chat_message_attachment($label:$attachment_id)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_chat_message_attachment\",\"arguments\":{\"target\":$target_json,\"attachmentId\":$attachment_id_json}},\"id\":2}"
  assert_json_field_equals "get_chat_message_attachment $label returns id" "$CHAT_GET_ATTACHMENT_TEXT" ".attachment.id" "$attachment_id"
  run_capture_to_var CHAT_UPDATE_ATTACHMENT_TEXT "update_chat_message_attachment($label:$attachment_id)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_chat_message_attachment\",\"arguments\":{\"target\":$target_json,\"attachmentId\":$attachment_id_json,\"description\":$updated_desc_json,\"pinned\":true}},\"id\":2}"
  assert_json_field_equals "update_chat_message_attachment $label updated" "$CHAT_UPDATE_ATTACHMENT_TEXT" ".updated" "true"
  run_capture_to_var CHAT_DELETE_ATTACHMENT_TEXT "delete_chat_message_attachment($label:$attachment_id)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_chat_message_attachment\",\"arguments\":{\"target\":$target_json,\"attachmentId\":$attachment_id_json}},\"id\":2}"
  assert_json_field_equals "delete_chat_message_attachment $label deleted" "$CHAT_DELETE_ATTACHMENT_TEXT" ".deleted" "true"
}

run_pinned_chat_message_lifecycle() {
  local label="$1" target_key="$2" target_value="$3" message_id="$4" expected_kind="$5"
  local pin_args_json list_args_json unpin_args_json
  local PIN_CHAT_TEXT PINNED_CHAT_TEXT UNPIN_CHAT_TEXT

  pin_args_json=$(jq -cn --arg key "$target_key" --arg target "$target_value" --arg messageId "$message_id" \
    '{($key): $target, messageId: $messageId, pinned: true}')
  list_args_json=$(jq -cn --arg key "$target_key" --arg target "$target_value" '{($key): $target}')
  unpin_args_json=$(jq -cn --arg key "$target_key" --arg target "$target_value" --arg messageId "$message_id" \
    '{($key): $target, messageId: $messageId, pinned: false}')

  run_capture_to_var PIN_CHAT_TEXT "set_chat_message_pinned($label:$message_id)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"set_chat_message_pinned\",\"arguments\":$pin_args_json},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_field_equals "set_chat_message_pinned $label kind" "$PIN_CHAT_TEXT" ".kind" "$expected_kind"
    assert_json_field_equals "set_chat_message_pinned $label pinned=true" "$PIN_CHAT_TEXT" ".pinned" "true"
    assert_json_field_equals "set_chat_message_pinned $label changed=true" "$PIN_CHAT_TEXT" ".changed" "true"
  fi

  run_capture_to_var PINNED_CHAT_TEXT "list_pinned_chat_messages($label)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_pinned_chat_messages\",\"arguments\":$list_args_json},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_array_contains "list_pinned_chat_messages includes $label" "$PINNED_CHAT_TEXT" ".messages | map(.id)" "$message_id"
  fi

  run_capture_to_var UNPIN_CHAT_TEXT "set_chat_message_pinned($label:$message_id unpin)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"set_chat_message_pinned\",\"arguments\":$unpin_args_json},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_field_equals "set_chat_message_pinned $label pinned=false" "$UNPIN_CHAT_TEXT" ".pinned" "false"
    assert_json_field_equals "set_chat_message_pinned $label unpin changed=true" "$UNPIN_CHAT_TEXT" ".changed" "true"
  fi
}

remember_drive_item_cleanup() {
  local drive_id="$1" item_path="$2"
  DRIVE_CLEANUP_ITEMS="${DRIVE_CLEANUP_ITEMS}${drive_id}"$'\t'"${item_path}"$'\n'
}

remember_drive_cleanup() {
  local drive_id="$1"
  DRIVE_CLEANUP_DRIVES="${DRIVE_CLEANUP_DRIVES} ${drive_id}"
}

url_encode() {
  jq -nr --arg value "$1" '$value | @uri'
}

# Like run_test but EXPECTS isError:true. PASSes if error, FAILs if success.
run_expect_error() {
  local name="$1"
  local payload="$2"
  local result
  result=$(call_tool "$payload")
  if [ -z "$result" ]; then
    echo "FAIL: $name (no response, expected error)"
    FAILED=$((FAILED + 1))
    ERRORS="${ERRORS}\n  - ${name}: no response (expected error)"
    return 1
  fi
  local is_error
  is_error=$(echo "$result" | jq -r '.result.isError // false' 2>/dev/null)
  if [ "$is_error" = "true" ]; then
    echo "PASS: $name (got expected error)"
    PASSED=$((PASSED + 1))
    return 0
  fi
  echo "FAIL: $name (expected error but succeeded)"
  FAILED=$((FAILED + 1))
  ERRORS="${ERRORS}\n  - ${name}: expected error but succeeded"
  return 1
}

run_expect_error_contains_with_runner() {
  local runner="$1" name="$2" payload="$3" expected="$4"
  local result
  result=$("$runner" "$payload")
  if [ -z "$result" ]; then
    echo "FAIL: $name (no response, expected error)"
    FAILED=$((FAILED + 1))
    ERRORS="${ERRORS}\n  - ${name}: no response (expected error)"
    return 1
  fi
  local is_error
  is_error=$(echo "$result" | jq -r '.result.isError // false' 2>/dev/null)
  local err_text
  err_text=$(echo "$result" | jq -r '.result.content[0].text // empty' 2>/dev/null)
  if [ "$is_error" = "true" ] && printf '%s\n' "$err_text" | grep -qF -- "$expected"; then
    echo "PASS: $name (got expected error)"
    PASSED=$((PASSED + 1))
    return 0
  fi
  echo "FAIL: $name (expected error containing: $expected)"
  FAILED=$((FAILED + 1))
  ERRORS="${ERRORS}\n  - ${name}: expected error containing ${expected}"
  return 1
}

wait_for_error_contains() {
  local name="$1"
  local payload="$2"
  local expected="$3"
  local attempts="${4:-20}"
  local result="" attempt=1 is_error err_text
  while [ "$attempt" -le "$attempts" ]; do
    restart_http_transport_if_needed "$name readback attempt $attempt" >/dev/null 2>&1 || return 1
    result=$(call_tool "$payload" 2>/dev/null || true)
    is_error=$(echo "$result" | jq -r '.result.isError // false' 2>/dev/null)
    err_text=$(echo "$result" | jq -r '.result.content[0].text // empty' 2>/dev/null)
    if [ "$is_error" = "true" ] && printf '%s\n' "$err_text" | grep -qF -- "$expected"; then
      echo "PASS: $name (got expected error)"
      PASSED=$((PASSED + 1))
      return 0
    fi
    sleep 0.25
    attempt=$((attempt + 1))
  done
  fail_test "$name" "expected error containing '$expected' after $attempts fresh-session attempts"
  return 1
}

run_expect_error_contains() {
  run_expect_error_contains_with_runner call_tool "$@"
}

run_expect_error_contains_fresh() {
  run_expect_error_contains_with_runner call_tool_fresh_session "$@"
}

# Fetch doc content, assert substring present. Args: test_name teamspace doc_id substring
assert_contains() {
  local name="$1" ts="$2" doc="$3" substr="$4"
  local text
  text=$(run_capture_only \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_document\",\"arguments\":{\"teamspace\":\"$ts\",\"document\":\"$doc\"}},\"id\":2}")
  if [ $? -ne 0 ]; then
    echo "FAIL: $name (could not fetch doc)"
    FAILED=$((FAILED + 1))
    ERRORS="${ERRORS}\n  - ${name}: could not fetch doc"
    return 1
  fi
  if printf '%s\n' "$text" | grep -qF -- "$substr"; then
    echo "PASS: $name"
    PASSED=$((PASSED + 1))
    return 0
  fi
  echo "FAIL: $name (substring not found: $substr)"
  FAILED=$((FAILED + 1))
  ERRORS="${ERRORS}\n  - ${name}: substring not found"
  return 1
}

# Fetch doc content, assert substring NOT present. Args: test_name teamspace doc_id substring
assert_not_contains() {
  local name="$1" ts="$2" doc="$3" substr="$4"
  local text
  text=$(run_capture_only \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_document\",\"arguments\":{\"teamspace\":\"$ts\",\"document\":\"$doc\"}},\"id\":2}")
  if [ $? -ne 0 ]; then
    echo "FAIL: $name (could not fetch doc)"
    FAILED=$((FAILED + 1))
    ERRORS="${ERRORS}\n  - ${name}: could not fetch doc"
    return 1
  fi
  if printf '%s\n' "$text" | grep -qF -- "$substr"; then
    echo "FAIL: $name (substring should be absent: $substr)"
    FAILED=$((FAILED + 1))
    ERRORS="${ERRORS}\n  - ${name}: substring should be absent"
    return 1
  fi
  echo "PASS: $name"
  PASSED=$((PASSED + 1))
  return 0
}

# Use a temp dir without spaces (TMPDIR may contain spaces which would break JSON payloads)
TEST_TMPDIR="${TMPDIR:-/tmp}"
if [[ "$TEST_TMPDIR" == *" "* ]]; then
  TEST_TMPDIR="/tmp"
fi

echo "========================================="
echo "  Full Integration Test Suite"
echo "  Surface: $INTEGRATION_SURFACE | Project: $PROJECT | URL: $HULY_URL"
echo "========================================="
echo ""

verify_http_tool_discovery

##############################
# 1. PROJECTS
##############################
echo "=== 1. Projects ==="
run_test "list_projects" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_projects","arguments":{}},"id":2}'
run_test "get_project($PROJECT)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_project\",\"arguments\":{\"project\":\"$PROJECT\"}},\"id\":2}"
LIST_STATUSES_RESULT=""
if run_result_to_var LIST_STATUSES_RESULT "list_statuses($PROJECT)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_statuses\",\"arguments\":{\"project\":\"$PROJECT\"}},\"id\":2}"; then
  LIST_STATUSES_TEXT=$(printf '%s\n' "$LIST_STATUSES_RESULT" | jq -r '.content[0].text' 2>/dev/null)
  # The server owns metadata-degradation detection via status_metadata_unresolved.
  # The raw-ref regex below remains defense in depth if an ID format changes.
  if printf '%s\n' "$LIST_STATUSES_RESULT" | jq -e '
    ((.structuredContent.warnings? // []) | length == 0)
    and ([.content[]? | select((.text | fromjson? | has("warnings")) == true)] | length == 0)
  ' >/dev/null 2>&1; then
    echo "PASS: list_statuses($PROJECT) emits no degradation warnings"
    PASSED=$((PASSED + 1))
  else
    echo "FAIL: list_statuses($PROJECT) emitted degradation warnings"
    FAILED=$((FAILED + 1))
    ERRORS="${ERRORS}\n  - list_statuses($PROJECT): degradation warnings emitted"
  fi
  if printf '%s\n' "$LIST_STATUSES_TEXT" | jq -e '
    (.statuses | length) > 0
    and all(.statuses[]?; (.name | type == "string")
      and (.name | length) > 0
      and ((.name | test("^[0-9a-f]{24}$")) | not)
      and .category != "unknown")
  ' >/dev/null 2>&1; then
    echo "PASS: list_statuses($PROJECT) resolves status metadata"
    PASSED=$((PASSED + 1))
  else
    echo "FAIL: list_statuses($PROJECT) returned raw or incomplete status metadata"
    FAILED=$((FAILED + 1))
    ERRORS="${ERRORS}\n  - list_statuses($PROJECT): raw or incomplete status metadata"
  fi
fi
skip_test "create_project" "would pollute workspace"
skip_test "update_project" "would pollute workspace"
skip_test "delete_project" "would pollute workspace"
echo ""

##############################
# 1r. MCP RESOURCES
##############################
if [ "$INTEGRATION_SURFACE" = "mcp" ]; then
  echo "=== 1r. MCP Resources ==="
  run_test "resources/templates/list" \
    '{"jsonrpc":"2.0","method":"resources/templates/list","id":2}'
  RESOURCE_LIST_JSON=""
  if run_result_to_var RESOURCE_LIST_JSON "resources/list(projects)" \
    '{"jsonrpc":"2.0","method":"resources/list","id":2}'; then
    assert_json_field_equals "resources/list includes project($PROJECT)" "$RESOURCE_LIST_JSON" \
      ".resources[]? | select(.uri == \"huly://projects/$PROJECT\") | .name" "$PROJECT"
  fi
  run_test "resources/read project($PROJECT)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"resources/read\",\"params\":{\"uri\":\"huly://projects/$PROJECT\"},\"id\":2}"
else
  echo "=== 1r. CLI Resource Equivalents ==="
  run_shell_test "CLI command discovery (resources/templates/list equivalent)" \
    "$HULY_CLI_INTEGRATION_EXECUTABLE" --help
  RESOURCE_LIST_JSON=""
  if run_result_to_var RESOURCE_LIST_JSON "list_projects (resources/list equivalent)" \
    '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_projects","arguments":{}},"id":2}'; then
    assert_json_field_equals "list_projects includes project($PROJECT)" "$RESOURCE_LIST_JSON" \
      ".content[0].text | fromjson | .projects[]? | select(.identifier == \"$PROJECT\") | .identifier" "$PROJECT"
  fi
  run_test "get_project($PROJECT) (resources/read equivalent)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_project\",\"arguments\":{\"project\":\"$PROJECT\"}},\"id\":2}"
fi
echo ""

##############################
# 1a. TASK MANAGEMENT (workflow mutations with cleanup)
##############################
echo "=== 1a. Task Management ==="
run_test "list_project_types" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_project_types","arguments":{}},"id":2}'
run_test "get_project_type(default Classic)" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_project_type","arguments":{}},"id":2}'
run_test "list_task_types(default Classic)" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_task_types","arguments":{}},"id":2}'

TM_TASK_TYPE_NAME="IntTest Task Type $RUN_ID"
TM_STATUS_NAME="IntTest QA $RUN_ID"
TM_TASK_TYPE_NAME_JSON=$(json_string "$TM_TASK_TYPE_NAME")
TM_STATUS_NAME_JSON=$(json_string "$TM_STATUS_NAME")
TM_TASK_TYPE_READY=false
TM_TASK_TYPE_STATUS_NAME_JSON=""

run_capture_to_var TASK_TYPE_TEXT "create_task_type($TM_TASK_TYPE_NAME)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_task_type\",\"arguments\":{\"name\":$TM_TASK_TYPE_NAME_JSON}},\"id\":2}"
if [ $? -eq 0 ]; then
  assert_json_field_nonempty "create_task_type returns task type id" "$TASK_TYPE_TEXT" '.taskType.id'
  run_capture_to_var TASK_TYPE_TEXT_2 "create_task_type idempotent($TM_TASK_TYPE_NAME)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_task_type\",\"arguments\":{\"name\":$TM_TASK_TYPE_NAME_JSON}},\"id\":2}"
  if [ $? -eq 0 ]; then
    CREATED_AGAIN=$(echo "$TASK_TYPE_TEXT_2" | jq -r '.created' 2>/dev/null)
    if [ "$CREATED_AGAIN" = "false" ]; then
      echo "PASS: create_task_type idempotent returns created=false"
      PASSED=$((PASSED + 1))
    else
      echo "FAIL: create_task_type idempotent expected created=false"
      FAILED=$((FAILED + 1))
      ERRORS="${ERRORS}\n  - create_task_type idempotent expected created=false"
    fi
  fi
fi

run_capture_to_var STATUS_TEXT "create_issue_status($TM_STATUS_NAME)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue_status\",\"arguments\":{\"name\":$TM_STATUS_NAME_JSON,\"category\":\"active\"}},\"id\":2}"
if [ $? -eq 0 ]; then
  assert_json_field_nonempty "create_issue_status returns status id" "$STATUS_TEXT" '.status.id'
  run_capture_to_var STATUS_TEXT_2 "create_issue_status idempotent($TM_STATUS_NAME)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue_status\",\"arguments\":{\"name\":$TM_STATUS_NAME_JSON,\"category\":\"active\"}},\"id\":2}"
  if [ $? -eq 0 ]; then
    CREATED_AGAIN=$(echo "$STATUS_TEXT_2" | jq -r '.created' 2>/dev/null)
    if [ "$CREATED_AGAIN" = "false" ]; then
      echo "PASS: create_issue_status idempotent returns created=false"
      PASSED=$((PASSED + 1))
    else
      echo "FAIL: create_issue_status idempotent expected created=false"
      FAILED=$((FAILED + 1))
      ERRORS="${ERRORS}\n  - create_issue_status idempotent expected created=false"
    fi
  fi
fi

sleep 2
run_capture_to_var PROJECT_TYPE_TEXT "get_project_type verifies task/status" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_project_type","arguments":{}},"id":2}'
if [ $? -eq 0 ]; then
  TASK_TYPE_PRESENT=$(echo "$PROJECT_TYPE_TEXT" | jq -r --arg name "$TM_TASK_TYPE_NAME" 'any(.taskTypes[]?; .name == $name)' 2>/dev/null)
  STATUS_PRESENT=$(echo "$PROJECT_TYPE_TEXT" | jq -r --arg name "$TM_STATUS_NAME" 'any(.statuses[]?; .name == $name and .category == "Active")' 2>/dev/null)
  TM_TASK_TYPE_STATUS_ID=$(echo "$PROJECT_TYPE_TEXT" | jq -r --arg name "$TM_TASK_TYPE_NAME" '.taskTypeStatuses[]? | select(.taskTypeName == $name) | .statusIds[0] // empty' 2>/dev/null | head -n 1)
  TM_TASK_TYPE_STATUS_NAME=$(echo "$PROJECT_TYPE_TEXT" | jq -r --arg id "$TM_TASK_TYPE_STATUS_ID" '.statuses[]? | select(.id == $id) | .name // empty' 2>/dev/null | head -n 1)
  if [ "$TASK_TYPE_PRESENT" = "true" ] && [ "$STATUS_PRESENT" = "true" ] && [ -n "$TM_TASK_TYPE_STATUS_NAME" ]; then
    echo "PASS: get_project_type includes created task type and status"
    PASSED=$((PASSED + 1))
    TM_TASK_TYPE_READY=true
    TM_TASK_TYPE_STATUS_NAME_JSON=$(json_string "$TM_TASK_TYPE_STATUS_NAME")
  else
    echo "FAIL: get_project_type missing created task type or status"
    FAILED=$((FAILED + 1))
    ERRORS="${ERRORS}\n  - get_project_type missing created task type or status"
  fi
fi
echo ""

##############################
# 1aa. GENERIC WORKFLOW STATUS CRUD
##############################
echo "=== 1aa. Generic Workflow Status CRUD ==="
GENERIC_WORKFLOW_ATTRIBUTE="tracker:attribute:IssueStatus"
GENERIC_WORKFLOW_STATUS_NAME="MCP Generic Status $RUN_ID"
GENERIC_WORKFLOW_STATUS_RENAMED="MCP Generic Status Renamed $RUN_ID"
GENERIC_WORKFLOW_CATEGORY_LABEL="MCP Generic Category $RUN_ID"
GENERIC_WORKFLOW_CATEGORY_UPDATED_LABEL="MCP Generic Category Updated $RUN_ID"
GENERIC_WORKFLOW_ATTRIBUTE_JSON=$(json_string "$GENERIC_WORKFLOW_ATTRIBUTE")
GENERIC_WORKFLOW_STATUS_NAME_JSON=$(json_string "$GENERIC_WORKFLOW_STATUS_NAME")
GENERIC_WORKFLOW_STATUS_RENAMED_JSON=$(json_string "$GENERIC_WORKFLOW_STATUS_RENAMED")
GENERIC_WORKFLOW_CATEGORY_LABEL_JSON=$(json_string "$GENERIC_WORKFLOW_CATEGORY_LABEL")
GENERIC_WORKFLOW_CATEGORY_UPDATED_LABEL_JSON=$(json_string "$GENERIC_WORKFLOW_CATEGORY_UPDATED_LABEL")

run_test "list_workflow_statuses($GENERIC_WORKFLOW_ATTRIBUTE)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_workflow_statuses\",\"arguments\":{\"ofAttribute\":$GENERIC_WORKFLOW_ATTRIBUTE_JSON,\"limit\":5}},\"id\":2}"
run_test "list_status_categories($GENERIC_WORKFLOW_ATTRIBUTE)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_status_categories\",\"arguments\":{\"ofAttribute\":$GENERIC_WORKFLOW_ATTRIBUTE_JSON,\"limit\":5}},\"id\":2}"

run_capture_to_var GENERIC_WORKFLOW_STATUS_TEXT "create_workflow_status($GENERIC_WORKFLOW_STATUS_NAME)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_workflow_status\",\"arguments\":{\"ofAttribute\":$GENERIC_WORKFLOW_ATTRIBUTE_JSON,\"name\":$GENERIC_WORKFLOW_STATUS_NAME_JSON,\"color\":6,\"description\":\"Generic workflow integration fixture\"}},\"id\":2}"
GENERIC_WORKFLOW_STATUS_CLEANUP_ID=$(echo "$GENERIC_WORKFLOW_STATUS_TEXT" | jq -r '.status.statusId // empty' 2>/dev/null)
if [ -n "$GENERIC_WORKFLOW_STATUS_CLEANUP_ID" ]; then
  GENERIC_WORKFLOW_STATUS_ID_JSON=$(json_string "$GENERIC_WORKFLOW_STATUS_CLEANUP_ID")
  assert_json_field_equals "create_workflow_status preserves attribute" "$GENERIC_WORKFLOW_STATUS_TEXT" ".status.ofAttribute.attributeId" "$GENERIC_WORKFLOW_ATTRIBUTE"
  sleep 2
  run_capture_to_var GENERIC_WORKFLOW_CATEGORY_TEXT "create_status_category($GENERIC_WORKFLOW_CATEGORY_LABEL)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_status_category\",\"arguments\":{\"ofAttribute\":$GENERIC_WORKFLOW_ATTRIBUTE_JSON,\"label\":$GENERIC_WORKFLOW_CATEGORY_LABEL_JSON,\"defaultStatus\":$GENERIC_WORKFLOW_STATUS_ID_JSON,\"order\":90}},\"id\":2}"
  GENERIC_WORKFLOW_CATEGORY_CLEANUP_ID=$(echo "$GENERIC_WORKFLOW_CATEGORY_TEXT" | jq -r '.category.categoryId // empty' 2>/dev/null)
  if [ -n "$GENERIC_WORKFLOW_CATEGORY_CLEANUP_ID" ]; then
    GENERIC_WORKFLOW_CATEGORY_ID_JSON=$(json_string "$GENERIC_WORKFLOW_CATEGORY_CLEANUP_ID")
    assert_json_field_equals "create_status_category preserves default status" "$GENERIC_WORKFLOW_CATEGORY_TEXT" ".category.defaultStatus.statusId" "$GENERIC_WORKFLOW_STATUS_CLEANUP_ID"
    sleep 2
    run_capture_to_var GENERIC_WORKFLOW_UPDATE_TEXT "update_workflow_status(category relationship)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_workflow_status\",\"arguments\":{\"status\":$GENERIC_WORKFLOW_STATUS_ID_JSON,\"category\":$GENERIC_WORKFLOW_CATEGORY_ID_JSON,\"description\":\"Generic workflow integration fixture updated\"}},\"id\":2}"
    assert_json_field_equals "update_workflow_status preserves category relationship" "$GENERIC_WORKFLOW_UPDATE_TEXT" ".status.category.categoryId" "$GENERIC_WORKFLOW_CATEGORY_CLEANUP_ID"
    sleep 2
    run_capture_to_var GENERIC_WORKFLOW_GET_TEXT "get_workflow_status(created)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_workflow_status\",\"arguments\":{\"status\":$GENERIC_WORKFLOW_STATUS_ID_JSON}},\"id\":2}"
    assert_json_field_equals "get_workflow_status resolves category" "$GENERIC_WORKFLOW_GET_TEXT" ".category.categoryId" "$GENERIC_WORKFLOW_CATEGORY_CLEANUP_ID"
    run_capture_to_var GENERIC_WORKFLOW_CATEGORY_UPDATE_TEXT "update_status_category(created)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_status_category\",\"arguments\":{\"category\":$GENERIC_WORKFLOW_CATEGORY_ID_JSON,\"label\":$GENERIC_WORKFLOW_CATEGORY_UPDATED_LABEL_JSON,\"order\":91}},\"id\":2}"
    assert_json_field_equals "update_status_category preserves default status" "$GENERIC_WORKFLOW_CATEGORY_UPDATE_TEXT" ".category.defaultStatus.statusId" "$GENERIC_WORKFLOW_STATUS_CLEANUP_ID"
    run_expect_error_contains "update_workflow_status(reject default rename)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_workflow_status\",\"arguments\":{\"status\":$GENERIC_WORKFLOW_STATUS_ID_JSON,\"name\":$GENERIC_WORKFLOW_STATUS_RENAMED_JSON}},\"id\":2}" \
      "still referenced"
    run_capture_to_var GENERIC_WORKFLOW_CATEGORY_AFTER_RENAME_TEXT "get_status_category(after rejected default rename)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_status_category\",\"arguments\":{\"category\":$GENERIC_WORKFLOW_CATEGORY_ID_JSON}},\"id\":2}"
    assert_json_field_equals "rejected status rename preserves category default" "$GENERIC_WORKFLOW_CATEGORY_AFTER_RENAME_TEXT" ".defaultStatus.name" "$GENERIC_WORKFLOW_STATUS_NAME"
    run_expect_error_contains "delete_status_category(in use)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_status_category\",\"arguments\":{\"category\":$GENERIC_WORKFLOW_CATEGORY_ID_JSON}},\"id\":2}" \
      "is referenced by statuses"
    run_test "update_workflow_status(clear category)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_workflow_status\",\"arguments\":{\"status\":$GENERIC_WORKFLOW_STATUS_ID_JSON,\"category\":null}},\"id\":2}"
    sleep 2
    run_test "delete_status_category(created)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_status_category\",\"arguments\":{\"category\":$GENERIC_WORKFLOW_CATEGORY_ID_JSON}},\"id\":2}"
    GENERIC_WORKFLOW_CATEGORY_CLEANUP_ID=""
  else
    skip_test "generic workflow category update/get/delete" "create_status_category did not return a category id"
  fi
  run_test "delete_workflow_status(created)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_workflow_status\",\"arguments\":{\"status\":$GENERIC_WORKFLOW_STATUS_ID_JSON}},\"id\":2}"
  GENERIC_WORKFLOW_STATUS_CLEANUP_ID=""
else
  skip_test "generic workflow category lifecycle" "create_workflow_status did not return a status id"
fi
echo ""

##############################
# 1ab. MODEL ENUM / ATTRIBUTE ADMINISTRATION
##############################
echo "=== 1ab. Model Enum / Attribute Administration ==="
MODEL_ENUM_NAME="MCP Model Enum $RUN_ID"
MODEL_ENUM_RENAMED="MCP Model Enum Renamed $RUN_ID"
MODEL_ATTRIBUTE_NAME="mcpModelField${RUN_ID//[^a-zA-Z0-9]/}"
MODEL_ENUM_NAME_JSON=$(json_string "$MODEL_ENUM_NAME")
MODEL_ENUM_RENAMED_JSON=$(json_string "$MODEL_ENUM_RENAMED")
MODEL_ATTRIBUTE_NAME_JSON=$(json_string "$MODEL_ATTRIBUTE_NAME")

run_expect_error_contains "create_huly_enum(requires confirmation)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_huly_enum\",\"arguments\":{\"name\":$MODEL_ENUM_NAME_JSON,\"values\":[\"One\",\"Two\"]}},\"id\":2}" \
  "confirm"
run_capture_to_var MODEL_ENUM_TEXT "create_huly_enum($MODEL_ENUM_NAME)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_huly_enum\",\"arguments\":{\"name\":$MODEL_ENUM_NAME_JSON,\"values\":[\"One\",\"Two\"],\"confirm\":true}},\"id\":2}"
MODEL_ENUM_CLEANUP_ID=$(echo "$MODEL_ENUM_TEXT" | jq -r '.enum.enumId // empty' 2>/dev/null)
if [ -n "$MODEL_ENUM_CLEANUP_ID" ]; then
  assert_json_field_equals "create_huly_enum returns name" "$MODEL_ENUM_TEXT" ".enum.name" "$MODEL_ENUM_NAME"
  sleep 2
  run_capture_to_var MODEL_ENUM_UPDATE_TEXT "update_huly_enum(add option and rename)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_huly_enum\",\"arguments\":{\"enum\":$MODEL_ENUM_NAME_JSON,\"name\":$MODEL_ENUM_RENAMED_JSON,\"values\":[\"One\",\"Two\",\"Three\"],\"confirm\":true}},\"id\":2}"
  assert_json_field_equals "update_huly_enum resolves name" "$MODEL_ENUM_UPDATE_TEXT" ".enum.name" "$MODEL_ENUM_RENAMED"
  sleep 2
  run_capture_to_var MODEL_ATTRIBUTE_TEXT "create_huly_attribute(class and enum names)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_huly_attribute\",\"arguments\":{\"class\":\"Issue\",\"name\":$MODEL_ATTRIBUTE_NAME_JSON,\"label\":\"MCP Model Field\",\"type\":{\"kind\":\"enum\",\"enum\":$MODEL_ENUM_RENAMED_JSON},\"hidden\":false,\"confirm\":true}},\"id\":2}"
  MODEL_ATTRIBUTE_CLEANUP_ID=$(echo "$MODEL_ATTRIBUTE_TEXT" | jq -r '.attribute.attributeId // empty' 2>/dev/null)
  if [ -n "$MODEL_ATTRIBUTE_CLEANUP_ID" ]; then
    MODEL_ATTRIBUTE_ID_JSON=$(json_string "$MODEL_ATTRIBUTE_CLEANUP_ID")
    assert_json_field_equals "create_huly_attribute resolves Issue class" "$MODEL_ATTRIBUTE_TEXT" ".attribute.ownerClassId" "tracker:class:Issue"
    run_capture_to_var MODEL_ATTRIBUTE_HIDE_TEXT "update_huly_attribute(hide)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_huly_attribute\",\"arguments\":{\"attribute\":$MODEL_ATTRIBUTE_ID_JSON,\"hidden\":true,\"confirm\":true}},\"id\":2}"
    assert_json_field_equals "update_huly_attribute hides attribute" "$MODEL_ATTRIBUTE_HIDE_TEXT" ".attribute.hidden" "true"
    run_test "update_huly_attribute(unhide)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_huly_attribute\",\"arguments\":{\"attribute\":$MODEL_ATTRIBUTE_ID_JSON,\"hidden\":false,\"confirm\":true}},\"id\":2}"
    sleep 2
    run_test "delete_huly_attribute(unused custom attribute)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_huly_attribute\",\"arguments\":{\"attribute\":$MODEL_ATTRIBUTE_ID_JSON,\"confirm\":true}},\"id\":2}"
    MODEL_ATTRIBUTE_CLEANUP_ID=""
  else
    skip_test "model attribute update/delete" "create_huly_attribute did not return an attribute id"
  fi
  sleep 2
  MODEL_ENUM_ID_JSON=$(json_string "$MODEL_ENUM_CLEANUP_ID")
  run_test "delete_huly_enum(unreferenced)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_huly_enum\",\"arguments\":{\"enum\":$MODEL_ENUM_ID_JSON,\"confirm\":true}},\"id\":2}"
  MODEL_ENUM_CLEANUP_ID=""
else
  skip_test "model attribute lifecycle" "create_huly_enum did not return an enum id"
fi
echo ""

##############################
# 1ac. SEQUENCE ADMINISTRATION
##############################
echo "=== 1ac. Sequence Administration ==="
SEQUENCE_STANDARD_CLASS="core:class:DomainIndexConfiguration"
SEQUENCE_CUSTOM_CLASS="core:class:UserStatus"
SEQUENCE_CUSTOM_PREFIX="MCP${RUN_ID//[^a-zA-Z0-9]/}"
SEQUENCE_CUSTOM_UPDATED_PREFIX="MCPU${RUN_ID//[^a-zA-Z0-9]/}"
SEQUENCE_STANDARD_CLASS_JSON=$(json_string "$SEQUENCE_STANDARD_CLASS")
SEQUENCE_CUSTOM_CLASS_JSON=$(json_string "$SEQUENCE_CUSTOM_CLASS")
SEQUENCE_CUSTOM_PREFIX_JSON=$(json_string "$SEQUENCE_CUSTOM_PREFIX")
SEQUENCE_CUSTOM_UPDATED_PREFIX_JSON=$(json_string "$SEQUENCE_CUSTOM_UPDATED_PREFIX")

run_expect_error_contains "create_huly_sequence(requires confirmation)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_huly_sequence\",\"arguments\":{\"class\":$SEQUENCE_STANDARD_CLASS_JSON,\"kind\":\"standard\"}},\"id\":2}" \
  "confirm"
run_capture_to_var SEQUENCE_STANDARD_TEXT "create_huly_sequence(standard)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_huly_sequence\",\"arguments\":{\"class\":$SEQUENCE_STANDARD_CLASS_JSON,\"kind\":\"standard\",\"confirm\":true}},\"id\":2}"
SEQUENCE_STANDARD_CLEANUP_ID=$(printf '%s\n' "$SEQUENCE_STANDARD_TEXT" | jq -r '.sequence.sequenceId // empty' 2>/dev/null)
SEQUENCE_STANDARD_CREATED=$(printf '%s\n' "$SEQUENCE_STANDARD_TEXT" | jq -r '.created // false' 2>/dev/null)
if [ -n "$SEQUENCE_STANDARD_CLEANUP_ID" ] && [ "$SEQUENCE_STANDARD_CREATED" = "true" ]; then
  SEQUENCE_STANDARD_CLEANUP_ENTRY=$(jq -nc --arg sequenceId "$SEQUENCE_STANDARD_CLEANUP_ID" \
    '{sequenceId: $sequenceId, expectedCurrentValue: 0, method: "guarded-tool-delete"}')
  SEQUENCE_CLEANUP_ENTRIES="${SEQUENCE_CLEANUP_ENTRIES}${SEQUENCE_STANDARD_CLEANUP_ENTRY}"$'\n'
  assert_json_field_equals "create_huly_sequence starts standard counter at zero" "$SEQUENCE_STANDARD_TEXT" ".sequence.currentValue" "0"
  sleep 2
  SEQUENCE_STANDARD_ID_JSON=$(json_string "$SEQUENCE_STANDARD_CLEANUP_ID")
  if run_test "delete_huly_sequence(standard rollback)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_huly_sequence\",\"arguments\":{\"sequence\":$SEQUENCE_STANDARD_ID_JSON,\"expectedCurrentValue\":0,\"confirm\":true}},\"id\":2}"; then
    SEQUENCE_CLEANUP_ENTRIES=$(printf '%s' "$SEQUENCE_CLEANUP_ENTRIES" | jq -c --arg id "$SEQUENCE_STANDARD_CLEANUP_ID" 'select(.sequenceId != $id)' || true)
    sleep 2
    run_capture_to_var SEQUENCE_STANDARD_AFTER_DELETE_TEXT "list_huly_sequences(after standard rollback)" \
      '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_huly_sequences","arguments":{}},"id":2}'
    assert_json_field_equals "standard rollback removed the created sequence" "$SEQUENCE_STANDARD_AFTER_DELETE_TEXT" \
      "[.sequences[] | select(.sequenceId == \"$SEQUENCE_STANDARD_CLEANUP_ID\")] | length" "0"
  fi
elif [ -n "$SEQUENCE_STANDARD_CLEANUP_ID" ]; then
  skip_test "standard sequence rollback" "target class already had a sequence; pre-existing metadata was left untouched"
else
  skip_test "standard sequence rollback" "create_huly_sequence did not return a sequence id"
fi

run_capture_to_var SEQUENCE_CUSTOM_TEXT "create_huly_sequence(custom)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_huly_sequence\",\"arguments\":{\"class\":$SEQUENCE_CUSTOM_CLASS_JSON,\"kind\":\"custom\",\"prefix\":$SEQUENCE_CUSTOM_PREFIX_JSON,\"confirm\":true}},\"id\":2}"
SEQUENCE_CUSTOM_CLEANUP_ID=$(printf '%s\n' "$SEQUENCE_CUSTOM_TEXT" | jq -r '.sequence.sequenceId // empty' 2>/dev/null)
SEQUENCE_CUSTOM_CREATED=$(printf '%s\n' "$SEQUENCE_CUSTOM_TEXT" | jq -r '.created // false' 2>/dev/null)
if [ -n "$SEQUENCE_CUSTOM_CLEANUP_ID" ] && [ "$SEQUENCE_CUSTOM_CREATED" = "true" ]; then
  SEQUENCE_CUSTOM_CLEANUP_ENTRY=$(jq -nc --arg sequenceId "$SEQUENCE_CUSTOM_CLEANUP_ID" \
    '{sequenceId: $sequenceId, expectedCurrentValue: 0, method: "owned-sdk-delete"}')
  SEQUENCE_CLEANUP_ENTRIES="${SEQUENCE_CLEANUP_ENTRIES}${SEQUENCE_CUSTOM_CLEANUP_ENTRY}"$'\n'
  assert_json_field_equals "create_huly_sequence returns custom prefix" "$SEQUENCE_CUSTOM_TEXT" ".sequence.prefix" "$SEQUENCE_CUSTOM_PREFIX"
  sleep 2
  SEQUENCE_CUSTOM_ID_JSON=$(json_string "$SEQUENCE_CUSTOM_CLEANUP_ID")
  run_shell_test "increment owned custom sequence fixture" \
    pnpm tsx scripts/integration-sequence.ts --action increment --sequence "$SEQUENCE_CUSTOM_CLEANUP_ID"
  sleep 2
  run_capture_to_var SEQUENCE_CUSTOM_AFTER_INCREMENT_TEXT "list_huly_sequences(after semantic increment)" \
    '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_huly_sequences","arguments":{}},"id":2}'
  assert_json_field_equals "semantic increment persisted a nonzero counter" "$SEQUENCE_CUSTOM_AFTER_INCREMENT_TEXT" \
    ".sequences[] | select(.sequenceId == \"$SEQUENCE_CUSTOM_CLEANUP_ID\") | .currentValue" "1"
  run_capture_to_var SEQUENCE_CUSTOM_RETRY_TEXT "create_huly_sequence(custom retry)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_huly_sequence\",\"arguments\":{\"class\":$SEQUENCE_CUSTOM_CLASS_JSON,\"kind\":\"custom\",\"prefix\":$SEQUENCE_CUSTOM_PREFIX_JSON,\"confirm\":true}},\"id\":2}"
  assert_json_field_equals "create_huly_sequence retry does not recreate" "$SEQUENCE_CUSTOM_RETRY_TEXT" ".created" "false"
  sleep 2
  run_capture_to_var SEQUENCE_CUSTOM_AFTER_RETRY_TEXT "list_huly_sequences(after retry)" \
    '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_huly_sequences","arguments":{}},"id":2}'
  assert_json_field_equals "create_huly_sequence retry preserves advanced counter" "$SEQUENCE_CUSTOM_AFTER_RETRY_TEXT" \
    ".sequences[] | select(.sequenceId == \"$SEQUENCE_CUSTOM_CLEANUP_ID\") | .currentValue" "1"
  run_capture_to_var SEQUENCE_CUSTOM_UPDATE_TEXT "update_huly_custom_sequence(prefix only)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_huly_custom_sequence\",\"arguments\":{\"sequence\":$SEQUENCE_CUSTOM_ID_JSON,\"prefix\":$SEQUENCE_CUSTOM_UPDATED_PREFIX_JSON,\"confirm\":true}},\"id\":2}"
  assert_json_field_equals "update_huly_custom_sequence preserves counter" "$SEQUENCE_CUSTOM_UPDATE_TEXT" ".sequence.currentValue" "1"
  sleep 2
  run_capture_to_var SEQUENCE_CUSTOM_AFTER_UPDATE_TEXT "list_huly_sequences(after prefix update)" \
    '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_huly_sequences","arguments":{}},"id":2}'
  assert_json_field_equals "prefix update persisted without changing counter" "$SEQUENCE_CUSTOM_AFTER_UPDATE_TEXT" \
    ".sequences[] | select(.sequenceId == \"$SEQUENCE_CUSTOM_CLEANUP_ID\") | [.prefix, .currentValue] | join(\":\")" "$SEQUENCE_CUSTOM_UPDATED_PREFIX:1"
  run_expect_error_contains "delete_huly_sequence(refuses used sequence)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_huly_sequence\",\"arguments\":{\"sequence\":$SEQUENCE_CUSTOM_ID_JSON,\"expectedCurrentValue\":0,\"confirm\":true}},\"id\":2}" \
    "not expected value"
  if run_shell_test "delete owned custom sequence fixture" \
    pnpm tsx scripts/integration-sequence.ts --action delete-owned --sequence "$SEQUENCE_CUSTOM_CLEANUP_ID"; then
    SEQUENCE_CLEANUP_ENTRIES=$(printf '%s' "$SEQUENCE_CLEANUP_ENTRIES" | jq -c --arg id "$SEQUENCE_CUSTOM_CLEANUP_ID" 'select(.sequenceId != $id)' || true)
    sleep 2
    run_capture_to_var SEQUENCE_CUSTOM_AFTER_DELETE_TEXT "list_huly_sequences(after owned fixture rollback)" \
      '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_huly_sequences","arguments":{}},"id":2}'
    assert_json_field_equals "owned fixture rollback removed the custom sequence" "$SEQUENCE_CUSTOM_AFTER_DELETE_TEXT" \
      "[.sequences[] | select(.sequenceId == \"$SEQUENCE_CUSTOM_CLEANUP_ID\")] | length" "0"
  fi
elif [ -n "$SEQUENCE_CUSTOM_CLEANUP_ID" ]; then
  skip_test "custom sequence retry/update/rollback" "target class already had a sequence; pre-existing metadata was left untouched"
else
  skip_test "custom sequence retry/update/rollback" "create_huly_sequence did not return a custom sequence id"
fi
echo ""

##############################
# 1ad. SECURITY METADATA ADMINISTRATION
##############################
echo "=== 1ad. Security Metadata Administration ==="
SECURITY_PERMISSION_LABEL="MCP Security Permission $RUN_ID"
SECURITY_PERMISSION_LABEL_JSON=$(json_string "$SECURITY_PERMISSION_LABEL")

run_expect_error_contains "create_huly_permission(requires confirmation)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_huly_permission\",\"arguments\":{\"label\":$SECURITY_PERMISSION_LABEL_JSON,\"scope\":\"space\"}},\"id\":2}" \
  "confirm"
run_capture_to_var SECURITY_PERMISSION_TEXT "create_huly_permission($SECURITY_PERMISSION_LABEL)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_huly_permission\",\"arguments\":{\"label\":$SECURITY_PERMISSION_LABEL_JSON,\"scope\":\"space\",\"description\":\"Temporary integration permission\",\"confirm\":true}},\"id\":2}"
SECURITY_PERMISSION_CLEANUP_ID=$(printf '%s\n' "$SECURITY_PERMISSION_TEXT" | jq -r '.permission.id // empty' 2>/dev/null)
if [ -n "$SECURITY_PERMISSION_CLEANUP_ID" ]; then
  assert_json_field_equals "create_huly_permission returns clear label" "$SECURITY_PERMISSION_TEXT" ".permission.label" "$SECURITY_PERMISSION_LABEL"
  sleep 2
  run_capture_to_var SECURITY_PERMISSION_UPDATE_TEXT "update_huly_permission(clear label lookup)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_huly_permission\",\"arguments\":{\"permission\":$SECURITY_PERMISSION_LABEL_JSON,\"description\":\"Updated integration permission\",\"confirm\":true}},\"id\":2}"
  assert_json_field_equals "update_huly_permission persists description" "$SECURITY_PERMISSION_UPDATE_TEXT" ".permission.description" "Updated integration permission"
  sleep 2
  run_capture_to_var SECURITY_PERMISSION_REREAD_TEXT "list_space_permissions(after update)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_space_permissions\",\"arguments\":{\"search\":$SECURITY_PERMISSION_LABEL_JSON,\"limit\":10}},\"id\":2}"
  assert_json_field_equals "permission reread sees persisted description label" "$SECURITY_PERMISSION_REREAD_TEXT" ".permissions[0].description" "embedded:embedded:Updated integration permission"
  run_expect_error_contains "delete_huly_permission(protect built-in)" \
    '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"delete_huly_permission","arguments":{"permission":"core:permission:UpdateObject","confirm":true}},"id":2}' \
    "built-in"
  SECURITY_PERMISSION_ID_JSON=$(json_string "$SECURITY_PERMISSION_CLEANUP_ID")
  if run_test "delete_huly_permission(unreferenced custom)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_huly_permission\",\"arguments\":{\"permission\":$SECURITY_PERMISSION_ID_JSON,\"confirm\":true}},\"id\":2}"; then
    sleep 2
    run_capture_to_var SECURITY_PERMISSION_DELETED_TEXT "list_space_permissions(after delete)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_space_permissions\",\"arguments\":{\"search\":$SECURITY_PERMISSION_LABEL_JSON,\"limit\":10}},\"id\":2}"
    assert_json_field_equals "permission reread confirms deletion" "$SECURITY_PERMISSION_DELETED_TEXT" ".total" "0"
    SECURITY_PERMISSION_CLEANUP_ID=""
  fi
else
  skip_test "permission update/delete lifecycle" "create_huly_permission did not return an id"
fi

CLASS_COLLABORATOR_FIXTURE_CLASS="core:class:UserStatus"
CLASS_COLLABORATOR_FIXTURE_CLASS_JSON=$(json_string "$CLASS_COLLABORATOR_FIXTURE_CLASS")
run_capture_to_var CLASS_COLLABORATOR_INITIAL_TEXT "get_class_collaborator_metadata($CLASS_COLLABORATOR_FIXTURE_CLASS)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_class_collaborator_metadata\",\"arguments\":{\"class\":$CLASS_COLLABORATOR_FIXTURE_CLASS_JSON}},\"id\":2}"
CLASS_COLLABORATOR_INITIAL_CONFIGURED=$(printf '%s\n' "$CLASS_COLLABORATOR_INITIAL_TEXT" | jq -r '.configured // false' 2>/dev/null)
if [ "$CLASS_COLLABORATOR_INITIAL_CONFIGURED" = "false" ]; then
  run_capture_to_var CLASS_COLLABORATOR_SET_TEXT "set_class_collaborator_metadata(none)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"set_class_collaborator_metadata\",\"arguments\":{\"class\":$CLASS_COLLABORATOR_FIXTURE_CLASS_JSON,\"fieldSelection\":{\"mode\":\"none\"},\"provideSecurity\":false,\"provideAttachedSecurity\":false,\"confirm\":true}},\"id\":2}"
  CLASS_COLLABORATOR_CLEANUP_CLASS="$CLASS_COLLABORATOR_FIXTURE_CLASS"
  assert_json_field_equals "set_class_collaborator_metadata returns none selection" "$CLASS_COLLABORATOR_SET_TEXT" ".metadata.fieldSelection.mode" "none"
  sleep 2
  run_capture_to_var CLASS_COLLABORATOR_GET_TEXT "get_class_collaborator_metadata(after set)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_class_collaborator_metadata\",\"arguments\":{\"class\":$CLASS_COLLABORATOR_FIXTURE_CLASS_JSON}},\"id\":2}"
  assert_json_field_equals "get_class_collaborator_metadata sees direct record" "$CLASS_COLLABORATOR_GET_TEXT" ".configured" "true"
  if run_test "delete_class_collaborator_metadata(direct record)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_class_collaborator_metadata\",\"arguments\":{\"class\":$CLASS_COLLABORATOR_FIXTURE_CLASS_JSON,\"confirm\":true}},\"id\":2}"; then
    sleep 2
    run_capture_to_var CLASS_COLLABORATOR_DELETED_TEXT "get_class_collaborator_metadata(after delete)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_class_collaborator_metadata\",\"arguments\":{\"class\":$CLASS_COLLABORATOR_FIXTURE_CLASS_JSON}},\"id\":2}"
    assert_json_field_equals "collaborator metadata reread confirms deletion" "$CLASS_COLLABORATOR_DELETED_TEXT" ".configured" "false"
    CLASS_COLLABORATOR_CLEANUP_CLASS=""
  fi
else
  skip_test "class collaborator metadata lifecycle" "$CLASS_COLLABORATOR_FIXTURE_CLASS already has direct metadata"
fi

TRAINING_SPACE_TYPE_TEXT=$(run_capture_only \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_space_type","arguments":{"spaceType":"Default Trainings"}},"id":2}' || true)
TRAINING_ROLE_NAME=$(printf '%s\n' "$TRAINING_SPACE_TYPE_TEXT" | jq -r '.roles[]? | select((.permissions | length) > 0) | .name' 2>/dev/null | head -n 1)
TRAINING_SPACE_TYPE_ID=$(printf '%s\n' "$TRAINING_SPACE_TYPE_TEXT" | jq -r '.id // empty' 2>/dev/null)
TRAINING_ROLE_PERMISSIONS_JSON=$(printf '%s\n' "$TRAINING_SPACE_TYPE_TEXT" | jq -c --arg role "$TRAINING_ROLE_NAME" '.roles[]? | select(.name == $role) | .permissions' 2>/dev/null)
SPACE_PERMISSION_TEXT=$(run_capture_only \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_space_permissions","arguments":{"scope":"space","limit":100}},"id":2}' || true)
TRAINING_EXTRA_PERMISSION_ID=$(printf '%s\n' "$SPACE_PERMISSION_TEXT" | jq -r --argjson current "${TRAINING_ROLE_PERMISSIONS_JSON:-[]}" \
  '.permissions[]? | select((.id as $id | $current | index($id)) == null) | .id' 2>/dev/null | head -n 1)
TRAINING_EXTRA_PERMISSION_LABEL=$(printf '%s\n' "$SPACE_PERMISSION_TEXT" | jq -r --arg id "$TRAINING_EXTRA_PERMISSION_ID" \
  '.permissions[]? | select(.id == $id) | (.label | split(":") | last)' 2>/dev/null)
if [ -n "$TRAINING_SPACE_TYPE_ID" ] && [ -n "$TRAINING_ROLE_NAME" ] && [ -n "$TRAINING_EXTRA_PERMISSION_LABEL" ] && [ -n "$TRAINING_ROLE_PERMISSIONS_JSON" ]; then
  TRAINING_MUTATED_PERMISSIONS_JSON=$(printf '%s\n' "$TRAINING_ROLE_PERMISSIONS_JSON" | jq -c --arg permission "$TRAINING_EXTRA_PERMISSION_LABEL" '. + [$permission]')
  TRAINING_SPACE_TYPE_NAME_JSON=$(json_string "Default Trainings")
  TRAINING_ROLE_NAME_JSON=$(json_string "$TRAINING_ROLE_NAME")
  SPACE_ROLE_CLEANUP_SPACE_TYPE="$TRAINING_SPACE_TYPE_ID"
  SPACE_ROLE_CLEANUP_ROLE="$TRAINING_ROLE_NAME"
  SPACE_ROLE_CLEANUP_PERMISSIONS_JSON="$TRAINING_ROLE_PERMISSIONS_JSON"
  run_capture_to_var SPACE_ROLE_SET_TEXT "set_space_role_permissions(clear names)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"set_space_role_permissions\",\"arguments\":{\"spaceType\":$TRAINING_SPACE_TYPE_NAME_JSON,\"role\":$TRAINING_ROLE_NAME_JSON,\"permissions\":$TRAINING_MUTATED_PERMISSIONS_JSON,\"confirm\":true}},\"id\":2}"
  assert_json_array_contains "set_space_role_permissions resolves permission label" "$SPACE_ROLE_SET_TEXT" ".role.permissions" "$TRAINING_EXTRA_PERMISSION_ID"
  sleep 2
  run_capture_to_var SPACE_ROLE_REREAD_TEXT "get_space_type(after permission set)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_space_type\",\"arguments\":{\"spaceType\":$TRAINING_SPACE_TYPE_NAME_JSON}},\"id\":2}"
  assert_json_array_contains "role reread sees added permission" "$SPACE_ROLE_REREAD_TEXT" ".roles[] | select(.name == $TRAINING_ROLE_NAME_JSON) | .permissions" "$TRAINING_EXTRA_PERMISSION_ID"
  TRAINING_SPACE_TYPE_ID_JSON=$(json_string "$TRAINING_SPACE_TYPE_ID")
  if run_test "set_space_role_permissions(restore)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"set_space_role_permissions\",\"arguments\":{\"spaceType\":$TRAINING_SPACE_TYPE_ID_JSON,\"role\":$TRAINING_ROLE_NAME_JSON,\"permissions\":$TRAINING_ROLE_PERMISSIONS_JSON,\"confirm\":true}},\"id\":2}"; then
    sleep 2
    run_capture_to_var SPACE_ROLE_RESTORED_TEXT "get_space_type(after role restore)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_space_type\",\"arguments\":{\"spaceType\":$TRAINING_SPACE_TYPE_ID_JSON}},\"id\":2}"
    RESTORED_ROLE_PERMISSIONS_JSON=$(printf '%s\n' "$SPACE_ROLE_RESTORED_TEXT" | jq -c --arg role "$TRAINING_ROLE_NAME" '.roles[]? | select(.name == $role) | .permissions | sort' 2>/dev/null)
    EXPECTED_ROLE_PERMISSIONS_JSON=$(printf '%s\n' "$TRAINING_ROLE_PERMISSIONS_JSON" | jq -c 'sort')
    assert_json_field_equals "role reread confirms exact restoration" "{\"actual\":$RESTORED_ROLE_PERMISSIONS_JSON}" ".actual | sort | join(\",\")" "$(printf '%s' "$EXPECTED_ROLE_PERMISSIONS_JSON" | jq -r 'sort | join(",")')"
    SPACE_ROLE_CLEANUP_SPACE_TYPE=""
    SPACE_ROLE_CLEANUP_ROLE=""
    SPACE_ROLE_CLEANUP_PERMISSIONS_JSON=""
  fi

  SECURITY_ROLE_NAME="MCP Integration Role $RUN_ID"
  SECURITY_ROLE_NAME_JSON=$(json_string "$SECURITY_ROLE_NAME")
  TRAINING_EXTRA_PERMISSION_LABEL_JSON=$(json_string "$TRAINING_EXTRA_PERMISSION_LABEL")
  run_capture_to_var SECURITY_ROLE_CREATE_TEXT "create_space_role($SECURITY_ROLE_NAME)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_space_role\",\"arguments\":{\"spaceType\":$TRAINING_SPACE_TYPE_NAME_JSON,\"name\":$SECURITY_ROLE_NAME_JSON,\"permissions\":[$TRAINING_EXTRA_PERMISSION_LABEL_JSON],\"confirm\":true}},\"id\":2}"
  SECURITY_ROLE_ID=$(printf '%s\n' "$SECURITY_ROLE_CREATE_TEXT" | jq -r '.role.id // empty' 2>/dev/null)
  if [ -n "$SECURITY_ROLE_ID" ]; then
    SPACE_ROLE_CREATED_CLEANUP_SPACE_TYPE="$TRAINING_SPACE_TYPE_ID"
    SPACE_ROLE_CREATED_CLEANUP_ROLE="$SECURITY_ROLE_ID"
    sleep 2
    run_shell_test "create_space_role persists Role and assignment Attribute" \
      pnpm tsx scripts/integration-security-role.ts --action verify --spaceType "$TRAINING_SPACE_TYPE_ID" --role "$SECURITY_ROLE_ID"
    if run_shell_test "cleanup create_space_role fixture" \
      pnpm tsx scripts/integration-security-role.ts --action delete --spaceType "$TRAINING_SPACE_TYPE_ID" --role "$SECURITY_ROLE_ID"; then
      sleep 2
      if run_shell_test "create_space_role cleanup is persistent" \
        pnpm tsx scripts/integration-security-role.ts --action verify-absent --spaceType "$TRAINING_SPACE_TYPE_ID" --role "$SECURITY_ROLE_ID"; then
        SPACE_ROLE_CREATED_CLEANUP_SPACE_TYPE=""
        SPACE_ROLE_CREATED_CLEANUP_ROLE=""
      fi
    fi
  else
    skip_test "create_space_role persistence lifecycle" "create_space_role did not return a role id"
  fi
else
  skip_test "space role permission lifecycle" "no restorable Default Trainings role and extra space permission fixture"
fi
echo ""

##############################
# 1b. LEADS (read and mutation coverage)
##############################
echo "=== 1b. Leads ==="
FUNNELS_TEXT=$(run_capture_only \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_funnels","arguments":{"limit":5}},"id":2}')
if [ $? -eq 0 ]; then
  FUNNEL_COUNT=$(echo "$FUNNELS_TEXT" | jq -r '.funnels | length' 2>/dev/null)
  if [ -n "$FUNNEL_COUNT" ] && [ "$FUNNEL_COUNT" -gt 0 ]; then
    FIRST_FUNNEL_ID=$(echo "$FUNNELS_TEXT" | jq -r '.funnels[0].identifier // empty' 2>/dev/null)
    FIRST_FUNNEL_NAME=$(echo "$FUNNELS_TEXT" | jq -r '.funnels[0].name // empty' 2>/dev/null)

    run_test "list_funnels" \
      '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_funnels","arguments":{"limit":5}},"id":2}'

    if [ -n "$FIRST_FUNNEL_ID" ]; then
      FIRST_FUNNEL_ID_JSON=$(json_string "$FIRST_FUNNEL_ID")
      run_capture_to_var FUNNEL_DETAIL_TEXT "get_funnel($FIRST_FUNNEL_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_funnel\",\"arguments\":{\"funnel\":$FIRST_FUNNEL_ID_JSON}},\"id\":2}"
      if [ $? -eq 0 ]; then
        FUNNEL_PROJECT_TYPE=$(echo "$FUNNEL_DETAIL_TEXT" | jq -r '.projectType.id // empty' 2>/dev/null)
        FUNNEL_PROJECT_TYPE_JSON=$(json_string "$FUNNEL_PROJECT_TYPE")
        LEAD_TASK_TYPE_ID=$(echo "$FUNNEL_DETAIL_TEXT" | jq -r '.workflow[0].id // empty' 2>/dev/null)
        LEAD_TASK_TYPE_ID_JSON=$(json_string "$LEAD_TASK_TYPE_ID")
        FUNNEL_ADMIN_NAME="Integration funnel $RUN_ID-$$"
        FUNNEL_ADMIN_NAME_JSON=$(json_string "$FUNNEL_ADMIN_NAME")
        run_capture_to_var FUNNEL_CREATE_TEXT "create_funnel($FUNNEL_ADMIN_NAME)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_funnel\",\"arguments\":{\"name\":$FUNNEL_ADMIN_NAME_JSON,\"projectType\":$FUNNEL_PROJECT_TYPE_JSON,\"description\":\"integration funnel\",\"fullDescription\":\"Native [reference](https://example.invalid) coverage\"}},\"id\":2}"
        if [ $? -eq 0 ]; then
          FUNNEL_CLEANUP_ID=$(echo "$FUNNEL_CREATE_TEXT" | jq -r '.identifier // empty' 2>/dev/null)
          FUNNEL_CLEANUP_ID_JSON=$(json_string "$FUNNEL_CLEANUP_ID")
          restart_http_transport_if_needed "after create_funnel" || exit 1
          run_test "get_funnel(created:$FUNNEL_CLEANUP_ID)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_funnel\",\"arguments\":{\"funnel\":$FUNNEL_CLEANUP_ID_JSON}},\"id\":2}"
          run_test "update_funnel($FUNNEL_CLEANUP_ID)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_funnel\",\"arguments\":{\"funnel\":$FUNNEL_CLEANUP_ID_JSON,\"description\":null}},\"id\":2}"
          restart_http_transport_if_needed "after update_funnel" || exit 1
          run_capture_to_var FUNNEL_ARCHIVE_TEXT "archive_funnel($FUNNEL_CLEANUP_ID)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"archive_funnel\",\"arguments\":{\"funnel\":$FUNNEL_CLEANUP_ID_JSON}},\"id\":2}"
          if [ $? -eq 0 ]; then
            restart_http_transport_if_needed "after archive_funnel" || exit 1
            run_capture_to_var FUNNEL_ARCHIVED_DETAIL "get_funnel(archived:$FUNNEL_CLEANUP_ID)" \
              "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_funnel\",\"arguments\":{\"funnel\":$FUNNEL_CLEANUP_ID_JSON}},\"id\":2}"
            if assert_json_field_equals "archive_funnel is visible before deletion" "$FUNNEL_ARCHIVED_DETAIL" '.archived' "true"; then
              run_capture_to_var FUNNEL_DELETE_TEXT "delete_funnel($FUNNEL_CLEANUP_ID)" \
                "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_funnel\",\"arguments\":{\"funnel\":$FUNNEL_CLEANUP_ID_JSON,\"expectedLeads\":0,\"expectedComments\":0,\"expectedAttachments\":0}},\"id\":2}"
              if [ $? -eq 0 ]; then
                assert_json_field_equals "delete_funnel reports deleted" "$FUNNEL_DELETE_TEXT" '.deleted' "true"
                restart_http_transport_if_needed "after delete_funnel" || exit 1
                run_expect_error_contains "get_funnel(deleted:$FUNNEL_CLEANUP_ID)" \
                  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_funnel\",\"arguments\":{\"funnel\":$FUNNEL_CLEANUP_ID_JSON}},\"id\":2}" \
                  "not found"
                if [ $? -eq 0 ]; then
                  FUNNEL_CLEANUP_ID=""
                fi
              fi
            fi
          fi
        fi
      fi

      LEAD_FIXTURE_SUFFIX="$RUN_ID-$$"
      LEAD_PERSON_EMAIL="lead-person-$LEAD_FIXTURE_SUFFIX@test.local"
      LEAD_PERSON_EMAIL_JSON=$(json_string "$LEAD_PERSON_EMAIL")
      LEAD_PERSON_ID=""
      LEAD_PERSON_TITLE="Integration person lead $LEAD_FIXTURE_SUFFIX"
      LEAD_PERSON_TITLE_JSON=$(json_string "$LEAD_PERSON_TITLE")
      run_capture_to_var LEAD_PERSON_TEXT "create_person(for_create_lead)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_person\",\"arguments\":{\"firstName\":\"Lead\",\"lastName\":\"Person $LEAD_FIXTURE_SUFFIX\",\"email\":$LEAD_PERSON_EMAIL_JSON}},\"id\":2}"
      if [ $? -eq 0 ]; then
      LEAD_PERSON_ID=$(echo "$LEAD_PERSON_TEXT" | jq -r '.id // empty' 2>/dev/null)
      if [ -n "$LEAD_PERSON_ID" ]; then
        # Register the person before any Customer-mixin or lead mutation so an
        # interrupted run can remove the exact fixture it created.
        LEAD_PERSON_CLEANUP_ID="$LEAD_PERSON_ID"
        wait_for_person_detail LEAD_PERSON_DETAIL "create_person exact person/email visibility" \
          "$LEAD_PERSON_ID" "$LEAD_PERSON_EMAIL"
        LEAD_PERSON_NAME=$(printf '%s\n' "$LEAD_PERSON_DETAIL" | jq -r '.name // empty' 2>/dev/null)
        LEAD_PERSON_NAME_JSON=$(json_string "$LEAD_PERSON_NAME")
        LEAD_PERSON_ID_JSON=$(json_string "$LEAD_PERSON_ID")
        run_capture_to_var_fresh PERSON_CUSTOMER_BY_ID_TEXT "make_person_customer(id:$LEAD_PERSON_ID)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"make_person_customer\",\"arguments\":{\"identifier\":$LEAD_PERSON_ID_JSON}},\"id\":2}"
        if [ $? -eq 0 ]; then
          assert_json_field_equals "make_person_customer first application" "$PERSON_CUSTOMER_BY_ID_TEXT" '.applied' "true"
          wait_for_person_customer_noop PERSON_CUSTOMER_SECOND_TEXT \
            "make_person_customer second application is no-op" "$LEAD_PERSON_ID"
        fi
        wait_for_person_customer_noop PERSON_CUSTOMER_BY_EMAIL_TEXT \
          "make_person_customer email resolves existing person" "$LEAD_PERSON_EMAIL"
        wait_for_person_customer_noop PERSON_CUSTOMER_BY_NAME_TEXT \
          "make_person_customer canonical name resolves existing person" "$LEAD_PERSON_NAME"
        run_capture_to_var_fresh PERSON_CUSTOMER_PERSONS_TEXT "list_persons confirms no inline person creation" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_persons\",\"arguments\":{\"emailSearch\":$LEAD_PERSON_EMAIL_JSON,\"limit\":10}},\"id\":2}"
        if [ $? -eq 0 ]; then
          assert_json_field_equals "make_person_customer keeps one exact person" "$PERSON_CUSTOMER_PERSONS_TEXT" 'length' "1"
          assert_json_field_equals "make_person_customer preserves person ID" "$PERSON_CUSTOMER_PERSONS_TEXT" '.[0].id' "$LEAD_PERSON_ID"
          assert_json_field_equals "make_person_customer preserves person name" "$PERSON_CUSTOMER_PERSONS_TEXT" '.[0].name' "$LEAD_PERSON_NAME"
        fi

        LEAD_AMBIGUOUS_EMAIL="lead-person-ambiguous-$LEAD_FIXTURE_SUFFIX@test.local"
        LEAD_AMBIGUOUS_EMAIL_JSON=$(json_string "$LEAD_AMBIGUOUS_EMAIL")
        run_capture_to_var LEAD_AMBIGUOUS_PERSON_TEXT "create_person(duplicate lead display name)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_person\",\"arguments\":{\"firstName\":\"Lead\",\"lastName\":\"Person $LEAD_FIXTURE_SUFFIX\",\"email\":$LEAD_AMBIGUOUS_EMAIL_JSON}},\"id\":2}"
        if [ $? -eq 0 ]; then
          LEAD_PERSON_AMBIGUOUS_CLEANUP_ID=$(echo "$LEAD_AMBIGUOUS_PERSON_TEXT" | jq -r '.id // empty' 2>/dev/null)
          if [ -n "$LEAD_PERSON_AMBIGUOUS_CLEANUP_ID" ]; then
            # Register the second exact-name fixture before the ambiguity probe
            # so interrupted runs can remove it without guessing.
            wait_for_person_detail LEAD_AMBIGUOUS_PERSON_DETAIL \
              "duplicate lead person exact visibility" "$LEAD_PERSON_AMBIGUOUS_CLEANUP_ID" "$LEAD_AMBIGUOUS_EMAIL"
            wait_for_error_contains "make_person_customer rejects ambiguous canonical display name" \
              "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"make_person_customer\",\"arguments\":{\"identifier\":$LEAD_PERSON_NAME_JSON}},\"id\":2}" \
              "matched 2 people" 40
          else
            fail_test "duplicate lead display name fixture" "create_person returned no stable person ID"
          fi
        fi
      else
        fail_test "make_person_customer fixture" "create_person returned no stable person ID"
      fi
      if [ -n "$LEAD_PERSON_ID" ]; then
      run_capture_to_var CREATED_PERSON_LEAD_TEXT "create_lead(person:$LEAD_PERSON_ID)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_lead\",\"arguments\":{\"funnel\":\"$FIRST_FUNNEL_ID\",\"customer\":{\"kind\":\"person\",\"identifier\":\"$LEAD_PERSON_ID\"},\"title\":$LEAD_PERSON_TITLE_JSON,\"description\":\"Created by the local Docker integration suite.\",\"taskType\":$LEAD_TASK_TYPE_ID_JSON}},\"id\":2}"
        if [ $? -eq 0 ]; then
          CREATED_PERSON_LEAD_IDENTIFIER=$(echo "$CREATED_PERSON_LEAD_TEXT" | jq -r '.identifier // empty' 2>/dev/null)
          CREATED_PERSON_LEAD_ID=$(echo "$CREATED_PERSON_LEAD_TEXT" | jq -r '.leadId // empty' 2>/dev/null)
          assert_json_field_nonempty "create_lead(person) returns leadId" "$CREATED_PERSON_LEAD_TEXT" '.leadId'
          assert_json_field_nonempty "create_lead(person) returns identifier" "$CREATED_PERSON_LEAD_TEXT" '.identifier'
          sleep 2
          run_capture_to_var_fresh CREATED_PERSON_LEAD_DETAIL "get_lead(created_person:$CREATED_PERSON_LEAD_IDENTIFIER)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_lead\",\"arguments\":{\"funnel\":\"$FIRST_FUNNEL_ID\",\"identifier\":\"$CREATED_PERSON_LEAD_IDENTIFIER\"}},\"id\":2}"
          if [ $? -eq 0 ]; then
            assert_json_field_equals "get_lead exposes stable native id" "$CREATED_PERSON_LEAD_DETAIL" '.id' "$CREATED_PERSON_LEAD_ID"
            assert_json_field_equals "get_lead classifies person customer" "$CREATED_PERSON_LEAD_DETAIL" '.customerType' 'person'
            assert_json_field_equals "get_lead exposes native collection counts" "$CREATED_PERSON_LEAD_DETAIL" '([.comments, .attachments, .labels] | all(type == "number"))' 'true'
            assert_json_field_equals "get_lead exposes stable task metadata" "$CREATED_PERSON_LEAD_DETAIL" '(.number | type == "number") and (.taskType | length > 0) and (.rank | length > 0)' 'true'
            assert_json_field_equals "get_lead explicitly classifies unsupported fields" "$CREATED_PERSON_LEAD_DETAIL" '[.unsupportedFields[].field] | sort | join(",")' 'collection,parents'
          fi
          run_capture_to_var CREATED_PERSON_LEAD_LIST "list_leads(created_person)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_leads\",\"arguments\":{\"funnel\":\"$FIRST_FUNNEL_ID\",\"titleSearch\":$LEAD_PERSON_TITLE_JSON,\"limit\":5}},\"id\":2}"
          if [ $? -eq 0 ]; then
            assert_json_array_contains "list_leads includes created person lead" "$CREATED_PERSON_LEAD_LIST" "map(.identifier)" "$CREATED_PERSON_LEAD_IDENTIFIER"
          fi

          if [ -n "$CREATED_PERSON_LEAD_IDENTIFIER" ] && [ -n "$LEAD_PERSON_ID" ]; then
            # Register every cleanup marker before the first mutation so an
            # interrupted run can remove the exact fixture it created.
            LEAD_CLEANUP_ID="$CREATED_PERSON_LEAD_IDENTIFIER"
            LEAD_CLEANUP_FUNNEL_ID="$FIRST_FUNNEL_ID"
            LEAD_PERSON_CLEANUP_ID="$LEAD_PERSON_ID"
            UPDATED_LEAD_TITLE="Updated person lead $LEAD_FIXTURE_SUFFIX"
            UPDATED_LEAD_TITLE_JSON=$(json_string "$UPDATED_LEAD_TITLE")
            CREATED_PERSON_LEAD_STATUS=$(echo "$CREATED_PERSON_LEAD_DETAIL" | jq -r '.status // empty' 2>/dev/null)
            LEAD_UPDATE_STATUS=$(echo "$FUNNEL_DETAIL_TEXT" | jq -r --arg task_type "$LEAD_TASK_TYPE_ID" --arg current "$CREATED_PERSON_LEAD_STATUS" \
              '[.workflow[]? | select(.id == $task_type) | .statuses[]? | select(.name != $current) | .name] | first // empty' 2>/dev/null)
            run_capture_to_var_fresh LEAD_EMPLOYEES_TEXT "list_employees(for_update_lead)" \
              '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_employees","arguments":{"limit":200}},"id":2}'
            LEAD_UPDATE_ASSIGNEE_ID=$(echo "$LEAD_EMPLOYEES_TEXT" | jq -r '[.[] | select(.active == true)] | first | .id // empty' 2>/dev/null)
            LEAD_UPDATE_ASSIGNEE_NAME=$(echo "$LEAD_EMPLOYEES_TEXT" | jq -r --arg id "$LEAD_UPDATE_ASSIGNEE_ID" '.[] | select(.id == $id) | .name // empty' 2>/dev/null | head -n 1)
            UPDATED_CUSTOMER_DESCRIPTION="Updated customer description $LEAD_FIXTURE_SUFFIX"
            LEAD_UPDATE_STATUS_JSON=$(json_string "$LEAD_UPDATE_STATUS")
            LEAD_UPDATE_ASSIGNEE_ID_JSON=$(json_string "$LEAD_UPDATE_ASSIGNEE_ID")
            UPDATED_CUSTOMER_DESCRIPTION_JSON=$(json_string "$UPDATED_CUSTOMER_DESCRIPTION")
            if [ -z "$LEAD_UPDATE_STATUS" ] || [ -z "$LEAD_UPDATE_ASSIGNEE_ID" ] || [ -z "$LEAD_UPDATE_ASSIGNEE_NAME" ]; then
              fail_test "update_lead mutation fixtures" "requires a different funnel status and one active employee"
            fi
            run_capture_to_var_fresh UPDATED_LEAD_TEXT "update_lead(nullable fields:$CREATED_PERSON_LEAD_IDENTIFIER)" \
              "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_lead\",\"arguments\":{\"funnel\":\"$FIRST_FUNNEL_ID\",\"identifier\":\"$CREATED_PERSON_LEAD_IDENTIFIER\",\"title\":$UPDATED_LEAD_TITLE_JSON,\"description\":null,\"status\":$LEAD_UPDATE_STATUS_JSON,\"assignee\":$LEAD_UPDATE_ASSIGNEE_ID_JSON,\"startDate\":0,\"dueDate\":0,\"customerDescription\":$UPDATED_CUSTOMER_DESCRIPTION_JSON}},\"id\":2}"
            if [ $? -eq 0 ]; then
              assert_json_field_equals "update_lead reports updated" "$UPDATED_LEAD_TEXT" '.updated' "true"
              wait_for_lead_projection "update_lead persists mutable detail" "$FIRST_FUNNEL_ID" "$CREATED_PERSON_LEAD_IDENTIFIER" "$UPDATED_LEAD_TITLE" clear "$LEAD_UPDATE_STATUS" "$LEAD_UPDATE_ASSIGNEE_NAME" 0 0 "$UPDATED_CUSTOMER_DESCRIPTION"
              wait_for_lead_update_noop IDEMPOTENT_LEAD_TEXT \
                "update_lead repeated customer description is unchanged" \
                "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_lead\",\"arguments\":{\"funnel\":\"$FIRST_FUNNEL_ID\",\"identifier\":\"$CREATED_PERSON_LEAD_IDENTIFIER\",\"customerDescription\":$UPDATED_CUSTOMER_DESCRIPTION_JSON}},\"id\":2}"
            fi

            LEAD_WORKSPACE_TEXT=$(run_capture_only_fresh \
              '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_workspace_info","arguments":{}},"id":2}')
            LEAD_WORKSPACE_UUID=$(echo "$LEAD_WORKSPACE_TEXT" | jq -r '.uuid // empty' 2>/dev/null)
            LEAD_REFERENCE_LABEL_ENCODED=$(url_encode "$CREATED_PERSON_LEAD_IDENTIFIER")
            LEAD_REFERENCE_URL="${HULY_URL%/}/browse?workspace=${LEAD_WORKSPACE_UUID}&_class=lead%3Aclass%3ALead&_id=${CREATED_PERSON_LEAD_ID}&label=${LEAD_REFERENCE_LABEL_ENCODED}"
            LEAD_COMMENT_BODY="Lead collaboration [${CREATED_PERSON_LEAD_IDENTIFIER}](${LEAD_REFERENCE_URL})"
            LEAD_COMMENT_BODY_JSON=$(json_string "$LEAD_COMMENT_BODY")
            run_capture_to_var_fresh LEAD_COMMENT_TEXT "add_lead_comment($CREATED_PERSON_LEAD_IDENTIFIER)" \
              "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_lead_comment\",\"arguments\":{\"funnel\":\"$FIRST_FUNNEL_ID\",\"identifier\":\"$CREATED_PERSON_LEAD_IDENTIFIER\",\"body\":$LEAD_COMMENT_BODY_JSON}},\"id\":2}"
            if [ $? -eq 0 ]; then
              LEAD_COMMENT_ID=$(echo "$LEAD_COMMENT_TEXT" | jq -r '.commentId // empty' 2>/dev/null)
              run_capture_to_var_fresh LEAD_COMMENTS_TEXT "list_lead_comments(native reference)" \
                "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_lead_comments\",\"arguments\":{\"funnel\":\"$FIRST_FUNNEL_ID\",\"identifier\":\"$CREATED_PERSON_LEAD_IDENTIFIER\"}},\"id\":2}"
              if [ $? -eq 0 ]; then
                assert_json_array_contains "lead comments preserve native collection" "$LEAD_COMMENTS_TEXT" '.comments | map(.id)' "$LEAD_COMMENT_ID"
                assert_json_field_contains "lead comments preserve native reference target" "$LEAD_COMMENTS_TEXT" '.comments[0].body' "$CREATED_PERSON_LEAD_ID"
              fi
              LEAD_COMMENT_UPDATED_JSON=$(json_string "Updated lead collaboration note")
              run_capture_to_var_fresh LEAD_COMMENT_UPDATE_TEXT "update_lead_comment($LEAD_COMMENT_ID)" \
                "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_lead_comment\",\"arguments\":{\"funnel\":\"$FIRST_FUNNEL_ID\",\"identifier\":\"$CREATED_PERSON_LEAD_IDENTIFIER\",\"commentId\":\"$LEAD_COMMENT_ID\",\"body\":$LEAD_COMMENT_UPDATED_JSON}},\"id\":2}"
              assert_json_field_equals "update_lead_comment reports change" "$LEAD_COMMENT_UPDATE_TEXT" '.changed' 'true'
              run_capture_to_var_fresh LEAD_COMMENT_DELETE_TEXT "delete_lead_comment($LEAD_COMMENT_ID)" \
                "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_lead_comment\",\"arguments\":{\"funnel\":\"$FIRST_FUNNEL_ID\",\"identifier\":\"$CREATED_PERSON_LEAD_IDENTIFIER\",\"commentId\":\"$LEAD_COMMENT_ID\"}},\"id\":2}"
              assert_json_field_equals "delete_lead_comment reports change" "$LEAD_COMMENT_DELETE_TEXT" '.changed' 'true'
              if run_capture_to_var_fresh LEAD_COMMENTS_AFTER_DELETE_TEXT "list_lead_comments(after delete)" \
                "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_lead_comments\",\"arguments\":{\"funnel\":\"$FIRST_FUNNEL_ID\",\"identifier\":\"$CREATED_PERSON_LEAD_IDENTIFIER\"}},\"id\":2}"; then
                if printf '%s\n' "$LEAD_COMMENTS_AFTER_DELETE_TEXT" | jq -e --arg id "$LEAD_COMMENT_ID" '.comments[]? | select(.id == $id)' >/dev/null 2>&1; then
                  fail_test "delete_lead_comment fresh-session readback" "deleted comment remains visible"
                else
                  echo "PASS: delete_lead_comment fresh-session readback"
                  PASSED=$((PASSED + 1))
                fi
              fi
            fi

            run_capture_to_var_fresh LEAD_ATTACHMENT_TEXT "add_lead_attachment($CREATED_PERSON_LEAD_IDENTIFIER)" \
              "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_lead_attachment\",\"arguments\":{\"funnel\":\"$FIRST_FUNNEL_ID\",\"identifier\":\"$CREATED_PERSON_LEAD_IDENTIFIER\",\"filename\":\"lead-$RUN_ID.txt\",\"contentType\":\"text/plain\",\"data\":\"aGVsbG8=\"}},\"id\":2}"
            if [ $? -eq 0 ]; then
              LEAD_ATTACHMENT_ID=$(echo "$LEAD_ATTACHMENT_TEXT" | jq -r '.attachmentId // empty' 2>/dev/null)
              run_capture_to_var_fresh LEAD_ATTACHMENTS_TEXT "list_lead_attachments($CREATED_PERSON_LEAD_IDENTIFIER)" \
                "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_lead_attachments\",\"arguments\":{\"funnel\":\"$FIRST_FUNNEL_ID\",\"identifier\":\"$CREATED_PERSON_LEAD_IDENTIFIER\"}},\"id\":2}"
              assert_json_array_contains "lead attachment retains native parent" "$LEAD_ATTACHMENTS_TEXT" '.attachments | map(.id)' "$LEAD_ATTACHMENT_ID"
              run_capture_to_var_fresh LEAD_ATTACHMENT_GET_TEXT "get_lead_attachment($LEAD_ATTACHMENT_ID)" \
                "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_lead_attachment\",\"arguments\":{\"funnel\":\"$FIRST_FUNNEL_ID\",\"identifier\":\"$CREATED_PERSON_LEAD_IDENTIFIER\",\"attachmentId\":\"$LEAD_ATTACHMENT_ID\"}},\"id\":2}"
              assert_json_field_equals "get_lead_attachment preserves ID" "$LEAD_ATTACHMENT_GET_TEXT" '.attachment.id' "$LEAD_ATTACHMENT_ID"
              run_capture_to_var_fresh LEAD_ATTACHMENT_UPDATE_TEXT "update_lead_attachment($LEAD_ATTACHMENT_ID)" \
                "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_lead_attachment\",\"arguments\":{\"funnel\":\"$FIRST_FUNNEL_ID\",\"identifier\":\"$CREATED_PERSON_LEAD_IDENTIFIER\",\"attachmentId\":\"$LEAD_ATTACHMENT_ID\",\"pinned\":true}},\"id\":2}"
              run_capture_to_var_fresh LEAD_ATTACHMENT_UPDATED_GET_TEXT "get_lead_attachment(updated:$LEAD_ATTACHMENT_ID)" \
                "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_lead_attachment\",\"arguments\":{\"funnel\":\"$FIRST_FUNNEL_ID\",\"identifier\":\"$CREATED_PERSON_LEAD_IDENTIFIER\",\"attachmentId\":\"$LEAD_ATTACHMENT_ID\"}},\"id\":2}"
              assert_json_field_equals "update_lead_attachment fresh-session readback" "$LEAD_ATTACHMENT_UPDATED_GET_TEXT" '.attachment.pinned' 'true'
              run_capture_to_var_fresh LEAD_ATTACHMENT_DELETE_TEXT "delete_lead_attachment($LEAD_ATTACHMENT_ID)" \
                "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_lead_attachment\",\"arguments\":{\"funnel\":\"$FIRST_FUNNEL_ID\",\"identifier\":\"$CREATED_PERSON_LEAD_IDENTIFIER\",\"attachmentId\":\"$LEAD_ATTACHMENT_ID\"}},\"id\":2}"
              run_expect_error_contains_fresh "get_lead_attachment(deleted:$LEAD_ATTACHMENT_ID)" \
                "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_lead_attachment\",\"arguments\":{\"funnel\":\"$FIRST_FUNNEL_ID\",\"identifier\":\"$CREATED_PERSON_LEAD_IDENTIFIER\",\"attachmentId\":\"$LEAD_ATTACHMENT_ID\"}},\"id\":2}" \
                "not found"
            fi

            LEAD_LABEL_TITLE="lead-label-$LEAD_FIXTURE_SUFFIX"
            LEAD_LABEL_TITLE_JSON=$(json_string "$LEAD_LABEL_TITLE")
            run_capture_to_var_fresh LEAD_LABEL_TEXT "add_lead_label($LEAD_LABEL_TITLE)" \
              "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_lead_label\",\"arguments\":{\"funnel\":\"$FIRST_FUNNEL_ID\",\"identifier\":\"$CREATED_PERSON_LEAD_IDENTIFIER\",\"label\":$LEAD_LABEL_TITLE_JSON,\"color\":4,\"weight\":2}},\"id\":2}"
            if [ $? -eq 0 ]; then
              LEAD_LABEL_DEFINITION_CLEANUP_ID=$(echo "$LEAD_LABEL_TEXT" | jq -r '.label // empty' 2>/dev/null)
              assert_json_field_equals "add_lead_label creates relation" "$LEAD_LABEL_TEXT" '.attached' 'true'
              run_capture_to_var_fresh LEAD_LABELS_TEXT "list_lead_labels($CREATED_PERSON_LEAD_IDENTIFIER)" \
                "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_lead_labels\",\"arguments\":{\"funnel\":\"$FIRST_FUNNEL_ID\",\"identifier\":\"$CREATED_PERSON_LEAD_IDENTIFIER\"}},\"id\":2}"
              assert_json_field_equals "list_lead_labels preserves weight" "$LEAD_LABELS_TEXT" ".labels[] | select(.label == \"$LEAD_LABEL_DEFINITION_CLEANUP_ID\") | .weight" '2'
              run_capture_to_var_fresh LEAD_LABEL_DEFINITIONS_TEXT "list_lead_label_definitions($LEAD_LABEL_TITLE)" \
                "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_lead_label_definitions\",\"arguments\":{\"titleSearch\":$LEAD_LABEL_TITLE_JSON,\"limit\":1}},\"id\":2}"
              assert_json_field_equals "list_lead_label_definitions reports exact total" "$LEAD_LABEL_DEFINITIONS_TEXT" '.total' '1'
              assert_json_field_equals "list_lead_label_definitions reports complete page" "$LEAD_LABEL_DEFINITIONS_TEXT" '.truncated' 'false'
              run_capture_to_var_fresh LEAD_LABEL_UPDATE_TEXT "update_lead_label($LEAD_LABEL_TITLE)" \
                "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_lead_label\",\"arguments\":{\"funnel\":\"$FIRST_FUNNEL_ID\",\"identifier\":\"$CREATED_PERSON_LEAD_IDENTIFIER\",\"label\":$LEAD_LABEL_TITLE_JSON,\"weight\":7}},\"id\":2}"
              assert_json_field_equals "update_lead_label reports one relation" "$LEAD_LABEL_UPDATE_TEXT" '.updatedCount' '1'
              run_capture_to_var_fresh LEAD_LABELS_UPDATED_TEXT "list_lead_labels(updated weight)" \
                "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_lead_labels\",\"arguments\":{\"funnel\":\"$FIRST_FUNNEL_ID\",\"identifier\":\"$CREATED_PERSON_LEAD_IDENTIFIER\"}},\"id\":2}"
              assert_json_field_equals "update_lead_label fresh-session readback" "$LEAD_LABELS_UPDATED_TEXT" ".labels[] | select(.label == \"$LEAD_LABEL_DEFINITION_CLEANUP_ID\") | .weight" '7'
              run_capture_to_var_fresh LEAD_LABEL_REMOVE_TEXT "remove_lead_label($LEAD_LABEL_TITLE)" \
                "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"remove_lead_label\",\"arguments\":{\"funnel\":\"$FIRST_FUNNEL_ID\",\"identifier\":\"$CREATED_PERSON_LEAD_IDENTIFIER\",\"label\":$LEAD_LABEL_TITLE_JSON}},\"id\":2}"
              assert_json_field_equals "remove_lead_label reports one relation" "$LEAD_LABEL_REMOVE_TEXT" '.detachedCount' '1'
              if run_capture_to_var_fresh LEAD_LABELS_AFTER_REMOVE_TEXT "list_lead_labels(after remove)" \
                "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_lead_labels\",\"arguments\":{\"funnel\":\"$FIRST_FUNNEL_ID\",\"identifier\":\"$CREATED_PERSON_LEAD_IDENTIFIER\"}},\"id\":2}"; then
                if printf '%s\n' "$LEAD_LABELS_AFTER_REMOVE_TEXT" | jq -e --arg id "$LEAD_LABEL_DEFINITION_CLEANUP_ID" '.labels[]? | select(.label == $id)' >/dev/null 2>&1; then
                  fail_test "remove_lead_label fresh-session readback" "detached label remains visible"
                else
                  echo "PASS: remove_lead_label fresh-session readback"
                  PASSED=$((PASSED + 1))
                fi
              fi
              if run_capture_to_var_fresh LEAD_LABEL_DELETE_TEXT "delete_tag(lead label cleanup)" \
                "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_tag\",\"arguments\":{\"targetClass\":\"lead:class:Lead\",\"tag\":\"$LEAD_LABEL_DEFINITION_CLEANUP_ID\"}},\"id\":2}"; then
                if wait_for_lead_label_absence_quiet "$LEAD_LABEL_DEFINITION_CLEANUP_ID" "$LEAD_LABEL_TITLE"; then
                  LEAD_LABEL_DEFINITION_CLEANUP_ID=""
                  LEAD_LABEL_TITLE=""
                else
                  fail_test "delete_tag(lead label cleanup) fresh-session readback" \
                    "label definition remains visible; cleanup marker retained"
                fi
              fi
            fi

            run_capture_to_var_fresh LEAD_RELATIONS_TEXT "list_relations(friendly lead locator)" \
              "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_relations\",\"arguments\":{\"source\":{\"kind\":\"lead\",\"funnel\":\"$FIRST_FUNNEL_ID\",\"identifier\":\"$CREATED_PERSON_LEAD_IDENTIFIER\"},\"limit\":3}},\"id\":2}"
            if [ $? -eq 0 ]; then
              assert_json_field_nonempty "list_relations friendly lead returns total" "$LEAD_RELATIONS_TEXT" '.total'
            fi
            LEAD_RELATION_SOURCE_ROLE="lead source $LEAD_FIXTURE_SUFFIX"
            LEAD_RELATION_TARGET_ROLE="lead customer $LEAD_FIXTURE_SUFFIX"
            LEAD_RELATION_SOURCE_ROLE_JSON=$(json_string "$LEAD_RELATION_SOURCE_ROLE")
            LEAD_RELATION_TARGET_ROLE_JSON=$(json_string "$LEAD_RELATION_TARGET_ROLE")
            run_capture_to_var_fresh LEAD_ASSOCIATION_TEXT "create_association(lead to person)" \
              "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_association\",\"arguments\":{\"sourceClass\":\"lead:class:Lead\",\"targetClass\":\"contact:class:Person\",\"sourceRole\":$LEAD_RELATION_SOURCE_ROLE_JSON,\"targetRole\":$LEAD_RELATION_TARGET_ROLE_JSON,\"cardinality\":\"many-to-many\"}},\"id\":2}"
            if [ $? -eq 0 ]; then
              LEAD_ASSOCIATION_ID=$(echo "$LEAD_ASSOCIATION_TEXT" | jq -r '.association.associationId // empty' 2>/dev/null)
              if [ -n "$LEAD_ASSOCIATION_ID" ]; then
                GENERIC_ASSOCIATION_CLEANUP_IDS="$GENERIC_ASSOCIATION_CLEANUP_IDS $LEAD_ASSOCIATION_ID"
                LEAD_RELATION_ARGS="{\"association\":\"$LEAD_ASSOCIATION_ID\",\"source\":{\"kind\":\"lead\",\"funnel\":\"$FIRST_FUNNEL_ID\",\"identifier\":\"$CREATED_PERSON_LEAD_IDENTIFIER\"},\"target\":{\"kind\":\"raw\",\"id\":\"$LEAD_PERSON_ID\",\"class\":\"contact:class:Person\"}}"
                run_capture_to_var_fresh LEAD_RELATION_CREATE_TEXT "create_relation(friendly lead endpoint)" \
                  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_relation\",\"arguments\":$LEAD_RELATION_ARGS},\"id\":2}"
                assert_json_field_equals "create_relation friendly lead reports created" "$LEAD_RELATION_CREATE_TEXT" '.created' 'true'
                run_capture_to_var_fresh LEAD_RELATION_LIST_TEXT "list_relations(created friendly lead endpoint)" \
                  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_relations\",\"arguments\":$LEAD_RELATION_ARGS},\"id\":2}"
                assert_json_field_equals "list_relations friendly lead readback" "$LEAD_RELATION_LIST_TEXT" '.total' '1'
                run_capture_to_var_fresh LEAD_RELATION_DELETE_TEXT "delete_relation(friendly lead endpoint)" \
                  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_relation\",\"arguments\":$LEAD_RELATION_ARGS},\"id\":2}"
                assert_json_field_equals "delete_relation friendly lead reports deleted" "$LEAD_RELATION_DELETE_TEXT" '.deleted' 'true'
                run_capture_to_var_fresh LEAD_ASSOCIATION_DELETE_TEXT "delete_association(lead to person cleanup)" \
                  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_association\",\"arguments\":{\"association\":\"$LEAD_ASSOCIATION_ID\"}},\"id\":2}"
                assert_json_field_equals "delete_association lead fixture reports deleted" "$LEAD_ASSOCIATION_DELETE_TEXT" '.deleted' 'true'
              else
                fail_test "create_association(lead to person)" "created association returned no stable identifier"
              fi
            fi

            LEAD_DESTINATION_FUNNEL_NAME="Integration lead destination $LEAD_FIXTURE_SUFFIX"
            LEAD_DESTINATION_FUNNEL_NAME_JSON=$(json_string "$LEAD_DESTINATION_FUNNEL_NAME")
            run_capture_to_var_fresh LEAD_DESTINATION_FUNNEL_TEXT "create_funnel(for_move_lead)" \
              "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_funnel\",\"arguments\":{\"name\":$LEAD_DESTINATION_FUNNEL_NAME_JSON,\"projectType\":$FUNNEL_PROJECT_TYPE_JSON}},\"id\":2}"
            if [ $? -eq 0 ]; then
              LEAD_DESTINATION_FUNNEL_CLEANUP_ID=$(echo "$LEAD_DESTINATION_FUNNEL_TEXT" | jq -r '.identifier // empty' 2>/dev/null)
              if [ -n "$LEAD_DESTINATION_FUNNEL_CLEANUP_ID" ]; then
                DESTINATION_FUNNEL_JSON=$(json_string "$LEAD_DESTINATION_FUNNEL_CLEANUP_ID")
                run_capture_to_var_fresh MOVED_LEAD_TEXT "move_lead($CREATED_PERSON_LEAD_IDENTIFIER)" \
                  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"move_lead\",\"arguments\":{\"funnel\":\"$FIRST_FUNNEL_ID\",\"identifier\":\"$CREATED_PERSON_LEAD_IDENTIFIER\",\"destinationFunnel\":$DESTINATION_FUNNEL_JSON}},\"id\":2}"
                if [ $? -eq 0 ]; then
                  assert_json_field_equals "move_lead reports moved" "$MOVED_LEAD_TEXT" '.moved' "true"
                  LEAD_CLEANUP_FUNNEL_ID="$LEAD_DESTINATION_FUNNEL_CLEANUP_ID"
                  wait_for_lead_projection "move_lead preserves mutable detail" "$LEAD_DESTINATION_FUNNEL_CLEANUP_ID" "$CREATED_PERSON_LEAD_IDENTIFIER" "$UPDATED_LEAD_TITLE" clear "$LEAD_UPDATE_STATUS" "$LEAD_UPDATE_ASSIGNEE_NAME" 0 0 "$UPDATED_CUSTOMER_DESCRIPTION"
                fi

                if [ -n "$LEAD_CLEANUP_FUNNEL_ID" ]; then
                  CLEANUP_LEAD_FUNNEL_JSON=$(json_string "$LEAD_CLEANUP_FUNNEL_ID")
                  run_capture_to_var_fresh LEAD_DELETE_PREVIEW "delete_lead preview($CREATED_PERSON_LEAD_IDENTIFIER)" \
                    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_lead\",\"arguments\":{\"funnel\":$CLEANUP_LEAD_FUNNEL_JSON,\"identifier\":\"$CREATED_PERSON_LEAD_IDENTIFIER\"}},\"id\":2}"
                  LEAD_DELETE_COMMENTS=$(echo "$LEAD_DELETE_PREVIEW" | jq -r '.impact.comments // empty' 2>/dev/null)
                  LEAD_DELETE_ATTACHMENTS=$(echo "$LEAD_DELETE_PREVIEW" | jq -r '.impact.attachments // empty' 2>/dev/null)
                  LEAD_DELETE_LABELS=$(echo "$LEAD_DELETE_PREVIEW" | jq -r '.impact.labels // empty' 2>/dev/null)
                  if [ -n "$LEAD_DELETE_COMMENTS" ] && [ -n "$LEAD_DELETE_ATTACHMENTS" ] && [ -n "$LEAD_DELETE_LABELS" ]; then
                    run_capture_to_var_fresh LEAD_DELETE_TEXT "delete_lead execute($CREATED_PERSON_LEAD_IDENTIFIER)" \
                      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_lead\",\"arguments\":{\"funnel\":$CLEANUP_LEAD_FUNNEL_JSON,\"identifier\":\"$CREATED_PERSON_LEAD_IDENTIFIER\",\"execute\":true,\"expectedComments\":$LEAD_DELETE_COMMENTS,\"expectedAttachments\":$LEAD_DELETE_ATTACHMENTS,\"expectedLabels\":$LEAD_DELETE_LABELS}},\"id\":2}"
                    if [ $? -eq 0 ]; then
                      assert_json_field_equals "delete_lead reports deleted" "$LEAD_DELETE_TEXT" '.deleted' "true"
                      if wait_for_lead_deleted "delete_lead persists deletion" "$LEAD_CLEANUP_FUNNEL_ID" "$CREATED_PERSON_LEAD_IDENTIFIER"; then
                        LEAD_CLEANUP_ID=""
                        LEAD_CLEANUP_FUNNEL_ID=""
                      fi
                    fi
                  fi
                fi
              else
                fail_test "create_funnel(for_move_lead)" "created destination funnel returned no stable identifier"
              fi
            fi
          fi
        fi
      fi
      else
        fail_test "create_lead(person)" "could not create person fixture"
      fi

      LEAD_ORG_NAME="Integration Lead Org $LEAD_FIXTURE_SUFFIX"
      LEAD_ORG_NAME_JSON=$(json_string "$LEAD_ORG_NAME")
      LEAD_ORG_TITLE="Integration organization lead $LEAD_FIXTURE_SUFFIX"
      LEAD_ORG_TITLE_JSON=$(json_string "$LEAD_ORG_TITLE")
      run_capture_to_var LEAD_ORG_TEXT "create_organization(for_create_lead)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_organization\",\"arguments\":{\"name\":$LEAD_ORG_NAME_JSON}},\"id\":2}"
      if [ $? -eq 0 ]; then
        LEAD_ORG_ID=$(echo "$LEAD_ORG_TEXT" | jq -r '.id // empty' 2>/dev/null)
        run_capture_to_var CREATED_ORG_LEAD_TEXT "create_lead(organization:$LEAD_ORG_NAME)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_lead\",\"arguments\":{\"funnel\":\"$FIRST_FUNNEL_ID\",\"customer\":{\"kind\":\"organization\",\"identifier\":$LEAD_ORG_NAME_JSON},\"title\":$LEAD_ORG_TITLE_JSON}},\"id\":2}"
        if [ $? -eq 0 ]; then
          CREATED_ORG_LEAD_IDENTIFIER=$(echo "$CREATED_ORG_LEAD_TEXT" | jq -r '.identifier // empty' 2>/dev/null)
          assert_json_field_nonempty "create_lead(organization) returns leadId" "$CREATED_ORG_LEAD_TEXT" '.leadId'
          assert_json_field_nonempty "create_lead(organization) returns identifier" "$CREATED_ORG_LEAD_TEXT" '.identifier'
          run_capture_to_var PROMOTED_ORG_TEXT "make_organization_customer(after_create_lead)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"make_organization_customer\",\"arguments\":{\"identifier\":\"$LEAD_ORG_ID\"}},\"id\":2}"
          if [ $? -eq 0 ]; then
            assert_json_field_equals "create_lead promoted organization customer idempotently" "$PROMOTED_ORG_TEXT" '.applied' "false"
          fi
          sleep 2
          run_test "get_lead(created_organization:$CREATED_ORG_LEAD_IDENTIFIER)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_lead\",\"arguments\":{\"funnel\":\"$FIRST_FUNNEL_ID\",\"identifier\":\"$CREATED_ORG_LEAD_IDENTIFIER\"}},\"id\":2}"
          run_capture_to_var CREATED_ORG_LEAD_LIST "list_leads(created_organization)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_leads\",\"arguments\":{\"funnel\":\"$FIRST_FUNNEL_ID\",\"titleSearch\":$LEAD_ORG_TITLE_JSON,\"limit\":5}},\"id\":2}"
          if [ $? -eq 0 ]; then
            assert_json_array_contains "list_leads includes created organization lead" "$CREATED_ORG_LEAD_LIST" "map(.identifier)" "$CREATED_ORG_LEAD_IDENTIFIER"
          fi
        fi
      else
        skip_test "create_lead(organization)" "could not create organization fixture"
      fi

      LEADS_TEXT=$(run_capture_only \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_leads\",\"arguments\":{\"funnel\":\"$FIRST_FUNNEL_ID\",\"limit\":5}},\"id\":2}")
      if [ $? -eq 0 ]; then
        run_test "list_leads($FIRST_FUNNEL_ID)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_leads\",\"arguments\":{\"funnel\":\"$FIRST_FUNNEL_ID\",\"limit\":5}},\"id\":2}"

        if [ -n "$FIRST_FUNNEL_NAME" ]; then
          FIRST_FUNNEL_NAME_JSON=$(json_string "$FIRST_FUNNEL_NAME")
          run_test "list_leads(by_name:$FIRST_FUNNEL_NAME)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_leads\",\"arguments\":{\"funnel\":$FIRST_FUNNEL_NAME_JSON,\"limit\":5}},\"id\":2}"
        fi

        FIRST_LEAD_ID=$(echo "$LEADS_TEXT" | jq -r '.[0].identifier // empty' 2>/dev/null)
        if [ -n "$FIRST_LEAD_ID" ]; then
          run_test "get_lead($FIRST_LEAD_ID)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_lead\",\"arguments\":{\"funnel\":\"$FIRST_FUNNEL_ID\",\"identifier\":\"$FIRST_LEAD_ID\"}},\"id\":2}"

          if [ -n "$FIRST_FUNNEL_NAME" ]; then
            FIRST_FUNNEL_NAME_JSON=$(json_string "$FIRST_FUNNEL_NAME")
            run_test "get_lead(by_name:$FIRST_LEAD_ID)" \
              "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_lead\",\"arguments\":{\"funnel\":$FIRST_FUNNEL_NAME_JSON,\"identifier\":\"$FIRST_LEAD_ID\"}},\"id\":2}"
          fi
        else
          skip_test "get_lead" "selected funnel has no leads"
        fi
      else
        skip_test "list_leads/get_lead" "selected funnel could not be queried"
      fi
    else
      skip_test "list_leads/get_lead" "list_funnels returned no stable funnel identifier"
    fi
  else
    skip_test "leads" "no funnels found in workspace"
  fi
else
  skip_test "leads" "list_funnels failed"
fi
echo ""

##############################
# 1c. RECRUITING CRUD
##############################
echo "=== 1c. Recruiting CRUD ==="
RECRUITING_PROBE_RESULT=$(call_tool \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_recruiting_vacancy_types","arguments":{"limit":5}},"id":2}')
RECRUITING_PROBE_ERROR=$(echo "$RECRUITING_PROBE_RESULT" | jq -r '.result.content[0].text // .error.message // empty' 2>/dev/null)
RECRUITING_PROBE_IS_ERROR=$(echo "$RECRUITING_PROBE_RESULT" | jq -r '.result.isError // false' 2>/dev/null)
if [ -z "$RECRUITING_PROBE_RESULT" ]; then
  fail_test "list_recruiting_vacancy_types" "no response"
elif [ "$RECRUITING_PROBE_IS_ERROR" = "true" ] &&
  printf '%s\n' "$RECRUITING_PROBE_ERROR" | grep -Eiq 'recruit|vacancy.*(class|model|missing|not found)|class.*vacancy'; then
  for recruiting_test in \
    "list_recruiting_vacancy_types" \
    "create_recruiting_vacancy" \
    "get_recruiting_vacancy" \
    "list_recruiting_vacancy_statuses" \
    "create_person(recruiting candidate)" \
    "set_recruiting_candidate_profile" \
    "get_recruiting_candidate" \
    "list_recruiting_skills" \
    "add_recruiting_candidate_skill" \
    "create_recruiting_applicant" \
    "list_recruiting_applicants" \
    "get_recruiting_applicant" \
    "update_recruiting_applicant" \
    "list_recruiting_applicant_matches" \
    "create_recruiting_review" \
    "list_recruiting_reviews" \
    "get_recruiting_review" \
    "update_recruiting_review" \
    "create_recruiting_opinion" \
    "list_recruiting_opinions" \
    "get_recruiting_opinion" \
    "update_recruiting_opinion" \
    "delete_recruiting_opinion" \
    "add/list/update/delete recruiting comment" \
    "add/list/get/update/delete recruiting attachment" \
    "list_recruiting_activity" \
    "add/list/remove recruiting related issue" \
    "delete_recruiting_review" \
    "delete_recruiting_applicant" \
    "remove_recruiting_candidate_skill" \
    "archive_recruiting_vacancy"; do
    skip_test "$recruiting_test" "server lacks Recruiting model"
  done
elif [ "$RECRUITING_PROBE_IS_ERROR" = "true" ]; then
  fail_test "list_recruiting_vacancy_types" "$RECRUITING_PROBE_ERROR"
else
  echo "PASS: list_recruiting_vacancy_types"
  PASSED=$((PASSED + 1))

  RECRUITING_TYPE_COUNT=$(echo "$RECRUITING_PROBE_RESULT" | jq -r '.result.content[0].text | fromjson | .types | length' 2>/dev/null)
  if [ -z "$RECRUITING_TYPE_COUNT" ] || [ "$RECRUITING_TYPE_COUNT" -eq 0 ]; then
    for recruiting_test in \
      "create_recruiting_vacancy" \
      "get_recruiting_vacancy" \
      "list_recruiting_vacancy_statuses" \
      "set_recruiting_candidate_profile" \
      "get_recruiting_candidate" \
      "list_recruiting_skills" \
      "add_recruiting_candidate_skill" \
      "create_recruiting_applicant" \
      "list_recruiting_applicants" \
      "get_recruiting_applicant" \
      "update_recruiting_applicant" \
      "list_recruiting_applicant_matches" \
      "create_recruiting_review" \
      "list_recruiting_reviews" \
      "get_recruiting_review" \
      "update_recruiting_review" \
      "create_recruiting_opinion" \
      "list_recruiting_opinions" \
      "get_recruiting_opinion" \
      "update_recruiting_opinion" \
      "delete_recruiting_opinion" \
      "add/list/update/delete recruiting comment" \
      "add/list/get/update/delete recruiting attachment" \
      "list_recruiting_activity" \
      "add/list/remove recruiting related issue" \
      "delete_recruiting_review" \
      "delete_recruiting_applicant" \
      "remove_recruiting_candidate_skill" \
      "archive_recruiting_vacancy"; do
      skip_test "$recruiting_test" "Recruiting model has no vacancy types"
    done
  else
    RECRUITING_VACANCY_NAME="MCP IntTest Vacancy $RUN_ID"
    RECRUITING_VACANCY_DESCRIPTION="Recruiting integration vacancy $RUN_ID"
    RECRUITING_PERSON_FIRST_NAME="Recruiting-$RUN_ID"
    RECRUITING_PERSON_EMAIL="recruiting-$RUN_ID@test.local"
    RECRUITING_SKILL_FALLBACK="MCP IntTest Skill $RUN_ID"
    RECRUITING_VACANCY_NAME_JSON=$(json_string "$RECRUITING_VACANCY_NAME")
    RECRUITING_VACANCY_DESCRIPTION_JSON=$(json_string "$RECRUITING_VACANCY_DESCRIPTION")
    RECRUITING_PERSON_FIRST_NAME_JSON=$(json_string "$RECRUITING_PERSON_FIRST_NAME")
    RECRUITING_PERSON_EMAIL_JSON=$(json_string "$RECRUITING_PERSON_EMAIL")
    RECRUITING_CLEANUP_PERSON_EMAIL="$RECRUITING_PERSON_EMAIL"

    run_capture_to_var RECRUITING_VACANCY_TEXT "create_recruiting_vacancy($RECRUITING_VACANCY_NAME)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_recruiting_vacancy\",\"arguments\":{\"name\":$RECRUITING_VACANCY_NAME_JSON,\"shortDescription\":$RECRUITING_VACANCY_DESCRIPTION_JSON,\"fullDescription\":\"# Integration vacancy\",\"private\":true}},\"id\":2}"
    RECRUITING_CLEANUP_VACANCY_ID=$(echo "$RECRUITING_VACANCY_TEXT" | jq -r '.vacancy.id // empty' 2>/dev/null)
    if [ -n "$RECRUITING_CLEANUP_VACANCY_ID" ]; then
      RECRUITING_VACANCY_ID_JSON=$(json_string "$RECRUITING_CLEANUP_VACANCY_ID")
      sleep 2
      run_capture_to_var RECRUITING_GET_VACANCY_TEXT "get_recruiting_vacancy($RECRUITING_CLEANUP_VACANCY_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_recruiting_vacancy\",\"arguments\":{\"vacancy\":$RECRUITING_VACANCY_ID_JSON}},\"id\":2}"
      assert_json_field_equals "get_recruiting_vacancy returns name" "$RECRUITING_GET_VACANCY_TEXT" ".name" "$RECRUITING_VACANCY_NAME"

      run_capture_to_var RECRUITING_STATUSES_TEXT "list_recruiting_vacancy_statuses($RECRUITING_CLEANUP_VACANCY_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_recruiting_vacancy_statuses\",\"arguments\":{\"vacancy\":$RECRUITING_VACANCY_ID_JSON}},\"id\":2}"
      RECRUITING_CREATE_STATUS=$(echo "$RECRUITING_STATUSES_TEXT" | jq -r '.statuses[0].name // empty' 2>/dev/null)
      RECRUITING_UPDATE_STATUS=$(echo "$RECRUITING_STATUSES_TEXT" | jq -r '.statuses[1].name // .statuses[0].name // empty' 2>/dev/null)
      RECRUITING_VACANCY_TARGET_JSON="{\"kind\":\"vacancy\",\"vacancy\":$RECRUITING_VACANCY_ID_JSON}"

      RECRUITING_COMMENT_BODY_JSON=$(json_string "Recruiting vacancy integration comment $RUN_ID")
      RECRUITING_COMMENT_BODY_UPDATED_JSON=$(json_string "Updated recruiting vacancy integration comment $RUN_ID")
      run_capture_to_var RECRUITING_COMMENT_TEXT "add_recruiting_comment(vacancy)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_recruiting_comment\",\"arguments\":{\"target\":$RECRUITING_VACANCY_TARGET_JSON,\"body\":$RECRUITING_COMMENT_BODY_JSON}},\"id\":2}"
      RECRUITING_CLEANUP_COMMENT_ID=$(echo "$RECRUITING_COMMENT_TEXT" | jq -r '.commentId // empty' 2>/dev/null)
      if [ -n "$RECRUITING_CLEANUP_COMMENT_ID" ]; then
        RECRUITING_COMMENT_ID_JSON=$(json_string "$RECRUITING_CLEANUP_COMMENT_ID")
        wait_for_json_array_contains_to_var RECRUITING_LIST_COMMENTS_TEXT "list_recruiting_comments includes comment" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_recruiting_comments\",\"arguments\":{\"target\":$RECRUITING_VACANCY_TARGET_JSON,\"limit\":20}},\"id\":2}" \
          ".comments | map(.id)" "$RECRUITING_CLEANUP_COMMENT_ID"
        run_capture_to_var RECRUITING_UPDATE_COMMENT_TEXT "update_recruiting_comment($RECRUITING_CLEANUP_COMMENT_ID)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_recruiting_comment\",\"arguments\":{\"target\":$RECRUITING_VACANCY_TARGET_JSON,\"commentId\":$RECRUITING_COMMENT_ID_JSON,\"body\":$RECRUITING_COMMENT_BODY_UPDATED_JSON}},\"id\":2}"
        assert_json_field_equals "update_recruiting_comment updated" "$RECRUITING_UPDATE_COMMENT_TEXT" ".updated" "true"
        run_capture_to_var RECRUITING_DELETE_COMMENT_TEXT "delete_recruiting_comment($RECRUITING_CLEANUP_COMMENT_ID)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_recruiting_comment\",\"arguments\":{\"target\":$RECRUITING_VACANCY_TARGET_JSON,\"commentId\":$RECRUITING_COMMENT_ID_JSON}},\"id\":2}"
        if assert_json_field_equals "delete_recruiting_comment deleted" "$RECRUITING_DELETE_COMMENT_TEXT" ".deleted" "true"; then
          RECRUITING_CLEANUP_COMMENT_ID=""
        fi
      else
        skip_test "list/update/delete recruiting comment" "add_recruiting_comment did not return a comment id"
      fi

      RECRUITING_ATTACHMENT_DATA_JSON=$(json_string "cmVjcnVpdGluZyBhdHRhY2htZW50")
      RECRUITING_ATTACHMENT_FILENAME_JSON=$(json_string "recruiting-attachment.txt")
      RECRUITING_ATTACHMENT_DESC_JSON=$(json_string "Recruiting attachment")
      RECRUITING_ATTACHMENT_DESC_UPDATED_JSON=$(json_string "Updated recruiting attachment")
      run_capture_to_var RECRUITING_ATTACHMENT_TEXT "add_recruiting_attachment(vacancy)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_recruiting_attachment\",\"arguments\":{\"target\":$RECRUITING_VACANCY_TARGET_JSON,\"filename\":$RECRUITING_ATTACHMENT_FILENAME_JSON,\"contentType\":\"text/plain\",\"data\":$RECRUITING_ATTACHMENT_DATA_JSON,\"description\":$RECRUITING_ATTACHMENT_DESC_JSON}},\"id\":2}"
      RECRUITING_CLEANUP_ATTACHMENT_ID=$(echo "$RECRUITING_ATTACHMENT_TEXT" | jq -r '.attachmentId // empty' 2>/dev/null)
      if [ -n "$RECRUITING_CLEANUP_ATTACHMENT_ID" ]; then
        RECRUITING_ATTACHMENT_ID_JSON=$(json_string "$RECRUITING_CLEANUP_ATTACHMENT_ID")
        wait_for_json_array_contains_to_var RECRUITING_LIST_ATTACHMENTS_TEXT "list_recruiting_attachments includes attachment" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_recruiting_attachments\",\"arguments\":{\"target\":$RECRUITING_VACANCY_TARGET_JSON,\"limit\":20}},\"id\":2}" \
          ".attachments | map(.id)" "$RECRUITING_CLEANUP_ATTACHMENT_ID"
        run_capture_to_var RECRUITING_GET_ATTACHMENT_TEXT "get_recruiting_attachment($RECRUITING_CLEANUP_ATTACHMENT_ID)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_recruiting_attachment\",\"arguments\":{\"target\":$RECRUITING_VACANCY_TARGET_JSON,\"attachmentId\":$RECRUITING_ATTACHMENT_ID_JSON}},\"id\":2}"
        assert_json_field_equals "get_recruiting_attachment returns id" "$RECRUITING_GET_ATTACHMENT_TEXT" ".attachment.id" "$RECRUITING_CLEANUP_ATTACHMENT_ID"
        run_capture_to_var RECRUITING_UPDATE_ATTACHMENT_TEXT "update_recruiting_attachment($RECRUITING_CLEANUP_ATTACHMENT_ID)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_recruiting_attachment\",\"arguments\":{\"target\":$RECRUITING_VACANCY_TARGET_JSON,\"attachmentId\":$RECRUITING_ATTACHMENT_ID_JSON,\"description\":$RECRUITING_ATTACHMENT_DESC_UPDATED_JSON,\"pinned\":true}},\"id\":2}"
        assert_json_field_equals "update_recruiting_attachment updated" "$RECRUITING_UPDATE_ATTACHMENT_TEXT" ".updated" "true"
        run_capture_to_var RECRUITING_DELETE_ATTACHMENT_TEXT "delete_recruiting_attachment($RECRUITING_CLEANUP_ATTACHMENT_ID)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_recruiting_attachment\",\"arguments\":{\"target\":$RECRUITING_VACANCY_TARGET_JSON,\"attachmentId\":$RECRUITING_ATTACHMENT_ID_JSON}},\"id\":2}"
        if assert_json_field_equals "delete_recruiting_attachment deleted" "$RECRUITING_DELETE_ATTACHMENT_TEXT" ".deleted" "true"; then
          RECRUITING_CLEANUP_ATTACHMENT_ID=""
        fi
      else
        skip_test "list/get/update/delete recruiting attachment" "add_recruiting_attachment did not return an attachment id"
      fi

      run_capture_to_var RECRUITING_ACTIVITY_TEXT "list_recruiting_activity(vacancy)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_recruiting_activity\",\"arguments\":{\"target\":$RECRUITING_VACANCY_TARGET_JSON,\"limit\":5}},\"id\":2}"
      assert_json_field_equals "list_recruiting_activity returns target" "$RECRUITING_ACTIVITY_TEXT" ".target.id" "$RECRUITING_CLEANUP_VACANCY_ID"

      run_capture_to_var RECRUITING_RELATED_ISSUE_TEXT "create_issue(for_recruiting_related_issue)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"title\":\"Recruiting Related Issue $RUN_ID\"}},\"id\":2}"
      RECRUITING_CLEANUP_RELATED_ISSUE_ID=$(echo "$RECRUITING_RELATED_ISSUE_TEXT" | jq -r '.identifier // empty' 2>/dev/null)
      if [ -n "$RECRUITING_CLEANUP_RELATED_ISSUE_ID" ]; then
        RECRUITING_RELATED_ISSUE_ID_JSON=$(json_string "$RECRUITING_CLEANUP_RELATED_ISSUE_ID")
        run_capture_to_var RECRUITING_ADD_RELATED_TEXT "add_recruiting_related_issue(vacancy)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_recruiting_related_issue\",\"arguments\":{\"target\":$RECRUITING_VACANCY_TARGET_JSON,\"issue\":$RECRUITING_RELATED_ISSUE_ID_JSON}},\"id\":2}"
        assert_json_field_equals "add_recruiting_related_issue created" "$RECRUITING_ADD_RELATED_TEXT" ".created" "true"
        run_capture_to_var RECRUITING_LIST_RELATED_TEXT "list_recruiting_related_issues(vacancy)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_recruiting_related_issues\",\"arguments\":{\"target\":$RECRUITING_VACANCY_TARGET_JSON,\"limit\":20}},\"id\":2}"
        assert_json_array_contains "list_recruiting_related_issues includes issue" "$RECRUITING_LIST_RELATED_TEXT" ".relatedIssues | map(.issue.display)" "$RECRUITING_CLEANUP_RELATED_ISSUE_ID"
        run_capture_to_var RECRUITING_REMOVE_RELATED_TEXT "remove_recruiting_related_issue(vacancy)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"remove_recruiting_related_issue\",\"arguments\":{\"target\":$RECRUITING_VACANCY_TARGET_JSON,\"issue\":$RECRUITING_RELATED_ISSUE_ID_JSON}},\"id\":2}"
        if assert_json_field_equals "remove_recruiting_related_issue deleted" "$RECRUITING_REMOVE_RELATED_TEXT" ".deleted" "true"; then
          run_test "delete_issue(recruiting_related:$RECRUITING_CLEANUP_RELATED_ISSUE_ID)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":$RECRUITING_RELATED_ISSUE_ID_JSON}},\"id\":2}"
          RECRUITING_CLEANUP_RELATED_ISSUE_ID=""
        fi
      else
        skip_test "add/list/remove recruiting related issue" "create_issue did not return an issue identifier"
      fi

      if [ -z "$RECRUITING_CREATE_STATUS" ]; then
        for recruiting_test in \
          "create_person(recruiting candidate)" \
          "set_recruiting_candidate_profile" \
          "get_recruiting_candidate" \
          "list_recruiting_skills" \
          "add_recruiting_candidate_skill" \
          "create_recruiting_applicant" \
          "list_recruiting_applicants" \
          "get_recruiting_applicant" \
          "update_recruiting_applicant" \
          "list_recruiting_applicant_matches" \
          "create_recruiting_review" \
          "list_recruiting_reviews" \
          "get_recruiting_review" \
          "update_recruiting_review" \
          "create_recruiting_opinion" \
          "list_recruiting_opinions" \
          "get_recruiting_opinion" \
          "update_recruiting_opinion" \
          "delete_recruiting_opinion" \
          "delete_recruiting_review" \
          "delete_recruiting_applicant" \
          "remove_recruiting_candidate_skill"; do
          skip_test "$recruiting_test" "Recruiting vacancy type has no applicant statuses"
        done
      else
        run_capture_to_var RECRUITING_PERSON_TEXT "create_person(recruiting candidate)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_person\",\"arguments\":{\"firstName\":$RECRUITING_PERSON_FIRST_NAME_JSON,\"lastName\":\"Candidate\",\"email\":$RECRUITING_PERSON_EMAIL_JSON}},\"id\":2}"
        RECRUITING_CLEANUP_PERSON_ID=$(echo "$RECRUITING_PERSON_TEXT" | jq -r '.id // empty' 2>/dev/null)
        if [ -n "$RECRUITING_CLEANUP_PERSON_ID" ]; then
          run_capture_to_var RECRUITING_PROFILE_TEXT "set_recruiting_candidate_profile($RECRUITING_PERSON_EMAIL)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"set_recruiting_candidate_profile\",\"arguments\":{\"candidate\":$RECRUITING_PERSON_EMAIL_JSON,\"title\":\"Integration Candidate\",\"remote\":true}},\"id\":2}"
          assert_json_field_equals "set_recruiting_candidate_profile created" "$RECRUITING_PROFILE_TEXT" ".created" "true"

          sleep 1
          run_capture_to_var RECRUITING_CANDIDATE_TEXT "get_recruiting_candidate($RECRUITING_PERSON_EMAIL)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_recruiting_candidate\",\"arguments\":{\"candidate\":$RECRUITING_PERSON_EMAIL_JSON}},\"id\":2}"
          assert_json_field_equals "get_recruiting_candidate returns email" "$RECRUITING_CANDIDATE_TEXT" ".email" "$RECRUITING_PERSON_EMAIL"

          run_capture_to_var RECRUITING_MATCHES_TEXT "list_recruiting_applicant_matches(candidate)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_recruiting_applicant_matches\",\"arguments\":{\"candidate\":$RECRUITING_PERSON_EMAIL_JSON,\"limit\":5}},\"id\":2}"

          run_capture_to_var RECRUITING_SKILLS_TEXT "list_recruiting_skills" \
            '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_recruiting_skills","arguments":{"limit":5}},"id":2}'
          RECRUITING_CLEANUP_SKILL=$(echo "$RECRUITING_SKILLS_TEXT" | jq -r '.skills[0].title // empty' 2>/dev/null)
          if [ -z "$RECRUITING_CLEANUP_SKILL" ]; then
            RECRUITING_CLEANUP_SKILL="$RECRUITING_SKILL_FALLBACK"
          fi
          RECRUITING_SKILL_JSON=$(json_string "$RECRUITING_CLEANUP_SKILL")
          run_capture_to_var RECRUITING_ADD_SKILL_TEXT "add_recruiting_candidate_skill($RECRUITING_CLEANUP_SKILL)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_recruiting_candidate_skill\",\"arguments\":{\"candidate\":$RECRUITING_PERSON_EMAIL_JSON,\"skill\":$RECRUITING_SKILL_JSON,\"weight\":5}},\"id\":2}"
          assert_json_field_equals "add_recruiting_candidate_skill attached" "$RECRUITING_ADD_SKILL_TEXT" ".attached" "true"

          RECRUITING_CREATE_STATUS_JSON=$(json_string "$RECRUITING_CREATE_STATUS")
          run_capture_to_var RECRUITING_APPLICANT_TEXT "create_recruiting_applicant" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_recruiting_applicant\",\"arguments\":{\"vacancy\":$RECRUITING_VACANCY_ID_JSON,\"candidate\":$RECRUITING_PERSON_EMAIL_JSON,\"status\":$RECRUITING_CREATE_STATUS_JSON}},\"id\":2}"
          RECRUITING_CLEANUP_APPLICANT_ID=$(echo "$RECRUITING_APPLICANT_TEXT" | jq -r '.applicant.id // empty' 2>/dev/null)
          if [ -n "$RECRUITING_CLEANUP_APPLICANT_ID" ]; then
            RECRUITING_APPLICANT_ID_JSON=$(json_string "$RECRUITING_CLEANUP_APPLICANT_ID")
            sleep 1
            run_capture_to_var RECRUITING_LIST_APPLICANTS_TEXT "list_recruiting_applicants(vacancy)" \
              "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_recruiting_applicants\",\"arguments\":{\"vacancy\":$RECRUITING_VACANCY_ID_JSON,\"limit\":20}},\"id\":2}"
            assert_json_array_contains "list_recruiting_applicants includes applicant" "$RECRUITING_LIST_APPLICANTS_TEXT" ".applicants | map(.id)" "$RECRUITING_CLEANUP_APPLICANT_ID"
            run_capture_to_var RECRUITING_GET_APPLICANT_TEXT "get_recruiting_applicant($RECRUITING_CLEANUP_APPLICANT_ID)" \
              "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_recruiting_applicant\",\"arguments\":{\"applicant\":$RECRUITING_APPLICANT_ID_JSON}},\"id\":2}"
            assert_json_field_equals "get_recruiting_applicant returns id" "$RECRUITING_GET_APPLICANT_TEXT" ".id" "$RECRUITING_CLEANUP_APPLICANT_ID"

            RECRUITING_UPDATE_STATUS_JSON=$(json_string "$RECRUITING_UPDATE_STATUS")
            run_capture_to_var RECRUITING_UPDATE_APPLICANT_TEXT "update_recruiting_applicant(status)" \
              "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_recruiting_applicant\",\"arguments\":{\"applicant\":$RECRUITING_APPLICANT_ID_JSON,\"status\":$RECRUITING_UPDATE_STATUS_JSON}},\"id\":2}"
            assert_json_field_equals "update_recruiting_applicant returns status" "$RECRUITING_UPDATE_APPLICANT_TEXT" ".applicant.status" "$RECRUITING_UPDATE_STATUS"

            RECRUITING_REVIEW_TITLE="MCP IntTest Review $RUN_ID"
            RECRUITING_REVIEW_TITLE_JSON=$(json_string "$RECRUITING_REVIEW_TITLE")
            RECRUITING_REVIEW_DATE=$((($(date +%s) + 60) * 1000))
            run_capture_to_var RECRUITING_REVIEW_TEXT "create_recruiting_review" \
              "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_recruiting_review\",\"arguments\":{\"candidate\":$RECRUITING_PERSON_EMAIL_JSON,\"title\":$RECRUITING_REVIEW_TITLE_JSON,\"date\":$RECRUITING_REVIEW_DATE,\"description\":\"Integration review\",\"application\":$RECRUITING_APPLICANT_ID_JSON,\"participants\":[$RECRUITING_PERSON_EMAIL_JSON]}},\"id\":2}"
            RECRUITING_CLEANUP_REVIEW_ID=$(echo "$RECRUITING_REVIEW_TEXT" | jq -r '.review.id // empty' 2>/dev/null)
            if [ -n "$RECRUITING_CLEANUP_REVIEW_ID" ]; then
              RECRUITING_REVIEW_ID_JSON=$(json_string "$RECRUITING_CLEANUP_REVIEW_ID")
              sleep 1
              run_capture_to_var RECRUITING_LIST_REVIEWS_TEXT "list_recruiting_reviews(candidate)" \
                "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_recruiting_reviews\",\"arguments\":{\"candidate\":$RECRUITING_PERSON_EMAIL_JSON,\"limit\":20}},\"id\":2}"
              assert_json_array_contains "list_recruiting_reviews includes review" "$RECRUITING_LIST_REVIEWS_TEXT" ".reviews | map(.id)" "$RECRUITING_CLEANUP_REVIEW_ID"
              run_capture_to_var RECRUITING_GET_REVIEW_TEXT "get_recruiting_review($RECRUITING_CLEANUP_REVIEW_ID)" \
                "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_recruiting_review\",\"arguments\":{\"review\":$RECRUITING_REVIEW_ID_JSON}},\"id\":2}"
              assert_json_field_equals "get_recruiting_review returns id" "$RECRUITING_GET_REVIEW_TEXT" ".id" "$RECRUITING_CLEANUP_REVIEW_ID"
              run_capture_to_var RECRUITING_UPDATE_REVIEW_TEXT "update_recruiting_review(verdict)" \
                "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_recruiting_review\",\"arguments\":{\"review\":$RECRUITING_REVIEW_ID_JSON,\"verdict\":\"Integration verdict\"}},\"id\":2}"
              assert_json_field_equals "update_recruiting_review returns id" "$RECRUITING_UPDATE_REVIEW_TEXT" ".review.id" "$RECRUITING_CLEANUP_REVIEW_ID"

              run_capture_to_var RECRUITING_OPINION_TEXT "create_recruiting_opinion" \
                "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_recruiting_opinion\",\"arguments\":{\"review\":$RECRUITING_REVIEW_ID_JSON,\"value\":\"Integration opinion\",\"description\":\"Opinion details\"}},\"id\":2}"
              RECRUITING_CLEANUP_OPINION_ID=$(echo "$RECRUITING_OPINION_TEXT" | jq -r '.opinion.id // empty' 2>/dev/null)
              if [ -n "$RECRUITING_CLEANUP_OPINION_ID" ]; then
                RECRUITING_OPINION_ID_JSON=$(json_string "$RECRUITING_CLEANUP_OPINION_ID")
                sleep 1
                run_capture_to_var RECRUITING_LIST_OPINIONS_TEXT "list_recruiting_opinions(review)" \
                  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_recruiting_opinions\",\"arguments\":{\"review\":$RECRUITING_REVIEW_ID_JSON,\"limit\":20}},\"id\":2}"
                assert_json_array_contains "list_recruiting_opinions includes opinion" "$RECRUITING_LIST_OPINIONS_TEXT" ".opinions | map(.id)" "$RECRUITING_CLEANUP_OPINION_ID"
                run_capture_to_var RECRUITING_GET_OPINION_TEXT "get_recruiting_opinion($RECRUITING_CLEANUP_OPINION_ID)" \
                  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_recruiting_opinion\",\"arguments\":{\"opinion\":$RECRUITING_OPINION_ID_JSON,\"review\":$RECRUITING_REVIEW_ID_JSON}},\"id\":2}"
                assert_json_field_equals "get_recruiting_opinion returns id" "$RECRUITING_GET_OPINION_TEXT" ".id" "$RECRUITING_CLEANUP_OPINION_ID"
                run_capture_to_var RECRUITING_UPDATE_OPINION_TEXT "update_recruiting_opinion(value)" \
                  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_recruiting_opinion\",\"arguments\":{\"opinion\":$RECRUITING_OPINION_ID_JSON,\"review\":$RECRUITING_REVIEW_ID_JSON,\"value\":\"Updated integration opinion\"}},\"id\":2}"
                assert_json_field_equals "update_recruiting_opinion returns value" "$RECRUITING_UPDATE_OPINION_TEXT" ".opinion.value" "Updated integration opinion"
                run_capture_to_var RECRUITING_DELETE_OPINION_TEXT "delete_recruiting_opinion($RECRUITING_CLEANUP_OPINION_ID)" \
                  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_recruiting_opinion\",\"arguments\":{\"opinion\":$RECRUITING_OPINION_ID_JSON,\"review\":$RECRUITING_REVIEW_ID_JSON}},\"id\":2}"
                if assert_json_field_equals "delete_recruiting_opinion deleted" "$RECRUITING_DELETE_OPINION_TEXT" ".deleted" "true"; then
                  RECRUITING_CLEANUP_OPINION_ID=""
                fi
              else
                skip_test "list/get/update/delete recruiting opinion" "create_recruiting_opinion did not return an id"
              fi

              run_capture_to_var RECRUITING_DELETE_REVIEW_TEXT "delete_recruiting_review($RECRUITING_CLEANUP_REVIEW_ID)" \
                "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_recruiting_review\",\"arguments\":{\"review\":$RECRUITING_REVIEW_ID_JSON}},\"id\":2}"
              if assert_json_field_equals "delete_recruiting_review deleted" "$RECRUITING_DELETE_REVIEW_TEXT" ".deleted" "true"; then
                RECRUITING_CLEANUP_REVIEW_ID=""
              fi
            else
              skip_test "list/get/update/delete recruiting review and opinion workflow" "create_recruiting_review did not return an id"
            fi

            run_capture_to_var RECRUITING_DELETE_APPLICANT_TEXT "delete_recruiting_applicant($RECRUITING_CLEANUP_APPLICANT_ID)" \
              "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_recruiting_applicant\",\"arguments\":{\"applicant\":$RECRUITING_APPLICANT_ID_JSON}},\"id\":2}"
            if assert_json_field_equals "delete_recruiting_applicant deleted" "$RECRUITING_DELETE_APPLICANT_TEXT" ".deleted" "true"; then
              RECRUITING_CLEANUP_APPLICANT_ID=""
            fi
          else
            skip_test "list/get/update/delete recruiting applicant" "create_recruiting_applicant did not return an id"
          fi

          run_capture_to_var RECRUITING_REMOVE_SKILL_TEXT "remove_recruiting_candidate_skill($RECRUITING_CLEANUP_SKILL)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"remove_recruiting_candidate_skill\",\"arguments\":{\"candidate\":$RECRUITING_PERSON_EMAIL_JSON,\"skill\":$RECRUITING_SKILL_JSON}},\"id\":2}"
          if assert_json_field_equals "remove_recruiting_candidate_skill detached" "$RECRUITING_REMOVE_SKILL_TEXT" ".detached" "true"; then
            RECRUITING_CLEANUP_SKILL=""
          fi
        else
          skip_test "set/get recruiting candidate and applicant workflow" "create_person did not return an id"
        fi
      fi

      run_capture_to_var RECRUITING_ARCHIVE_TEXT "archive_recruiting_vacancy($RECRUITING_CLEANUP_VACANCY_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"archive_recruiting_vacancy\",\"arguments\":{\"vacancy\":$RECRUITING_VACANCY_ID_JSON}},\"id\":2}"
      assert_json_field_equals "archive_recruiting_vacancy archived" "$RECRUITING_ARCHIVE_TEXT" ".vacancy.archived" "true"
    else
      skip_test "get/list/update recruiting vacancy workflow" "create_recruiting_vacancy did not return an id"
      skip_test "add/list/update/delete recruiting comment" "create_recruiting_vacancy did not return an id"
      skip_test "add/list/get/update/delete recruiting attachment" "create_recruiting_vacancy did not return an id"
      skip_test "list_recruiting_activity" "create_recruiting_vacancy did not return an id"
      skip_test "add/list/remove recruiting related issue" "create_recruiting_vacancy did not return an id"
    fi

    if [ -n "$RECRUITING_CLEANUP_PERSON_ID" ]; then
      RECRUITING_PERSON_ID_JSON=$(json_string "$RECRUITING_CLEANUP_PERSON_ID")
      run_test "delete_person(recruiting:$RECRUITING_CLEANUP_PERSON_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_person\",\"arguments\":{\"personId\":$RECRUITING_PERSON_ID_JSON}},\"id\":2}"
      RECRUITING_CLEANUP_PERSON_ID=""
    fi
  fi
fi
echo ""

##############################
# 1d. INVENTORY CRUD
##############################
echo "=== 1d. Inventory CRUD ==="
INVENTORY_PROBE_RESULT=$(call_tool \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_inventory_categories","arguments":{"limit":5}},"id":2}')
INVENTORY_PROBE_ERROR=$(echo "$INVENTORY_PROBE_RESULT" | jq -r '.result.content[0].text // .error.message // empty' 2>/dev/null)
INVENTORY_PROBE_IS_ERROR=$(echo "$INVENTORY_PROBE_RESULT" | jq -r '.result.isError // false' 2>/dev/null)
if [ -z "$INVENTORY_PROBE_RESULT" ]; then
  fail_test "list_inventory_categories" "no response"
elif [ "$INVENTORY_PROBE_IS_ERROR" = "true" ] &&
  printf '%s\n' "$INVENTORY_PROBE_ERROR" | grep -Eiq 'inventory.*(class|model|not found|missing)|class.*inventory'; then
  for inventory_test in \
    "list_inventory_categories" \
    "create_inventory_category" \
    "get_inventory_category" \
    "update_inventory_category" \
    "create_inventory_category(child)" \
    "list_inventory_categories(parent)" \
    "create_inventory_product" \
    "get_inventory_product" \
    "list_inventory_products" \
    "update_inventory_product" \
    "add_inventory_product_attachment" \
    "list_inventory_product_attachments" \
    "get_inventory_product_attachment" \
    "update_inventory_product_attachment" \
    "delete_inventory_product_attachment" \
    "add_inventory_product_photo" \
    "list_inventory_product_photos" \
    "get_inventory_product_photo" \
    "update_inventory_product_photo" \
    "delete_inventory_product_photo" \
    "add_inventory_product_comment" \
    "list_inventory_product_comments" \
    "update_inventory_product_comment" \
    "delete_inventory_product_comment" \
    "list_inventory_product_activity" \
    "create_inventory_variant" \
    "get_inventory_variant" \
    "list_inventory_variants" \
    "update_inventory_variant" \
    "delete_inventory_product(non-empty)" \
    "delete_inventory_variant" \
    "delete_inventory_product" \
    "delete_inventory_category(child)" \
    "delete_inventory_category"; do
    skip_test "$inventory_test" "server lacks Inventory model"
  done
elif [ "$INVENTORY_PROBE_IS_ERROR" = "true" ]; then
  fail_test "list_inventory_categories" "$INVENTORY_PROBE_ERROR"
else
  echo "PASS: list_inventory_categories"
  PASSED=$((PASSED + 1))

  INV_CATEGORY_NAME="MCP IntTest Inventory $RUN_ID"
  INV_CATEGORY_UPDATED_NAME="MCP IntTest Inventory Updated $RUN_ID"
  INV_CHILD_CATEGORY_NAME="MCP IntTest Inventory Child $RUN_ID"
  INV_PRODUCT_NAME="MCP IntTest Product $RUN_ID"
  INV_PRODUCT_UPDATED_NAME="MCP IntTest Product Updated $RUN_ID"
  INV_VARIANT_NAME="MCP IntTest Variant $RUN_ID"
  INV_VARIANT_UPDATED_NAME="MCP IntTest Variant Updated $RUN_ID"
  INV_SKU="MCP-$RUN_ID"
  INV_SKU_UPDATED="MCP-$RUN_ID-U"
  INV_CATEGORY_NAME_JSON=$(json_string "$INV_CATEGORY_NAME")
  INV_CATEGORY_UPDATED_NAME_JSON=$(json_string "$INV_CATEGORY_UPDATED_NAME")
  INV_CHILD_CATEGORY_NAME_JSON=$(json_string "$INV_CHILD_CATEGORY_NAME")
  INV_PRODUCT_NAME_JSON=$(json_string "$INV_PRODUCT_NAME")
  INV_PRODUCT_UPDATED_NAME_JSON=$(json_string "$INV_PRODUCT_UPDATED_NAME")
  INV_VARIANT_NAME_JSON=$(json_string "$INV_VARIANT_NAME")
  INV_VARIANT_UPDATED_NAME_JSON=$(json_string "$INV_VARIANT_UPDATED_NAME")
  INV_SKU_JSON=$(json_string "$INV_SKU")
  INV_SKU_UPDATED_JSON=$(json_string "$INV_SKU_UPDATED")

  run_capture_to_var INV_CATEGORY_TEXT "create_inventory_category($INV_CATEGORY_NAME)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_inventory_category\",\"arguments\":{\"name\":$INV_CATEGORY_NAME_JSON}},\"id\":2}"
  INVENTORY_CLEANUP_CATEGORY_ID=$(echo "$INV_CATEGORY_TEXT" | jq -r '.id // empty' 2>/dev/null)
  if [ -n "$INVENTORY_CLEANUP_CATEGORY_ID" ]; then
    INV_CATEGORY_ID_JSON=$(json_string "$INVENTORY_CLEANUP_CATEGORY_ID")
    sleep 1
    run_capture_to_var INV_GET_CATEGORY_TEXT "get_inventory_category($INVENTORY_CLEANUP_CATEGORY_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_inventory_category\",\"arguments\":{\"category\":$INV_CATEGORY_ID_JSON}},\"id\":2}"
    assert_json_field_equals "get_inventory_category returns name" "$INV_GET_CATEGORY_TEXT" ".name" "$INV_CATEGORY_NAME"

    run_capture_to_var INV_UPDATE_CATEGORY_TEXT "update_inventory_category($INVENTORY_CLEANUP_CATEGORY_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_inventory_category\",\"arguments\":{\"category\":$INV_CATEGORY_ID_JSON,\"name\":$INV_CATEGORY_UPDATED_NAME_JSON}},\"id\":2}"
    assert_json_field_equals "update_inventory_category updated" "$INV_UPDATE_CATEGORY_TEXT" ".updated" "true"

    run_capture_to_var INV_CHILD_CATEGORY_TEXT "create_inventory_category($INV_CHILD_CATEGORY_NAME)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_inventory_category\",\"arguments\":{\"name\":$INV_CHILD_CATEGORY_NAME_JSON,\"parentCategory\":$INV_CATEGORY_ID_JSON}},\"id\":2}"
    INVENTORY_CLEANUP_CHILD_CATEGORY_ID=$(echo "$INV_CHILD_CATEGORY_TEXT" | jq -r '.id // empty' 2>/dev/null)
    INV_CHILD_CATEGORY_ID_JSON=$(json_string "$INVENTORY_CLEANUP_CHILD_CATEGORY_ID")
    sleep 1
    run_capture_to_var INV_LIST_CHILDREN_TEXT "list_inventory_categories(parent)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_inventory_categories\",\"arguments\":{\"parentCategory\":$INV_CATEGORY_ID_JSON,\"limit\":20}},\"id\":2}"
    assert_json_array_contains "list_inventory_categories includes child" "$INV_LIST_CHILDREN_TEXT" ".categories | map(.id)" "$INVENTORY_CLEANUP_CHILD_CATEGORY_ID"

    run_capture_to_var INV_PRODUCT_TEXT "create_inventory_product($INV_PRODUCT_NAME)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_inventory_product\",\"arguments\":{\"name\":$INV_PRODUCT_NAME_JSON,\"category\":$INV_CATEGORY_ID_JSON}},\"id\":2}"
    INVENTORY_CLEANUP_PRODUCT_ID=$(echo "$INV_PRODUCT_TEXT" | jq -r '.id // empty' 2>/dev/null)
    if [ -n "$INVENTORY_CLEANUP_PRODUCT_ID" ]; then
      INV_PRODUCT_ID_JSON=$(json_string "$INVENTORY_CLEANUP_PRODUCT_ID")
      sleep 1
      run_capture_to_var INV_GET_PRODUCT_TEXT "get_inventory_product($INVENTORY_CLEANUP_PRODUCT_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_inventory_product\",\"arguments\":{\"product\":$INV_PRODUCT_ID_JSON}},\"id\":2}"
      assert_json_field_equals "get_inventory_product returns name" "$INV_GET_PRODUCT_TEXT" ".name" "$INV_PRODUCT_NAME"
      run_capture_to_var INV_LIST_PRODUCTS_TEXT "list_inventory_products(category)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_inventory_products\",\"arguments\":{\"category\":$INV_CATEGORY_ID_JSON,\"query\":$INV_PRODUCT_NAME_JSON,\"limit\":20}},\"id\":2}"
      assert_json_array_contains "list_inventory_products includes product" "$INV_LIST_PRODUCTS_TEXT" ".products | map(.id)" "$INVENTORY_CLEANUP_PRODUCT_ID"
      run_capture_to_var INV_UPDATE_PRODUCT_TEXT "update_inventory_product($INVENTORY_CLEANUP_PRODUCT_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_inventory_product\",\"arguments\":{\"product\":$INV_PRODUCT_ID_JSON,\"name\":$INV_PRODUCT_UPDATED_NAME_JSON}},\"id\":2}"
      assert_json_field_equals "update_inventory_product updated" "$INV_UPDATE_PRODUCT_TEXT" ".updated" "true"

      INV_SMALL_TEXT_DATA_JSON=$(json_string "aW52ZW50b3J5IGF0dGFjaG1lbnQ=")
      INV_SMALL_PHOTO_DATA_JSON=$(json_string "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=")
      INV_ATTACHMENT_FILENAME_JSON=$(json_string "inventory-attachment.txt")
      INV_PHOTO_FILENAME_JSON=$(json_string "inventory-photo.png")
      INV_ATTACHMENT_DESC_JSON=$(json_string "Inventory attachment")
      INV_ATTACHMENT_DESC_UPDATED_JSON=$(json_string "Updated inventory attachment")
      INV_PHOTO_DESC_JSON=$(json_string "Inventory photo")
      INV_PHOTO_DESC_UPDATED_JSON=$(json_string "Updated inventory photo")
      INV_COMMENT_BODY_JSON=$(json_string "Inventory product integration comment")
      INV_COMMENT_BODY_UPDATED_JSON=$(json_string "Updated inventory product integration comment")

      run_capture_to_var INV_ATTACHMENT_TEXT "add_inventory_product_attachment($INVENTORY_CLEANUP_PRODUCT_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_inventory_product_attachment\",\"arguments\":{\"product\":$INV_PRODUCT_ID_JSON,\"filename\":$INV_ATTACHMENT_FILENAME_JSON,\"contentType\":\"text/plain\",\"data\":$INV_SMALL_TEXT_DATA_JSON,\"description\":$INV_ATTACHMENT_DESC_JSON}},\"id\":2}"
      INVENTORY_CLEANUP_ATTACHMENT_ID=$(echo "$INV_ATTACHMENT_TEXT" | jq -r '.attachmentId // empty' 2>/dev/null)
      if [ -n "$INVENTORY_CLEANUP_ATTACHMENT_ID" ]; then
        INV_ATTACHMENT_ID_JSON=$(json_string "$INVENTORY_CLEANUP_ATTACHMENT_ID")
        wait_for_json_array_contains_to_var INV_LIST_ATTACHMENTS_TEXT "list_inventory_product_attachments includes attachment" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_inventory_product_attachments\",\"arguments\":{\"product\":$INV_PRODUCT_ID_JSON,\"limit\":20}},\"id\":2}" \
          ".attachments | map(.id)" "$INVENTORY_CLEANUP_ATTACHMENT_ID"
        run_capture_to_var INV_GET_ATTACHMENT_TEXT "get_inventory_product_attachment($INVENTORY_CLEANUP_ATTACHMENT_ID)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_inventory_product_attachment\",\"arguments\":{\"product\":$INV_PRODUCT_ID_JSON,\"attachmentId\":$INV_ATTACHMENT_ID_JSON}},\"id\":2}"
        assert_json_field_equals "get_inventory_product_attachment returns id" "$INV_GET_ATTACHMENT_TEXT" ".attachment.id" "$INVENTORY_CLEANUP_ATTACHMENT_ID"
        run_capture_to_var INV_UPDATE_ATTACHMENT_TEXT "update_inventory_product_attachment($INVENTORY_CLEANUP_ATTACHMENT_ID)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_inventory_product_attachment\",\"arguments\":{\"product\":$INV_PRODUCT_ID_JSON,\"attachmentId\":$INV_ATTACHMENT_ID_JSON,\"description\":$INV_ATTACHMENT_DESC_UPDATED_JSON,\"pinned\":true}},\"id\":2}"
        assert_json_field_equals "update_inventory_product_attachment updated" "$INV_UPDATE_ATTACHMENT_TEXT" ".updated" "true"
        run_capture_to_var INV_DELETE_ATTACHMENT_TEXT "delete_inventory_product_attachment($INVENTORY_CLEANUP_ATTACHMENT_ID)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_inventory_product_attachment\",\"arguments\":{\"product\":$INV_PRODUCT_ID_JSON,\"attachmentId\":$INV_ATTACHMENT_ID_JSON}},\"id\":2}"
        if assert_json_field_equals "delete_inventory_product_attachment deleted" "$INV_DELETE_ATTACHMENT_TEXT" ".deleted" "true"; then
          INVENTORY_CLEANUP_ATTACHMENT_ID=""
        fi
      else
        skip_test "list/get/update/delete inventory product attachment" "add_inventory_product_attachment did not return an id"
      fi

      run_capture_to_var INV_PHOTO_TEXT "add_inventory_product_photo($INVENTORY_CLEANUP_PRODUCT_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_inventory_product_photo\",\"arguments\":{\"product\":$INV_PRODUCT_ID_JSON,\"filename\":$INV_PHOTO_FILENAME_JSON,\"contentType\":\"image/png\",\"data\":$INV_SMALL_PHOTO_DATA_JSON,\"description\":$INV_PHOTO_DESC_JSON}},\"id\":2}"
      INVENTORY_CLEANUP_PHOTO_ID=$(echo "$INV_PHOTO_TEXT" | jq -r '.photoId // empty' 2>/dev/null)
      if [ -n "$INVENTORY_CLEANUP_PHOTO_ID" ]; then
        INV_PHOTO_ID_JSON=$(json_string "$INVENTORY_CLEANUP_PHOTO_ID")
        wait_for_json_array_contains_to_var INV_LIST_PHOTOS_TEXT "list_inventory_product_photos includes photo" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_inventory_product_photos\",\"arguments\":{\"product\":$INV_PRODUCT_ID_JSON,\"limit\":20}},\"id\":2}" \
          ".photos | map(.id)" "$INVENTORY_CLEANUP_PHOTO_ID"
        run_capture_to_var INV_GET_PHOTO_TEXT "get_inventory_product_photo($INVENTORY_CLEANUP_PHOTO_ID)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_inventory_product_photo\",\"arguments\":{\"product\":$INV_PRODUCT_ID_JSON,\"photoId\":$INV_PHOTO_ID_JSON}},\"id\":2}"
        assert_json_field_equals "get_inventory_product_photo returns id" "$INV_GET_PHOTO_TEXT" ".photo.id" "$INVENTORY_CLEANUP_PHOTO_ID"
        run_capture_to_var INV_UPDATE_PHOTO_TEXT "update_inventory_product_photo($INVENTORY_CLEANUP_PHOTO_ID)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_inventory_product_photo\",\"arguments\":{\"product\":$INV_PRODUCT_ID_JSON,\"photoId\":$INV_PHOTO_ID_JSON,\"description\":$INV_PHOTO_DESC_UPDATED_JSON,\"pinned\":true}},\"id\":2}"
        assert_json_field_equals "update_inventory_product_photo updated" "$INV_UPDATE_PHOTO_TEXT" ".updated" "true"
        run_capture_to_var INV_DELETE_PHOTO_TEXT "delete_inventory_product_photo($INVENTORY_CLEANUP_PHOTO_ID)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_inventory_product_photo\",\"arguments\":{\"product\":$INV_PRODUCT_ID_JSON,\"photoId\":$INV_PHOTO_ID_JSON}},\"id\":2}"
        if assert_json_field_equals "delete_inventory_product_photo deleted" "$INV_DELETE_PHOTO_TEXT" ".deleted" "true"; then
          INVENTORY_CLEANUP_PHOTO_ID=""
        fi
      else
        skip_test "list/get/update/delete inventory product photo" "add_inventory_product_photo did not return an id"
      fi

      run_capture_to_var INV_COMMENT_TEXT "add_inventory_product_comment($INVENTORY_CLEANUP_PRODUCT_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_inventory_product_comment\",\"arguments\":{\"product\":$INV_PRODUCT_ID_JSON,\"body\":$INV_COMMENT_BODY_JSON}},\"id\":2}"
      INVENTORY_CLEANUP_COMMENT_ID=$(echo "$INV_COMMENT_TEXT" | jq -r '.commentId // empty' 2>/dev/null)
      if [ -n "$INVENTORY_CLEANUP_COMMENT_ID" ]; then
        INV_COMMENT_ID_JSON=$(json_string "$INVENTORY_CLEANUP_COMMENT_ID")
        wait_for_json_array_contains_to_var INV_LIST_COMMENTS_TEXT "list_inventory_product_comments includes comment" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_inventory_product_comments\",\"arguments\":{\"product\":$INV_PRODUCT_ID_JSON,\"limit\":20}},\"id\":2}" \
          ".comments | map(.id)" "$INVENTORY_CLEANUP_COMMENT_ID"
        run_capture_to_var INV_UPDATE_COMMENT_TEXT "update_inventory_product_comment($INVENTORY_CLEANUP_COMMENT_ID)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_inventory_product_comment\",\"arguments\":{\"product\":$INV_PRODUCT_ID_JSON,\"commentId\":$INV_COMMENT_ID_JSON,\"body\":$INV_COMMENT_BODY_UPDATED_JSON}},\"id\":2}"
        assert_json_field_equals "update_inventory_product_comment updated" "$INV_UPDATE_COMMENT_TEXT" ".updated" "true"
        run_expect_error_contains "delete_inventory_product(comment non-empty)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_inventory_product\",\"arguments\":{\"product\":$INV_PRODUCT_ID_JSON}},\"id\":2}" \
          "comments"
        run_capture_to_var INV_ACTIVITY_TEXT "list_inventory_product_activity($INVENTORY_CLEANUP_PRODUCT_ID)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_inventory_product_activity\",\"arguments\":{\"product\":$INV_PRODUCT_ID_JSON,\"limit\":5}},\"id\":2}"
        assert_json_field_equals "list_inventory_product_activity returns product" "$INV_ACTIVITY_TEXT" ".product.id" "$INVENTORY_CLEANUP_PRODUCT_ID"
        run_capture_to_var INV_DELETE_COMMENT_TEXT "delete_inventory_product_comment($INVENTORY_CLEANUP_COMMENT_ID)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_inventory_product_comment\",\"arguments\":{\"product\":$INV_PRODUCT_ID_JSON,\"commentId\":$INV_COMMENT_ID_JSON}},\"id\":2}"
        if assert_json_field_equals "delete_inventory_product_comment deleted" "$INV_DELETE_COMMENT_TEXT" ".deleted" "true"; then
          INVENTORY_CLEANUP_COMMENT_ID=""
        fi
      else
        skip_test "list/update/delete inventory product comment" "add_inventory_product_comment did not return an id"
        run_capture_to_var INV_ACTIVITY_TEXT "list_inventory_product_activity($INVENTORY_CLEANUP_PRODUCT_ID)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_inventory_product_activity\",\"arguments\":{\"product\":$INV_PRODUCT_ID_JSON,\"limit\":5}},\"id\":2}"
        assert_json_field_equals "list_inventory_product_activity returns product" "$INV_ACTIVITY_TEXT" ".product.id" "$INVENTORY_CLEANUP_PRODUCT_ID"
      fi

      run_capture_to_var INV_VARIANT_TEXT "create_inventory_variant($INV_SKU)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_inventory_variant\",\"arguments\":{\"product\":$INV_PRODUCT_ID_JSON,\"name\":$INV_VARIANT_NAME_JSON,\"sku\":$INV_SKU_JSON}},\"id\":2}"
      INVENTORY_CLEANUP_VARIANT_ID=$(echo "$INV_VARIANT_TEXT" | jq -r '.id // empty' 2>/dev/null)
      if [ -n "$INVENTORY_CLEANUP_VARIANT_ID" ]; then
        INV_VARIANT_ID_JSON=$(json_string "$INVENTORY_CLEANUP_VARIANT_ID")
        sleep 1
        run_capture_to_var INV_GET_VARIANT_TEXT "get_inventory_variant($INV_SKU)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_inventory_variant\",\"arguments\":{\"variant\":$INV_SKU_JSON,\"product\":$INV_PRODUCT_ID_JSON}},\"id\":2}"
        assert_json_field_equals "get_inventory_variant returns sku" "$INV_GET_VARIANT_TEXT" ".sku" "$INV_SKU"
        run_capture_to_var INV_LIST_VARIANTS_TEXT "list_inventory_variants(product)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_inventory_variants\",\"arguments\":{\"product\":$INV_PRODUCT_ID_JSON,\"query\":$INV_SKU_JSON,\"limit\":20}},\"id\":2}"
        assert_json_array_contains "list_inventory_variants includes variant" "$INV_LIST_VARIANTS_TEXT" ".variants | map(.id)" "$INVENTORY_CLEANUP_VARIANT_ID"
        run_capture_to_var INV_UPDATE_VARIANT_TEXT "update_inventory_variant($INVENTORY_CLEANUP_VARIANT_ID)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_inventory_variant\",\"arguments\":{\"variant\":$INV_VARIANT_ID_JSON,\"name\":$INV_VARIANT_UPDATED_NAME_JSON,\"sku\":$INV_SKU_UPDATED_JSON}},\"id\":2}"
        assert_json_field_equals "update_inventory_variant updated" "$INV_UPDATE_VARIANT_TEXT" ".updated" "true"
        run_expect_error_contains "delete_inventory_product(non-empty)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_inventory_product\",\"arguments\":{\"product\":$INV_PRODUCT_ID_JSON}},\"id\":2}" \
          "not empty"
        run_capture_to_var INV_DELETE_VARIANT_TEXT "delete_inventory_variant($INVENTORY_CLEANUP_VARIANT_ID)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_inventory_variant\",\"arguments\":{\"variant\":$INV_VARIANT_ID_JSON}},\"id\":2}"
        assert_json_field_equals "delete_inventory_variant deleted" "$INV_DELETE_VARIANT_TEXT" ".deleted" "true"
        INVENTORY_CLEANUP_VARIANT_ID=""
      else
        skip_test "get/update/delete inventory variant" "create_inventory_variant did not return an id"
      fi

      run_capture_to_var INV_DELETE_PRODUCT_TEXT "delete_inventory_product($INVENTORY_CLEANUP_PRODUCT_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_inventory_product\",\"arguments\":{\"product\":$INV_PRODUCT_ID_JSON}},\"id\":2}"
      if assert_json_field_equals "delete_inventory_product deleted" "$INV_DELETE_PRODUCT_TEXT" ".deleted" "true"; then
        INVENTORY_CLEANUP_PRODUCT_ID=""
      fi
    else
      skip_test "get/list/update/delete inventory product" "create_inventory_product did not return an id"
    fi

    if [ -n "$INVENTORY_CLEANUP_CHILD_CATEGORY_ID" ]; then
      run_capture_to_var INV_DELETE_CHILD_CATEGORY_TEXT "delete_inventory_category($INVENTORY_CLEANUP_CHILD_CATEGORY_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_inventory_category\",\"arguments\":{\"category\":$INV_CHILD_CATEGORY_ID_JSON}},\"id\":2}"
      assert_json_field_equals "delete_inventory_category(child) deleted" "$INV_DELETE_CHILD_CATEGORY_TEXT" ".deleted" "true"
      INVENTORY_CLEANUP_CHILD_CATEGORY_ID=""
    fi
    run_capture_to_var INV_DELETE_CATEGORY_TEXT "delete_inventory_category($INVENTORY_CLEANUP_CATEGORY_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_inventory_category\",\"arguments\":{\"category\":$INV_CATEGORY_ID_JSON}},\"id\":2}"
    assert_json_field_equals "delete_inventory_category deleted" "$INV_DELETE_CATEGORY_TEXT" ".deleted" "true"
    INVENTORY_CLEANUP_CATEGORY_ID=""
  else
    skip_test "get/update/delete inventory category" "create_inventory_category did not return an id"
  fi
fi
echo ""

##############################
# 2. ISSUES CRUD + RELATIONS + LABELS + MOVE
##############################
echo "=== 2. Issues CRUD ==="
ISSUE_ID=""
ISSUE_OBJ_ID=""
ISSUE_TITLE="IntTest Issue $RUN_ID"
ISSUE_TITLE_JSON=$(json_string "$ISSUE_TITLE")
ISSUE_TITLE_REGEX_JSON=$(json_string "%$ISSUE_TITLE%")
ISSUE_TITLE_CASE_REGEX_JSON=$(json_string "%inttest issue $RUN_ID%")
TIME_ESTIMATE_HOURS=8
TIME_REPORT_HOURS=0.25
run_capture_to_var ISSUE_TEXT "create_issue" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"title\":$ISSUE_TITLE_JSON,\"description\":\"Integration test\",\"priority\":\"low\",\"estimation\":$TIME_ESTIMATE_HOURS}},\"id\":2}"
if [ $? -eq 0 ]; then
  ISSUE_ID=$(echo "$ISSUE_TEXT" | jq -r '.identifier' 2>/dev/null)
  ISSUE_OBJ_ID=$(echo "$ISSUE_TEXT" | jq -r '.issueId' 2>/dev/null)
  echo "  => $ISSUE_ID ($ISSUE_OBJ_ID)"

  run_capture_to_var GET_ISSUE_TEXT "get_issue($ISSUE_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$ISSUE_ID\"}},\"id\":2}"
  if [ $? -eq 0 ] && [ -n "$ISSUE_OBJ_ID" ]; then
    assert_json_field_equals "get_issue returns issueId" "$GET_ISSUE_TEXT" ".issueId" "$ISSUE_OBJ_ID"
  fi
  ISSUE_CREATOR_ID=$(echo "$GET_ISSUE_TEXT" | jq -r '.creator.id // empty' 2>/dev/null)
  ISSUE_CREATOR_NAME=$(echo "$GET_ISSUE_TEXT" | jq -r '.creator.name // empty' 2>/dev/null)
  ISSUE_CREATOR_EMAIL=$(echo "$GET_ISSUE_TEXT" | jq -r '.creator.email // empty' 2>/dev/null)
  if [ -n "$ISSUE_CREATOR_ID" ] && [ -n "$ISSUE_CREATOR_NAME" ] && [ -n "$ISSUE_CREATOR_EMAIL" ]; then
    assert_json_field_equals "get_issue projects stable creator Person ID" \
      "$GET_ISSUE_TEXT" ".creator.id" "$ISSUE_CREATOR_ID"
    assert_json_field_equals "get_issue projects creator display name" \
      "$GET_ISSUE_TEXT" ".creator.name" "$ISSUE_CREATOR_NAME"
    assert_json_field_equals "get_issue projects creator email" \
      "$GET_ISSUE_TEXT" ".creator.email" "$ISSUE_CREATOR_EMAIL"

    ISSUE_CREATOR_ID_JSON=$(json_string "$ISSUE_CREATOR_ID")
    ISSUE_CREATOR_NAME_JSON=$(json_string "$ISSUE_CREATOR_NAME")
    ISSUE_CREATOR_EMAIL_JSON=$(json_string "$ISSUE_CREATOR_EMAIL")
    wait_for_json_array_contains_to_var CREATOR_BY_ID_TEXT \
      "list_issues(creator Person ID + titleSearch) includes created issue" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_issues\",\"arguments\":{\"project\":\"$PROJECT\",\"creator\":$ISSUE_CREATOR_ID_JSON,\"titleSearch\":$ISSUE_TITLE_JSON,\"limit\":10}},\"id\":2}" \
      "map(.issueId)" "$ISSUE_OBJ_ID"
    assert_json_field_equals "list_issues projects creator from Person ID filter" \
      "$CREATOR_BY_ID_TEXT" ".[0].creator.id" "$ISSUE_CREATOR_ID"
    wait_for_json_array_contains_to_var CREATOR_BY_EMAIL_TEXT \
      "list_issues(creator exact email) includes created issue" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_issues\",\"arguments\":{\"project\":\"$PROJECT\",\"creator\":$ISSUE_CREATOR_EMAIL_JSON,\"titleSearch\":$ISSUE_TITLE_JSON,\"limit\":10}},\"id\":2}" \
      "map(.issueId)" "$ISSUE_OBJ_ID"
    wait_for_json_array_contains_to_var CREATOR_BY_NAME_TEXT \
      "list_issues(creator exact name) includes created issue" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_issues\",\"arguments\":{\"project\":\"$PROJECT\",\"creator\":$ISSUE_CREATOR_NAME_JSON,\"titleSearch\":$ISSUE_TITLE_JSON,\"limit\":10}},\"id\":2}" \
      "map(.issueId)" "$ISSUE_OBJ_ID"
  else
    fail_test "issue creator projection and filters" \
      "get_issue did not return creator id, name, and email for the authenticated issue author"
  fi

  if ISSUE_PARENT_STATE=$(pnpm exec tsx scripts/integration-issue-parent-semantics.ts \
    --project "$PROJECT" --issue "$ISSUE_ID" --mode top-level --expectedIssueChildren 0); then
    echo "PASS: create_issue uses native NoParent top-level shape"
    PASSED=$((PASSED + 1))
    echo "  => $ISSUE_PARENT_STATE"
  else
    fail_test "create_issue native NoParent shape" "parent semantics helper failed"
  fi

  if [ "$INTEGRATION_TRANSPORT" = "stdio" ] \
    && CUSTOM_FIELD_DATE_FIXTURE=$(pnpm exec tsx scripts/integration-custom-field-date.ts \
      --mode setup --issueId "$ISSUE_OBJ_ID"); then
    CUSTOM_FIELD_DATE_CLEANUP_ISSUE_ID="$ISSUE_OBJ_ID"
    CUSTOM_FIELD_DATE_CLEANUP_FIELD_ID=$(printf '%s\n' "$CUSTOM_FIELD_DATE_FIXTURE" | jq -r '.fieldId')
    CUSTOM_FIELD_DATE_CLEANUP_FIELD_NAME=$(printf '%s\n' "$CUSTOM_FIELD_DATE_FIXTURE" | jq -r '.fieldName')
    CUSTOM_FIELD_DATE_FIELD_ID_JSON=$(json_string "$CUSTOM_FIELD_DATE_CLEANUP_FIELD_ID")
    sleep 1

    CUSTOM_FIELD_DATE_INITIAL_RESULT=$(pnpm exec tsx scripts/integration-custom-field-date.ts \
      --mode read \
      --issueId "$ISSUE_OBJ_ID" \
      --fieldName "$CUSTOM_FIELD_DATE_CLEANUP_FIELD_NAME")
    assert_json_field_equals "date custom field is initially absent" \
      "$CUSTOM_FIELD_DATE_INITIAL_RESULT" ".value" "null"

    run_capture_to_var CUSTOM_FIELD_DATE_SET_TEXT "set_custom_field(strict ISO date)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"set_custom_field\",\"arguments\":{\"objectId\":\"$ISSUE_OBJ_ID\",\"objectClass\":\"tracker:class:Issue\",\"fieldId\":$CUSTOM_FIELD_DATE_FIELD_ID_JSON,\"value\":\"2026-07-24\"}},\"id\":2}"
    assert_json_field_equals "set_custom_field persists strict ISO date as Unix milliseconds" \
      "$CUSTOM_FIELD_DATE_SET_TEXT" ".value" "1784851200000"

    run_expect_error_contains "set_custom_field rejects timezone-adjacent date before write" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"set_custom_field\",\"arguments\":{\"objectId\":\"$ISSUE_OBJ_ID\",\"objectClass\":\"tracker:class:Issue\",\"fieldId\":$CUSTOM_FIELD_DATE_FIELD_ID_JSON,\"value\":\"2026-07-25T00:00:00Z\"}},\"id\":2}" \
      "Invalid date custom-field value"

    CUSTOM_FIELD_DATE_READ_RESULT=$(pnpm exec tsx scripts/integration-custom-field-date.ts \
      --mode read \
      --issueId "$ISSUE_OBJ_ID" \
      --fieldName "$CUSTOM_FIELD_DATE_CLEANUP_FIELD_NAME")
    assert_json_field_equals "rejected date custom field leaves persisted value unchanged" \
      "$CUSTOM_FIELD_DATE_READ_RESULT" ".value" "1784851200000"

    if cleanup_custom_field_date_artifacts; then
      CUSTOM_FIELD_DATE_CLEANUP_ISSUE_ID=""
      CUSTOM_FIELD_DATE_CLEANUP_FIELD_ID=""
      CUSTOM_FIELD_DATE_CLEANUP_FIELD_NAME=""
    else
      fail_test "date custom-field fixture cleanup" "cleanup failed; exit trap will retry retained markers"
    fi
  elif [ "$INTEGRATION_TRANSPORT" != "stdio" ]; then
    skip_test "set_custom_field persists strict ISO date as Unix milliseconds" \
      "dynamic model fixture requires a fresh stdio connection"
    skip_test "date custom field is initially absent" \
      "dynamic model fixture requires a fresh stdio connection"
    skip_test "set_custom_field rejects timezone-adjacent date before write" \
      "dynamic model fixture requires a fresh stdio connection"
    skip_test "rejected date custom field leaves persisted value unchanged" \
      "dynamic model fixture requires a fresh stdio connection"
  else
    fail_test "date custom-field strict persistence/no-write lifecycle" "custom-field date helper failed"
  fi

  wait_for_json_array_contains_to_var TOP_LEVEL_ISSUES_TEXT "list_issues(isTopLevel) includes created top-level issue" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_issues\",\"arguments\":{\"project\":\"$PROJECT\",\"isTopLevel\":true,\"limit\":200}},\"id\":2}" \
    "map(.identifier)" "$ISSUE_ID"

  if [ "$INTEGRATION_SURFACE" = "mcp" ]; then
    run_test "resources/read issue($ISSUE_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"resources/read\",\"params\":{\"uri\":\"huly://issues/$ISSUE_ID\"},\"id\":2}"
  else
    run_test "get_issue($ISSUE_ID) (resources/read equivalent)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$ISSUE_ID\"}},\"id\":2}"
  fi

  run_capture_to_var LIST_ISSUES_TEXT "list_issues" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_issues\",\"arguments\":{\"project\":\"$PROJECT\",\"titleSearch\":$ISSUE_TITLE_JSON,\"limit\":10}},\"id\":2}"
  if [ $? -eq 0 ] && [ -n "$ISSUE_OBJ_ID" ]; then
    assert_json_issue_summary_contains_issue_id "list_issues includes issueId" "$LIST_ISSUES_TEXT" "$ISSUE_ID" "$ISSUE_OBJ_ID"
  fi

  run_capture_to_var LIST_ISSUES_REGEX_TEXT "list_issues(titleRegex SIMILAR TO contains)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_issues\",\"arguments\":{\"project\":\"$PROJECT\",\"titleRegex\":$ISSUE_TITLE_REGEX_JSON,\"limit\":10}},\"id\":2}"
  if [ $? -eq 0 ] && [ -n "$ISSUE_OBJ_ID" ]; then
    assert_json_issue_summary_contains_issue_id "list_issues titleRegex SIMILAR TO contains includes issueId" "$LIST_ISSUES_REGEX_TEXT" "$ISSUE_ID" "$ISSUE_OBJ_ID"
  fi

  run_capture_to_var LIST_ISSUES_REGEX_CASE_TEXT "list_issues(titleRegex case-sensitive miss)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_issues\",\"arguments\":{\"project\":\"$PROJECT\",\"titleRegex\":$ISSUE_TITLE_CASE_REGEX_JSON,\"limit\":10}},\"id\":2}"
  if [ $? -eq 0 ] && [ -n "$ISSUE_OBJ_ID" ]; then
    assert_json_array_not_contains "list_issues titleRegex is case-sensitive" "$LIST_ISSUES_REGEX_CASE_TEXT" "map(.issueId)" "$ISSUE_OBJ_ID"
  fi

  run_test "update_issue($ISSUE_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$ISSUE_ID\",\"title\":\"Updated IntTest\",\"priority\":\"high\"}},\"id\":2}"

  AGENT_ASSIGNEE_TITLE="Integration Agent Profile $RUN_ID"
  AGENT_ASSIGNEE_TITLE_JSON=$(json_string "$AGENT_ASSIGNEE_TITLE")
  AGENT_ASSIGNEE_EMAIL="issue-agent-$RUN_ID@example.invalid"
  AGENT_ASSIGNEE_EMAIL_JSON=$(json_string "$AGENT_ASSIGNEE_EMAIL")
  run_capture_to_var AGENT_ASSIGNEE_PERSON_TEXT "create_person(for_agent_profile_assignee)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_person\",\"arguments\":{\"firstName\":\"Issue Agent\",\"lastName\":\"$RUN_ID\",\"email\":$AGENT_ASSIGNEE_EMAIL_JSON}},\"id\":2}"
  if [ $? -eq 0 ]; then
    ISSUE_AGENT_CLEANUP_PERSON_ID=$(printf '%s\n' "$AGENT_ASSIGNEE_PERSON_TEXT" | jq -r '.id // empty')
    if AGENT_ASSIGNEE_PROFILE_FIXTURE=$(pnpm exec tsx scripts/integration-issue-agent-profile.ts \
      --mode setup --personId "$ISSUE_AGENT_CLEANUP_PERSON_ID" --title "$AGENT_ASSIGNEE_TITLE"); then
      ISSUE_AGENT_CLEANUP_PROFILE_ID=$(printf '%s\n' "$AGENT_ASSIGNEE_PROFILE_FIXTURE" | jq -r '.profileId // empty')
      sleep 2
      AGENT_ASSIGNEE_ISSUE_TITLE="Agent Assignee Issue $RUN_ID"
      AGENT_ASSIGNEE_ISSUE_TITLE_JSON=$(json_string "$AGENT_ASSIGNEE_ISSUE_TITLE")
      run_capture_to_var AGENT_ASSIGNEE_ISSUE_TEXT "create_issue(agent UserProfile title assignee)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"title\":$AGENT_ASSIGNEE_ISSUE_TITLE_JSON,\"assignee\":$AGENT_ASSIGNEE_TITLE_JSON}},\"id\":2}"
      if [ $? -eq 0 ]; then
        ISSUE_AGENT_CLEANUP_ISSUE_ID=$(printf '%s\n' "$AGENT_ASSIGNEE_ISSUE_TEXT" | jq -r '.identifier // empty')
        ISSUE_AGENT_ASSIGNEE_OBJECT_ID=$(printf '%s\n' "$AGENT_ASSIGNEE_ISSUE_TEXT" | jq -r '.issueId // empty')
        sleep 2
        run_capture_to_var AGENT_ASSIGNEE_CREATED_GET_TEXT "get_issue(agent UserProfile title assignee)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$ISSUE_AGENT_CLEANUP_ISSUE_ID\"}},\"id\":2}"
        assert_json_field_equals "create_issue resolves agent UserProfile title to linked Person" \
          "$AGENT_ASSIGNEE_CREATED_GET_TEXT" ".assigneeRef.id" "$ISSUE_AGENT_CLEANUP_PERSON_ID"
        wait_for_json_array_contains_to_var AGENT_ASSIGNEE_LIST_TEXT \
          "list_issues resolves exact agent UserProfile title" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_issues\",\"arguments\":{\"project\":\"$PROJECT\",\"assignee\":$AGENT_ASSIGNEE_TITLE_JSON,\"titleSearch\":$AGENT_ASSIGNEE_ISSUE_TITLE_JSON,\"limit\":10}},\"id\":2}" \
          "map(.issueId)" "$ISSUE_AGENT_ASSIGNEE_OBJECT_ID"
        run_test "update_issue(unassign agent UserProfile fixture)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$ISSUE_AGENT_CLEANUP_ISSUE_ID\",\"assignee\":null}},\"id\":2}"
        run_test "update_issue(agent UserProfile title assignee)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$ISSUE_AGENT_CLEANUP_ISSUE_ID\",\"assignee\":$AGENT_ASSIGNEE_TITLE_JSON}},\"id\":2}"
        sleep 2
        run_capture_to_var AGENT_ASSIGNEE_UPDATED_GET_TEXT "get_issue(after agent UserProfile title update)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$ISSUE_AGENT_CLEANUP_ISSUE_ID\"}},\"id\":2}"
        assert_json_field_equals "update_issue resolves agent UserProfile title to linked Person" \
          "$AGENT_ASSIGNEE_UPDATED_GET_TEXT" ".assigneeRef.id" "$ISSUE_AGENT_CLEANUP_PERSON_ID"
      else
        skip_test "list/update issue by agent UserProfile title" "could not create assigned issue fixture"
      fi
    else
      skip_test "issue assignee agent UserProfile title lifecycle" "could not create UserProfile fixture"
    fi
  else
    skip_test "issue assignee agent UserProfile title lifecycle" "could not create Person fixture"
  fi
  if ! cleanup_issue_agent_assignee_artifacts; then
    fail_test "agent UserProfile assignee fixture cleanup" "cleanup failed; exit trap will retry retained markers"
  fi

  if [ "$TM_TASK_TYPE_READY" = "true" ]; then
    run_capture_to_var TASK_TYPED_ISSUE_TEXT "create_issue(taskType=$TM_TASK_TYPE_NAME)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"title\":\"Typed IntTest Issue\",\"taskType\":$TM_TASK_TYPE_NAME_JSON,\"status\":$TM_TASK_TYPE_STATUS_NAME_JSON}},\"id\":2}"
    if [ $? -eq 0 ]; then
      TASK_TYPED_ISSUE_ID=$(echo "$TASK_TYPED_ISSUE_TEXT" | jq -r '.identifier' 2>/dev/null)
      echo "  => typed: $TASK_TYPED_ISSUE_ID"
    fi

    run_test "update_issue($ISSUE_ID taskType=$TM_TASK_TYPE_NAME)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$ISSUE_ID\",\"taskType\":$TM_TASK_TYPE_NAME_JSON,\"status\":$TM_TASK_TYPE_STATUS_NAME_JSON}},\"id\":2}"
    if [ -n "$TASK_TYPED_ISSUE_ID" ]; then
      run_test "delete_issue(task_typed:$TASK_TYPED_ISSUE_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$TASK_TYPED_ISSUE_ID\"}},\"id\":2}"
    fi
  else
    skip_test "create_issue(taskType)" "task-management setup did not verify disposable task type/status"
    skip_test "update_issue(taskType)" "task-management setup did not verify disposable task type/status"
  fi

  # Sub-issue + move
  SUB_ID=""
  run_capture_to_var SUB_TEXT "create_issue(sub)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"title\":\"Sub Issue\",\"parentIssue\":\"$ISSUE_ID\"}},\"id\":2}"
  if [ $? -eq 0 ]; then
    SUB_ID=$(echo "$SUB_TEXT" | jq -r '.identifier' 2>/dev/null)
    echo "  => sub: $SUB_ID"
    if CHILD_PARENT_STATE=$(pnpm exec tsx scripts/integration-issue-parent-semantics.ts \
      --project "$PROJECT" --issue "$SUB_ID" --mode child --parent "$ISSUE_ID" \
      --expectedIssueChildren 0 --expectedParentChildren 1); then
      echo "PASS: create_issue(sub) attaches natively and increments parent count once"
      PASSED=$((PASSED + 1))
      echo "  => $CHILD_PARENT_STATE"
    else
      fail_test "create_issue(sub) native parent/count" "parent semantics helper failed"
    fi
    wait_for_json_array_contains_to_var SUB_ISSUES_TEXT "list_issues(parentIssue) includes direct child" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_issues\",\"arguments\":{\"project\":\"$PROJECT\",\"parentIssue\":\"$ISSUE_ID\",\"limit\":200}},\"id\":2}" \
      "map(.identifier)" "$SUB_ID"
    run_capture_to_var TOP_LEVEL_BEFORE_DETACH_TEXT "list_issues(isTopLevel before detach)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_issues\",\"arguments\":{\"project\":\"$PROJECT\",\"isTopLevel\":true,\"limit\":200}},\"id\":2}"
    assert_json_array_not_contains "list_issues(isTopLevel) excludes attached child" \
      "$TOP_LEVEL_BEFORE_DETACH_TEXT" "map(.identifier)" "$SUB_ID"
    run_test "move_issue($SUB_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"move_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$SUB_ID\",\"newParent\":null}},\"id\":2}"
    if DETACHED_PARENT_STATE=$(pnpm exec tsx scripts/integration-issue-parent-semantics.ts \
      --project "$PROJECT" --issue "$SUB_ID" --mode top-level --parent "$ISSUE_ID" \
      --expectedIssueChildren 0 --expectedParentChildren 0); then
      echo "PASS: move_issue(null) restores NoParent and decrements parent count once"
      PASSED=$((PASSED + 1))
      echo "  => $DETACHED_PARENT_STATE"
    else
      fail_test "move_issue(null) native detach/count" "parent semantics helper failed"
    fi
    wait_for_json_array_contains_to_var TOP_LEVEL_AFTER_DETACH_TEXT "list_issues(isTopLevel) includes detached child" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_issues\",\"arguments\":{\"project\":\"$PROJECT\",\"isTopLevel\":true,\"limit\":200}},\"id\":2}" \
      "map(.identifier)" "$SUB_ID"
    if LEGACY_PARENT_STATE=$(pnpm exec tsx scripts/integration-issue-parent-semantics.ts \
      --project "$PROJECT" --issue "$SUB_ID" --mode make-legacy --parent "$ISSUE_ID" \
      --expectedIssueChildren 0 --expectedParentChildren 0); then
      echo "PASS: integration fixture creates legacy project-attached issue without changing parent count"
      PASSED=$((PASSED + 1))
      echo "  => $LEGACY_PARENT_STATE"
    else
      fail_test "create legacy project-attached issue fixture" "parent semantics helper failed"
    fi
    run_test "move_issue($SUB_ID repair legacy top-level)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"move_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$SUB_ID\",\"newParent\":null}},\"id\":2}"
    if REPAIRED_PARENT_STATE=$(pnpm exec tsx scripts/integration-issue-parent-semantics.ts \
      --project "$PROJECT" --issue "$SUB_ID" --mode top-level --parent "$ISSUE_ID" \
      --expectedIssueChildren 0 --expectedParentChildren 0); then
      echo "PASS: move_issue(null) repairs legacy attachment without changing parent count"
      PASSED=$((PASSED + 1))
      echo "  => $REPAIRED_PARENT_STATE"
    else
      fail_test "move_issue(null) legacy repair/count" "parent semantics helper failed"
    fi
    run_test "delete_issue(sub:$SUB_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$SUB_ID\"}},\"id\":2}"
  fi

  # Issue relations
  run_capture_to_var ISSUE2_TEXT "create_issue(for_relation)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"title\":\"Relation Target\"}},\"id\":2}"
  if [ $? -eq 0 ]; then
    ISSUE2_ID=$(echo "$ISSUE2_TEXT" | jq -r '.identifier' 2>/dev/null)
    echo "  => relation target: $ISSUE2_ID"
    run_test "add_issue_relation" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_issue_relation\",\"arguments\":{\"project\":\"$PROJECT\",\"issueIdentifier\":\"$ISSUE_ID\",\"targetIssue\":\"$ISSUE2_ID\",\"relationType\":\"is-blocked-by\"}},\"id\":2}"
    run_test "list_issue_relations" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_issue_relations\",\"arguments\":{\"project\":\"$PROJECT\",\"issueIdentifier\":\"$ISSUE_ID\"}},\"id\":2}"
    run_capture_to_var REL_BLOCKS_TEXT "list_issue_relations(blocks:$ISSUE2_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_issue_relations\",\"arguments\":{\"project\":\"$PROJECT\",\"issueIdentifier\":\"$ISSUE2_ID\"}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_blocks_contains_identifier "list_issue_relations blocks contains $ISSUE_ID" "$REL_BLOCKS_TEXT" "$ISSUE_ID"
    fi
    run_test "remove_issue_relation" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"remove_issue_relation\",\"arguments\":{\"project\":\"$PROJECT\",\"issueIdentifier\":\"$ISSUE_ID\",\"targetIssue\":\"$ISSUE2_ID\",\"relationType\":\"is-blocked-by\"}},\"id\":2}"
    run_test "delete_issue(relation:$ISSUE2_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$ISSUE2_ID\"}},\"id\":2}"
  fi

  # Issue labels
  ISSUE_LABEL_TITLE="inttest-lbl-$RUN_ID"
  ISSUE_LABEL_TITLE_JSON=$(json_string "$ISSUE_LABEL_TITLE")
  ISSUE_LABEL_FILTER=$(printf '%s' "$ISSUE_LABEL_TITLE" | tr '[:lower:]' '[:upper:]')
  ISSUE_LABEL_FILTER_JSON=$(json_string "$ISSUE_LABEL_FILTER")
  run_capture_to_var LBL_TEXT "create_label(for_issue)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_label\",\"arguments\":{\"title\":$ISSUE_LABEL_TITLE_JSON,\"color\":2}},\"id\":2}"
  if [ $? -eq 0 ]; then
    LBL_ID=$(echo "$LBL_TEXT" | jq -r '.id' 2>/dev/null)
    echo "  => label: $LBL_ID"
    run_test "add_issue_label($ISSUE_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_issue_label\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$ISSUE_ID\",\"label\":$ISSUE_LABEL_TITLE_JSON}},\"id\":2}"
    wait_for_json_array_contains_to_var ISSUE_LABEL_GET_TEXT "get_issue projects attached label title" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$ISSUE_ID\"}},\"id\":2}" \
      ".labels | map(.title)" "$ISSUE_LABEL_TITLE"
    assert_json_field_equals "get_issue projects attached label color" "$ISSUE_LABEL_GET_TEXT" \
      ".labels | map(select(.title == \"$ISSUE_LABEL_TITLE\")) | first | .color" "2"
    wait_for_json_array_contains_to_var ISSUE_LABEL_LIST_TEXT "list_issues filters by case-insensitive label title" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_issues\",\"arguments\":{\"project\":\"$PROJECT\",\"label\":$ISSUE_LABEL_FILTER_JSON,\"limit\":1}},\"id\":2}" \
      "map(.identifier)" "$ISSUE_ID"
    assert_json_array_contains "list_issues projects attached label summary" "$ISSUE_LABEL_LIST_TEXT" \
      "map(select(.identifier == \"$ISSUE_ID\")) | first | .labels | map(.title)" "$ISSUE_LABEL_TITLE"
    run_test "remove_issue_label($ISSUE_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"remove_issue_label\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$ISSUE_ID\",\"label\":$ISSUE_LABEL_TITLE_JSON}},\"id\":2}"
    run_test "delete_label($LBL_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_label\",\"arguments\":{\"label\":\"$LBL_ID\"}},\"id\":2}"
  fi

  # Comments on issue
  run_capture_to_var COMMENT_TEXT "add_comment($ISSUE_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_comment\",\"arguments\":{\"project\":\"$PROJECT\",\"issueIdentifier\":\"$ISSUE_ID\",\"body\":\"IntTest comment\"}},\"id\":2}"
  if [ $? -eq 0 ]; then
    COMMENT_ID=$(echo "$COMMENT_TEXT" | jq -r '.commentId' 2>/dev/null)
    echo "  => comment: $COMMENT_ID"
    run_test "list_comments($ISSUE_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_comments\",\"arguments\":{\"project\":\"$PROJECT\",\"issueIdentifier\":\"$ISSUE_ID\"}},\"id\":2}"
    run_test "update_comment($COMMENT_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_comment\",\"arguments\":{\"project\":\"$PROJECT\",\"issueIdentifier\":\"$ISSUE_ID\",\"commentId\":\"$COMMENT_ID\",\"body\":\"Updated comment\"}},\"id\":2}"
    run_test "delete_comment($COMMENT_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_comment\",\"arguments\":{\"project\":\"$PROJECT\",\"issueIdentifier\":\"$ISSUE_ID\",\"commentId\":\"$COMMENT_ID\"}},\"id\":2}"
  fi

  # Activity on issue
  run_capture_to_var ACTIVITY_TEXT "list_activity(issue:$ISSUE_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_activity\",\"arguments\":{\"project\":\"$PROJECT\",\"issueIdentifier\":\"$ISSUE_ID\",\"limit\":3}},\"id\":2}"
  if [ $? -eq 0 ] && [ -n "$ISSUE_OBJ_ID" ]; then
    assert_json_activity_contains_object_id "list_activity friendly target contains $ISSUE_OBJ_ID" "$ACTIVITY_TEXT" "$ISSUE_OBJ_ID"
  fi

  # Time tracking
  run_capture_to_var TIME_REPORT_TEXT "log_time($ISSUE_ID,$TIME_REPORT_HOURS hours)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"log_time\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$ISSUE_ID\",\"value\":$TIME_REPORT_HOURS}},\"id\":2}"
  if [ $? -eq 0 ]; then
    TIME_REPORT_ID=$(echo "$TIME_REPORT_TEXT" | jq -r '.reportId' 2>/dev/null)
    if TIME_TRIGGER_RESULT=$(pnpm exec tsx scripts/integration-time-report-trigger.ts \
      --project "$PROJECT" --issue "$ISSUE_ID" --report "$TIME_REPORT_ID" \
      --estimateHours "$TIME_ESTIMATE_HOURS" --reportHours "$TIME_REPORT_HOURS"); then
      echo "PASS: log_time create/delete uses one native aggregate change and authenticated employee"
      PASSED=$((PASSED + 1))
      echo "  => $TIME_TRIGGER_RESULT"
    else
      fail_test "log_time native aggregate lifecycle" "trigger verification helper failed"
    fi
  fi
  run_capture_to_var TIME_REPORT_AFTER_DELETE_TEXT "get_time_report($ISSUE_ID after report deletion)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_time_report\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$ISSUE_ID\"}},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_field_equals "get_time_report reports zero hours after deletion" "$TIME_REPORT_AFTER_DELETE_TEXT" ".totalTime" "0"
    assert_json_field_equals "get_time_report restores estimated remaining hours" "$TIME_REPORT_AFTER_DELETE_TEXT" ".remainingTime" "$TIME_ESTIMATE_HOURS"
    assert_json_field_count "get_time_report removes deleted entry" "$TIME_REPORT_AFTER_DELETE_TEXT" ".reports | length" "0"
  fi
  run_test "get_detailed_time_report($ISSUE_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_detailed_time_report\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$ISSUE_ID\"}},\"id\":2}"

  # Preview deletion
  run_test "preview_deletion($ISSUE_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"preview_deletion\",\"arguments\":{\"entityType\":\"issue\",\"project\":\"$PROJECT\",\"identifier\":\"$ISSUE_ID\"}},\"id\":2}"

  run_test "delete_issue($ISSUE_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$ISSUE_ID\"}},\"id\":2}"
fi
echo ""

##############################
# 3. COMPONENTS CRUD + set_issue_component
##############################
echo "=== 3. Components CRUD ==="
run_capture_to_var COMP_TEXT "create_component" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_component\",\"arguments\":{\"project\":\"$PROJECT\",\"label\":\"IntTest Comp\"}},\"id\":2}"
if [ $? -eq 0 ]; then
  COMP_ID=$(echo "$COMP_TEXT" | jq -r '.id' 2>/dev/null)
  echo "  => $COMP_ID"
  run_test "list_components" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_components\",\"arguments\":{\"project\":\"$PROJECT\"}},\"id\":2}"
  run_test "get_component($COMP_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_component\",\"arguments\":{\"project\":\"$PROJECT\",\"component\":\"$COMP_ID\"}},\"id\":2}"
  run_test "update_component($COMP_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_component\",\"arguments\":{\"project\":\"$PROJECT\",\"component\":\"$COMP_ID\",\"label\":\"Updated Comp\"}},\"id\":2}"

  # set_issue_component
  run_capture_to_var SET_COMP_TEXT "create_issue(for_component)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"title\":\"Comp Test Issue\"}},\"id\":2}"
  if [ $? -eq 0 ]; then
    SET_COMP_ISSUE=$(echo "$SET_COMP_TEXT" | jq -r '.identifier' 2>/dev/null)
    run_test "set_issue_component($SET_COMP_ISSUE)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"set_issue_component\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$SET_COMP_ISSUE\",\"component\":\"Updated Comp\"}},\"id\":2}"
    run_test "delete_issue(comp_test:$SET_COMP_ISSUE)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$SET_COMP_ISSUE\"}},\"id\":2}"
  fi

  run_test "delete_component($COMP_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_component\",\"arguments\":{\"project\":\"$PROJECT\",\"component\":\"$COMP_ID\"}},\"id\":2}"
fi
echo ""

##############################
# 4. MILESTONES CRUD + set_issue_milestone
##############################
echo "=== 4. Milestones CRUD ==="
run_capture_to_var MS_TEXT "create_milestone" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_milestone\",\"arguments\":{\"project\":\"$PROJECT\",\"label\":\"IntTest MS\",\"targetDate\":1777000000000}},\"id\":2}"
if [ $? -eq 0 ]; then
  MS_ID=$(echo "$MS_TEXT" | jq -r '.id' 2>/dev/null)
  echo "  => $MS_ID"
  run_test "list_milestones" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_milestones\",\"arguments\":{\"project\":\"$PROJECT\"}},\"id\":2}"
  run_test "get_milestone($MS_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_milestone\",\"arguments\":{\"project\":\"$PROJECT\",\"milestone\":\"$MS_ID\"}},\"id\":2}"
  run_test "update_milestone($MS_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_milestone\",\"arguments\":{\"project\":\"$PROJECT\",\"milestone\":\"$MS_ID\",\"label\":\"Updated MS\"}},\"id\":2}"

  # set_issue_milestone
  run_capture_to_var SET_MS_TEXT "create_issue(for_milestone)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"title\":\"MS Test Issue $RUN_ID\"}},\"id\":2}"
  if [ $? -eq 0 ]; then
    SET_MS_ISSUE=$(echo "$SET_MS_TEXT" | jq -r '.identifier' 2>/dev/null)
    SET_MS_TITLE_JSON=$(json_string "MS Test Issue $RUN_ID")
    run_test "set_issue_milestone($SET_MS_ISSUE)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"set_issue_milestone\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$SET_MS_ISSUE\",\"milestone\":\"Updated MS\"}},\"id\":2}"

    wait_for_json_array_contains_to_var SET_MS_GET_TEXT "get_issue projects assigned milestone ID" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$SET_MS_ISSUE\"}},\"id\":2}" \
      "[.milestone.id]" "$MS_ID"
    assert_json_field_equals "get_issue projects assigned milestone label" "$SET_MS_GET_TEXT" \
      ".milestone.label" "Updated MS"

    wait_for_json_array_contains_to_var SET_MS_LIST_ID_TEXT "list_issues filters by milestone ID" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_issues\",\"arguments\":{\"project\":\"$PROJECT\",\"milestone\":\"$MS_ID\",\"limit\":1}},\"id\":2}" \
      "map(.identifier)" "$SET_MS_ISSUE"
    assert_json_field_equals "list_issues projects assigned milestone label" "$SET_MS_LIST_ID_TEXT" \
      "map(select(.identifier == \"$SET_MS_ISSUE\")) | first | .milestone.label" "Updated MS"
    assert_json_field_equals "list_issues projects assigned milestone ID" "$SET_MS_LIST_ID_TEXT" \
      "map(select(.identifier == \"$SET_MS_ISSUE\")) | first | .milestone.id" "$MS_ID"

    wait_for_json_array_contains_to_var SET_MS_LIST_LABEL_TEXT "list_issues composes milestone label and title filters" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_issues\",\"arguments\":{\"project\":\"$PROJECT\",\"milestone\":\" updated ms \",\"titleSearch\":$SET_MS_TITLE_JSON,\"limit\":1}},\"id\":2}" \
      "map(.identifier)" "$SET_MS_ISSUE"
    wait_for_json_array_contains_to_var SET_MS_HAS_TRUE_TEXT "list_issues(hasMilestone:true) includes assigned issue" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_issues\",\"arguments\":{\"project\":\"$PROJECT\",\"hasMilestone\":true,\"titleSearch\":$SET_MS_TITLE_JSON,\"limit\":1}},\"id\":2}" \
      "map(.identifier)" "$SET_MS_ISSUE"

    run_test "set_issue_milestone(clear:$SET_MS_ISSUE)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"set_issue_milestone\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$SET_MS_ISSUE\",\"milestone\":null}},\"id\":2}"
    wait_for_json_array_contains_to_var SET_MS_HAS_FALSE_TEXT "list_issues(hasMilestone:false) includes cleared issue" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_issues\",\"arguments\":{\"project\":\"$PROJECT\",\"hasMilestone\":false,\"titleSearch\":$SET_MS_TITLE_JSON,\"limit\":1}},\"id\":2}" \
      "map(.identifier)" "$SET_MS_ISSUE"
    run_test "delete_issue(ms_test:$SET_MS_ISSUE)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$SET_MS_ISSUE\"}},\"id\":2}"
  fi

  run_test "delete_milestone($MS_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_milestone\",\"arguments\":{\"project\":\"$PROJECT\",\"milestone\":\"$MS_ID\"}},\"id\":2}"
fi
echo ""

##############################
# 5. ISSUE TEMPLATES CRUD + CHILDREN
##############################
echo "=== 5. Issue Templates CRUD ==="
run_capture_to_var TMPL_TEXT "create_issue_template" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue_template\",\"arguments\":{\"project\":\"$PROJECT\",\"title\":\"IntTest Tmpl\",\"priority\":\"high\"}},\"id\":2}"
if [ $? -eq 0 ]; then
  TMPL_ID=$(echo "$TMPL_TEXT" | jq -r '.id' 2>/dev/null)
  echo "  => $TMPL_ID"
  run_test "list_issue_templates" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_issue_templates\",\"arguments\":{\"project\":\"$PROJECT\"}},\"id\":2}"
  run_test "get_issue_template($TMPL_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_issue_template\",\"arguments\":{\"project\":\"$PROJECT\",\"template\":\"$TMPL_ID\"}},\"id\":2}"
  run_test "update_issue_template($TMPL_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_issue_template\",\"arguments\":{\"project\":\"$PROJECT\",\"template\":\"$TMPL_ID\",\"title\":\"Updated Tmpl\"}},\"id\":2}"

  # Template children
  CHILD_ID=""
  run_capture_to_var CHILD_TEXT "add_template_child($TMPL_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_template_child\",\"arguments\":{\"project\":\"$PROJECT\",\"template\":\"$TMPL_ID\",\"title\":\"Child Task\"}},\"id\":2}"
  if [ $? -eq 0 ]; then
    CHILD_ID=$(echo "$CHILD_TEXT" | jq -r '.id' 2>/dev/null)
    echo "  => child: $CHILD_ID"
  fi

  # Create immediately after modifying the template to exercise eventual consistency.
  run_capture_to_var TMPL_ISSUE_TEXT "create_issue_from_template" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue_from_template\",\"arguments\":{\"project\":\"$PROJECT\",\"template\":\"$TMPL_ID\",\"title\":\"From Template\"}},\"id\":2}"
  if [ $? -eq 0 ]; then
    TMPL_ISSUE_ID=$(echo "$TMPL_ISSUE_TEXT" | jq -r '.identifier' 2>/dev/null)
    if [ -n "$CHILD_ID" ]; then
      wait_for_json_array_contains_to_var TMPL_CHILD_ISSUES_TEXT \
        "list_issues(parentIssue) includes template-created child" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_issues\",\"arguments\":{\"project\":\"$PROJECT\",\"parentIssue\":\"$TMPL_ISSUE_ID\",\"limit\":10}},\"id\":2}" \
        "map(.title)" "Child Task"
      TMPL_CHILD_ISSUE_ID=$(echo "$TMPL_CHILD_ISSUES_TEXT" | jq -r '.[] | select(.title == "Child Task") | .identifier' 2>/dev/null | head -1)
      if [ -n "$TMPL_CHILD_ISSUE_ID" ]; then
        if TMPL_PARENT_STATE=$(pnpm exec tsx scripts/integration-issue-parent-semantics.ts \
          --project "$PROJECT" --issue "$TMPL_CHILD_ISSUE_ID" --mode child --parent "$TMPL_ISSUE_ID" \
          --expectedIssueChildren 0 --expectedParentChildren 1); then
          echo "PASS: create_issue_from_template attaches child and increments parent count once"
          PASSED=$((PASSED + 1))
          echo "  => $TMPL_PARENT_STATE"
        else
          fail_test "create_issue_from_template child parent/count" "parent semantics helper failed"
        fi
        run_test "delete_issue(template_child:$TMPL_CHILD_ISSUE_ID)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$TMPL_CHILD_ISSUE_ID\"}},\"id\":2}"
      else
        fail_test "resolve template-created child identifier" "list_issues did not return the child identifier"
      fi
    fi
    run_test "delete_issue(from_tmpl:$TMPL_ISSUE_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$TMPL_ISSUE_ID\"}},\"id\":2}"
  fi

  if [ -n "$CHILD_ID" ]; then
    run_test "remove_template_child($CHILD_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"remove_template_child\",\"arguments\":{\"project\":\"$PROJECT\",\"template\":\"$TMPL_ID\",\"childId\":\"$CHILD_ID\"}},\"id\":2}"
  fi

  run_test "delete_issue_template($TMPL_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_issue_template\",\"arguments\":{\"project\":\"$PROJECT\",\"template\":\"$TMPL_ID\"}},\"id\":2}"
fi
echo ""

##############################
# 5a. MESSAGE TEMPLATE DISCOVERY (READ-ONLY)
##############################
echo "=== 5a. Message Template Discovery ==="
run_capture_to_var MSG_TEMPLATE_CATEGORIES_TEXT "list_message_template_categories" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_message_template_categories","arguments":{"limit":50}},"id":2}'
if [ $? -eq 0 ]; then
  assert_json_field_equals "list_message_template_categories returns array" "$MSG_TEMPLATE_CATEGORIES_TEXT" "type" "array"
fi

run_capture_to_var MSG_TEMPLATES_TEXT "list_message_templates" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_message_templates","arguments":{"limit":50}},"id":2}'
if [ $? -eq 0 ]; then
  assert_json_field_equals "list_message_templates returns array" "$MSG_TEMPLATES_TEXT" "type" "array"
  MSG_TEMPLATE_ID=$(echo "$MSG_TEMPLATES_TEXT" | jq -r '.[0].id // empty' 2>/dev/null)
  if [ -n "$MSG_TEMPLATE_ID" ]; then
    MSG_TEMPLATE_ID_JSON=$(json_string "$MSG_TEMPLATE_ID")
    run_capture_to_var MSG_TEMPLATE_GET_TEXT "get_message_template($MSG_TEMPLATE_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_message_template\",\"arguments\":{\"template\":$MSG_TEMPLATE_ID_JSON}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_equals "get_message_template returns id" "$MSG_TEMPLATE_GET_TEXT" ".id" "$MSG_TEMPLATE_ID"
      assert_json_field_equals "get_message_template returns markdown string" "$MSG_TEMPLATE_GET_TEXT" ".message | type" "string"
      assert_json_field_equals "get_message_template returns placeholderFieldIds array" "$MSG_TEMPLATE_GET_TEXT" ".placeholderFieldIds | type" "array"

      MSG_TEMPLATE_FIRST_FIELD=$(echo "$MSG_TEMPLATE_GET_TEXT" | jq -r '.placeholderFieldIds[0] // empty' 2>/dev/null)
      MSG_TEMPLATE_RENDER_ARGUMENTS="{\"template\":$MSG_TEMPLATE_ID_JSON}"
      if [ -n "$MSG_TEMPLATE_FIRST_FIELD" ]; then
        MSG_TEMPLATE_FIRST_FIELD_JSON=$(json_string "$MSG_TEMPLATE_FIRST_FIELD")
        MSG_TEMPLATE_RENDER_ARGUMENTS="{\"template\":$MSG_TEMPLATE_ID_JSON,\"values\":[{\"field\":$MSG_TEMPLATE_FIRST_FIELD_JSON,\"value\":\"Integration Value\"}]}"
      fi

      run_capture_to_var MSG_TEMPLATE_RENDER_TEXT "render_message_template($MSG_TEMPLATE_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"render_message_template\",\"arguments\":$MSG_TEMPLATE_RENDER_ARGUMENTS},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_field_equals "render_message_template returns id" "$MSG_TEMPLATE_RENDER_TEXT" ".id" "$MSG_TEMPLATE_ID"
        assert_json_field_equals "render_message_template returns rendered markdown string" "$MSG_TEMPLATE_RENDER_TEXT" ".renderedMessage | type" "string"
        assert_json_field_equals "render_message_template returns unresolved field IDs array" "$MSG_TEMPLATE_RENDER_TEXT" ".unresolvedFieldIds | type" "array"
        assert_json_field_equals "render_message_template returns unused value fields array" "$MSG_TEMPLATE_RENDER_TEXT" ".unusedValueFields | type" "array"
        if [ -n "$MSG_TEMPLATE_FIRST_FIELD" ]; then
          assert_json_field_equals "render_message_template reports used field" "$MSG_TEMPLATE_RENDER_TEXT" ".usedFields[0].field" "$MSG_TEMPLATE_FIRST_FIELD"
          assert_json_field_contains "render_message_template substitutes provided value" "$MSG_TEMPLATE_RENDER_TEXT" ".renderedMessage" "Integration Value"
        fi
      fi
    fi
  else
    echo "INFO: get_message_template/render_message_template not exercised (no live message templates in workspace)"
  fi
fi

run_capture_to_var MSG_TEMPLATE_FIELDS_TEXT "list_message_template_fields" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_message_template_fields","arguments":{"limit":50}},"id":2}'
if [ $? -eq 0 ]; then
  assert_json_field_equals "list_message_template_fields returns array" "$MSG_TEMPLATE_FIELDS_TEXT" "type" "array"
fi
echo ""

##############################
# 6. LABELS & TAG CATEGORIES
##############################
echo "=== 6. Labels & Tag Categories ==="
run_capture_to_var TC_TEXT "create_tag_category" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_tag_category\",\"arguments\":{\"label\":\"IntTest Category\"}},\"id\":2}"
if [ $? -eq 0 ]; then
  TC_ID=$(echo "$TC_TEXT" | jq -r '.id' 2>/dev/null)
  echo "  => tag_cat: $TC_ID"
  run_test "list_tag_categories" \
    '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_tag_categories","arguments":{}},"id":2}'
  run_test "update_tag_category($TC_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_tag_category\",\"arguments\":{\"category\":\"$TC_ID\",\"label\":\"Updated Cat\"}},\"id\":2}"
  run_test "delete_tag_category($TC_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_tag_category\",\"arguments\":{\"category\":\"$TC_ID\"}},\"id\":2}"
fi

run_capture_to_var LBL_TEXT "create_label" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"create_label","arguments":{"title":"inttest-label","color":1}},"id":2}'
if [ $? -eq 0 ]; then
  LBL_ID=$(echo "$LBL_TEXT" | jq -r '.id' 2>/dev/null)
  echo "  => label: $LBL_ID"
  run_test "list_labels" \
    '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_labels","arguments":{}},"id":2}'
  run_test "update_label($LBL_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_label\",\"arguments\":{\"label\":\"$LBL_ID\",\"title\":\"updated-label\"}},\"id\":2}"
  run_test "delete_label($LBL_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_label\",\"arguments\":{\"label\":\"$LBL_ID\"}},\"id\":2}"
fi

GENERIC_TAG_TITLE="inttest-generic-tag-$RUN_ID"
GENERIC_TAG_UPDATED_TITLE="updated-generic-tag-$RUN_ID"
GENERIC_TAG_TITLE_JSON=$(json_string "$GENERIC_TAG_TITLE")
GENERIC_TAG_UPDATED_TITLE_JSON=$(json_string "$GENERIC_TAG_UPDATED_TITLE")
run_capture_to_var GENERIC_TAG_TEXT "create_tag(generic)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_tag\",\"arguments\":{\"targetClass\":\"core:class:Space\",\"title\":$GENERIC_TAG_TITLE_JSON,\"color\":3}},\"id\":2}"
if [ $? -eq 0 ]; then
  GENERIC_TAG_ID=$(echo "$GENERIC_TAG_TEXT" | jq -r '.id' 2>/dev/null)
  echo "  => generic_tag: $GENERIC_TAG_ID"
  assert_json_field_nonempty "create_tag(generic) returns id" "$GENERIC_TAG_TEXT" '.id'
  run_test "list_tags(generic)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_tags\",\"arguments\":{\"targetClass\":\"core:class:Space\",\"titleSearch\":$GENERIC_TAG_TITLE_JSON}},\"id\":2}"
  run_test "update_tag($GENERIC_TAG_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_tag\",\"arguments\":{\"targetClass\":\"core:class:Space\",\"tag\":\"$GENERIC_TAG_ID\",\"title\":$GENERIC_TAG_UPDATED_TITLE_JSON,\"color\":4,\"description\":\"Generic tag integration test\"}},\"id\":2}"
  run_capture_to_var ATTACH_TAG_TEXT "attach_tag($GENERIC_TAG_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"attach_tag\",\"arguments\":{\"targetClass\":\"core:class:Space\",\"tag\":\"$GENERIC_TAG_ID\",\"object\":{\"objectId\":\"core:space:Workspace\",\"objectClass\":\"core:class:Space\",\"space\":\"core:space:Workspace\",\"collection\":\"tags\"},\"weight\":3}},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_field_equals "attach_tag($GENERIC_TAG_ID) attached" "$ATTACH_TAG_TEXT" '.attached' 'true'
    run_test "list_attached_tags($GENERIC_TAG_ID)" \
      '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_attached_tags","arguments":{"objectId":"core:space:Workspace","objectClass":"core:class:Space","space":"core:space:Workspace","collection":"tags"}},"id":2}'
    run_capture_to_var DETACH_TAG_TEXT "detach_tag($GENERIC_TAG_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"detach_tag\",\"arguments\":{\"targetClass\":\"core:class:Space\",\"tag\":\"$GENERIC_TAG_ID\",\"object\":{\"objectId\":\"core:space:Workspace\",\"objectClass\":\"core:class:Space\",\"space\":\"core:space:Workspace\",\"collection\":\"tags\"}}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_equals "detach_tag($GENERIC_TAG_ID) detached" "$DETACH_TAG_TEXT" '.detached' 'true'
    fi
  fi
  run_test "delete_tag($GENERIC_TAG_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_tag\",\"arguments\":{\"targetClass\":\"core:class:Space\",\"tag\":\"$GENERIC_TAG_ID\"}},\"id\":2}"
fi
echo ""

##############################
# 7. DOCUMENTS
##############################
echo "=== 7. Documents ==="
run_test "list_teamspaces" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_teamspaces","arguments":{}},"id":2}'
TS_TEXT=$(run_capture_only \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_teamspaces","arguments":{}},"id":2}')
TS_NAME=$(echo "$TS_TEXT" | jq -r '.teamspaces[0].name // empty' 2>/dev/null)
if [ -n "$TS_NAME" ]; then
  run_test "list_documents($TS_NAME)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_documents\",\"arguments\":{\"teamspace\":\"$TS_NAME\"}},\"id\":2}"

  DOC_CONTENT=$'# Integration Markdown\n\nThis has **bold**, *italic*, and [Huly](https://huly.io).\n\n- First item\n- Second item'
  DOC_CONTENT_JSON=$(json_string "$DOC_CONTENT")
  DOC_TITLE="IntTest Doc $RUN_ID"
  DOC_TITLE_JSON=$(json_string "$DOC_TITLE")
  DOC_TITLE_REGEX_JSON=$(json_string "%$DOC_TITLE%")
  DOC_TITLE_CASE_REGEX_JSON=$(json_string "%inttest doc $RUN_ID%")
  DOC_EDITED_CONTENT=$'# Edited Integration Markdown\n\nThe full replacement path repaired this document.\n\n- Repaired item'
  DOC_EDITED_CONTENT_JSON=$(json_string "$DOC_EDITED_CONTENT")
  DOC_REPAIR_CONTENT=$'# Repaired After Corruption\n\nFull replacement restored readable content.'
  DOC_REPAIR_CONTENT_JSON=$(json_string "$DOC_REPAIR_CONTENT")
  DOC_CORRUPT_CONTENT='raw-markdown-that-is-not-a-blob-ref'

  run_capture_to_var DOC_TEXT "create_document" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"title\":$DOC_TITLE_JSON,\"content\":$DOC_CONTENT_JSON}},\"id\":2}"
  if [ $? -eq 0 ]; then
    DOC_ID=$(echo "$DOC_TEXT" | jq -r '.id' 2>/dev/null)
    echo "  => doc: $DOC_ID"
    assert_json_field_nonempty "create_document($DOC_ID) returns url" "$DOC_TEXT" '.url'

    run_capture_to_var GET_DOC_TEXT "get_document($DOC_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"document\":\"$DOC_ID\"}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_nonempty "get_document($DOC_ID) returns url" "$GET_DOC_TEXT" '.url'
      assert_json_field_contains "get_document($DOC_ID) round-trips heading" "$GET_DOC_TEXT" '.content' "# Integration Markdown"
      assert_json_field_contains "get_document($DOC_ID) round-trips bold" "$GET_DOC_TEXT" '.content' "**bold**"
      assert_json_field_contains "get_document($DOC_ID) round-trips italic" "$GET_DOC_TEXT" '.content' "*italic*"
      assert_json_field_contains "get_document($DOC_ID) round-trips link" "$GET_DOC_TEXT" '.content' "[Huly](https://huly.io)"
      assert_json_field_contains "get_document($DOC_ID) round-trips list" "$GET_DOC_TEXT" '.content' "- First item"
    fi

    run_capture_to_var LIST_DOCS_REGEX_TEXT "list_documents($TS_NAME,titleRegex SIMILAR TO contains)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_documents\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"titleRegex\":$DOC_TITLE_REGEX_JSON,\"limit\":10}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_array_contains "list_documents titleRegex SIMILAR TO contains includes document" "$LIST_DOCS_REGEX_TEXT" ".documents | map(.id)" "$DOC_ID"
    fi

    run_capture_to_var LIST_DOCS_REGEX_CASE_TEXT "list_documents($TS_NAME,titleRegex case-sensitive miss)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_documents\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"titleRegex\":$DOC_TITLE_CASE_REGEX_JSON,\"limit\":10}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_array_not_contains "list_documents titleRegex is case-sensitive" "$LIST_DOCS_REGEX_CASE_TEXT" ".documents | map(.id)" "$DOC_ID"
    fi

    run_capture_to_var EDIT_DOC_TEXT "edit_document($DOC_ID) title rename" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"edit_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"document\":\"$DOC_ID\",\"title\":\"Updated Doc\"}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_nonempty "edit_document($DOC_ID) returns url" "$EDIT_DOC_TEXT" '.url'
    fi

    run_test "edit_document($DOC_ID) full replace" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"edit_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"document\":\"$DOC_ID\",\"content\":$DOC_EDITED_CONTENT_JSON}},\"id\":2}"
    run_capture_to_var GET_EDITED_DOC_TEXT "get_document($DOC_ID) after full replace" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"document\":\"$DOC_ID\"}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_contains "get_document($DOC_ID) returns full replacement" "$GET_EDITED_DOC_TEXT" '.content' "# Edited Integration Markdown"
      assert_json_field_contains "get_document($DOC_ID) replacement list" "$GET_EDITED_DOC_TEXT" '.content' "- Repaired item"
    fi

    CORRUPT_DOC_ID=""
    run_capture_to_var CORRUPT_DOC_TEXT "create_document(raw corruption fixture)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"title\":\"IntTest Raw Corruption Fixture\"}},\"id\":2}"
    if [ $? -eq 0 ]; then
      CORRUPT_DOC_ID=$(echo "$CORRUPT_DOC_TEXT" | jq -r '.id' 2>/dev/null)
      echo "  => corrupt_doc: $CORRUPT_DOC_ID"
    fi

    if [ -n "${CORRUPT_DOC_ID:-}" ] && pnpm exec tsx scripts/corrupt-document-content.ts --document "$CORRUPT_DOC_ID" --content "$DOC_CORRUPT_CONTENT" >/dev/null; then
      sleep 2
      run_expect_error_contains "get_document($CORRUPT_DOC_ID) corrupted content error" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"document\":\"$CORRUPT_DOC_ID\"}},\"id\":2}" \
        "Document content is unreadable or corrupted. Use edit_document with the full content field to replace and repair it."
      run_test "edit_document($CORRUPT_DOC_ID) repairs corrupted content" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"edit_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"document\":\"$CORRUPT_DOC_ID\",\"content\":$DOC_REPAIR_CONTENT_JSON}},\"id\":2}"
      run_capture_to_var GET_REPAIRED_DOC_TEXT "get_document($CORRUPT_DOC_ID) after repair" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"document\":\"$CORRUPT_DOC_ID\"}},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_field_contains "get_document($CORRUPT_DOC_ID) repaired content" "$GET_REPAIRED_DOC_TEXT" '.content' "# Repaired After Corruption"
      fi
      run_test "delete_document($CORRUPT_DOC_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"document\":\"$CORRUPT_DOC_ID\"}},\"id\":2}"
    else
      fail_test "corrupt_document_content(${CORRUPT_DOC_ID:-missing})" "SDK helper failed"
      if [ -n "${CORRUPT_DOC_ID:-}" ]; then
        run_test "delete_document($CORRUPT_DOC_ID)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"document\":\"$CORRUPT_DOC_ID\"}},\"id\":2}"
      fi
    fi

    LIST_DOCS_TEXT=$(run_capture_only \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_documents\",\"arguments\":{\"teamspace\":\"$TS_NAME\"}},\"id\":2}")
    if [ -n "$LIST_DOCS_TEXT" ]; then
      LIST_DOC_URL=$(printf '%s\n' "$LIST_DOCS_TEXT" | jq -r --arg doc_id "$DOC_ID" '.documents[] | select(.id == $doc_id) | .url // empty' 2>/dev/null | head -n 1)
      if [ -n "$LIST_DOC_URL" ]; then
        echo "PASS: list_documents($TS_NAME) returns url for $DOC_ID"
        PASSED=$((PASSED + 1))
      else
        echo "FAIL: list_documents($TS_NAME) returns url for $DOC_ID"
        FAILED=$((FAILED + 1))
        ERRORS="${ERRORS}\n  - list_documents(${TS_NAME}) missing url for ${DOC_ID}"
      fi
    fi

    DOCUMENT_LABEL_TITLE="inttest-document-label-$RUN_ID"
    DOCUMENT_LABEL_TITLE_JSON=$(json_string "$DOCUMENT_LABEL_TITLE")
    run_capture_to_var ADD_DOCUMENT_LABEL_TEXT "add_document_label($DOC_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_document_label\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"document\":\"$DOC_ID\",\"label\":$DOCUMENT_LABEL_TITLE_JSON,\"color\":5}},\"id\":2}"
    if [ $? -eq 0 ]; then
      DOCUMENT_LABEL_ID=$(echo "$ADD_DOCUMENT_LABEL_TEXT" | jq -r '.label // empty' 2>/dev/null)
      assert_json_field_equals "add_document_label($DOC_ID) attached" "$ADD_DOCUMENT_LABEL_TEXT" '.attached' 'true'
      assert_json_field_equals "add_document_label($DOC_ID) created definition" "$ADD_DOCUMENT_LABEL_TEXT" '.labelCreated' 'true'
      sleep 2
      run_capture_to_var READD_DOCUMENT_LABEL_TEXT "add_document_label($DOC_ID idempotent)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_document_label\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"document\":\"$DOC_ID\",\"label\":$DOCUMENT_LABEL_TITLE_JSON}},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_field_equals "add_document_label($DOC_ID) is idempotent" "$READD_DOCUMENT_LABEL_TEXT" '.attached' 'false'
      fi
      run_capture_to_var DOCUMENT_LABELS_TEXT "list_document_labels($DOC_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_document_labels\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"document\":\"$DOC_ID\"}},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_array_contains "list_document_labels($DOC_ID) includes label" "$DOCUMENT_LABELS_TEXT" '.labels | map(.title)' "$DOCUMENT_LABEL_TITLE"
      fi
      run_test "list_document_label_definitions($DOCUMENT_LABEL_TITLE)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_document_label_definitions\",\"arguments\":{\"titleSearch\":$DOCUMENT_LABEL_TITLE_JSON}},\"id\":2}"
      run_capture_to_var REMOVE_DOCUMENT_LABEL_TEXT "remove_document_label($DOC_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"remove_document_label\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"document\":\"$DOC_ID\",\"label\":$DOCUMENT_LABEL_TITLE_JSON}},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_field_equals "remove_document_label($DOC_ID) detached" "$REMOVE_DOCUMENT_LABEL_TEXT" '.detached' 'true'
      fi
      if [ -n "$DOCUMENT_LABEL_ID" ]; then
        run_test "delete_tag(document:$DOCUMENT_LABEL_ID cleanup)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_tag\",\"arguments\":{\"targetClass\":\"document:class:Document\",\"tag\":\"$DOCUMENT_LABEL_ID\"}},\"id\":2}"
      fi
    fi

    run_test "list_inline_comments($DOC_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_inline_comments\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"document\":\"$DOC_ID\"}},\"id\":2}"
    run_test "delete_document($DOC_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"document\":\"$DOC_ID\"}},\"id\":2}"
  fi

  NATIVE_REF_ISSUE_ID=""
  NATIVE_REF_ISSUE_OBJ_ID=""
  NATIVE_URL_DOC_ID=""
  NATIVE_REF_DOC_ID=""
  NATIVE_REF_WORKSPACE_UUID=""
  if run_capture_to_var NATIVE_REF_WORKSPACE_TEXT "get_workspace_info(native_reference)" \
    '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_workspace_info","arguments":{}},"id":2}'; then
    NATIVE_REF_WORKSPACE_UUID=$(echo "$NATIVE_REF_WORKSPACE_TEXT" | jq -r '.uuid // empty' 2>/dev/null)
  fi
  if run_capture_to_var NATIVE_REF_ISSUE_TEXT "create_issue(for_native_document_reference)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"title\":\"Native Document Reference Fixture\",\"description\":\"Integration test native document reference\"}},\"id\":2}"; then
    NATIVE_REF_ISSUE_ID=$(echo "$NATIVE_REF_ISSUE_TEXT" | jq -r '.identifier' 2>/dev/null)
    NATIVE_REF_ISSUE_OBJ_ID=$(echo "$NATIVE_REF_ISSUE_TEXT" | jq -r '.issueId' 2>/dev/null)
    echo "  => native_ref_issue: $NATIVE_REF_ISSUE_ID ($NATIVE_REF_ISSUE_OBJ_ID)"

    EXTERNAL_URL="https://example.com/plain"
    NATIVE_REF_LABEL_ENCODED=$(url_encode "$NATIVE_REF_ISSUE_ID")
    NATIVE_REF_URL="${HULY_URL%/}/browse?workspace=${NATIVE_REF_WORKSPACE_UUID}&_class=tracker%3Aclass%3AIssue&_id=${NATIVE_REF_ISSUE_OBJ_ID}&label=${NATIVE_REF_LABEL_ENCODED}"
    NATIVE_REF_CONTENT="Native issue: [${NATIVE_REF_ISSUE_ID}](${NATIVE_REF_URL}). External link stays [plain](${EXTERNAL_URL})."
    NATIVE_REF_CONTENT_JSON=$(json_string "$NATIVE_REF_CONTENT")
    if run_capture_to_var NATIVE_REF_DOC_TEXT "create_document(native_reference)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"title\":\"IntTest Native Reference Doc\",\"content\":$NATIVE_REF_CONTENT_JSON}},\"id\":2}"; then
      NATIVE_REF_DOC_ID=$(echo "$NATIVE_REF_DOC_TEXT" | jq -r '.id' 2>/dev/null)
      echo "  => native_ref_doc: $NATIVE_REF_DOC_ID"

      if run_capture_to_var GET_NATIVE_REF_DOC_TEXT "get_document($NATIVE_REF_DOC_ID native_reference)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"document\":\"$NATIVE_REF_DOC_ID\"}},\"id\":2}"; then
        assert_json_field_contains "get_document($NATIVE_REF_DOC_ID) serializes native reference as link" "$GET_NATIVE_REF_DOC_TEXT" '.content' "$NATIVE_REF_ISSUE_ID"
        assert_json_field_contains "get_document($NATIVE_REF_DOC_ID) serializes native reference url" "$GET_NATIVE_REF_DOC_TEXT" '.content' "$NATIVE_REF_ISSUE_OBJ_ID"
        assert_json_field_contains "get_document($NATIVE_REF_DOC_ID) keeps external link" "$GET_NATIVE_REF_DOC_TEXT" '.content' "$EXTERNAL_URL"

        NATIVE_URL_CONTENT="Auto native issue: [${NATIVE_REF_ISSUE_ID}](${NATIVE_REF_URL})."
        NATIVE_URL_CONTENT_JSON=$(json_string "$NATIVE_URL_CONTENT")
        if run_capture_to_var NATIVE_URL_DOC_TEXT "create_document(native_reference_from_url)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"title\":\"IntTest Native Reference URL\",\"content\":$NATIVE_URL_CONTENT_JSON}},\"id\":2}"; then
          NATIVE_URL_DOC_ID=$(echo "$NATIVE_URL_DOC_TEXT" | jq -r '.id' 2>/dev/null)
          echo "  => native_ref_url_doc: $NATIVE_URL_DOC_ID"

          if run_capture_to_var GET_NATIVE_URL_DOC_TEXT "get_document($NATIVE_URL_DOC_ID native_reference_from_url)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"document\":\"$NATIVE_URL_DOC_ID\"}},\"id\":2}"; then
            assert_json_field_contains "get_document($NATIVE_URL_DOC_ID) serializes auto native reference label" "$GET_NATIVE_URL_DOC_TEXT" '.content' "$NATIVE_REF_ISSUE_ID"
            assert_json_field_contains "get_document($NATIVE_URL_DOC_ID) serializes auto native reference url" "$GET_NATIVE_URL_DOC_TEXT" '.content' "$NATIVE_REF_ISSUE_OBJ_ID"
          fi

          run_test "delete_document($NATIVE_URL_DOC_ID native_reference_from_url)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"document\":\"$NATIVE_URL_DOC_ID\"}},\"id\":2}"
        fi
      fi

      NATIVE_REF_EDITED_CONTENT="Edited native issue: [${NATIVE_REF_ISSUE_ID}](${NATIVE_REF_URL})."
      NATIVE_REF_EDITED_CONTENT_JSON=$(json_string "$NATIVE_REF_EDITED_CONTENT")
      run_test "edit_document($NATIVE_REF_DOC_ID native_reference full replace)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"edit_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"document\":\"$NATIVE_REF_DOC_ID\",\"content\":$NATIVE_REF_EDITED_CONTENT_JSON}},\"id\":2}"
      if run_capture_to_var GET_EDITED_NATIVE_REF_DOC_TEXT "get_document($NATIVE_REF_DOC_ID edited native_reference)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"document\":\"$NATIVE_REF_DOC_ID\"}},\"id\":2}"; then
        assert_json_field_contains "get_document($NATIVE_REF_DOC_ID edited) content" "$GET_EDITED_NATIVE_REF_DOC_TEXT" '.content' "Edited native issue"
        assert_json_field_contains "get_document($NATIVE_REF_DOC_ID edited) serializes native reference url" "$GET_EDITED_NATIVE_REF_DOC_TEXT" '.content' "$NATIVE_REF_ISSUE_OBJ_ID"
      fi

      run_test "delete_document($NATIVE_REF_DOC_ID native_reference)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"document\":\"$NATIVE_REF_DOC_ID\"}},\"id\":2}"
    fi

    run_test "delete_issue(native_reference:$NATIVE_REF_ISSUE_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$NATIVE_REF_ISSUE_ID\"}},\"id\":2}"
  fi

  NATIVE_MULTI_TARGET_DOC_ID=""
  NATIVE_MULTI_DOC_ID=""
  NATIVE_MULTI_PERSON_ID=""
  NATIVE_MULTI_PERSON_EMAIL="native-ref-${RUN_ID}@test.local"
  NATIVE_MULTI_TARGET_TITLE="IntTest Native Reference Target ${RUN_ID}"
  NATIVE_MULTI_TARGET_TITLE_JSON=$(json_string "$NATIVE_MULTI_TARGET_TITLE")
  NATIVE_MULTI_TARGET_CONTENT_JSON=$(json_string "Native reference target fixture.")
  if run_capture_to_var NATIVE_MULTI_TARGET_TEXT "create_document(native_reference_target)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"title\":$NATIVE_MULTI_TARGET_TITLE_JSON,\"content\":$NATIVE_MULTI_TARGET_CONTENT_JSON}},\"id\":2}"; then
    NATIVE_MULTI_TARGET_DOC_ID=$(echo "$NATIVE_MULTI_TARGET_TEXT" | jq -r '.id' 2>/dev/null)
    echo "  => native_ref_target_doc: $NATIVE_MULTI_TARGET_DOC_ID"

    if run_capture_to_var NATIVE_MULTI_PERSON_TEXT "create_person(native_reference_person)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_person\",\"arguments\":{\"firstName\":\"Reference\",\"lastName\":\"Person\",\"email\":\"$NATIVE_MULTI_PERSON_EMAIL\"}},\"id\":2}"; then
      NATIVE_MULTI_PERSON_ID=$(echo "$NATIVE_MULTI_PERSON_TEXT" | jq -r '.id' 2>/dev/null)
      echo "  => native_ref_person: $NATIVE_MULTI_PERSON_ID"

      # Give Huly's search indexes a moment to expose the newly created person/document to the next MCP process.
      sleep 1

      NATIVE_MULTI_PERSON_NAME="Reference Person"
      NATIVE_MULTI_TARGET_TITLE_ENCODED=$(url_encode "$NATIVE_MULTI_TARGET_TITLE")
      NATIVE_MULTI_PERSON_NAME_ENCODED=$(url_encode "$NATIVE_MULTI_PERSON_NAME")
      NATIVE_MULTI_DOC_URL="${HULY_URL%/}/browse?workspace=${NATIVE_REF_WORKSPACE_UUID}&_class=document%3Aclass%3ADocument&_id=${NATIVE_MULTI_TARGET_DOC_ID}&label=${NATIVE_MULTI_TARGET_TITLE_ENCODED}"
      NATIVE_MULTI_PERSON_URL="${HULY_URL%/}/browse?workspace=${NATIVE_REF_WORKSPACE_UUID}&_class=contact%3Aclass%3APerson&_id=${NATIVE_MULTI_PERSON_ID}&label=${NATIVE_MULTI_PERSON_NAME_ENCODED}"
      NATIVE_MULTI_CONTENT="Native refs: document [${NATIVE_MULTI_TARGET_TITLE}](${NATIVE_MULTI_DOC_URL}), person [${NATIVE_MULTI_PERSON_NAME}](${NATIVE_MULTI_PERSON_URL})."
      NATIVE_MULTI_CONTENT_JSON=$(json_string "$NATIVE_MULTI_CONTENT")
      if run_capture_to_var NATIVE_MULTI_DOC_TEXT "create_document(native_reference_document_person)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"title\":\"IntTest Native Reference Multi\",\"content\":$NATIVE_MULTI_CONTENT_JSON}},\"id\":2}"; then
        NATIVE_MULTI_DOC_ID=$(echo "$NATIVE_MULTI_DOC_TEXT" | jq -r '.id' 2>/dev/null)
        echo "  => native_ref_multi_doc: $NATIVE_MULTI_DOC_ID"

        if run_capture_to_var GET_NATIVE_MULTI_DOC_TEXT "get_document($NATIVE_MULTI_DOC_ID native_reference_document_person)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"document\":\"$NATIVE_MULTI_DOC_ID\"}},\"id\":2}"; then
          assert_json_field_contains "get_document($NATIVE_MULTI_DOC_ID) serializes document reference" "$GET_NATIVE_MULTI_DOC_TEXT" '.content' "$NATIVE_MULTI_TARGET_TITLE"
          assert_json_field_contains "get_document($NATIVE_MULTI_DOC_ID) serializes document reference url" "$GET_NATIVE_MULTI_DOC_TEXT" '.content' "$NATIVE_MULTI_TARGET_DOC_ID"
          assert_json_field_contains "get_document($NATIVE_MULTI_DOC_ID) serializes person reference url" "$GET_NATIVE_MULTI_DOC_TEXT" '.content' "$NATIVE_MULTI_PERSON_ID"
        fi

        run_test "delete_document($NATIVE_MULTI_DOC_ID native_reference_document_person)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"document\":\"$NATIVE_MULTI_DOC_ID\"}},\"id\":2}"
      fi
    fi
  fi
  if [ -n "${NATIVE_MULTI_TARGET_DOC_ID:-}" ]; then
    run_test "delete_document($NATIVE_MULTI_TARGET_DOC_ID native_reference_target)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"document\":\"$NATIVE_MULTI_TARGET_DOC_ID\"}},\"id\":2}"
  fi
  if [ -n "${NATIVE_MULTI_PERSON_ID:-}" ]; then
    run_test "delete_person($NATIVE_MULTI_PERSON_ID native_reference_person)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_person\",\"arguments\":{\"personId\":\"$NATIVE_MULTI_PERSON_ID\"}},\"id\":2}"
  fi
else
  skip_test "documents" "no teamspace found"
fi
echo ""

##############################
# 7b. DOCUMENT EDIT (S&R)
##############################
echo "=== 7b. Document Edit (Search & Replace) ==="

# Big structured markdown content (~3K chars) with repeated words, code block, special chars
SR_CONTENT='# Project Overview\n\nThis document describes the **Project Alpha** architecture. TODO: finalize scope.\n\n## Getting Started\n\nTo set up the project, follow these steps:\n\n- Install dependencies with `pnpm install`\n- Configure the `config.yaml` file\n- Set the `$API_KEY` environment variable\n- TODO: add Docker instructions\n\n## API Reference\n\nThe API exposes the following endpoints:\n\n### GET /users\n\nReturns a list of users. The response includes `id`, `name`, and `email` fields.\nEach user object also contains a `role` field with values like *admin*, *editor*, or *viewer*.\n\n### POST /users\n\nCreates a new user. Required fields: `name` and `email`.\n\n## Code Examples\n\n```typescript\nimport { Client } from \"./sdk\";\n\nconst client = new Client({ baseUrl: \"https://api.example.com\" });\n\nasync function main() {\n  const users = await client.getUsers();\n  console.log(\"Found users:\", users.length);\n  \n  for (const user of users) {\n    console.log(`User: ${user.name} (${user.email})`);\n  }\n}\n\nmain().catch(console.error);\n```\n\n## Configuration\n\nThe system supports the following configuration options:\n\n| Option | Type | Default | Description |\n|--------|------|---------|-------------|\n| port | number | 3000 | Server port |\n| debug | boolean | false | Enable debug mode |\n| logLevel | string | \"info\" | Log verbosity |\n\n## Deployment Notes\n\nThe deployment pipeline uses GitHub Actions. TODO: document rollback procedure.\nMake sure the `$DATABASE_URL` variable is set in the production environment.\nThe health check endpoint is available at `/health` and returns a 200 status code.\n\n## Troubleshooting\n\nCommon issues and solutions:\n\n- **Connection timeout**: Check that the `$API_KEY` is valid and not expired\n- **Rate limiting**: The API allows 100 requests per minute per API key\n- **Data sync**: Allow up to 5 minutes for changes to propagate across regions'

# Create a dedicated teamspace for S&R tests
run_capture_to_var SR_TS_TEXT "create_teamspace(SR)" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"create_teamspace","arguments":{"name":"SR Test Space","description":"search and replace integration test"}},"id":2}'
if [ $? -eq 0 ]; then
  SR_TS_ID=$(echo "$SR_TS_TEXT" | jq -r '.id' 2>/dev/null)
  echo "  => teamspace: $SR_TS_ID"

  # Step 1: Create doc with big content
  run_capture_to_var SR_DOC_TEXT "sr: create big doc" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_document\",\"arguments\":{\"teamspace\":\"$SR_TS_ID\",\"title\":\"SR Test Doc\",\"content\":\"$SR_CONTENT\"}},\"id\":2}"
  if [ $? -eq 0 ]; then
    SR_DOC_ID=$(echo "$SR_DOC_TEXT" | jq -r '.id' 2>/dev/null)
    echo "  => doc: $SR_DOC_ID"
    assert_contains "sr: baseline has API Reference" "$SR_TS_ID" "$SR_DOC_ID" "## API Reference"

    # Step 2: Replace unique heading
    run_test "sr: heading rename" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"edit_document\",\"arguments\":{\"teamspace\":\"$SR_TS_ID\",\"document\":\"$SR_DOC_ID\",\"old_text\":\"## API Reference\",\"new_text\":\"## API Docs\"}},\"id\":2}"
    assert_contains "sr: heading changed" "$SR_TS_ID" "$SR_DOC_ID" "## API Docs"
    assert_not_contains "sr: old heading gone" "$SR_TS_ID" "$SR_DOC_ID" "## API Reference"

    # Step 3: Replace inside code block
    run_test "sr: edit inside code block" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"edit_document\",\"arguments\":{\"teamspace\":\"$SR_TS_ID\",\"document\":\"$SR_DOC_ID\",\"old_text\":\"console.log(\\\"Found users:\\\", users.length)\",\"new_text\":\"logger.info(\\\"Found users:\\\", users.length)\"}},\"id\":2}"
    assert_contains "sr: code block updated" "$SR_TS_ID" "$SR_DOC_ID" "logger.info"
    assert_contains "sr: code fences intact" "$SR_TS_ID" "$SR_DOC_ID" '```typescript'

    # Step 4: Replace multi-word phrase
    run_test "sr: multi-word phrase" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"edit_document\",\"arguments\":{\"teamspace\":\"$SR_TS_ID\",\"document\":\"$SR_DOC_ID\",\"old_text\":\"health check endpoint is available at\",\"new_text\":\"readiness probe is exposed at\"}},\"id\":2}"
    assert_contains "sr: new phrase present" "$SR_TS_ID" "$SR_DOC_ID" "readiness probe is exposed at"
    assert_not_contains "sr: old phrase gone" "$SR_TS_ID" "$SR_DOC_ID" "health check endpoint is available at"

    # Step 5: replace_all on word appearing 3x (TODO)
    run_test "sr: replace_all TODO" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"edit_document\",\"arguments\":{\"teamspace\":\"$SR_TS_ID\",\"document\":\"$SR_DOC_ID\",\"old_text\":\"TODO\",\"new_text\":\"DONE\",\"replace_all\":true}},\"id\":2}"
    assert_not_contains "sr: no TODO remains" "$SR_TS_ID" "$SR_DOC_ID" "TODO"
    assert_contains "sr: DONE present" "$SR_TS_ID" "$SR_DOC_ID" "DONE"

    # Step 6: Delete text (empty new_text) — remove a bullet point
    run_test "sr: delete bullet" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"edit_document\",\"arguments\":{\"teamspace\":\"$SR_TS_ID\",\"document\":\"$SR_DOC_ID\",\"old_text\":\"- **Rate limiting**: The API allows 100 requests per minute per API key\",\"new_text\":\"\"}},\"id\":2}"
    assert_not_contains "sr: bullet removed" "$SR_TS_ID" "$SR_DOC_ID" "Rate limiting"
    assert_contains "sr: neighbor intact" "$SR_TS_ID" "$SR_DOC_ID" "Connection timeout"

    # Step 7: Non-existent text (expect error)
    run_expect_error "sr: not found error" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"edit_document\",\"arguments\":{\"teamspace\":\"$SR_TS_ID\",\"document\":\"$SR_DOC_ID\",\"old_text\":\"this text does not exist anywhere in the document\",\"new_text\":\"replacement\"}},\"id\":2}"
    assert_contains "sr: content unchanged after not-found" "$SR_TS_ID" "$SR_DOC_ID" "Project Alpha"

    # Step 8: Ambiguous match without replace_all (expect error) — "DONE" appears 3x
    run_expect_error "sr: ambiguous match error" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"edit_document\",\"arguments\":{\"teamspace\":\"$SR_TS_ID\",\"document\":\"$SR_DOC_ID\",\"old_text\":\"DONE\",\"new_text\":\"FIXED\"}},\"id\":2}"
    assert_contains "sr: content unchanged after ambiguous" "$SR_TS_ID" "$SR_DOC_ID" "Project Alpha"

    # Step 9: Full replace — overwrite entire content
    run_test "sr: full replace" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"edit_document\",\"arguments\":{\"teamspace\":\"$SR_TS_ID\",\"document\":\"$SR_DOC_ID\",\"content\":\"# Replaced\"}},\"id\":2}"
    assert_contains "sr: full replace content" "$SR_TS_ID" "$SR_DOC_ID" "# Replaced"
    assert_not_contains "sr: old content gone" "$SR_TS_ID" "$SR_DOC_ID" "Project Alpha"

    # Step 10: Cleanup
    run_test "sr: delete doc" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_document\",\"arguments\":{\"teamspace\":\"$SR_TS_ID\",\"document\":\"$SR_DOC_ID\"}},\"id\":2}"
  fi

  run_test "sr: delete teamspace" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_teamspace\",\"arguments\":{\"teamspace\":\"$SR_TS_ID\"}},\"id\":2}"
else
  skip_test "document S&R" "could not create teamspace"
fi
echo ""

##############################
# 8. TEAMSPACES
##############################
echo "=== 8. Teamspaces ==="
run_capture_to_var NEW_TS_TEXT "create_teamspace" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"create_teamspace","arguments":{"name":"IntTest Space","description":"test"}},"id":2}'
if [ $? -eq 0 ]; then
  NEW_TS_ID=$(echo "$NEW_TS_TEXT" | jq -r '.id' 2>/dev/null)
  echo "  => teamspace: $NEW_TS_ID"
  run_test "get_teamspace($NEW_TS_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_teamspace\",\"arguments\":{\"teamspace\":\"$NEW_TS_ID\"}},\"id\":2}"
  run_test "update_teamspace($NEW_TS_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_teamspace\",\"arguments\":{\"teamspace\":\"$NEW_TS_ID\",\"name\":\"Updated Space\"}},\"id\":2}"
  run_test "delete_teamspace($NEW_TS_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_teamspace\",\"arguments\":{\"teamspace\":\"$NEW_TS_ID\"}},\"id\":2}"
fi
echo ""

##############################
# 9. CHANNELS & MESSAGES
##############################
echo "=== 9. Channels & Messages ==="
run_test "list_channels" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_channels","arguments":{}},"id":2}'
run_test "get_channel(general)" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_channel","arguments":{"channel":"general"}},"id":2}'
run_test "list_channel_messages(general)" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_channel_messages","arguments":{"channel":"general","limit":3}},"id":2}'
run_capture_to_var DM_LIST_TEXT "list_direct_messages" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_direct_messages","arguments":{"limit":3}},"id":2}'
if [ -n "$HULY_EMAIL" ]; then
  SELF_EMAIL_JSON=$(json_string "$HULY_EMAIL")
  run_expect_error "create_direct_message(rejects_self)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_direct_message\",\"arguments\":{\"person\":$SELF_EMAIL_JSON}},\"id\":2}"
else
  skip_test "create_direct_message(rejects_self)" "HULY_EMAIL is not set"
fi
SELF_NAME=""
EMPLOYEES_FOR_DM_TEXT=""
WORKSPACE_MEMBERS_FOR_DM_TEXT=""
USER_PROFILE_TEXT=""
if [ -n "$HULY_EMAIL" ]; then
  EMPLOYEES_FOR_DM_TEXT=$(run_capture_only \
    '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_employees","arguments":{"limit":200}},"id":2}')
  if [ $? -eq 0 ]; then
    SELF_NAME=$(echo "$EMPLOYEES_FOR_DM_TEXT" | jq -r --arg email "$HULY_EMAIL" '[.[]? | select(.email == $email) | .name // empty] | unique | if length == 1 then .[0] else empty end' 2>/dev/null)
    WORKSPACE_MEMBERS_FOR_DM_TEXT=$(run_capture_only \
      '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_workspace_members","arguments":{"limit":200}},"id":2}' || true)
  else
    EMPLOYEES_FOR_DM_TEXT=""
  fi
fi
if [ -z "$SELF_NAME" ]; then
  USER_PROFILE_TEXT=$(run_capture_only \
    '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_user_profile","arguments":{}},"id":2}')
  if [ $? -eq 0 ]; then
    SELF_NAME=$(echo "$USER_PROFILE_TEXT" | jq -r '[.name, ((.firstName // "") + " " + (.lastName // ""))] | map(select(type == "string") | gsub("^ +| +$"; "")) | map(select(. != "")) | .[0] // empty' 2>/dev/null)
  fi
fi
if [ -n "$SELF_NAME" ]; then
  EXISTING_DM_PERSON_NAME=$(echo "$DM_LIST_TEXT" | jq -r --arg self "$SELF_NAME" '.conversations[]? | select((.participantIds // [] | length) == 2 and (.participants // [] | length) == 2 and ((.participants // []) | index($self) != null)) | .participants[]? | select(. != $self)' 2>/dev/null | head -1)
  if [ -n "$EXISTING_DM_PERSON_NAME" ]; then
    EXISTING_DM_PERSON_JSON=$(json_string "$EXISTING_DM_PERSON_NAME")
    run_capture_to_var CREATE_DM_TEXT "create_direct_message(existing:$EXISTING_DM_PERSON_NAME)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_direct_message\",\"arguments\":{\"person\":$EXISTING_DM_PERSON_JSON}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_equals "create_direct_message existing created=false" "$CREATE_DM_TEXT" ".created" "false"
    fi
  else
    skip_test "create_direct_message(existing)" "no existing one-to-one DM participant found"
  fi
else
  skip_test "create_direct_message(existing)" "could not determine current employee name"
fi
GROUP_DM_PEOPLE_JSON=""
GROUP_DM_ID=""
CHANNEL_MEMBER_CANDIDATE=""
if [ -n "$EMPLOYEES_FOR_DM_TEXT" ] && [ -n "$WORKSPACE_MEMBERS_FOR_DM_TEXT" ] && [ -n "$HULY_EMAIL" ]; then
  GROUP_DM_PEOPLE_JSON=$(select_workspace_member_employee_emails \
    "$EMPLOYEES_FOR_DM_TEXT" "$WORKSPACE_MEMBERS_FOR_DM_TEXT" "$HULY_EMAIL" 2 2>/dev/null)
  CHANNEL_MEMBER_CANDIDATE=$(printf '%s\n' "$GROUP_DM_PEOPLE_JSON" | jq -r '.[0] // empty' 2>/dev/null)
fi
if [ "$(printf '%s\n' "$GROUP_DM_PEOPLE_JSON" | jq -r 'length // 0' 2>/dev/null)" = "2" ]; then
  run_capture_to_var GROUP_DM_TEXT "create_group_direct_message" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_group_direct_message\",\"arguments\":{\"people\":$GROUP_DM_PEOPLE_JSON}},\"id\":2}"
  if [ $? -eq 0 ]; then
    GROUP_DM_ID=$(echo "$GROUP_DM_TEXT" | jq -r '.id // empty' 2>/dev/null)
    assert_json_field_nonempty "create_group_direct_message returns id" "$GROUP_DM_TEXT" ".id"
    assert_json_field_count "create_group_direct_message has three members" "$GROUP_DM_TEXT" ".members | length" "3"

    GROUP_DM_REVERSED_JSON=$(printf '%s\n' "$GROUP_DM_PEOPLE_JSON" | jq -c 'reverse')
    run_capture_to_var GROUP_DM_EXISTING_TEXT "create_group_direct_message(existing reversed)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_group_direct_message\",\"arguments\":{\"people\":$GROUP_DM_REVERSED_JSON}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_equals "create_group_direct_message existing created=false" "$GROUP_DM_EXISTING_TEXT" ".created" "false"
      if [ -n "$GROUP_DM_ID" ]; then
        assert_json_field_equals "create_group_direct_message existing same id" "$GROUP_DM_EXISTING_TEXT" ".id" "$GROUP_DM_ID"
      fi
    fi
  fi
else
  skip_test "create_group_direct_message" "need at least two non-self employees with unique exact emails linked to authoritative workspace memberships"
fi
DM_ID="${HULY_TEST_DM_ID:-}"
if [ -z "$DM_ID" ]; then
  DM_ID=$(echo "$DM_LIST_TEXT" | jq -r '.conversations[0].id // empty' 2>/dev/null)
fi
if [ -n "$DM_ID" ]; then
  run_test "list_dm_messages($DM_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_dm_messages\",\"arguments\":{\"dm\":\"$DM_ID\",\"limit\":3}},\"id\":2}"
  run_capture_to_var DM_MSG_TEXT "send_dm_message($DM_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"send_dm_message\",\"arguments\":{\"dm\":\"$DM_ID\",\"body\":\"IntTest DM msg $RUN_ID\"}},\"id\":2}"
  if [ $? -eq 0 ]; then
    DM_MSG_ID=$(echo "$DM_MSG_TEXT" | jq -r '.id // empty' 2>/dev/null)
    if [ -n "$DM_MSG_ID" ]; then
      DM_ID_JSON=$(json_string "$DM_ID")
      DM_MSG_ID_JSON=$(json_string "$DM_MSG_ID")
      DM_MSG_TARGET_JSON="{\"kind\":\"dm_message\",\"dm\":$DM_ID_JSON,\"messageId\":$DM_MSG_ID_JSON}"
      run_chat_attachment_lifecycle "dm_message" "$DM_MSG_TARGET_JSON"
      run_pinned_chat_message_lifecycle "dm_message" "dm" "$DM_ID" "$DM_MSG_ID" "direct_message"
      run_test "update_dm_message($DM_MSG_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_dm_message\",\"arguments\":{\"dm\":\"$DM_ID\",\"messageId\":\"$DM_MSG_ID\",\"body\":\"Updated IntTest DM msg $RUN_ID\"}},\"id\":2}"
      run_test "delete_dm_message($DM_MSG_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_dm_message\",\"arguments\":{\"dm\":\"$DM_ID\",\"messageId\":\"$DM_MSG_ID\"}},\"id\":2}"
    else
      echo "FAIL: DM message update/delete (send_dm_message returned no id)"
      FAILED=$((FAILED + 1))
      ERRORS="${ERRORS}\n  - DM message update/delete: send_dm_message returned no id"
    fi
  fi
else
  echo "FAIL: DM message tools (set HULY_TEST_DM_ID or create a direct-message conversation in the test workspace)"
  FAILED=$((FAILED + 1))
  ERRORS="${ERRORS}\n  - DM message tools: no fixture DM; set HULY_TEST_DM_ID or create a direct-message conversation"
fi

# Create a temp channel for message/thread/reaction tests — deleting it cleans up all messages
CHANNEL_NAME="inttest-chan-$RUN_ID"
CHANNEL_NAME_JSON=$(json_string "$CHANNEL_NAME")
CHANNEL_NAME_REGEX_JSON=$(json_string "%$CHANNEL_NAME%")
CHANNEL_NAME_CASE_REGEX_JSON=$(json_string "%INTTEST-CHAN-$RUN_ID%")
run_capture_to_var CH_TEXT "create_channel" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_channel\",\"arguments\":{\"name\":$CHANNEL_NAME_JSON,\"topic\":\"test channel\"}},\"id\":2}"
if [ $? -eq 0 ]; then
  CH_ID=$(echo "$CH_TEXT" | jq -r '.id' 2>/dev/null)
  echo "  => channel: $CH_ID"

  run_capture_to_var CH_MEMBERS_TEXT "list_channel_members($CH_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_channel_members\",\"arguments\":{\"channel\":\"$CH_ID\"}},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_field_count "list_channel_members sees creator" "$CH_MEMBERS_TEXT" ".members | length" "1"
    assert_json_field_nonempty "list_channel_members returns accountUuid" "$CH_MEMBERS_TEXT" ".members[0].accountUuid"
  fi

  run_capture_to_var JOIN_TEXT "join_channel($CH_ID idempotent)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"join_channel\",\"arguments\":{\"channel\":\"$CH_ID\"}},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_field_equals "join_channel existing member changed=false" "$JOIN_TEXT" ".changed" "false"
  fi

  run_capture_to_var ACCESS_REQUEST_TEXT "request_channel_access($CH_ID unsupported)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"request_channel_access\",\"arguments\":{\"channel\":\"$CH_ID\"}},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_field_equals "request_channel_access supported=false" "$ACCESS_REQUEST_TEXT" ".supported" "false"
    assert_json_field_equals "request_channel_access reason code" "$ACCESS_REQUEST_TEXT" ".reasonCode" "chunter_access_request_unavailable"
  fi

  if [ -n "$CHANNEL_MEMBER_CANDIDATE" ]; then
    CHANNEL_MEMBER_CANDIDATE_JSON=$(json_string "$CHANNEL_MEMBER_CANDIDATE")
    run_capture_to_var ADD_MEMBERS_TEXT "add_channel_members($CH_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_channel_members\",\"arguments\":{\"channel\":\"$CH_ID\",\"members\":[$CHANNEL_MEMBER_CANDIDATE_JSON]}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_equals "add_channel_members changed" "$ADD_MEMBERS_TEXT" ".changed" "true"
      assert_json_field_count "add_channel_members has two members" "$ADD_MEMBERS_TEXT" ".members | length" "2"
    fi

    run_capture_to_var ADD_MEMBERS_AGAIN_TEXT "add_channel_members($CH_ID idempotent)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_channel_members\",\"arguments\":{\"channel\":\"$CH_ID\",\"members\":[$CHANNEL_MEMBER_CANDIDATE_JSON]}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_equals "add_channel_members idempotent changed=false" "$ADD_MEMBERS_AGAIN_TEXT" ".changed" "false"
    fi

    run_capture_to_var REMOVE_MEMBERS_TEXT "remove_channel_members($CH_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"remove_channel_members\",\"arguments\":{\"channel\":\"$CH_ID\",\"members\":[$CHANNEL_MEMBER_CANDIDATE_JSON]}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_equals "remove_channel_members changed" "$REMOVE_MEMBERS_TEXT" ".changed" "true"
      assert_json_field_count "remove_channel_members leaves creator" "$REMOVE_MEMBERS_TEXT" ".members | length" "1"
    fi
  else
    skip_test "add/remove_channel_members" "need a non-self employee linked to an authoritative workspace membership"
  fi

  run_expect_error "leave_channel($CH_ID rejects last owner)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"leave_channel\",\"arguments\":{\"channel\":\"$CH_ID\"}},\"id\":2}"

  run_capture_to_var STAR_TEXT "set_conversation_starred(channel:$CH_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"set_conversation_starred\",\"arguments\":{\"channel\":\"$CH_ID\",\"starred\":true}},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_field_equals "set_conversation_starred channel kind" "$STAR_TEXT" ".kind" "channel"
    assert_json_field_equals "set_conversation_starred channel starred" "$STAR_TEXT" ".starred" "true"
  fi

  run_capture_to_var STAR_AGAIN_TEXT "set_conversation_starred(channel:$CH_ID idempotent)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"set_conversation_starred\",\"arguments\":{\"channel\":\"$CH_ID\",\"starred\":true}},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_field_equals "set_conversation_starred idempotent changed=false" "$STAR_AGAIN_TEXT" ".changed" "false"
  fi

  run_capture_to_var ARCHIVE_TEXT "archive_channel($CH_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"archive_channel\",\"arguments\":{\"channel\":\"$CH_ID\"}},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_field_equals "archive_channel archived" "$ARCHIVE_TEXT" ".archived" "true"
    assert_json_field_equals "archive_channel changed" "$ARCHIVE_TEXT" ".changed" "true"
  fi

  run_capture_to_var ARCHIVE_AGAIN_TEXT "archive_channel($CH_ID idempotent)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"archive_channel\",\"arguments\":{\"channel\":\"$CH_ID\"}},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_field_equals "archive_channel idempotent changed=false" "$ARCHIVE_AGAIN_TEXT" ".changed" "false"
  fi

  if [ -n "$CHANNEL_MEMBER_CANDIDATE" ]; then
    run_expect_error "add_channel_members($CH_ID archived rejects)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_channel_members\",\"arguments\":{\"channel\":\"$CH_ID\",\"members\":[$CHANNEL_MEMBER_CANDIDATE_JSON]}},\"id\":2}"
  fi

  run_capture_to_var UNARCHIVE_TEXT "unarchive_channel($CH_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"unarchive_channel\",\"arguments\":{\"channel\":\"$CH_ID\"}},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_field_equals "unarchive_channel archived=false" "$UNARCHIVE_TEXT" ".archived" "false"
    assert_json_field_equals "unarchive_channel changed" "$UNARCHIVE_TEXT" ".changed" "true"
  fi

  run_capture_to_var UNARCHIVE_AGAIN_TEXT "unarchive_channel($CH_ID idempotent)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"unarchive_channel\",\"arguments\":{\"channel\":\"$CH_ID\"}},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_field_equals "unarchive_channel idempotent changed=false" "$UNARCHIVE_AGAIN_TEXT" ".changed" "false"
  fi

  run_capture_to_var CH_REGEX_TEXT "list_channels(nameRegex SIMILAR TO contains)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_channels\",\"arguments\":{\"nameRegex\":$CHANNEL_NAME_REGEX_JSON,\"limit\":10}},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_array_contains "list_channels nameRegex SIMILAR TO contains includes channel" "$CH_REGEX_TEXT" "map(.id)" "$CH_ID"
  fi

  run_capture_to_var CH_REGEX_CASE_TEXT "list_channels(nameRegex case-sensitive miss)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_channels\",\"arguments\":{\"nameRegex\":$CHANNEL_NAME_CASE_REGEX_JSON,\"limit\":10}},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_array_not_contains "list_channels nameRegex is case-sensitive" "$CH_REGEX_CASE_TEXT" "map(.id)" "$CH_ID"
  fi

  # Send a channel message, then reply + reactions
  run_capture_to_var MSG_TEXT "send_channel_message($CHANNEL_NAME)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"send_channel_message\",\"arguments\":{\"channel\":\"$CH_ID\",\"body\":\"IntTest msg\"}},\"id\":2}"
  if [ $? -eq 0 ]; then
    MSG_ID=$(echo "$MSG_TEXT" | jq -r '.id' 2>/dev/null)
    echo "  => msg: $MSG_ID"
    CH_ID_JSON=$(json_string "$CH_ID")
    MSG_ID_JSON=$(json_string "$MSG_ID")
    CHANNEL_MSG_TARGET_JSON="{\"kind\":\"channel_message\",\"channel\":$CH_ID_JSON,\"messageId\":$MSG_ID_JSON}"
    run_chat_attachment_lifecycle "channel_message" "$CHANNEL_MSG_TARGET_JSON"

    run_pinned_chat_message_lifecycle "channel_message" "channel" "$CH_ID" "$MSG_ID" "channel_message"

    run_capture_to_var TRANSLATE_CHAT_TEXT "translate_chat_message($MSG_ID unsupported)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"translate_chat_message\",\"arguments\":{\"channel\":\"$CH_ID\",\"messageId\":\"$MSG_ID\",\"targetLanguage\":\"fr\"}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_equals "translate_chat_message supported=false" "$TRANSLATE_CHAT_TEXT" ".supported" "false"
      assert_json_field_equals "translate_chat_message reason code" "$TRANSLATE_CHAT_TEXT" ".reasonCode" "server_translation_unavailable"
    fi

    # Thread replies
    run_capture_to_var REPLY_TEXT "add_thread_reply($MSG_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_thread_reply\",\"arguments\":{\"channel\":\"$CH_ID\",\"messageId\":\"$MSG_ID\",\"body\":\"IntTest reply\"}},\"id\":2}"
    if [ $? -eq 0 ]; then
      REPLY_ID=$(echo "$REPLY_TEXT" | jq -r '.id' 2>/dev/null)
      echo "  => reply: $REPLY_ID"
      run_test "list_thread_replies($MSG_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_thread_replies\",\"arguments\":{\"channel\":\"$CH_ID\",\"messageId\":\"$MSG_ID\"}},\"id\":2}"
      REPLY_ID_JSON=$(json_string "$REPLY_ID")
      THREAD_REPLY_TARGET_JSON="{\"kind\":\"thread_reply\",\"channel\":$CH_ID_JSON,\"messageId\":$MSG_ID_JSON,\"replyId\":$REPLY_ID_JSON}"
      run_chat_attachment_lifecycle "thread_reply" "$THREAD_REPLY_TARGET_JSON"
      run_pinned_chat_message_lifecycle "thread_reply" "channel" "$CH_ID" "$REPLY_ID" "channel_message"
      run_test "update_thread_reply($REPLY_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_thread_reply\",\"arguments\":{\"channel\":\"$CH_ID\",\"messageId\":\"$MSG_ID\",\"replyId\":\"$REPLY_ID\",\"body\":\"Updated reply\"}},\"id\":2}"
      run_test "delete_thread_reply($REPLY_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_thread_reply\",\"arguments\":{\"channel\":\"$CH_ID\",\"messageId\":\"$MSG_ID\",\"replyId\":\"$REPLY_ID\"}},\"id\":2}"
    fi

    # Reactions
    run_test "add_reaction($MSG_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_reaction\",\"arguments\":{\"messageId\":\"$MSG_ID\",\"emoji\":\"thumbsup\"}},\"id\":2}"
    run_test "list_reactions($MSG_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_reactions\",\"arguments\":{\"messageId\":\"$MSG_ID\"}},\"id\":2}"
    run_test "remove_reaction($MSG_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"remove_reaction\",\"arguments\":{\"messageId\":\"$MSG_ID\",\"emoji\":\"thumbsup\"}},\"id\":2}"

    # Save/unsave message
    run_test "save_message($MSG_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"save_message\",\"arguments\":{\"messageId\":\"$MSG_ID\"}},\"id\":2}"
    run_test "unsave_message($MSG_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"unsave_message\",\"arguments\":{\"messageId\":\"$MSG_ID\"}},\"id\":2}"
  fi

  run_test "update_channel($CH_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_channel\",\"arguments\":{\"channel\":\"$CH_ID\",\"topic\":\"updated\"}},\"id\":2}"
  run_test "delete_channel($CH_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_channel\",\"arguments\":{\"channel\":\"$CH_ID\"}},\"id\":2}"
fi
if [ -n "$GROUP_DM_ID" ]; then
  run_capture_to_var CLOSE_DM_TEXT "set_conversation_closed(dm:$GROUP_DM_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"set_conversation_closed\",\"arguments\":{\"dm\":\"$GROUP_DM_ID\",\"closed\":true}},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_field_equals "set_conversation_closed dm kind" "$CLOSE_DM_TEXT" ".kind" "direct_message"
    assert_json_field_equals "set_conversation_closed dm closed" "$CLOSE_DM_TEXT" ".closed" "true"
  fi

  run_capture_to_var REOPEN_DM_TEXT "set_conversation_closed(dm:$GROUP_DM_ID reopen)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"set_conversation_closed\",\"arguments\":{\"dm\":\"$GROUP_DM_ID\",\"closed\":false}},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_field_equals "set_conversation_closed dm reopened" "$REOPEN_DM_TEXT" ".closed" "false"
  fi
else
  skip_test "set_conversation_closed(dm)" "no group direct-message id available"
fi
echo ""

##############################
# 10. CONTACTS
##############################
echo "=== 10. Contacts ==="
run_test "list_persons" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_persons","arguments":{"limit":3}},"id":2}'
run_capture_to_var EMPLOYEES_TEXT "list_employees" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_employees","arguments":{"limit":3}},"id":2}'
EMPLOYEE_LIFECYCLE_EMAIL="employee-lifecycle-$RUN_ID@example.test"
EMPLOYEE_LIFECYCLE_NAME="Lifecycle-$RUN_ID,Fixture"
EMPLOYEE_LIFECYCLE_EMAIL_JSON=$(json_string "$EMPLOYEE_LIFECYCLE_EMAIL")
EMPLOYEE_LIFECYCLE_NAME_JSON=$(json_string "$EMPLOYEE_LIFECYCLE_NAME")
run_employee_invitation_step EMPLOYEE_LIFECYCLE_CREATE "invite_employee(create-or-promote)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"invite_employee\",\"arguments\":{\"mode\":\"create-or-promote\",\"name\":$EMPLOYEE_LIFECYCLE_NAME_JSON,\"email\":$EMPLOYEE_LIFECYCLE_EMAIL_JSON}},\"id\":2}"
if [ $? -eq 0 ]; then
  EMPLOYEE_LIFECYCLE_CLEANUP_PERSON_ID=$(extract_employee_lifecycle_person_id "$EMPLOYEE_LIFECYCLE_CREATE")
  if [ -z "$EMPLOYEE_LIFECYCLE_CLEANUP_PERSON_ID" ]; then
    fail_test "invite_employee(create-or-promote cleanup identity)" "response did not contain an exact lifecycle Person ID"
  else
    run_capture_to_var_fresh EMPLOYEE_LIFECYCLE_CREATED_PREVIEW "deactivate_employee(created preview)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"deactivate_employee\",\"arguments\":{\"employee\":{\"email\":$EMPLOYEE_LIFECYCLE_EMAIL_JSON},\"action\":\"deactivate\"}},\"id\":2}"
    if [ $? -eq 0 ]; then
      EMPLOYEE_LIFECYCLE_CREATED_ID_VALUE=$(printf '%s\n' "$EMPLOYEE_LIFECYCLE_CREATED_PREVIEW" | jq -r '.impact.personId')
      EMPLOYEE_LIFECYCLE_CREATED_EXPECTED=$(printf '%s\n' "$EMPLOYEE_LIFECYCLE_CREATED_PREVIEW" | jq -c \
        '.impact | {relationship, personId, employeeActive: (.employee.state == "active")} + (if .relationship == "unlinked" then {} else {personUuid: .account.personUuid} end) + (if .relationship == "workspace-member" then {workspaceRole: .workspaceMembership.role} else {} end)')
      run_capture_to_var_fresh EMPLOYEE_LIFECYCLE_DEACTIVATED "deactivate_employee(created execute)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"deactivate_employee\",\"arguments\":{\"employee\":{\"email\":$EMPLOYEE_LIFECYCLE_EMAIL_JSON},\"action\":\"deactivate\",\"execute\":true,\"expected\":$EMPLOYEE_LIFECYCLE_CREATED_EXPECTED}},\"id\":2}"
      run_employee_invitation_step EMPLOYEE_LIFECYCLE_RESENT "invite_employee(inactive resend)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"invite_employee\",\"arguments\":{\"mode\":\"invite-existing\",\"employee\":{\"email\":$EMPLOYEE_LIFECYCLE_EMAIL_JSON}}},\"id\":2}"
      run_employee_invitation_step EMPLOYEE_LIFECYCLE_REACTIVATED "invite_employee(reactivate and restore)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"invite_employee\",\"arguments\":{\"mode\":\"create-or-promote\",\"name\":$EMPLOYEE_LIFECYCLE_NAME_JSON,\"email\":$EMPLOYEE_LIFECYCLE_EMAIL_JSON}},\"id\":2}"
      run_capture_to_var_fresh EMPLOYEE_LIFECYCLE_RESTORED "deactivate_employee(restoration readback)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"deactivate_employee\",\"arguments\":{\"employee\":{\"email\":$EMPLOYEE_LIFECYCLE_EMAIL_JSON},\"action\":\"deactivate\"}},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_field_equals "employee lifecycle restoration is active" \
          "$EMPLOYEE_LIFECYCLE_RESTORED" '.impact.employee.state' 'active'
        assert_json_field_equals "employee lifecycle restoration keeps USER role" \
          "$EMPLOYEE_LIFECYCLE_RESTORED" '.impact.employee.role' 'USER'
        assert_json_field_equals "employee lifecycle disposable account remains unlinked" \
          "$EMPLOYEE_LIFECYCLE_RESTORED" '.impact.account.state' 'unlinked'
        assert_json_field_equals "employee lifecycle disposable member remains absent" \
          "$EMPLOYEE_LIFECYCLE_RESTORED" '.impact.workspaceMembership.state' 'absent'
        assert_json_field_equals "employee lifecycle restoration keeps Person identity" \
          "$EMPLOYEE_LIFECYCLE_RESTORED" '.impact.personId' "$EMPLOYEE_LIFECYCLE_CREATED_ID_VALUE"
      fi
    fi
  fi
fi
run_capture_to_var INACTIVE_EMPLOYEES_TEXT "list_inactive_employees" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_inactive_employees","arguments":{"limit":3,"offset":0}},"id":2}'
if [ $? -eq 0 ]; then
  assert_json_field_equals "list_inactive_employees returns exact total metadata" \
    "$INACTIVE_EMPLOYEES_TEXT" ".total >= (.employees | length)" "true"
fi
EMPLOYEE_LIFECYCLE_ALL=$(run_capture_only \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_employees","arguments":{"limit":200}},"id":2}' 2>/dev/null || true)
if [ -n "${HULY_EMAIL:-}" ]; then
  EMPLOYEE_LIFECYCLE_SELF_EMAIL=$(json_string "$HULY_EMAIL")
  run_expect_error "invite_employee(active self is incompatible)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"invite_employee\",\"arguments\":{\"mode\":\"invite-existing\",\"employee\":{\"email\":$EMPLOYEE_LIFECYCLE_SELF_EMAIL}}},\"id\":2}"
fi
EMPLOYEE_LIFECYCLE_TARGET=$(printf '%s\n' "$EMPLOYEE_LIFECYCLE_ALL" | jq -r --arg email "${HULY_EMAIL:-}" \
  '[.[]? | select(.active == true and (.email // "") != $email and (.name // "") != "") | .name] | sort | group_by(.) | map(select(length == 1) | .[0]) | .[0] // empty' 2>/dev/null)
if [ -n "$EMPLOYEE_LIFECYCLE_TARGET" ]; then
  EMPLOYEE_LIFECYCLE_TARGET_JSON=$(json_string "$EMPLOYEE_LIFECYCLE_TARGET")
  run_capture_to_var EMPLOYEE_LIFECYCLE_PREVIEW "deactivate_employee(preview)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"deactivate_employee\",\"arguments\":{\"employee\":{\"name\":$EMPLOYEE_LIFECYCLE_TARGET_JSON},\"action\":\"kick\"}},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_field_equals "deactivate_employee preview performs no mutation" \
      "$EMPLOYEE_LIFECYCLE_PREVIEW" ".executed" "false"
    EMPLOYEE_LIFECYCLE_STALE_EXPECTED=$(printf '%s\n' "$EMPLOYEE_LIFECYCLE_PREVIEW" | jq -c \
      '.impact | {relationship, personId: "stale-person-id", employeeActive: (.employee.state == "active")} + (if .relationship == "unlinked" then {} else {personUuid: .account.personUuid} end) + (if .relationship == "workspace-member" then {workspaceRole: .workspaceMembership.role} else {} end)')
    run_expect_error "deactivate_employee(stale impact guard)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"deactivate_employee\",\"arguments\":{\"employee\":{\"name\":$EMPLOYEE_LIFECYCLE_TARGET_JSON},\"action\":\"kick\",\"execute\":true,\"expected\":$EMPLOYEE_LIFECYCLE_STALE_EXPECTED}},\"id\":2}"
  fi
else
  skip_test "deactivate_employee(preview and stale guard)" "no unique active non-self employee fixture"
fi
HR_STAFF_FIXTURE=$(pnpm exec tsx scripts/integration-hr-staff-fixture.ts 2>/dev/null)
HR_STAFF_EMPLOYEE=$(echo "$HR_STAFF_FIXTURE" | jq -r '.employeeId // empty' 2>/dev/null)
HR_STAFF_ORIGINAL_DEPARTMENT=$(echo "$HR_STAFF_FIXTURE" | jq -r '.departmentId // empty' 2>/dev/null)
if [ -n "$HR_STAFF_EMPLOYEE" ]; then
  HR_DEPARTMENT_NAME="MCP HR $RUN_ID"
  HR_CHILD_NAME="Platform"
  HR_DEPARTMENT_NAME_JSON=$(json_string "$HR_DEPARTMENT_NAME")
  run_capture_to_var HR_CREATE_TEXT "create_department(top-level)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_department\",\"arguments\":{\"name\":$HR_DEPARTMENT_NAME_JSON,\"description\":\"Issue 253 integration fixture\"}},\"id\":2}"
  if [ $? -eq 0 ]; then
    HR_CLEANUP_DEPARTMENT_ID=$(echo "$HR_CREATE_TEXT" | jq -r '.id' 2>/dev/null)
    HR_DEPARTMENT_ID_JSON=$(json_string "$HR_CLEANUP_DEPARTMENT_ID")
    wait_for_department_path HR_PARENT_VISIBLE_TEXT \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_department\",\"arguments\":{\"department\":$HR_DEPARTMENT_ID_JSON}},\"id\":2}" \
      "$HR_CLEANUP_DEPARTMENT_ID" "get_department(parent fresh-session visibility)" || exit 1
    run_capture_to_var_with_runner call_tool_fresh_session HR_CHILD_TEXT "create_department(nested)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_department\",\"arguments\":{\"name\":\"$HR_CHILD_NAME\",\"parent\":$HR_DEPARTMENT_ID_JSON}},\"id\":2}"
    if [ $? -eq 0 ]; then
      HR_CHILD_ID=$(echo "$HR_CHILD_TEXT" | jq -r '.id' 2>/dev/null)
      restart_http_transport_if_needed "after nested HR department create" || exit 1
      wait_for_department_path HR_GET_TEXT \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_department\",\"arguments\":{\"department\":\"$HR_DEPARTMENT_NAME/$HR_CHILD_NAME\"}},\"id\":2}" \
        "$HR_CHILD_ID"
      if [ $? -eq 0 ]; then
        echo "PASS: get_department resolves nested path"
        PASSED=$((PASSED + 1))
      fi
      run_test "update_department(nested metadata)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_department\",\"arguments\":{\"department\":\"$HR_DEPARTMENT_NAME/$HR_CHILD_NAME\",\"description\":\"Updated integration fixture\"}},\"id\":2}"
      restart_http_transport_if_needed "after nested HR department update" || exit 1
      HR_STAFF_RESTORE_EMPLOYEE="$HR_STAFF_EMPLOYEE"
      HR_STAFF_RESTORE_DEPARTMENT="$HR_STAFF_ORIGINAL_DEPARTMENT"
      run_test "assign_staff_department(authoritative)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"assign_staff_department\",\"arguments\":{\"employee\":\"$HR_STAFF_EMPLOYEE\",\"department\":\"$HR_CHILD_ID\"}},\"id\":2}"
      restart_http_transport_if_needed "after HR Staff assignment" || exit 1
      run_capture_to_var HR_PARENT_HOLIDAY_TEXT "create_public_holiday(parent)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_public_holiday\",\"arguments\":{\"title\":\"Parent holiday\",\"date\":\"2026-09-04\",\"department\":\"$HR_CLEANUP_DEPARTMENT_ID\"}},\"id\":2}"
      HR_PARENT_HOLIDAY_ID=$(echo "$HR_PARENT_HOLIDAY_TEXT" | jq -r '.holiday.id // empty' 2>/dev/null)
      if [ -n "$HR_PARENT_HOLIDAY_ID" ]; then HR_CLEANUP_HOLIDAY_IDS="$HR_PARENT_HOLIDAY_ID"; fi
      restart_http_transport_if_needed "after parent public holiday create" || exit 1
      run_capture_to_var HR_CHILD_HOLIDAY_TEXT "create_public_holiday(child)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_public_holiday\",\"arguments\":{\"title\":\"Child holiday\",\"date\":\"2026-09-07\",\"department\":\"$HR_CHILD_ID\"}},\"id\":2}"
      HR_CHILD_HOLIDAY_ID=$(echo "$HR_CHILD_HOLIDAY_TEXT" | jq -r '.holiday.id // empty' 2>/dev/null)
      if [ -n "$HR_CHILD_HOLIDAY_ID" ]; then HR_CLEANUP_HOLIDAY_IDS="$HR_CLEANUP_HOLIDAY_IDS $HR_CHILD_HOLIDAY_ID"; fi
      restart_http_transport_if_needed "after child public holiday create" || exit 1
      if [ -n "$HR_CHILD_HOLIDAY_ID" ]; then
        run_test "get_public_holiday" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_public_holiday\",\"arguments\":{\"holiday\":\"$HR_CHILD_HOLIDAY_ID\"}},\"id\":2}"
        run_test "update_public_holiday" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_public_holiday\",\"arguments\":{\"holiday\":\"$HR_CHILD_HOLIDAY_ID\",\"title\":\"Updated child holiday\"}},\"id\":2}"
      fi
      run_capture_to_var HR_INHERITED_HOLIDAYS_TEXT "list_public_holidays(inherited)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_public_holidays\",\"arguments\":{\"department\":\"$HR_CHILD_ID\",\"includeInherited\":true,\"startDate\":\"2026-09-04\",\"endDate\":\"2026-09-07\",\"limit\":20}},\"id\":2}"
      assert_json_field_equals "nested department inherits both holiday documents" \
        "$HR_INHERITED_HOLIDAYS_TEXT" ".total" "2"
      run_capture_to_var HR_TABLE_TEXT "get_hr_table(complete scan)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_hr_table\",\"arguments\":{\"department\":\"$HR_CHILD_ID\",\"startDate\":\"2026-09-04\",\"endDate\":\"2026-09-07\"}},\"id\":2}"
      assert_json_field_equals "HR table reports a complete scan" "$HR_TABLE_TEXT" ".complete" "true"
      capture_paginated_hr_reports HR_PAGINATED_REPORTS_BEFORE_REQUEST \
        "internal HR reports compose page-size-one holiday and Staff scans" \
        "$HR_CHILD_ID" "2026-09-04" "2026-09-07"
      assert_json_field_equals "internal paginated schedule includes both inherited holidays" \
        "$HR_PAGINATED_REPORTS_BEFORE_REQUEST" ".schedule.holidays | length" "2"
      assert_json_field_equals "internal paginated table includes the assigned Staff employee" \
        "$HR_PAGINATED_REPORTS_BEFORE_REQUEST" ".table.totalEmployees" "1"
      assert_json_field_equals "internal paginated table applies both inherited weekday holidays" \
        "$HR_PAGINATED_REPORTS_BEFORE_REQUEST" ".table.rows[0].publicHolidayWorkdays" "2"
      assert_json_field_equals "internal paginated table excludes both inherited holidays from base workdays" \
        "$HR_PAGINATED_REPORTS_BEFORE_REQUEST" ".table.rows[0].baseWorkdays" "0"
      HR_CHILD_PATH_JSON=$(json_string "$HR_DEPARTMENT_NAME/$HR_CHILD_NAME")
      HR_PROPAGATED_CHILD="{}"
      HR_PROPAGATED_PARENT="{}"
      for _ in $(seq 1 20); do
        restart_http_transport_if_needed "HR hierarchy propagation poll" || exit 1
        HR_CHILD_RESPONSE=$(call_tool \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_department\",\"arguments\":{\"department\":$HR_CHILD_PATH_JSON}},\"id\":2}" 2>/dev/null) || true
        HR_PARENT_RESPONSE=$(call_tool \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_department\",\"arguments\":{\"department\":$HR_DEPARTMENT_NAME_JSON}},\"id\":2}" 2>/dev/null) || true
        HR_PROPAGATED_CHILD=$(echo "$HR_CHILD_RESPONSE" | jq -r '.result.content[0].text // "{}"' 2>/dev/null)
        HR_PROPAGATED_PARENT=$(echo "$HR_PARENT_RESPONSE" | jq -r '.result.content[0].text // "{}"' 2>/dev/null)
        if [ "$(echo "$HR_PROPAGATED_CHILD" | jq -r '.derivedMembers // 0')" -ge 1 ] \
          && [ "$(echo "$HR_PROPAGATED_PARENT" | jq -r '.derivedMembers // 0')" -ge 1 ]; then
          break
        fi
        sleep 0.25
      done
      assert_json_field_equals "Staff assignment propagates to child members" \
        "$HR_PROPAGATED_CHILD" ".derivedMembers >= 1" "true"
      assert_json_field_equals "Staff assignment propagates to ancestor members" \
        "$HR_PROPAGATED_PARENT" ".derivedMembers >= 1" "true"
      HR_RESTORE_DEPARTMENT_JSON="null"
      if [ -n "$HR_STAFF_ORIGINAL_DEPARTMENT" ]; then
        HR_RESTORE_DEPARTMENT_JSON=$(json_string "$HR_STAFF_ORIGINAL_DEPARTMENT")
      fi
      run_test "assign_staff_department(restore fixture)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"assign_staff_department\",\"arguments\":{\"employee\":\"$HR_STAFF_EMPLOYEE\",\"department\":$HR_RESTORE_DEPARTMENT_JSON}},\"id\":2}"
      HR_RESTORED_DEPARTMENT="__unconfirmed__"
      for _ in $(seq 1 20); do
        restart_http_transport_if_needed "HR Staff restoration poll" || exit 1
        HR_RESTORE_RESPONSE=$(call_tool \
          '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_staff","arguments":{"limit":200}},"id":2}' 2>/dev/null) || true
        HR_RESTORE_TEXT=$(echo "$HR_RESTORE_RESPONSE" | jq -r '.result.content[0].text // "{}"' 2>/dev/null)
        HR_RESTORED_DEPARTMENT=$(echo "$HR_RESTORE_TEXT" | jq -r --arg employee "$HR_STAFF_EMPLOYEE" '.staff[] | select(.id == $employee) | .department.id // empty' 2>/dev/null)
        HR_RESTORED_PRESENT=$(echo "$HR_RESTORE_TEXT" | jq -r --arg employee "$HR_STAFF_EMPLOYEE" '[.staff[] | select(.id == $employee)] | length' 2>/dev/null)
        if [ "$HR_RESTORED_PRESENT" = "1" ] && [ "$HR_RESTORED_DEPARTMENT" = "$HR_STAFF_ORIGINAL_DEPARTMENT" ]; then
          break
        fi
        sleep 0.25
      done
      if [ "$HR_RESTORED_PRESENT" = "1" ] && [ "$HR_RESTORED_DEPARTMENT" = "$HR_STAFF_ORIGINAL_DEPARTMENT" ]; then
        echo "PASS: HR Staff fixture restoration confirmed"
        PASSED=$((PASSED + 1))
        HR_STAFF_RESTORE_EMPLOYEE=""
        HR_STAFF_RESTORE_DEPARTMENT=""
      else
        fail_test "HR Staff fixture restoration" "restored department was not confirmed; cleanup marker retained"
      fi
      run_capture_to_var HR_REQUEST_TYPES_TEXT "list_hr_request_types" \
        '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_hr_request_types","arguments":{"limit":20}},"id":2}'
      run_capture_to_var HR_REQUEST_TYPES_FR_TEXT "list_hr_request_types(French labels)" \
        '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_hr_request_types","arguments":{"locale":"fr","limit":20}},"id":2}'
      if echo "$HR_REQUEST_TYPES_FR_TEXT" | jq -e \
        '[.requestTypes[] | select(.labelResource == "hr:string:PTO" and .label == "Congé payé" and .labelLocale == "fr")] | length == 1' \
        >/dev/null 2>&1; then
        echo "PASS: French HR request type translation"
        PASSED=$((PASSED + 1))
      else
        fail_test "French HR request type translation" "PTO was not localized through the Huly HR asset"
      fi
      HR_REQUEST_TYPE_ID=$(echo "$HR_REQUEST_TYPES_TEXT" | jq -r '.requestTypes[0].id // empty' 2>/dev/null)
      HR_REQUEST_TYPE_LABEL=$(echo "$HR_REQUEST_TYPES_TEXT" | jq -r '.requestTypes[0].label // empty' 2>/dev/null)
      if [ -n "$HR_REQUEST_TYPE_ID" ] && [ -n "$HR_REQUEST_TYPE_LABEL" ]; then
        HR_REQUEST_TYPE_JSON=$(json_string "$HR_REQUEST_TYPE_ID")
        HR_REQUEST_TYPE_LABEL_JSON=$(json_string "$HR_REQUEST_TYPE_LABEL")
        run_capture_to_var HR_REQUEST_CREATE_TEXT "create_hr_request" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_hr_request\",\"arguments\":{\"employee\":\"$HR_STAFF_EMPLOYEE\",\"department\":\"$HR_CHILD_ID\",\"requestType\":$HR_REQUEST_TYPE_LABEL_JSON,\"startDate\":\"2026-09-04\",\"endDate\":\"2026-09-04\",\"description\":\"Issue 254 **integration** fixture\"}},\"id\":2}"
        if [ $? -eq 0 ]; then
          HR_CLEANUP_REQUEST_ID=$(echo "$HR_REQUEST_CREATE_TEXT" | jq -r '.request.id // empty' 2>/dev/null)
          restart_http_transport_if_needed "after HR request create" || exit 1
          capture_paginated_hr_reports HR_PAGINATED_REPORTS_WITH_REQUEST \
            "internal HR reports compose page-size-one request and holiday scans" \
            "$HR_CHILD_ID" "2026-09-04" "2026-09-07"
          assert_json_field_equals "internal paginated schedule aggregates the request" \
            "$HR_PAGINATED_REPORTS_WITH_REQUEST" ".schedule.requests | length" "1"
          assert_json_field_equals "internal paginated schedule retains inherited holidays" \
            "$HR_PAGINATED_REPORTS_WITH_REQUEST" ".schedule.holidays | length" "2"
          assert_json_field_equals "internal paginated summary aggregates one request group" \
            "$HR_PAGINATED_REPORTS_WITH_REQUEST" ".summary.groups | length" "1"
          assert_json_field_equals "internal paginated summary reports the complete request total" \
            "$HR_PAGINATED_REPORTS_WITH_REQUEST" ".summary.totalRequests" "1"
          assert_json_field_equals "internal paginated summary clips the request to one calendar day" \
            "$HR_PAGINATED_REPORTS_WITH_REQUEST" ".summary.totalCalendarDays" "1"
          assert_json_field_equals "internal paginated summary excludes the inherited holiday workday" \
            "$HR_PAGINATED_REPORTS_WITH_REQUEST" ".summary.totalWorkdays" "0"
          assert_json_field_equals "internal paginated summary retains both holiday documents" \
            "$HR_PAGINATED_REPORTS_WITH_REQUEST" ".summary.publicHolidayDocuments" "2"
          run_capture_to_var HR_SCHEDULE_TEXT "get_hr_schedule(complete inherited holidays)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_hr_schedule\",\"arguments\":{\"department\":\"$HR_CHILD_ID\",\"startDate\":\"2026-09-04\",\"endDate\":\"2026-09-07\"}},\"id\":2}"
          assert_json_field_equals "HR schedule reports a complete scan" "$HR_SCHEDULE_TEXT" ".complete" "true"
          assert_json_field_equals "HR schedule includes both inherited holiday documents" \
            "$HR_SCHEDULE_TEXT" ".holidays | length" "2"
          run_capture_to_var HR_SUMMARY_TEXT "get_hr_summary_report(complete scan)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_hr_summary_report\",\"arguments\":{\"department\":\"$HR_CHILD_ID\",\"startDate\":\"2026-09-04\",\"endDate\":\"2026-09-07\"}},\"id\":2}"
          assert_json_field_equals "HR summary reports a complete scan" "$HR_SUMMARY_TEXT" ".complete" "true"
          run_test "list_hr_requests(exact filters)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_hr_requests\",\"arguments\":{\"employee\":\"$HR_STAFF_EMPLOYEE\",\"department\":\"$HR_CHILD_ID\",\"requestType\":$HR_REQUEST_TYPE_JSON,\"limit\":1}},\"id\":2}"
          run_capture_to_var HR_REQUEST_COMMENT_TEXT "add_hr_request_comment" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_hr_request_comment\",\"arguments\":{\"request\":\"$HR_CLEANUP_REQUEST_ID\",\"body\":\"Integration comment\"}},\"id\":2}"
          HR_REQUEST_COMMENT_ID=$(echo "$HR_REQUEST_COMMENT_TEXT" | jq -r '.commentId // empty' 2>/dev/null)
          restart_http_transport_if_needed "after HR request comment create" || exit 1
          if [ -n "$HR_REQUEST_COMMENT_ID" ]; then
            run_test "update_hr_request_comment" \
              "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_hr_request_comment\",\"arguments\":{\"request\":\"$HR_CLEANUP_REQUEST_ID\",\"commentId\":\"$HR_REQUEST_COMMENT_ID\",\"body\":\"Updated integration comment\"}},\"id\":2}"
            restart_http_transport_if_needed "after HR request comment update" || exit 1
          fi
          run_test "list_hr_request_comments" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_hr_request_comments\",\"arguments\":{\"request\":\"$HR_CLEANUP_REQUEST_ID\"}},\"id\":2}"
          run_capture_to_var HR_REQUEST_ATTACHMENT_TEXT "add_hr_request_attachment" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_hr_request_attachment\",\"arguments\":{\"request\":\"$HR_CLEANUP_REQUEST_ID\",\"filename\":\"issue-254.txt\",\"contentType\":\"text/plain\",\"data\":\"aXNzdWUtMjU0\"}},\"id\":2}"
          HR_REQUEST_ATTACHMENT_ID=$(echo "$HR_REQUEST_ATTACHMENT_TEXT" | jq -r '.attachmentId // empty' 2>/dev/null)
          restart_http_transport_if_needed "after HR request attachment create" || exit 1
          if [ -n "$HR_REQUEST_ATTACHMENT_ID" ]; then
            run_test "get_hr_request_attachment" \
              "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_hr_request_attachment\",\"arguments\":{\"request\":\"$HR_CLEANUP_REQUEST_ID\",\"attachmentId\":\"$HR_REQUEST_ATTACHMENT_ID\"}},\"id\":2}"
            run_test "update_hr_request_attachment" \
              "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_hr_request_attachment\",\"arguments\":{\"request\":\"$HR_CLEANUP_REQUEST_ID\",\"attachmentId\":\"$HR_REQUEST_ATTACHMENT_ID\",\"pinned\":true}},\"id\":2}"
            restart_http_transport_if_needed "after HR request attachment update" || exit 1
          fi
          run_test "list_hr_request_attachments" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_hr_request_attachments\",\"arguments\":{\"request\":\"$HR_CLEANUP_REQUEST_ID\"}},\"id\":2}"
          if [ -n "$HR_REQUEST_COMMENT_ID" ]; then
            run_test "delete_hr_request_comment" \
              "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_hr_request_comment\",\"arguments\":{\"request\":\"$HR_CLEANUP_REQUEST_ID\",\"commentId\":\"$HR_REQUEST_COMMENT_ID\"}},\"id\":2}"
          fi
          if [ -n "$HR_REQUEST_ATTACHMENT_ID" ]; then
            run_test "delete_hr_request_attachment" \
              "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_hr_request_attachment\",\"arguments\":{\"request\":\"$HR_CLEANUP_REQUEST_ID\",\"attachmentId\":\"$HR_REQUEST_ATTACHMENT_ID\"}},\"id\":2}"
          fi
          restart_http_transport_if_needed "after HR request media deletion" || exit 1
          run_test "update_hr_request" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_hr_request\",\"arguments\":{\"request\":\"$HR_CLEANUP_REQUEST_ID\",\"description\":\"Updated issue 254 fixture\"}},\"id\":2}"
          restart_http_transport_if_needed "after HR request update" || exit 1
          run_test "delete_hr_request" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_hr_request\",\"arguments\":{\"request\":\"$HR_CLEANUP_REQUEST_ID\"}},\"id\":2}"
          restart_http_transport_if_needed "after HR request delete" || exit 1
          run_expect_error_contains "get_hr_request(deleted fixture)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_hr_request\",\"arguments\":{\"request\":\"$HR_CLEANUP_REQUEST_ID\"}},\"id\":2}" "not found"
          if [ $? -eq 0 ]; then HR_CLEANUP_REQUEST_ID=""; fi
        fi
      else
        skip_test "HR request lifecycle" "no installed request type with a human-readable label available"
      fi
      if [ -n "$HR_CHILD_HOLIDAY_ID" ]; then
        run_test "delete_public_holiday(child)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_public_holiday\",\"arguments\":{\"holiday\":\"$HR_CHILD_HOLIDAY_ID\"}},\"id\":2}"
        restart_http_transport_if_needed "after child public holiday delete" || exit 1
        run_expect_error_contains "get_public_holiday(deleted fixture)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_public_holiday\",\"arguments\":{\"holiday\":\"$HR_CHILD_HOLIDAY_ID\"}},\"id\":2}" "not found"
        if [ $? -eq 0 ]; then HR_CLEANUP_HOLIDAY_IDS="$HR_PARENT_HOLIDAY_ID"; fi
      fi
      if [ -n "$HR_PARENT_HOLIDAY_ID" ]; then
        run_test "delete_public_holiday(parent cleanup)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_public_holiday\",\"arguments\":{\"holiday\":\"$HR_PARENT_HOLIDAY_ID\"}},\"id\":2}"
        restart_http_transport_if_needed "after parent public holiday cleanup" || exit 1
        run_expect_error_contains "get_public_holiday(parent cleanup confirmation)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_public_holiday\",\"arguments\":{\"holiday\":\"$HR_PARENT_HOLIDAY_ID\"}},\"id\":2}" "not found"
        if [ $? -eq 0 ]; then HR_CLEANUP_HOLIDAY_IDS=""; fi
      fi
      if [ -z "$HR_STAFF_RESTORE_EMPLOYEE" ]; then
        restart_http_transport_if_needed "after HR Staff restoration before delete preview" || exit 1
        run_capture_to_var HR_DELETE_PREVIEW "delete_department(preview cascade)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_department\",\"arguments\":{\"department\":\"$HR_CLEANUP_DEPARTMENT_ID\"}},\"id\":2}"
        if [ $? -eq 0 ]; then
          assert_json_field_equals "delete_department previews nested impact" "$HR_DELETE_PREVIEW" ".impact.subdepartments" "1"
          HR_DELETE_DESCENDANTS=$(echo "$HR_DELETE_PREVIEW" | jq -r '.impact.subdepartments' 2>/dev/null)
          HR_DELETE_STAFF=$(echo "$HR_DELETE_PREVIEW" | jq -r '.impact.assignedStaff' 2>/dev/null)
          run_test "delete_department(exact impact)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_department\",\"arguments\":{\"department\":\"$HR_CLEANUP_DEPARTMENT_ID\",\"execute\":true,\"expectedSubdepartments\":$HR_DELETE_DESCENDANTS,\"expectedAssignedStaff\":$HR_DELETE_STAFF}},\"id\":2}"
          restart_http_transport_if_needed "after HR department delete" || exit 1
          run_expect_error_contains "get_department(deleted fixture)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_department\",\"arguments\":{\"department\":\"$HR_CLEANUP_DEPARTMENT_ID\"}},\"id\":2}" \
            "not found"
          if [ $? -eq 0 ]; then
            HR_CLEANUP_DEPARTMENT_ID=""
          fi
        fi
      fi
      if ! cleanup_hr_artifacts; then
        fail_test "HR fixture cleanup" "restoration or deletion was not confirmed; cleanup markers retained"
      fi
    fi
  fi
else
  fail_test "HR Staff fixture" "authenticated workspace user did not resolve to an Employee"
fi
run_capture_to_var EMPLOYEES_TEXT "list_employees(employee position fixture)" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_employees","arguments":{"limit":200}},"id":2}'
if [ $? -eq 0 ]; then
  EMPLOYEE_POSITION_FIXTURE_ID="${HULY_EMPLOYEE_ID:-}"
  EMPLOYEE_POSITION_FIXTURE_EMAIL="${HULY_EMPLOYEE_EMAIL:-${HULY_EMAIL:-}}"
  if [ -n "$EMPLOYEE_POSITION_FIXTURE_ID" ]; then
    EMPLOYEE_POSITION_FIXTURE_MATCHES=$(printf '%s\n' "$EMPLOYEES_TEXT" | jq -r --arg id "$EMPLOYEE_POSITION_FIXTURE_ID" \
      '[.[] | select(.id == $id and .active == true)] | length' 2>/dev/null)
  elif [ -n "$EMPLOYEE_POSITION_FIXTURE_EMAIL" ]; then
    EMPLOYEE_POSITION_FIXTURE_MATCHES=$(printf '%s\n' "$EMPLOYEES_TEXT" | jq -r --arg email "$EMPLOYEE_POSITION_FIXTURE_EMAIL" \
      '[.[] | select(.email == $email and .active == true)] | length' 2>/dev/null)
  else
    EMPLOYEE_POSITION_FIXTURE_MATCHES=0
  fi

  if [ "$EMPLOYEE_POSITION_FIXTURE_MATCHES" != "1" ]; then
    fail_test "set_employee_position deterministic fixture" \
      "expected one active fixture selected by HULY_EMPLOYEE_ID or HULY_EMPLOYEE_EMAIL/HULY_EMAIL, found ${EMPLOYEE_POSITION_FIXTURE_MATCHES:-0}"
  else
    EMPLOYEE_ID=$(printf '%s\n' "$EMPLOYEES_TEXT" | jq -r --arg id "$EMPLOYEE_POSITION_FIXTURE_ID" --arg email "$EMPLOYEE_POSITION_FIXTURE_EMAIL" \
      '([.[] | select((($id != "" and .id == $id) or ($id == "" and .email == $email)) and .active == true)] | first | .id) // empty' 2>/dev/null)
    EMPLOYEE_ORIGINAL_POSITION_JSON=$(printf '%s\n' "$EMPLOYEES_TEXT" | jq -c --arg id "$EMPLOYEE_ID" \
      '([.[] | select(.id == $id and .active == true)] | first | (.position // null)) | if . == "" then null else . end' 2>/dev/null)
    EMPLOYEE_POSITION_CLEANUP_ID="$EMPLOYEE_ID"
    EMPLOYEE_POSITION_CLEANUP_ORIGINAL_POSITION_JSON="$EMPLOYEE_ORIGINAL_POSITION_JSON"
    EMPLOYEE_POSITION_CLEANUP_PENDING=true
    EMPLOYEE_ID_JSON=$(json_string "$EMPLOYEE_ID")

    run_expect_error "set_employee_position(requires position)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"set_employee_position\",\"arguments\":{\"employee\":{\"id\":$EMPLOYEE_ID_JSON}}},\"id\":2}"

    EMPLOYEE_TEST_POSITION_JSON=$(json_string "MCP Integration Position $RUN_ID")
    if run_capture_to_var_fresh EMPLOYEE_SET_TEXT "set_employee_position($EMPLOYEE_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"set_employee_position\",\"arguments\":{\"employee\":{\"id\":$EMPLOYEE_ID_JSON},\"position\":$EMPLOYEE_TEST_POSITION_JSON}},\"id\":2}"; then
      assert_json_field_equals "set_employee_position returns employee id" "$EMPLOYEE_SET_TEXT" ".id" "$EMPLOYEE_ID"
      assert_json_field_equals "set_employee_position sets position" "$EMPLOYEE_SET_TEXT" ".position" "MCP Integration Position $RUN_ID"
      if wait_for_employee_position "set_employee_position set persisted" "$EMPLOYEE_TEST_POSITION_JSON"; then
        if run_capture_to_var_fresh EMPLOYEE_CLEAR_TEXT "set_employee_position($EMPLOYEE_ID clear)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"set_employee_position\",\"arguments\":{\"employee\":{\"id\":$EMPLOYEE_ID_JSON},\"position\":null}},\"id\":2}"; then
          assert_json_field_equals "set_employee_position clears position" "$EMPLOYEE_CLEAR_TEXT" ".position" "null"
          wait_for_employee_position "set_employee_position clear persisted" "null"
        fi
      fi
    fi
    if ! restore_employee_position; then
      fail_test "set_employee_position restore" "employee position restore failed; exit cleanup will retry"
    fi
  fi
else
  fail_test "set_employee_position deterministic fixture" "list_employees did not return a fixture source"
fi
run_test "list_organizations" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_organizations","arguments":{"limit":3}},"id":2}'
run_test "get_user_profile" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_user_profile","arguments":{}},"id":2}'
run_test "list_contact_channel_providers" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_contact_channel_providers","arguments":{}},"id":2}'
run_capture_to_var SUPPORT_STATUS_TEXT "get_support_status(missing setup)" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_support_status","arguments":{}},"id":2}'
if [ $? -eq 0 ]; then
  assert_json_field_equals "get_support_status classifiers available" "$SUPPORT_STATUS_TEXT" ".supported" "true"
  assert_json_field_equals "get_support_status local setup" "$SUPPORT_STATUS_TEXT" ".setup.status" "missing"
  assert_json_field_equals "get_support_status status records array" "$SUPPORT_STATUS_TEXT" ".statusRecords | type" "array"
fi
run_capture_to_var WORKBENCH_APPLICATION_CLASS_TEXT "get_huly_class(workbench Application)" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_huly_class","arguments":{"class":"workbench:class:Application"}},"id":2}'
if [ $? -eq 0 ]; then
  assert_json_field_equals "Workbench Application classifier exists" "$WORKBENCH_APPLICATION_CLASS_TEXT" ".class.classId" "workbench:class:Application"
fi
run_capture_to_var WORKBENCH_NAV_CLASS_TEXT "get_huly_class(workbench ApplicationNavModel)" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_huly_class","arguments":{"class":"workbench:class:ApplicationNavModel"}},"id":2}'
if [ $? -eq 0 ]; then
  assert_json_field_equals "Workbench ApplicationNavModel classifier exists" "$WORKBENCH_NAV_CLASS_TEXT" ".class.classId" "workbench:class:ApplicationNavModel"
fi
run_capture_to_var WORKBENCH_APPLICATIONS_TEXT "list_workbench_applications(all declarations)" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_workbench_applications","arguments":{"limit":100}},"id":2}'
if [ $? -eq 0 ]; then
  assert_json_field_equals "list_workbench_applications returns declarations" "$WORKBENCH_APPLICATIONS_TEXT" ".applications | length > 0" "true"
  assert_json_field_equals "list_workbench_applications aliases are non-empty" "$WORKBENCH_APPLICATIONS_TEXT" "[.applications[].alias | length > 0] | all" "true"
  assert_json_field_equals "list_workbench_applications queries navigation models" "$WORKBENCH_APPLICATIONS_TEXT" "[.applications[].navigation | (.spaces | type) == \"array\" and (.specials | type) == \"array\" and (.groups | type) == \"array\"] | all" "true"
fi
run_capture_to_var WORKBENCH_PLUGIN_CONFIG_TEXT "list_huly_plugin_configurations(board disabled)" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_huly_plugin_configurations","arguments":{}},"id":2}'
if [ $? -eq 0 ]; then
  assert_json_field_equals "local Board plugin configuration is disabled" "$WORKBENCH_PLUGIN_CONFIG_TEXT" "[.pluginConfigurations[] | select(.pluginId == \"board\") | .enabled] | first" "false"
fi
run_capture_to_var WORKBENCH_DISABLED_APP_TEXT "list_workbench_applications(board despite disabled plugin)" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_workbench_applications","arguments":{"alias":"board"}},"id":2}'
if [ $? -eq 0 ]; then
  assert_json_field_equals "disabled plugin application remains a model declaration" "$WORKBENCH_DISABLED_APP_TEXT" ".applications[0].alias" "board"
  assert_json_field_equals "disabled plugin application is not filtered as capability" "$WORKBENCH_DISABLED_APP_TEXT" ".total" "1"
  assert_json_field_equals "list_workbench_applications returns caller preference state" "$WORKBENCH_DISABLED_APP_TEXT" ".applications[0].hiddenByPreference | type" "boolean"
fi
run_capture_to_var TELEGRAM_MESSAGES_TEXT "list_external_channel_messages(telegram missing channel)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_external_channel_messages\",\"arguments\":{\"provider\":\"telegram\",\"channel\":\"mcp-no-channel-$RUN_ID\",\"limit\":5}},\"id\":2}"
if [ $? -eq 0 ]; then
  assert_json_field_equals "list_external_channel_messages Telegram supported=false" "$TELEGRAM_MESSAGES_TEXT" ".supported" "false"
  assert_json_field_equals "list_external_channel_messages Telegram missing-channel reason" "$TELEGRAM_MESSAGES_TEXT" ".unsupportedReasonCode" "channel-unavailable"
  assert_json_field_equals "list_external_channel_messages Telegram messages array" "$TELEGRAM_MESSAGES_TEXT" ".messages | type" "array"
fi

if [ -n "$HR_STAFF_EMPLOYEE" ]; then
  run_capture_to_var_fresh PERSON_REPAIR_SUPPORTED_TEXT "repair_person_social_identities(linked Staff)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"repair_person_social_identities\",\"arguments\":{\"person\":{\"id\":\"$HR_STAFF_EMPLOYEE\"}}},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_field_equals "supported identity repair resolves linked Staff" "$PERSON_REPAIR_SUPPORTED_TEXT" ".personId" "$HR_STAFF_EMPLOYEE"
    assert_json_field_equals "supported identity repair starts from a cleanup-safe projection" "$PERSON_REPAIR_SUPPORTED_TEXT" ".created + .updated" "0"
    run_capture_to_var_fresh PERSON_REPAIR_IDEMPOTENT_TEXT "repair_person_social_identities(linked Staff second call)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"repair_person_social_identities\",\"arguments\":{\"person\":{\"id\":\"$HR_STAFF_EMPLOYEE\"}}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_equals "supported identity repair second call creates nothing" "$PERSON_REPAIR_IDEMPOTENT_TEXT" ".created" "0"
      assert_json_field_equals "supported identity repair second call updates nothing" "$PERSON_REPAIR_IDEMPOTENT_TEXT" ".updated" "0"
    fi
  fi
  run_capture_to_var_fresh PERSON_LINKED_ADMIN_TEXT "get_person_administration(linked Staff profile)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_person_administration\",\"arguments\":{\"person\":{\"id\":\"$HR_STAFF_EMPLOYEE\"}}},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_field_equals "linked Staff administration projects workspace membership" "$PERSON_LINKED_ADMIN_TEXT" ".workspaceMember.member" "true"
    assert_json_field_equals "linked Staff administration projects account profile" "$PERSON_LINKED_ADMIN_TEXT" ".profile.firstName | type" "string"
    if [ "$(printf '%s\n' "$PERSON_LINKED_ADMIN_TEXT" | jq -r '.contactStatuses | length' 2>/dev/null)" -gt 0 ]; then
      assert_json_field_equals "linked Staff administration projects populated contact status" "$PERSON_LINKED_ADMIN_TEXT" ".contactStatuses[0].name | type" "string"
    else
      skip_test "person administration populated contact status projection" "deterministic linked Staff has no Contact Status rows, and no first-class status creation tool exists for a cleanup-safe fixture"
    fi
  fi
else
  fail_test "person administration linked Staff fixture" "the deterministic authenticated Staff fixture was unavailable"
fi

PERSON_FIRST_NAME="IntTest-$RUN_ID"
PERSON_EMAIL="inttest-$RUN_ID@test.local"
PERSON_FIRST_NAME_JSON=$(json_string "$PERSON_FIRST_NAME")
PERSON_EMAIL_JSON=$(json_string "$PERSON_EMAIL")
PERSON_PHONE="+1555$RUN_ID"
PERSON_PHONE_UPDATED="+1666$RUN_ID"
PERSON_PHONE_JSON=$(json_string "$PERSON_PHONE")
PERSON_PHONE_UPDATED_JSON=$(json_string "$PERSON_PHONE_UPDATED")
PERSON_NAME_REGEX_JSON=$(json_string "%$PERSON_FIRST_NAME%")
PERSON_NAME_CASE_REGEX_JSON=$(json_string "%inttest-$RUN_ID%")
run_capture_to_var PERSON_TEXT "create_person" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_person\",\"arguments\":{\"firstName\":$PERSON_FIRST_NAME_JSON,\"lastName\":\"Person\",\"email\":$PERSON_EMAIL_JSON}},\"id\":2}"
if [ $? -eq 0 ]; then
  PERSON_ID=$(echo "$PERSON_TEXT" | jq -r '.id' 2>/dev/null)
  PERSON_ADMIN_CLEANUP_ID="$PERSON_ID"
  echo "  => person: $PERSON_ID"
  run_capture_to_var PERSON_REGEX_TEXT "list_persons(nameRegex SIMILAR TO contains)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_persons\",\"arguments\":{\"nameRegex\":$PERSON_NAME_REGEX_JSON,\"limit\":10}},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_array_contains "list_persons nameRegex SIMILAR TO contains includes person" "$PERSON_REGEX_TEXT" "map(.id)" "$PERSON_ID"
  fi

  run_capture_to_var PERSON_REGEX_CASE_TEXT "list_persons(nameRegex case-sensitive miss)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_persons\",\"arguments\":{\"nameRegex\":$PERSON_NAME_CASE_REGEX_JSON,\"limit\":10}},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_array_not_contains "list_persons nameRegex is case-sensitive" "$PERSON_REGEX_CASE_TEXT" "map(.id)" "$PERSON_ID"
  fi
	  run_test "update_person($PERSON_ID)" \
	    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_person\",\"arguments\":{\"personId\":\"$PERSON_ID\",\"city\":\"TestCity\"}},\"id\":2}"
	  run_capture_to_var_fresh PERSON_ADMIN_TEXT "get_person_administration($PERSON_ID)" \
	    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_person_administration\",\"arguments\":{\"person\":{\"id\":\"$PERSON_ID\"}}},\"id\":2}"
	  if [ $? -eq 0 ]; then
	    assert_json_field_equals "person administration resolves exact ID" "$PERSON_ADMIN_TEXT" ".personId" "$PERSON_ID"
	    assert_json_field_equals "person administration classifies identity mutation" "$PERSON_ADMIN_TEXT" '[.fieldClassifications[] | select(.field == "socialIdentityMutation") | .classification] | first' "unsupported"
	  fi
	  PERSON_EXACT_NAME="Person,$PERSON_FIRST_NAME"
	  PERSON_EXACT_NAME_JSON=$(json_string "$PERSON_EXACT_NAME")
	  run_capture_to_var_fresh PERSON_ADMIN_EMAIL_TEXT "get_person_administration(exact email)" \
	    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_person_administration\",\"arguments\":{\"person\":{\"email\":$PERSON_EMAIL_JSON}}},\"id\":2}"
	  if [ $? -eq 0 ]; then
	    assert_json_field_equals "person administration exact email resolves fixture" "$PERSON_ADMIN_EMAIL_TEXT" ".personId" "$PERSON_ID"
	  fi
	  run_capture_to_var_fresh PERSON_ADMIN_NAME_TEXT "get_person_administration(exact name)" \
	    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_person_administration\",\"arguments\":{\"person\":{\"name\":$PERSON_EXACT_NAME_JSON}}},\"id\":2}"
	  if [ $? -eq 0 ]; then
	    assert_json_field_equals "person administration exact name resolves fixture" "$PERSON_ADMIN_NAME_TEXT" ".personId" "$PERSON_ID"
	  fi
	  run_capture_to_var_fresh PERSON_DUPLICATE_TEXT "create_person(person administration ambiguity fixture)" \
	    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_person\",\"arguments\":{\"firstName\":$PERSON_FIRST_NAME_JSON,\"lastName\":\"Person\",\"email\":$PERSON_EMAIL_JSON}},\"id\":2}"
	  if [ $? -eq 0 ]; then
	    PERSON_DUPLICATE_ID=$(echo "$PERSON_DUPLICATE_TEXT" | jq -r '.id' 2>/dev/null)
	    PERSON_ADMIN_DUPLICATE_CLEANUP_ID="$PERSON_DUPLICATE_ID"
	    wait_for_error_contains "get_person_administration(ambiguous email)" \
	      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_person_administration\",\"arguments\":{\"person\":{\"email\":$PERSON_EMAIL_JSON}}},\"id\":2}" \
	      "matched 2 people"
	    wait_for_error_contains "get_person_administration(ambiguous name)" \
	      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_person_administration\",\"arguments\":{\"person\":{\"name\":$PERSON_EXACT_NAME_JSON}}},\"id\":2}" \
	      "matched 2 people"
	    if run_capture_to_var_fresh PERSON_DUPLICATE_DELETE_TEXT "delete_person(ambiguity fixture:$PERSON_DUPLICATE_ID)" \
	      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_person\",\"arguments\":{\"personId\":\"$PERSON_DUPLICATE_ID\"}},\"id\":2}"; then
	      if wait_for_error_contains "get_person(deleted ambiguity fixture:$PERSON_DUPLICATE_ID)" \
	        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_person\",\"arguments\":{\"personId\":\"$PERSON_DUPLICATE_ID\"}},\"id\":2}" \
	        "not found"; then
	        PERSON_ADMIN_DUPLICATE_CLEANUP_ID=""
	      fi
	    fi
	  fi
	  restart_http_transport_if_needed "before person identity repair verification" >/dev/null 2>&1
	  run_expect_error_contains "repair_person_social_identities(unlinked person)" \
	    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"repair_person_social_identities\",\"arguments\":{\"person\":{\"id\":\"$PERSON_ID\"}}},\"id\":2}" \
	    "not linked to an account personUuid"
	  run_capture_to_var SOCIAL_PROVIDER_TEXT "list_social_identity_providers" \
	    '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_social_identity_providers","arguments":{}},"id":2}'
	  if [ $? -eq 0 ]; then
	    assert_json_field_equals "social identity providers are discoverable" "$SOCIAL_PROVIDER_TEXT" "length > 0" "true"
	  fi
	  run_capture_to_var PERSON_NOTE_WORKSPACE_TEXT "get_workspace_info(person native-reference note)" \
	    '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_workspace_info","arguments":{}},"id":2}'
	  PERSON_NOTE_WORKSPACE_UUID=$(echo "$PERSON_NOTE_WORKSPACE_TEXT" | jq -r '.uuid // empty' 2>/dev/null)
	  PERSON_NOTE_LABEL_ENCODED=$(url_encode "$PERSON_EXACT_NAME")
	  PERSON_NOTE_URL="${HULY_URL%/}/browse?workspace=${PERSON_NOTE_WORKSPACE_UUID}&_class=contact%3Aclass%3APerson&_id=${PERSON_ID}&label=${PERSON_NOTE_LABEL_ENCODED}"
	  PERSON_NOTE_BODY="Person note [${PERSON_EXACT_NAME}](${PERSON_NOTE_URL})"
	  PERSON_NOTE_BODY_JSON=$(json_string "$PERSON_NOTE_BODY")
	  run_capture_to_var_fresh PERSON_COMMENT_TEXT "add_person_comment($PERSON_ID)" \
	    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_person_comment\",\"arguments\":{\"person\":{\"id\":\"$PERSON_ID\"},\"body\":$PERSON_NOTE_BODY_JSON}},\"id\":2}"
	  if [ $? -eq 0 ]; then
	    PERSON_COMMENT_ID=$(echo "$PERSON_COMMENT_TEXT" | jq -r '.commentId' 2>/dev/null)
	    PERSON_ADMIN_COMMENT_CLEANUP_ID="$PERSON_COMMENT_ID"
	    run_capture_to_var_fresh PERSON_COMMENTS_TEXT "list_person_comments($PERSON_ID)" \
	      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_person_comments\",\"arguments\":{\"person\":{\"id\":\"$PERSON_ID\"}}},\"id\":2}"
	    if [ $? -eq 0 ]; then
	      assert_json_array_contains "person notes preserve native attachment" "$PERSON_COMMENTS_TEXT" ".comments | map(.id)" "$PERSON_COMMENT_ID"
	      assert_json_field_contains "person notes round-trip native reference label" "$PERSON_COMMENTS_TEXT" ".comments[0].body" "$PERSON_EXACT_NAME"
	      assert_json_field_contains "person notes round-trip native reference target" "$PERSON_COMMENTS_TEXT" ".comments[0].body" "$PERSON_ID"
	    fi
	    if run_capture_to_var_fresh PERSON_COMMENT_DELETE_TEXT "delete_person_comment($PERSON_COMMENT_ID)" \
	      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_person_comment\",\"arguments\":{\"person\":{\"id\":\"$PERSON_ID\"},\"commentId\":\"$PERSON_COMMENT_ID\"}},\"id\":2}"; then
	      if run_capture_to_var_fresh PERSON_COMMENTS_AFTER_DELETE_TEXT "list_person_comments(after delete:$PERSON_ID)" \
	        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_person_comments\",\"arguments\":{\"person\":{\"id\":\"$PERSON_ID\"}}},\"id\":2}" \
	        && ! printf '%s\n' "$PERSON_COMMENTS_AFTER_DELETE_TEXT" | jq -e --arg id "$PERSON_COMMENT_ID" '.comments[]? | select(.id == $id)' >/dev/null 2>&1; then
	        PERSON_ADMIN_COMMENT_CLEANUP_ID=""
	      fi
	    fi
	  fi
	  run_capture_to_var_fresh PERSON_ATTACHMENT_TEXT "add_person_attachment($PERSON_ID)" \
	    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_person_attachment\",\"arguments\":{\"person\":{\"id\":\"$PERSON_ID\"},\"filename\":\"person-$RUN_ID.txt\",\"contentType\":\"text/plain\",\"data\":\"aGVsbG8=\"}},\"id\":2}"
	  if [ $? -eq 0 ]; then
	    PERSON_ATTACHMENT_ID=$(echo "$PERSON_ATTACHMENT_TEXT" | jq -r '.attachmentId' 2>/dev/null)
	    PERSON_ADMIN_ATTACHMENT_CLEANUP_ID="$PERSON_ATTACHMENT_ID"
	    run_capture_to_var_fresh PERSON_ATTACHMENTS_TEXT "list_person_attachments($PERSON_ID)" \
	      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_person_attachments\",\"arguments\":{\"person\":{\"id\":\"$PERSON_ID\"}}},\"id\":2}"
	    if [ $? -eq 0 ]; then
	      assert_json_array_contains "person attachment retains native parent" "$PERSON_ATTACHMENTS_TEXT" ".attachments | map(.id)" "$PERSON_ATTACHMENT_ID"
	    fi
	    run_capture_to_var_fresh PERSON_ATTACHMENT_UPDATE_TEXT "update_person_attachment($PERSON_ATTACHMENT_ID)" \
	      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_person_attachment\",\"arguments\":{\"person\":{\"id\":\"$PERSON_ID\"},\"attachmentId\":\"$PERSON_ATTACHMENT_ID\",\"pinned\":true}},\"id\":2}"
	    if run_capture_to_var_fresh PERSON_ATTACHMENT_DELETE_TEXT "delete_person_attachment($PERSON_ATTACHMENT_ID)" \
	      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_person_attachment\",\"arguments\":{\"person\":{\"id\":\"$PERSON_ID\"},\"attachmentId\":\"$PERSON_ATTACHMENT_ID\"}},\"id\":2}"; then
	      if run_capture_to_var_fresh PERSON_ATTACHMENTS_AFTER_DELETE_TEXT "list_person_attachments(after delete:$PERSON_ID)" \
	        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_person_attachments\",\"arguments\":{\"person\":{\"id\":\"$PERSON_ID\"}}},\"id\":2}" \
	        && ! printf '%s\n' "$PERSON_ATTACHMENTS_AFTER_DELETE_TEXT" | jq -e --arg id "$PERSON_ATTACHMENT_ID" '.attachments[]? | select(.id == $id)' >/dev/null 2>&1; then
	        PERSON_ADMIN_ATTACHMENT_CLEANUP_ID=""
	      fi
	    fi
	  fi
	  run_capture_to_var PERSON_CHANNEL_TEXT "add_person_channel($PERSON_ID phone)" \
	    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_person_channel\",\"arguments\":{\"person\":\"$PERSON_ID\",\"provider\":\"phone\",\"value\":$PERSON_PHONE_JSON}},\"id\":2}"
	  if [ $? -eq 0 ]; then
	    PERSON_CHANNEL_ID=$(echo "$PERSON_CHANNEL_TEXT" | jq -r '.channel.channelId' 2>/dev/null)
	    assert_json_field_equals "add_person_channel added" "$PERSON_CHANNEL_TEXT" ".added" "true"
	    run_capture_to_var PERSON_CHANNEL_AGAIN_TEXT "add_person_channel($PERSON_ID phone idempotent)" \
	      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_person_channel\",\"arguments\":{\"person\":\"$PERSON_ID\",\"provider\":\"phone\",\"value\":$PERSON_PHONE_JSON}},\"id\":2}"
	    if [ $? -eq 0 ]; then
	      assert_json_field_equals "add_person_channel idempotent added=false" "$PERSON_CHANNEL_AGAIN_TEXT" ".added" "false"
	    fi
	    run_capture_to_var PERSON_CHANNELS_TEXT "list_person_channels($PERSON_ID)" \
	      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_person_channels\",\"arguments\":{\"person\":\"$PERSON_ID\"}},\"id\":2}"
	    if [ $? -eq 0 ]; then
	      assert_json_array_contains "list_person_channels includes phone channel" "$PERSON_CHANNELS_TEXT" ".channels | map(.channelId)" "$PERSON_CHANNEL_ID"
	    fi
	    run_capture_to_var PERSON_GET_TEXT "get_person($PERSON_ID channels)" \
	      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_person\",\"arguments\":{\"personId\":\"$PERSON_ID\"}},\"id\":2}"
	    if [ $? -eq 0 ]; then
	      assert_json_array_contains "get_person includes channelId" "$PERSON_GET_TEXT" ".channels | map(.channelId)" "$PERSON_CHANNEL_ID"
	    fi
	    run_test "update_person_channel($PERSON_CHANNEL_ID)" \
	      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_person_channel\",\"arguments\":{\"person\":\"$PERSON_ID\",\"channelId\":\"$PERSON_CHANNEL_ID\",\"newValue\":$PERSON_PHONE_UPDATED_JSON}},\"id\":2}"
	    run_test "remove_person_channel($PERSON_ID provider+value)" \
	      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"remove_person_channel\",\"arguments\":{\"person\":\"$PERSON_ID\",\"provider\":\"phone\",\"value\":$PERSON_PHONE_UPDATED_JSON}},\"id\":2}"
	  fi
	  if [ -z "$PERSON_ADMIN_COMMENT_CLEANUP_ID" ] && [ -z "$PERSON_ADMIN_ATTACHMENT_CLEANUP_ID" ]; then
	    PERSON_MERGE_SURVIVOR_FIRST_NAME="MergeSurvivor-$RUN_ID"
	    PERSON_MERGE_SURVIVOR_EMAIL="merge-survivor-$RUN_ID@test.local"
	    run_capture_to_var_fresh PERSON_MERGE_SURVIVOR_TEXT "create_person(person merge survivor)" \
	      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_person\",\"arguments\":{\"firstName\":\"$PERSON_MERGE_SURVIVOR_FIRST_NAME\",\"lastName\":\"Person\",\"email\":\"$PERSON_MERGE_SURVIVOR_EMAIL\"}},\"id\":2}"
	    if [ $? -eq 0 ]; then
	      PERSON_MERGE_SURVIVOR_ID=$(printf '%s\n' "$PERSON_MERGE_SURVIVOR_TEXT" | jq -r '.id' 2>/dev/null)
	      PERSON_MERGE_SURVIVOR_CLEANUP_ID="$PERSON_MERGE_SURVIVOR_ID"
	      run_capture_to_var_fresh PERSON_MERGE_COMMENT_TEXT "add_person_comment(person merge source)" \
	        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_person_comment\",\"arguments\":{\"person\":{\"id\":\"$PERSON_ID\"},\"body\":\"Merge-preserved note $RUN_ID\"}},\"id\":2}"
	      PERSON_MERGE_COMMENT_ID=$(printf '%s\n' "$PERSON_MERGE_COMMENT_TEXT" | jq -r '.commentId // empty' 2>/dev/null)
	      PERSON_ADMIN_COMMENT_CLEANUP_ID="$PERSON_MERGE_COMMENT_ID"
	      run_capture_to_var_fresh PERSON_MERGE_ATTACHMENT_TEXT "add_person_attachment(person merge source)" \
	        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_person_attachment\",\"arguments\":{\"person\":{\"id\":\"$PERSON_ID\"},\"filename\":\"merge-$RUN_ID.txt\",\"contentType\":\"text/plain\",\"data\":\"bWVyZ2U=\"}},\"id\":2}"
	      PERSON_MERGE_ATTACHMENT_ID=$(printf '%s\n' "$PERSON_MERGE_ATTACHMENT_TEXT" | jq -r '.attachmentId // empty' 2>/dev/null)
	      PERSON_ADMIN_ATTACHMENT_CLEANUP_ID="$PERSON_MERGE_ATTACHMENT_ID"
	      run_expect_error_contains "merge_people(self merge rejected)" \
	        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"merge_people\",\"arguments\":{\"source\":{\"id\":\"$PERSON_ID\"},\"survivor\":{\"id\":\"$PERSON_ID\"}}},\"id\":2}" \
	        "Choose two distinct people"
	      run_capture_to_var_fresh PERSON_MERGE_PREVIEW_TEXT "merge_people(preflight)" \
	        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"merge_people\",\"arguments\":{\"source\":{\"id\":\"$PERSON_ID\"},\"survivor\":{\"id\":\"$PERSON_MERGE_SURVIVOR_ID\"}}},\"id\":2}"
	      if [ $? -eq 0 ]; then
	        assert_json_field_equals "person merge preflight is non-destructive" "$PERSON_MERGE_PREVIEW_TEXT" ".executed" "false"
	        assert_json_field_equals "person merge preflight reports comments" "$PERSON_MERGE_PREVIEW_TEXT" ".impact.comments >= 1" "true"
	        assert_json_field_equals "person merge preflight reports attachments" "$PERSON_MERGE_PREVIEW_TEXT" ".impact.attachments >= 1" "true"
	        assert_json_field_equals "person merge preflight reports channels" "$PERSON_MERGE_PREVIEW_TEXT" ".impact.channels >= 1" "true"
	        assert_json_field_equals "person merge preflight binds canonical snapshot digests" "$PERSON_MERGE_PREVIEW_TEXT" ".impact.references | length > 0 and all(.snapshotDigest | test(\"^[0-9a-f]{64}$\"))" "true"
	        PERSON_MERGE_TOKEN=$(printf '%s\n' "$PERSON_MERGE_PREVIEW_TEXT" | jq -r '.preflightToken' 2>/dev/null)
	        run_expect_error_contains "merge_people(stale preflight rejected)" \
	          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"merge_people\",\"arguments\":{\"source\":{\"id\":\"$PERSON_ID\"},\"survivor\":{\"id\":\"$PERSON_MERGE_SURVIVOR_ID\"},\"execute\":true,\"expectedPreflightToken\":\"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff\"}},\"id\":2}" \
	          "changed since preflight"
	        run_capture_to_var_fresh PERSON_MERGE_EXECUTE_TEXT "merge_people(execute)" \
	          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"merge_people\",\"arguments\":{\"source\":{\"id\":\"$PERSON_ID\"},\"survivor\":{\"id\":\"$PERSON_MERGE_SURVIVOR_ID\"},\"execute\":true,\"expectedPreflightToken\":\"$PERSON_MERGE_TOKEN\"}},\"id\":2}"
	        if [ $? -eq 0 ]; then
	          assert_json_field_equals "person merge executed" "$PERSON_MERGE_EXECUTE_TEXT" ".executed" "true"
	          PERSON_MERGE_SOURCE_CLEANUP_ID="$PERSON_ID"
	          PERSON_ADMIN_CLEANUP_ID="$PERSON_MERGE_SURVIVOR_ID"
	          PERSON_MERGE_SURVIVOR_CLEANUP_ID=""
	          run_capture_to_var_fresh PERSON_MERGED_COMMENTS_TEXT "list_person_comments(person merge survivor)" \
	            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_person_comments\",\"arguments\":{\"person\":{\"id\":\"$PERSON_MERGE_SURVIVOR_ID\"}}},\"id\":2}"
	          assert_json_array_contains "person merge preserves native comment" "$PERSON_MERGED_COMMENTS_TEXT" ".comments | map(.id)" "$PERSON_MERGE_COMMENT_ID"
	          run_capture_to_var_fresh PERSON_MERGED_ATTACHMENTS_TEXT "list_person_attachments(person merge survivor)" \
	            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_person_attachments\",\"arguments\":{\"person\":{\"id\":\"$PERSON_MERGE_SURVIVOR_ID\"}}},\"id\":2}"
	          assert_json_array_contains "person merge preserves native attachment" "$PERSON_MERGED_ATTACHMENTS_TEXT" ".attachments | map(.id)" "$PERSON_MERGE_ATTACHMENT_ID"
	        fi
	      fi
	    fi
	    cleanup_person_admin_artifacts || true
	    cleanup_retained_merge_source || true
	  else
	    fail_test "delete_person($PERSON_ID)" "child cleanup was not confirmed; preserving parent for EXIT cleanup"
	  fi
fi

skip_test "get_person" "covered by create+update cycle"
ORG_SUFFIX="$(date +%s)-$$"
ORG_NAME="IntTest Org $ORG_SUFFIX"
ORG_UPDATED_NAME="IntTest Org Updated $ORG_SUFFIX"
ORG_DESC="Integration org $ORG_SUFFIX"
ORG_MEMBER_EMAIL="inttest-org-$ORG_SUFFIX@test.local"
ORG_CHANNEL_EMAIL="org-$ORG_SUFFIX@test.local"
ORG_CHANNEL_UPDATED_EMAIL="org-updated-$ORG_SUFFIX@test.local"

run_capture_to_var ORG_PERSON_TEXT "create_person(for_org)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_person\",\"arguments\":{\"firstName\":\"Org\",\"lastName\":\"Member\",\"email\":\"$ORG_MEMBER_EMAIL\"}},\"id\":2}"
if [ $? -eq 0 ]; then
  ORG_PERSON_ID=$(echo "$ORG_PERSON_TEXT" | jq -r '.id' 2>/dev/null)
  echo "  => org person: $ORG_PERSON_ID"

  ORG_NAME_JSON=$(json_string "$ORG_NAME")
  ORG_UPDATED_NAME_JSON=$(json_string "$ORG_UPDATED_NAME")
  ORG_DESC_JSON=$(json_string "$ORG_DESC")
  ORG_MEMBER_EMAIL_JSON=$(json_string "$ORG_MEMBER_EMAIL")
	  ORG_CHANNEL_EMAIL_JSON=$(json_string "$ORG_CHANNEL_EMAIL")
	  ORG_CHANNEL_UPDATED_EMAIL_JSON=$(json_string "$ORG_CHANNEL_UPDATED_EMAIL")

  run_expect_error "create_organization(rejects_missing_member)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_organization\",\"arguments\":{\"name\":\"IntTest Missing Member $ORG_SUFFIX\",\"members\":[\"missing-$ORG_SUFFIX@test.local\"]}},\"id\":2}"

  run_capture_to_var ORG_TEXT "create_organization" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_organization\",\"arguments\":{\"name\":$ORG_NAME_JSON,\"members\":[$ORG_MEMBER_EMAIL_JSON]}},\"id\":2}"
  if [ $? -eq 0 ]; then
    ORG_ID=$(echo "$ORG_TEXT" | jq -r '.id' 2>/dev/null)
    echo "  => organization: $ORG_ID"

    run_test "get_organization($ORG_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_organization\",\"arguments\":{\"identifier\":\"$ORG_ID\"}},\"id\":2}"
    run_test "get_organization(by_name:$ORG_NAME)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_organization\",\"arguments\":{\"identifier\":$ORG_NAME_JSON}},\"id\":2}"
    run_test "list_organization_members($ORG_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_organization_members\",\"arguments\":{\"organizationId\":\"$ORG_ID\"}},\"id\":2}"
    run_test "list_person_organizations($ORG_PERSON_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_person_organizations\",\"arguments\":{\"personId\":\"$ORG_PERSON_ID\"}},\"id\":2}"
    run_test "update_organization($ORG_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_organization\",\"arguments\":{\"identifier\":\"$ORG_ID\",\"name\":$ORG_UPDATED_NAME_JSON,\"city\":\"TestCity\",\"description\":$ORG_DESC_JSON}},\"id\":2}"
	    run_capture_to_var ORG_CHANNEL_TEXT "add_organization_channel($ORG_ID)" \
	      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_organization_channel\",\"arguments\":{\"organizationId\":\"$ORG_ID\",\"provider\":\"email\",\"value\":$ORG_CHANNEL_EMAIL_JSON}},\"id\":2}"
	    if [ $? -eq 0 ]; then
	      ORG_CHANNEL_ID=$(echo "$ORG_CHANNEL_TEXT" | jq -r '.channel.channelId' 2>/dev/null)
	      assert_json_field_equals "add_organization_channel added" "$ORG_CHANNEL_TEXT" ".added" "true"
	      run_capture_to_var ORG_CHANNEL_AGAIN_TEXT "add_organization_channel($ORG_ID idempotent)" \
	        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_organization_channel\",\"arguments\":{\"organizationId\":\"$ORG_ID\",\"provider\":\"email\",\"value\":$ORG_CHANNEL_EMAIL_JSON}},\"id\":2}"
	      if [ $? -eq 0 ]; then
	        assert_json_field_equals "add_organization_channel idempotent added=false" "$ORG_CHANNEL_AGAIN_TEXT" ".added" "false"
	      fi
	      run_capture_to_var ORG_CHANNELS_TEXT "list_organization_channels($ORG_ID)" \
	        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_organization_channels\",\"arguments\":{\"organizationId\":\"$ORG_ID\"}},\"id\":2}"
	      if [ $? -eq 0 ]; then
	        assert_json_array_contains "list_organization_channels includes email channel" "$ORG_CHANNELS_TEXT" ".channels | map(.channelId)" "$ORG_CHANNEL_ID"
	      fi
	      run_capture_to_var GMAIL_MESSAGES_TEXT "list_external_channel_messages(gmail:$ORG_CHANNEL_ID)" \
	        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_external_channel_messages\",\"arguments\":{\"provider\":\"gmail\",\"channel\":\"$ORG_CHANNEL_ID\",\"limit\":5}},\"id\":2}"
	      if [ $? -eq 0 ]; then
	        assert_json_field_equals "list_external_channel_messages Gmail unsupported without authoritative runtime" "$GMAIL_MESSAGES_TEXT" ".supported" "false"
	        assert_json_field_equals "list_external_channel_messages Gmail reason code" "$GMAIL_MESSAGES_TEXT" ".unsupportedReasonCode" "runtime-unverifiable"
	        assert_json_field_equals "list_external_channel_messages Gmail channel" "$GMAIL_MESSAGES_TEXT" ".channel" "$ORG_CHANNEL_ID"
	        assert_json_field_equals "list_external_channel_messages Gmail messages empty" "$GMAIL_MESSAGES_TEXT" ".messages | length" "0"
	      fi
	      run_capture_to_var ORG_GET_TEXT "get_organization($ORG_ID channels)" \
	        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_organization\",\"arguments\":{\"identifier\":\"$ORG_ID\"}},\"id\":2}"
	      if [ $? -eq 0 ]; then
	        assert_json_array_contains "get_organization includes channelId" "$ORG_GET_TEXT" ".channels | map(.channelId)" "$ORG_CHANNEL_ID"
	      fi
	      run_test "update_organization_channel($ORG_CHANNEL_ID)" \
	        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_organization_channel\",\"arguments\":{\"organizationId\":\"$ORG_ID\",\"channelId\":\"$ORG_CHANNEL_ID\",\"newValue\":$ORG_CHANNEL_UPDATED_EMAIL_JSON}},\"id\":2}"
	      run_test "remove_organization_channel($ORG_ID provider+value)" \
	        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"remove_organization_channel\",\"arguments\":{\"organizationId\":\"$ORG_ID\",\"provider\":\"email\",\"value\":$ORG_CHANNEL_UPDATED_EMAIL_JSON}},\"id\":2}"
	    fi
    run_test "remove_organization_member($ORG_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"remove_organization_member\",\"arguments\":{\"organizationId\":\"$ORG_ID\",\"personIdentifier\":\"$ORG_PERSON_ID\"}},\"id\":2}"
    run_test "add_organization_member($ORG_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_organization_member\",\"arguments\":{\"organizationId\":\"$ORG_ID\",\"personIdentifier\":$ORG_MEMBER_EMAIL_JSON}},\"id\":2}"
    run_test "make_organization_customer($ORG_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"make_organization_customer\",\"arguments\":{\"identifier\":\"$ORG_ID\"}},\"id\":2}"
    run_test "delete_organization($ORG_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_organization\",\"arguments\":{\"identifier\":\"$ORG_ID\"}},\"id\":2}"
  fi

  run_test "delete_person(org_member:$ORG_PERSON_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_person\",\"arguments\":{\"personId\":\"$ORG_PERSON_ID\"}},\"id\":2}"
else
  skip_test "organization_mutations" "could not create cleanup-safe member person"
fi
echo ""

##############################
# 11. CALENDAR & TIME
##############################
echo "=== 11. Calendar & Time ==="
run_test "list_events" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_events","arguments":{"limit":3}},"id":2}'
run_test "list_work_slots" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_work_slots","arguments":{"limit":3}},"id":2}'
run_test "list_time_spend_reports" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_time_spend_reports\",\"arguments\":{\"project\":\"$PROJECT\",\"limit\":3}},\"id\":2}"
run_test "list_recurring_events" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_recurring_events","arguments":{"limit":3}},"id":2}'
run_capture_to_var CALENDARS_TEXT "list_calendars" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_calendars","arguments":{}},"id":2}'
CALENDAR_ID=""
if [ $? -eq 0 ]; then
  CALENDAR_ID=$(echo "$CALENDARS_TEXT" | jq -r '((map(select(.isPrimary == true)) | .[0]) // .[0]).calendarId // empty' 2>/dev/null)
  if [ -n "$CALENDAR_ID" ]; then
    echo "  => calendar: $CALENDAR_ID"
  else
    skip_test "create_event(explicit_calendar)" "list_calendars returned no writable calendar"
  fi
fi

# Event CRUD
run_capture_to_var EVT_TEXT "create_event" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"create_event","arguments":{"title":"IntTest Event","date":1777000000000,"dueDate":1777003600000}},"id":2}'
if [ $? -eq 0 ]; then
  EVT_ID=$(echo "$EVT_TEXT" | jq -r '.eventId' 2>/dev/null)
  echo "  => event: $EVT_ID"
  if [ -n "$EVT_ID" ] && [ "$EVT_ID" != "null" ]; then
    run_test "get_event($EVT_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_event\",\"arguments\":{\"eventId\":\"$EVT_ID\"}},\"id\":2}"
    run_test "update_event($EVT_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_event\",\"arguments\":{\"eventId\":\"$EVT_ID\",\"title\":\"Updated Event\"}},\"id\":2}"
    run_test "delete_event($EVT_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_event\",\"arguments\":{\"eventId\":\"$EVT_ID\"}},\"id\":2}"
  else
    skip_test "get_event" "no eventId in response"
    skip_test "update_event" "no eventId in response"
    skip_test "delete_event" "no eventId in response"
  fi
fi

if [ -n "$CALENDAR_ID" ]; then
  EXPLICIT_EVT_PAYLOAD=$(jq -cn \
    --arg calendarId "$CALENDAR_ID" \
    '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"create_event","arguments":{"title":"IntTest Explicit Calendar Event","date":1777007200000,"dueDate":1777010800000,"calendarId":$calendarId}},"id":2}')
  run_capture_to_var EXPLICIT_EVT_TEXT "create_event(explicit_calendar)" "$EXPLICIT_EVT_PAYLOAD"
  if [ $? -eq 0 ]; then
    EXPLICIT_EVT_ID=$(echo "$EXPLICIT_EVT_TEXT" | jq -r '.eventId' 2>/dev/null)
    echo "  => explicit calendar event: $EXPLICIT_EVT_ID"
    if [ -n "$EXPLICIT_EVT_ID" ] && [ "$EXPLICIT_EVT_ID" != "null" ]; then
      run_capture_to_var GET_EXPLICIT_EVT_TEXT "get_event(explicit_calendar:$EXPLICIT_EVT_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_event\",\"arguments\":{\"eventId\":\"$EXPLICIT_EVT_ID\"}},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_field_equals "get_event explicit calendarId matches" "$GET_EXPLICIT_EVT_TEXT" ".calendarId" "$CALENDAR_ID"
      fi
      run_test "delete_event(explicit_calendar:$EXPLICIT_EVT_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_event\",\"arguments\":{\"eventId\":\"$EXPLICIT_EVT_ID\"}},\"id\":2}"
    else
      skip_test "get_event(explicit_calendar)" "no eventId in response"
      skip_test "delete_event(explicit_calendar)" "no eventId in response"
    fi
  fi
fi

# Planner ToDo lifecycle + work slots
TODO_TITLE="IntTest Planner Todo $RUN_ID"
TODO_TITLE_JSON=$(json_string "$TODO_TITLE")
run_capture_to_var TODO_TEXT "create_todo(personal)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_todo\",\"arguments\":{\"title\":$TODO_TITLE_JSON,\"description\":\"planner integration todo\",\"priority\":\"medium\",\"visibility\":\"private\"}},\"id\":2}"
if [ $? -eq 0 ]; then
  TODO_ID=$(echo "$TODO_TEXT" | jq -r '.todoId // empty' 2>/dev/null)
  echo "  => todo: $TODO_ID"
  if [ -n "$TODO_ID" ]; then
    run_capture_to_var LIST_TODOS_TEXT "list_todos($TODO_TITLE)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_todos\",\"arguments\":{\"titleSearch\":$TODO_TITLE_JSON,\"limit\":10}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_array_contains "list_todos includes $TODO_ID" "$LIST_TODOS_TEXT" "map(.id)" "$TODO_ID"
    fi
    TODO_LABEL_TITLE="inttest-todo-label-$RUN_ID"
    TODO_LABEL_TITLE_JSON=$(json_string "$TODO_LABEL_TITLE")
    run_capture_to_var ADD_TODO_LABEL_TEXT "add_todo_label($TODO_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_todo_label\",\"arguments\":{\"locator\":{\"todoId\":\"$TODO_ID\"},\"label\":$TODO_LABEL_TITLE_JSON,\"color\":6}},\"id\":2}"
    if [ $? -eq 0 ]; then
      TODO_LABEL_ID=$(echo "$ADD_TODO_LABEL_TEXT" | jq -r '.label // empty' 2>/dev/null)
      assert_json_field_equals "add_todo_label($TODO_ID) attached" "$ADD_TODO_LABEL_TEXT" '.attached' 'true'
      assert_json_field_equals "add_todo_label($TODO_ID) created definition" "$ADD_TODO_LABEL_TEXT" '.labelCreated' 'true'
      sleep 2
      run_capture_to_var READD_TODO_LABEL_TEXT "add_todo_label($TODO_ID idempotent)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_todo_label\",\"arguments\":{\"locator\":{\"todoId\":\"$TODO_ID\"},\"label\":$TODO_LABEL_TITLE_JSON}},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_field_equals "add_todo_label($TODO_ID) is idempotent" "$READD_TODO_LABEL_TEXT" '.attached' 'false'
      fi
      run_capture_to_var TODO_LABELS_TEXT "list_todo_labels($TODO_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_todo_labels\",\"arguments\":{\"locator\":{\"todoId\":\"$TODO_ID\"}}},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_array_contains "list_todo_labels($TODO_ID) includes label" "$TODO_LABELS_TEXT" '.labels | map(.title)' "$TODO_LABEL_TITLE"
      fi
      run_test "list_todo_label_definitions($TODO_LABEL_TITLE)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_todo_label_definitions\",\"arguments\":{\"titleSearch\":$TODO_LABEL_TITLE_JSON}},\"id\":2}"
      run_capture_to_var REMOVE_TODO_LABEL_TEXT "remove_todo_label($TODO_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"remove_todo_label\",\"arguments\":{\"locator\":{\"todoId\":\"$TODO_ID\"},\"label\":$TODO_LABEL_TITLE_JSON}},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_field_equals "remove_todo_label($TODO_ID) detached" "$REMOVE_TODO_LABEL_TEXT" '.detached' 'true'
      fi
      if [ -n "$TODO_LABEL_ID" ]; then
        run_test "delete_tag(todo:$TODO_LABEL_ID cleanup)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_tag\",\"arguments\":{\"targetClass\":\"time:class:ToDo\",\"tag\":\"$TODO_LABEL_ID\"}},\"id\":2}"
      fi
    fi
    run_capture_to_var GET_TODO_TEXT "get_todo($TODO_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_todo\",\"arguments\":{\"locator\":{\"todoId\":\"$TODO_ID\"}}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_equals "get_todo($TODO_ID) returns id" "$GET_TODO_TEXT" ".id" "$TODO_ID"
      assert_json_field_equals "get_todo($TODO_ID) priority before update" "$GET_TODO_TEXT" ".priority" "medium"
    fi
    run_capture_to_var UPDATE_TODO_TEXT "update_todo($TODO_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_todo\",\"arguments\":{\"locator\":{\"todoId\":\"$TODO_ID\"},\"priority\":\"high\",\"dueDate\":1777020000000}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_equals "update_todo($TODO_ID) updated" "$UPDATE_TODO_TEXT" ".updated" "true"
      run_capture_to_var GET_UPDATED_TODO_TEXT "get_todo($TODO_ID after update)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_todo\",\"arguments\":{\"locator\":{\"todoId\":\"$TODO_ID\"}}},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_field_equals "get_todo($TODO_ID) priority after update" "$GET_UPDATED_TODO_TEXT" ".priority" "high"
        assert_json_field_equals "get_todo($TODO_ID) dueDate after update" "$GET_UPDATED_TODO_TEXT" ".dueDate" "1777020000000"
      fi
    fi

    run_capture_to_var SCHEDULE_TEXT "schedule_todo($TODO_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"schedule_todo\",\"arguments\":{\"locator\":{\"todoId\":\"$TODO_ID\"},\"date\":1777020000000,\"dueDate\":1777023600000}},\"id\":2}"
    SCHEDULE_SLOT_ID=$(echo "$SCHEDULE_TEXT" | jq -r '.workSlotId // empty' 2>/dev/null)
    if [ -n "$SCHEDULE_SLOT_ID" ]; then
      if PLANNER_SLOT_RESULT=$(pnpm exec tsx scripts/integration-planner-work-slot.ts \
        --slot "$SCHEDULE_SLOT_ID" --todo "$TODO_ID" --calendar "$CALENDAR_ID" \
        --date "1777020000000" --dueDate "1777023600000"); then
        echo "PASS: schedule_todo creates a Planner-visible authenticated calendar slot"
        PASSED=$((PASSED + 1))
        echo "  => $PLANNER_SLOT_RESULT"
      else
        fail_test "schedule_todo Planner-native slot shape" "Planner visibility verification helper failed"
      fi
      run_capture_to_var UNSCHEDULE_SLOT_TEXT "unschedule_todo(workSlotId:$SCHEDULE_SLOT_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"unschedule_todo\",\"arguments\":{\"workSlotId\":\"$SCHEDULE_SLOT_ID\"}},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_field_equals "unschedule_todo(workSlotId:$SCHEDULE_SLOT_ID) removed one" "$UNSCHEDULE_SLOT_TEXT" ".removed" "1"
      fi
    else
      skip_test "unschedule_todo(workSlotId)" "schedule_todo did not return a workSlotId"
    fi

    run_capture_to_var RAW_SLOT_TEXT "schedule_todo(raw_id:$TODO_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"schedule_todo\",\"arguments\":{\"locator\":{\"todoId\":\"$TODO_ID\"},\"date\":1777027200000,\"dueDate\":1777030800000}},\"id\":2}"
    RAW_SLOT_ID=$(echo "$RAW_SLOT_TEXT" | jq -r '.workSlotId // empty' 2>/dev/null)
    if [ -n "$RAW_SLOT_ID" ]; then
      run_capture_to_var UNSCHEDULE_RAW_SLOT_TEXT "unschedule_todo(raw_workSlotId:$RAW_SLOT_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"unschedule_todo\",\"arguments\":{\"workSlotId\":\"$RAW_SLOT_ID\"}},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_field_equals "unschedule_todo(raw_workSlotId:$RAW_SLOT_ID) removed one" "$UNSCHEDULE_RAW_SLOT_TEXT" ".removed" "1"
      fi
    else
      skip_test "unschedule_todo(raw_workSlotId)" "schedule_todo raw-id locator did not return a workSlotId"
    fi

    run_capture_to_var SCHEDULE_SCOPE_TEXT "schedule_todo(scope_cleanup:$TODO_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"schedule_todo\",\"arguments\":{\"locator\":{\"todoId\":\"$TODO_ID\"},\"date\":1777034400000,\"dueDate\":1777038000000}},\"id\":2}"
    SCHEDULE_SCOPE_SLOT_ID=$(echo "$SCHEDULE_SCOPE_TEXT" | jq -r '.workSlotId // empty' 2>/dev/null)
    if [ -n "$SCHEDULE_SCOPE_SLOT_ID" ]; then
      run_capture_to_var UNSCHEDULE_SCOPE_TEXT "unschedule_todo(scope_all:$TODO_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"unschedule_todo\",\"arguments\":{\"locator\":{\"todoId\":\"$TODO_ID\"},\"scope\":\"all\"}},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_field_equals "unschedule_todo(scope_all:$TODO_ID) removed one" "$UNSCHEDULE_SCOPE_TEXT" ".removed" "1"
      fi
    else
      skip_test "unschedule_todo(scope_all)" "schedule_todo did not return a workSlotId"
    fi

    run_capture_to_var COMPLETE_TODO_TEXT "complete_todo($TODO_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"complete_todo\",\"arguments\":{\"locator\":{\"todoId\":\"$TODO_ID\"},\"doneOn\":1777040000000}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_equals "complete_todo($TODO_ID) updated" "$COMPLETE_TODO_TEXT" ".updated" "true"
      sleep 1
      run_capture_to_var GET_COMPLETED_TODO_TEXT "get_todo($TODO_ID completed)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_todo\",\"arguments\":{\"locator\":{\"todoId\":\"$TODO_ID\"}}},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_field_equals "get_todo($TODO_ID) doneOn after complete" "$GET_COMPLETED_TODO_TEXT" ".doneOn" "1777040000000"
      fi
    fi
    run_capture_to_var REOPEN_TODO_TEXT "reopen_todo($TODO_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"reopen_todo\",\"arguments\":{\"locator\":{\"todoId\":\"$TODO_ID\"}}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_equals "reopen_todo($TODO_ID) updated" "$REOPEN_TODO_TEXT" ".updated" "true"
      sleep 1
      run_capture_to_var GET_REOPENED_TODO_TEXT "get_todo($TODO_ID reopened)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_todo\",\"arguments\":{\"locator\":{\"todoId\":\"$TODO_ID\"}}},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_field_equals "get_todo($TODO_ID) doneOn after reopen" "$GET_REOPENED_TODO_TEXT" ".doneOn" "null"
      fi
    fi
    run_capture_to_var DELETE_TODO_TEXT "delete_todo($TODO_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_todo\",\"arguments\":{\"locator\":{\"todoId\":\"$TODO_ID\"}}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_equals "delete_todo($TODO_ID) deleted" "$DELETE_TODO_TEXT" ".deleted" "true"
    fi
  else
    skip_test "planner_todo_lifecycle" "create_todo did not return a todoId"
  fi
fi

PLANNER_ISSUE_TITLE="Planner Attached ToDo $RUN_ID"
PLANNER_ISSUE_TITLE_JSON=$(json_string "$PLANNER_ISSUE_TITLE")
run_capture_to_var PLANNER_ISSUE_TEXT "create_issue(for_planner_todo)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"title\":$PLANNER_ISSUE_TITLE_JSON}},\"id\":2}"
if [ $? -eq 0 ]; then
  PLANNER_ISSUE_ID=$(echo "$PLANNER_ISSUE_TEXT" | jq -r '.identifier // empty' 2>/dev/null)
  if [ -n "$PLANNER_ISSUE_ID" ]; then
    ISSUE_TODO_TITLE="IntTest Issue Planner Todo $RUN_ID"
    ISSUE_TODO_TITLE_JSON=$(json_string "$ISSUE_TODO_TITLE")
    run_capture_to_var ISSUE_TODO_TEXT "create_todo(issue:$PLANNER_ISSUE_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_todo\",\"arguments\":{\"title\":$ISSUE_TODO_TITLE_JSON,\"attachedTo\":{\"type\":\"issue\",\"project\":\"$PROJECT\",\"identifier\":\"$PLANNER_ISSUE_ID\"}}},\"id\":2}"
    ISSUE_TODO_ID=$(echo "$ISSUE_TODO_TEXT" | jq -r '.todoId // empty' 2>/dev/null)
    if [ -n "$ISSUE_TODO_ID" ]; then
      run_capture_to_var ISSUE_TODO_GET_TEXT "get_todo(issue:$ISSUE_TODO_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_todo\",\"arguments\":{\"locator\":{\"todoId\":\"$ISSUE_TODO_ID\"}}},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_field_equals "get_todo(issue:$ISSUE_TODO_ID) attached type" "$ISSUE_TODO_GET_TEXT" ".attachedTo.type" "issue"
        assert_json_field_equals "get_todo(issue:$ISSUE_TODO_ID) attached identifier" "$ISSUE_TODO_GET_TEXT" ".attachedTo.identifier" "$PLANNER_ISSUE_ID"
        assert_json_field_equals "get_todo(issue:$ISSUE_TODO_ID) default visibility" "$ISSUE_TODO_GET_TEXT" ".visibility" "public"
      fi
      run_capture_to_var ISSUE_TODO_LIST_TEXT "list_todos(issue:$PLANNER_ISSUE_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_todos\",\"arguments\":{\"issue\":{\"project\":\"$PROJECT\",\"identifier\":\"$PLANNER_ISSUE_ID\"},\"limit\":10}},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_array_contains "list_todos(issue:$PLANNER_ISSUE_ID) includes issue todo" "$ISSUE_TODO_LIST_TEXT" "map(.id)" "$ISSUE_TODO_ID"
      fi
      run_test "delete_issue(planner_todo:$PLANNER_ISSUE_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$PLANNER_ISSUE_ID\"}},\"id\":2}"
      if [ $? -eq 0 ]; then
        run_expect_error "get_todo(issue:$ISSUE_TODO_ID after issue delete)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_todo\",\"arguments\":{\"locator\":{\"todoId\":\"$ISSUE_TODO_ID\"}}},\"id\":2}"
      fi
    else
      skip_test "issue_planner_todo_lifecycle" "create_todo did not return a todoId"
    fi
  else
    skip_test "issue_planner_todo_lifecycle" "create_issue did not return an identifier"
  fi
fi

# Timer — requires project + issue identifier
run_capture_to_var TIMER_ISSUE_TEXT "create_issue(for_timer)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"title\":\"Timer Test\"}},\"id\":2}"
if [ $? -eq 0 ]; then
  TIMER_ISSUE_ID=$(echo "$TIMER_ISSUE_TEXT" | jq -r '.identifier' 2>/dev/null)
  run_test "start_timer($TIMER_ISSUE_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"start_timer\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$TIMER_ISSUE_ID\"}},\"id\":2}"
  run_test "stop_timer($TIMER_ISSUE_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"stop_timer\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$TIMER_ISSUE_ID\"}},\"id\":2}"
  run_test "delete_issue(timer:$TIMER_ISSUE_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$TIMER_ISSUE_ID\"}},\"id\":2}"
fi

# Recurring event — no delete_recurring_event tool, so skip create to avoid leaking
skip_test "create_recurring_event" "no delete tool — would leak data"
skip_test "list_event_instances" "requires recurring event"
echo ""

##############################
# 12. NOTIFICATIONS
##############################
echo "=== 12. Notifications ==="
run_test "list_notifications" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_notifications","arguments":{"limit":3}},"id":2}'
run_test "get_unread_notification_count" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_unread_notification_count","arguments":{}},"id":2}'
run_test "list_notification_contexts" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_notification_contexts","arguments":{"limit":3}},"id":2}'
run_test "list_notification_contexts(includeHidden)" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_notification_contexts","arguments":{"limit":3,"includeHidden":true}},"id":2}'
run_test "list_notification_settings" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_notification_settings","arguments":{}},"id":2}'
for METADATA_TOOL in list_notification_providers list_notification_types; do
  METADATA_RESULT=""
  if run_result_to_var METADATA_RESULT "$METADATA_TOOL(model-backed)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"$METADATA_TOOL\",\"arguments\":{}},\"id\":2}"; then
    if printf '%s\n' "$METADATA_RESULT" | jq -e '
      ((.structuredContent.warnings? // []) | length == 0)
      and ([.content[]? | select((.text | fromjson? | has("warnings")) == true)] | length == 0)
      and ((.content[0].text | fromjson | length) > 0)
    ' >/dev/null 2>&1; then
      echo "PASS: $METADATA_TOOL resolves authoritative model metadata without warnings"
      PASSED=$((PASSED + 1))
    else
      echo "FAIL: $METADATA_TOOL returned empty or degraded model metadata"
      FAILED=$((FAILED + 1))
      ERRORS="${ERRORS}\n  - $METADATA_TOOL: empty or degraded model metadata"
    fi
  fi
done
# mark_all_notifications_read, archive_all_notifications, delete_notification,
# update_notification_provider_setting — all require existing notifications, skipped if none
NOTIF_TEXT=$(run_capture_only \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_notifications","arguments":{"limit":1}},"id":2}')
NOTIF_ID=$(echo "$NOTIF_TEXT" | jq -r '.[0].id // .notifications[0].id // empty' 2>/dev/null)
if [ -n "$NOTIF_ID" ]; then
  run_capture_to_var GET_NOTIF_TEXT "get_notification($NOTIF_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_notification\",\"arguments\":{\"notificationId\":\"$NOTIF_ID\"}},\"id\":2}"

  ORIGINAL_VIEWED=$(echo "$GET_NOTIF_TEXT" | jq -r '.isViewed // empty' 2>/dev/null)
  DOC_CONTEXT_ID=$(echo "$GET_NOTIF_TEXT" | jq -r '.docNotifyContextId // empty' 2>/dev/null)
  NOTIF_OBJECT_ID=$(echo "$GET_NOTIF_TEXT" | jq -r '.objectId // empty' 2>/dev/null)
  NOTIF_OBJECT_CLASS=$(echo "$GET_NOTIF_TEXT" | jq -r '.objectClass // empty' 2>/dev/null)

  run_test "mark_notification_unread($NOTIF_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"mark_notification_unread\",\"arguments\":{\"notificationId\":\"$NOTIF_ID\"}},\"id\":2}"
  run_test "mark_notification_read($NOTIF_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"mark_notification_read\",\"arguments\":{\"notificationId\":\"$NOTIF_ID\"}},\"id\":2}"
  if [ "$ORIGINAL_VIEWED" = "false" ]; then
    run_test "mark_notification_unread($NOTIF_ID restore)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"mark_notification_unread\",\"arguments\":{\"notificationId\":\"$NOTIF_ID\"}},\"id\":2}"
  fi

  run_test "archive_notification($NOTIF_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"archive_notification\",\"arguments\":{\"notificationId\":\"$NOTIF_ID\"}},\"id\":2}"
  run_test "unarchive_notification($NOTIF_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"unarchive_notification\",\"arguments\":{\"notificationId\":\"$NOTIF_ID\"}},\"id\":2}"

  if [ -n "$NOTIF_OBJECT_ID" ] && [ -n "$NOTIF_OBJECT_CLASS" ]; then
    NOTIF_OBJECT_ID_JSON=$(json_string "$NOTIF_OBJECT_ID")
    NOTIF_OBJECT_CLASS_JSON=$(json_string "$NOTIF_OBJECT_CLASS")
    run_capture_to_var CONTEXT_TEXT "get_notification_context($NOTIF_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_notification_context\",\"arguments\":{\"objectId\":$NOTIF_OBJECT_ID_JSON,\"objectClass\":$NOTIF_OBJECT_CLASS_JSON}},\"id\":2}"
    CONTEXT_ID=$(echo "$CONTEXT_TEXT" | jq -r '.id // empty' 2>/dev/null)
    ORIGINAL_PINNED=$(echo "$CONTEXT_TEXT" | jq -r '.isPinned // empty' 2>/dev/null)
    ORIGINAL_HIDDEN=$(echo "$CONTEXT_TEXT" | jq -r '.hidden // empty' 2>/dev/null)
    if [ -n "$CONTEXT_ID" ]; then
      if [ "$ORIGINAL_PINNED" = "true" ]; then
        run_test "pin_notification_context($CONTEXT_ID unpin)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"pin_notification_context\",\"arguments\":{\"contextId\":\"$CONTEXT_ID\",\"pinned\":false}},\"id\":2}"
        run_test "pin_notification_context($CONTEXT_ID restore)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"pin_notification_context\",\"arguments\":{\"contextId\":\"$CONTEXT_ID\",\"pinned\":true}},\"id\":2}"
      else
        run_test "pin_notification_context($CONTEXT_ID pin)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"pin_notification_context\",\"arguments\":{\"contextId\":\"$CONTEXT_ID\",\"pinned\":true}},\"id\":2}"
        run_test "pin_notification_context($CONTEXT_ID restore)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"pin_notification_context\",\"arguments\":{\"contextId\":\"$CONTEXT_ID\",\"pinned\":false}},\"id\":2}"
      fi

      if [ "$ORIGINAL_HIDDEN" = "true" ]; then
        run_test "hide_notification_context($CONTEXT_ID unhide)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"hide_notification_context\",\"arguments\":{\"contextId\":\"$CONTEXT_ID\",\"hidden\":false}},\"id\":2}"
        run_test "hide_notification_context($CONTEXT_ID restore)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"hide_notification_context\",\"arguments\":{\"contextId\":\"$CONTEXT_ID\",\"hidden\":true}},\"id\":2}"
      else
        run_test "hide_notification_context($CONTEXT_ID hide)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"hide_notification_context\",\"arguments\":{\"contextId\":\"$CONTEXT_ID\",\"hidden\":true}},\"id\":2}"
        run_test "hide_notification_context($CONTEXT_ID restore)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"hide_notification_context\",\"arguments\":{\"contextId\":\"$CONTEXT_ID\",\"hidden\":false}},\"id\":2}"
      fi
    else
      skip_test "pin_notification_context" "notification context not found"
      skip_test "hide_notification_context" "notification context not found"
    fi
  elif [ -n "$DOC_CONTEXT_ID" ]; then
    skip_test "get_notification_context" "notification missing object locator"
    skip_test "pin_notification_context" "notification missing object locator"
    skip_test "hide_notification_context" "notification missing object locator"
  else
    skip_test "get_notification_context" "notification has no context"
    skip_test "pin_notification_context" "notification has no context"
    skip_test "hide_notification_context" "notification has no context"
  fi

  skip_test "mark_all_notifications_read" "would clear all notifications"
  skip_test "archive_all_notifications" "would archive all"
  skip_test "delete_notification" "requires notification ID"
  skip_test "update_notification_provider_setting" "would modify settings"
else
  skip_test "get_notification" "no notifications"
  skip_test "mark_notification_read" "no notifications"
  skip_test "mark_notification_unread" "no notifications"
  skip_test "mark_all_notifications_read" "no notifications"
  skip_test "archive_notification" "no notifications"
  skip_test "unarchive_notification" "no notifications"
  skip_test "archive_all_notifications" "no notifications"
  skip_test "delete_notification" "no notifications"
  skip_test "get_notification_context" "no notifications"
  skip_test "pin_notification_context" "no notifications"
  skip_test "hide_notification_context" "no notifications"
  skip_test "update_notification_provider_setting" "no notifications"
fi
echo ""

##############################
# 13. SEARCH
##############################
echo "=== 13. Search ==="
run_test "fulltext_search" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"fulltext_search","arguments":{"query":"test","limit":3}},"id":2}'
echo ""

##############################
# 13a. SDK DISCOVERY
##############################
echo "=== 13a. SDK Discovery ==="
run_capture_to_var SDK_CLASSES_TEXT "list_huly_classes(issue)" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_huly_classes","arguments":{"query":"Issue","limit":10}},"id":2}'
if [ $? -eq 0 ]; then
  if printf '%s\n' "$SDK_CLASSES_TEXT" | jq -e 'any(.classes[]?; .classId == "tracker:class:Issue" and .label == "Issue")' >/dev/null 2>&1; then
    echo "PASS: list_huly_classes includes tracker issue"
    PASSED=$((PASSED + 1))
  else
    fail_test "list_huly_classes includes tracker issue" "tracker:class:Issue missing"
  fi
fi

run_capture_to_var SDK_CLASS_TEXT "get_huly_class(tracker:class:Issue)" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_huly_class","arguments":{"class":"tracker:class:Issue"}},"id":2}'
if [ $? -eq 0 ]; then
  assert_json_field_equals "get_huly_class returns issue class" "$SDK_CLASS_TEXT" ".class.classId" "tracker:class:Issue"
  assert_json_field_nonempty "get_huly_class returns attributes" "$SDK_CLASS_TEXT" ".attributes[0].attributeId"
  if printf '%s\n' "$SDK_CLASS_TEXT" | jq -e 'any(.attributes[]?; .inherited == true)' >/dev/null 2>&1; then
    echo "PASS: get_huly_class returns inherited attributes"
    PASSED=$((PASSED + 1))
  else
    fail_test "get_huly_class returns inherited attributes" "no inherited attributes returned"
  fi
  if printf '%s\n' "$SDK_CLASS_TEXT" | jq -e 'any(.class.firstClassToolHints[]?; .category == "issues" and any(.exampleTools[]?; . == "get_issue"))' >/dev/null 2>&1; then
    echo "PASS: get_huly_class returns first-class tool hints"
    PASSED=$((PASSED + 1))
  else
    fail_test "get_huly_class returns first-class tool hints" "issues tool hint missing"
  fi
fi

run_capture_to_var SDK_ATTRIBUTES_TEXT "list_huly_attributes(issue)" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_huly_attributes","arguments":{"class":"tracker:class:Issue","limit":5}},"id":2}'
if [ $? -eq 0 ]; then
  assert_json_field_nonempty "list_huly_attributes returns attribute id" "$SDK_ATTRIBUTES_TEXT" ".attributes[0].attributeId"
fi

run_capture_to_var SDK_ENUMS_TEXT "list_huly_enums" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_huly_enums","arguments":{"limit":5}},"id":2}'
if [ $? -eq 0 ]; then
  assert_json_field_nonempty "list_huly_enums returns total" "$SDK_ENUMS_TEXT" ".total"
fi
echo ""

##############################
# 13b. SPACES
##############################
echo "=== 13b. Spaces ==="
run_capture_to_var SPACES_TEXT "list_spaces" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_spaces","arguments":{"limit":5}},"id":2}'
if [ $? -eq 0 ]; then
  assert_json_field_nonempty "list_spaces returns total" "$SPACES_TEXT" ".total"
  FIRST_SPACE_ID=$(echo "$SPACES_TEXT" | jq -r '.spaces[0].id // empty' 2>/dev/null)
  if [ -n "$FIRST_SPACE_ID" ]; then
    run_test "get_space($FIRST_SPACE_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_space\",\"arguments\":{\"space\":\"$FIRST_SPACE_ID\",\"includeArchived\":true}},\"id\":2}"
  fi
fi

run_capture_to_var SPACE_PREFS_TEXT "list_space_preferences" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_space_preferences","arguments":{"limit":5}},"id":2}'
if [ $? -eq 0 ]; then
  assert_json_field_nonempty "list_space_preferences returns total" "$SPACE_PREFS_TEXT" ".total"
fi

run_capture_to_var APPROVAL_REQUESTS_TEXT "list_approval_requests" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_approval_requests","arguments":{"limit":5}},"id":2}'
if [ $? -eq 0 ]; then
  assert_json_field_nonempty "list_approval_requests returns total" "$APPROVAL_REQUESTS_TEXT" ".total"
  FIRST_APPROVAL_REQUEST_ID=$(echo "$APPROVAL_REQUESTS_TEXT" | jq -r '.requests[0].id // empty' 2>/dev/null)
  if [ -n "$FIRST_APPROVAL_REQUEST_ID" ]; then
    FIRST_APPROVAL_REQUEST_ID_JSON=$(json_string "$FIRST_APPROVAL_REQUEST_ID")
    run_capture_to_var APPROVAL_REQUEST_TEXT "get_approval_request($FIRST_APPROVAL_REQUEST_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_approval_request\",\"arguments\":{\"request\":$FIRST_APPROVAL_REQUEST_ID_JSON}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_equals "get_approval_request returns id" "$APPROVAL_REQUEST_TEXT" ".id" "$FIRST_APPROVAL_REQUEST_ID"
      assert_json_field_nonempty "get_approval_request returns status" "$APPROVAL_REQUEST_TEXT" ".status"
    fi
  else
    echo "INFO: get_approval_request not exercised (no generic approval requests found)"
  fi
fi
run_expect_error_contains "get_approval_request(missing)" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_approval_request","arguments":{"request":"missing-approval-request-integration-fixture"}},"id":2}' \
  "not found"

APPROVAL_REQUESTED_IDENTIFIER="${HULY_EMAIL:-}"
APPROVAL_PERSON_ID=""
if [ -z "$APPROVAL_REQUESTED_IDENTIFIER" ]; then
  APPROVAL_PERSON_FIRST="Approval-$RUN_ID"
  APPROVAL_PERSON_EMAIL="approval-$RUN_ID@test.local"
  APPROVAL_PERSON_FIRST_JSON=$(json_string "$APPROVAL_PERSON_FIRST")
  APPROVAL_PERSON_EMAIL_JSON=$(json_string "$APPROVAL_PERSON_EMAIL")
  run_capture_to_var APPROVAL_PERSON_TEXT "create_person(for_approval_request)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_person\",\"arguments\":{\"firstName\":$APPROVAL_PERSON_FIRST_JSON,\"lastName\":\"Requested\",\"email\":$APPROVAL_PERSON_EMAIL_JSON}},\"id\":2}"
  if [ $? -eq 0 ]; then
    APPROVAL_PERSON_ID=$(echo "$APPROVAL_PERSON_TEXT" | jq -r '.id // empty' 2>/dev/null)
    APPROVAL_REQUESTED_IDENTIFIER="$APPROVAL_PERSON_ID"
  fi
fi

if [ -n "$APPROVAL_REQUESTED_IDENTIFIER" ]; then
  APPROVAL_ISSUE_TITLE="Approval Request IntTest $RUN_ID"
  APPROVAL_ISSUE_TITLE_JSON=$(json_string "$APPROVAL_ISSUE_TITLE")
  run_capture_to_var APPROVAL_ISSUE_TEXT "create_issue(for_approval_request)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"title\":$APPROVAL_ISSUE_TITLE_JSON}},\"id\":2}"
  if [ $? -eq 0 ]; then
    APPROVAL_ISSUE_ID=$(echo "$APPROVAL_ISSUE_TEXT" | jq -r '.identifier // empty' 2>/dev/null)
    APPROVAL_ISSUE_OBJ_ID=$(echo "$APPROVAL_ISSUE_TEXT" | jq -r '.issueId // empty' 2>/dev/null)
    APPROVAL_ISSUE_OBJ_JSON=$(json_string "$APPROVAL_ISSUE_OBJ_ID")
    APPROVAL_REQUESTED_JSON=$(json_string "$APPROVAL_REQUESTED_IDENTIFIER")

    if [ -n "$APPROVAL_ISSUE_ID" ] && [ -n "$APPROVAL_ISSUE_OBJ_ID" ]; then
      APPROVAL_CANCEL_ARGS=$(jq -nc \
        --arg attached "$APPROVAL_ISSUE_OBJ_ID" \
        --arg requested "$APPROVAL_REQUESTED_IDENTIFIER" \
        --arg txid "approval-cancel-tx-$RUN_ID" \
        '{attachedTo:$attached, attachedToClass:"tracker:class:Issue", requested:[$requested], tx:{_id:$txid, _class:"core:class:Tx"}}')
      run_capture_to_var APPROVAL_ADD_TEXT "add_approval_request(cancel fixture)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_approval_request\",\"arguments\":$APPROVAL_CANCEL_ARGS},\"id\":2}"
      if [ $? -eq 0 ]; then
        APPROVAL_CANCEL_REQUEST_ID=$(echo "$APPROVAL_ADD_TEXT" | jq -r '.request // empty' 2>/dev/null)
        assert_json_field_equals "add_approval_request returns created action" "$APPROVAL_ADD_TEXT" ".action" "created"
        assert_json_field_equals "add_approval_request returns Active status" "$APPROVAL_ADD_TEXT" ".status" "Active"

        restart_http_transport_if_needed "approval request create readback"
        APPROVAL_LIST_PAYLOAD="{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_approval_requests\",\"arguments\":{\"attachedTo\":$APPROVAL_ISSUE_OBJ_JSON,\"attachedToClass\":\"tracker:class:Issue\",\"limit\":10}},\"id\":2}"
        wait_for_json_array_contains_to_var APPROVAL_CREATED_LIST_TEXT "list_approval_requests includes created request" \
          "$APPROVAL_LIST_PAYLOAD" ".requests | map(.id)" "$APPROVAL_CANCEL_REQUEST_ID" 8 1
        run_capture_to_var APPROVAL_CREATED_GET_TEXT "get_approval_request(created)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_approval_request\",\"arguments\":{\"request\":\"$APPROVAL_CANCEL_REQUEST_ID\"}},\"id\":2}"
        if [ $? -eq 0 ]; then
          assert_json_field_equals "get_approval_request(created) returns attachedTo" "$APPROVAL_CREATED_GET_TEXT" ".attachedTo" "$APPROVAL_ISSUE_OBJ_ID"
        fi

        run_capture_to_var APPROVAL_COMMENT_TEXT "add_approval_request_comment" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_approval_request_comment\",\"arguments\":{\"request\":\"$APPROVAL_CANCEL_REQUEST_ID\",\"body\":\"Integration approval comment\"}},\"id\":2}"
        if [ $? -eq 0 ]; then
          assert_json_field_equals "add_approval_request_comment action" "$APPROVAL_COMMENT_TEXT" ".action" "comment_added"
          assert_json_field_nonempty "add_approval_request_comment returns comment id" "$APPROVAL_COMMENT_TEXT" ".comment"
        fi

        run_capture_to_var APPROVAL_CANCEL_TEXT "cancel_approval_request" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"cancel_approval_request\",\"arguments\":{\"request\":\"$APPROVAL_CANCEL_REQUEST_ID\"}},\"id\":2}"
        if [ $? -eq 0 ]; then
          assert_json_field_equals "cancel_approval_request action" "$APPROVAL_CANCEL_TEXT" ".action" "cancelled"
          assert_json_field_equals "cancel_approval_request status" "$APPROVAL_CANCEL_TEXT" ".status" "Cancelled"
        fi
      fi

      APPROVAL_REJECT_ARGS=$(jq -nc \
        --arg attached "$APPROVAL_ISSUE_OBJ_ID" \
        --arg requested "$APPROVAL_REQUESTED_IDENTIFIER" \
        --arg txid "approval-reject-tx-$RUN_ID" \
        '{attachedTo:$attached, attachedToClass:"tracker:class:Issue", requested:[$requested], tx:{_id:$txid, _class:"core:class:Tx"}}')
      run_capture_to_var APPROVAL_REJECT_ADD_TEXT "add_approval_request(reject fixture)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_approval_request\",\"arguments\":$APPROVAL_REJECT_ARGS},\"id\":2}"
      if [ $? -eq 0 ]; then
        APPROVAL_REJECT_REQUEST_ID=$(echo "$APPROVAL_REJECT_ADD_TEXT" | jq -r '.request // empty' 2>/dev/null)
        run_capture_to_var APPROVAL_REJECT_TEXT "reject_approval_request" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"reject_approval_request\",\"arguments\":{\"request\":\"$APPROVAL_REJECT_REQUEST_ID\",\"comment\":\"Integration rejection\"}},\"id\":2}"
        if [ $? -eq 0 ]; then
          assert_json_field_equals "reject_approval_request action" "$APPROVAL_REJECT_TEXT" ".action" "rejected"
          assert_json_field_equals "reject_approval_request status" "$APPROVAL_REJECT_TEXT" ".status" "Rejected"
          assert_json_field_nonempty "reject_approval_request returns comment id" "$APPROVAL_REJECT_TEXT" ".comment"
        fi
      fi

      if [ -n "${HULY_EMAIL:-}" ]; then
        APPROVAL_WITNESS_FIRST="ApprovalWitness-$RUN_ID"
        APPROVAL_WITNESS_EMAIL="approval-witness-$RUN_ID@test.local"
        APPROVAL_WITNESS_FIRST_JSON=$(json_string "$APPROVAL_WITNESS_FIRST")
        APPROVAL_WITNESS_EMAIL_JSON=$(json_string "$APPROVAL_WITNESS_EMAIL")
        run_capture_to_var APPROVAL_WITNESS_TEXT "create_person(for_approval_witness)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_person\",\"arguments\":{\"firstName\":$APPROVAL_WITNESS_FIRST_JSON,\"lastName\":\"Requested\",\"email\":$APPROVAL_WITNESS_EMAIL_JSON}},\"id\":2}"
        if [ $? -eq 0 ]; then
          APPROVAL_WITNESS_ID=$(echo "$APPROVAL_WITNESS_TEXT" | jq -r '.id // empty' 2>/dev/null)
          APPROVAL_APPROVE_ARGS=$(jq -nc \
            --arg attached "$APPROVAL_ISSUE_OBJ_ID" \
            --arg current "$HULY_EMAIL" \
            --arg witness "$APPROVAL_WITNESS_ID" \
            --arg txid "approval-approve-tx-$RUN_ID" \
            '{attachedTo:$attached, attachedToClass:"tracker:class:Issue", requested:[$current, $witness], requiredApprovesCount:2, tx:{_id:$txid, _class:"core:class:Tx"}}')
          run_capture_to_var APPROVAL_APPROVE_ADD_TEXT "add_approval_request(approve fixture)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_approval_request\",\"arguments\":$APPROVAL_APPROVE_ARGS},\"id\":2}"
          if [ $? -eq 0 ]; then
            APPROVAL_APPROVE_REQUEST_ID=$(echo "$APPROVAL_APPROVE_ADD_TEXT" | jq -r '.request // empty' 2>/dev/null)
            run_capture_to_var APPROVAL_APPROVE_TEXT "approve_approval_request" \
              "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"approve_approval_request\",\"arguments\":{\"request\":\"$APPROVAL_APPROVE_REQUEST_ID\",\"comment\":\"Integration approval\"}},\"id\":2}"
            if [ $? -eq 0 ]; then
              assert_json_field_equals "approve_approval_request action" "$APPROVAL_APPROVE_TEXT" ".action" "approved"
              assert_json_field_equals "approve_approval_request changed" "$APPROVAL_APPROVE_TEXT" ".changed" "true"
              assert_json_field_nonempty "approve_approval_request returns comment id" "$APPROVAL_APPROVE_TEXT" ".comment"
              run_test "cancel_approval_request(after approve)" \
                "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"cancel_approval_request\",\"arguments\":{\"request\":\"$APPROVAL_APPROVE_REQUEST_ID\"}},\"id\":2}"
            fi
          fi
          run_test "delete_person(approval_witness:$APPROVAL_WITNESS_ID)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_person\",\"arguments\":{\"personId\":\"$APPROVAL_WITNESS_ID\"}},\"id\":2}"
        fi
      fi

      run_test "delete_issue(approval_request:$APPROVAL_ISSUE_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$APPROVAL_ISSUE_ID\"}},\"id\":2}"
    fi
  fi
else
  echo "INFO: approval request write integration not exercised (no requester identifier available)"
fi

if [ -n "$APPROVAL_PERSON_ID" ]; then
  run_test "delete_person(approval_request:$APPROVAL_PERSON_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_person\",\"arguments\":{\"personId\":\"$APPROVAL_PERSON_ID\"}},\"id\":2}"
fi
if [ -n "$FIRST_SPACE_ID" ]; then
  FIRST_SPACE_ID_JSON=$(json_string "$FIRST_SPACE_ID")
  run_capture_to_var SPACE_PREF_TEXT "get_space_preference($FIRST_SPACE_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_space_preference\",\"arguments\":{\"space\":$FIRST_SPACE_ID_JSON,\"includeArchived\":true}},\"id\":2}"
  if [ $? -eq 0 ]; then
    SPACE_PREF_PRESENT_TYPE=$(printf '%s\n' "$SPACE_PREF_TEXT" | jq -r '.present | type' 2>/dev/null)
    if [ "$SPACE_PREF_PRESENT_TYPE" = "boolean" ]; then
      echo "PASS: get_space_preference($FIRST_SPACE_ID) returns presence boolean"
      PASSED=$((PASSED + 1))
    else
      echo "FAIL: get_space_preference($FIRST_SPACE_ID) missing presence boolean"
      FAILED=$((FAILED + 1))
      ERRORS="${ERRORS}\n  - get_space_preference($FIRST_SPACE_ID): missing presence boolean"
    fi
    assert_json_field_nonempty "get_space_preference($FIRST_SPACE_ID) returns attached space id" "$SPACE_PREF_TEXT" \
      'if .present then .preference.attachedTo else .attachedTo end'
  fi
else
  skip_test "get_space_preference" "no spaces found"
fi

run_capture_to_var SPACE_TYPES_TEXT "list_space_types" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_space_types","arguments":{"limit":50}},"id":2}'
if [ $? -eq 0 ]; then
  assert_json_field_nonempty "list_space_types returns total" "$SPACE_TYPES_TEXT" ".total"
  FIRST_SPACE_TYPE_ID=$(echo "$SPACE_TYPES_TEXT" | jq -r '.spaceTypes[0].id // empty' 2>/dev/null)
  if [ -n "$FIRST_SPACE_TYPE_ID" ]; then
    run_test "get_space_type($FIRST_SPACE_TYPE_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_space_type\",\"arguments\":{\"spaceType\":\"$FIRST_SPACE_TYPE_ID\"}},\"id\":2}"
  else
    skip_test "get_space_type" "no space types found"
  fi
fi

run_test "list_space_permissions" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_space_permissions","arguments":{"limit":5}},"id":2}'

run_expect_error_contains "create_space rejects system space type" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"create_space","arguments":{"spaceType":"core:spaceType:SpacesType","name":"Unsafe Generic System Space"}},"id":2}' \
  "system-managed"

run_capture_to_var GLOBAL_ADMINS_TEXT "get_global_space_admins" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_global_space_admins","arguments":{}},"id":2}'
if [ $? -eq 0 ]; then
  INITIAL_GLOBAL_ADMINS_JSON=$(printf '%s\n' "$GLOBAL_ADMINS_TEXT" | jq -c '.admins // []' 2>/dev/null)
  GLOBAL_SPACE_TEXT=$(run_capture_only \
    '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_space","arguments":{"space":"core:space:Space","includeArchived":true}},"id":2}')
  GLOBAL_ADMIN_CANDIDATE=$(printf '%s\n' "$GLOBAL_SPACE_TEXT" | jq -r '.members[0] // empty' 2>/dev/null)
  if [ -n "$GLOBAL_ADMIN_CANDIDATE" ]; then
    MUTATED_GLOBAL_ADMINS_JSON=$(printf '%s\n' "$INITIAL_GLOBAL_ADMINS_JSON" | jq -c --arg member "$GLOBAL_ADMIN_CANDIDATE" \
      'if index($member) then map(select(. != $member)) else . + [$member] | unique end' 2>/dev/null)
    GLOBAL_ADMINS_CLEANUP_JSON="$INITIAL_GLOBAL_ADMINS_JSON"
    if run_capture_to_var SET_GLOBAL_ADMINS_TEXT "set_global_space_admins(mutate)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"set_global_space_admins\",\"arguments\":{\"admins\":$MUTATED_GLOBAL_ADMINS_JSON}},\"id\":2}"; then
      assert_json_array_same_set "set_global_space_admins returns mutated admins" "$SET_GLOBAL_ADMINS_TEXT" ".admins // []" "$MUTATED_GLOBAL_ADMINS_JSON"
      sleep 2
      run_capture_to_var PERSISTED_GLOBAL_ADMINS_TEXT "get_global_space_admins(after mutate)" \
        '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_global_space_admins","arguments":{}},"id":2}'
      if [ $? -eq 0 ]; then
        assert_json_array_same_set "get_global_space_admins sees persisted mutation" "$PERSISTED_GLOBAL_ADMINS_TEXT" ".admins // []" "$MUTATED_GLOBAL_ADMINS_JSON"
      fi
    fi
    if run_test "set_global_space_admins(restore)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"set_global_space_admins\",\"arguments\":{\"admins\":$INITIAL_GLOBAL_ADMINS_JSON}},\"id\":2}"; then
      sleep 2
      run_capture_to_var RESTORED_GLOBAL_ADMINS_TEXT "get_global_space_admins(after restore)" \
        '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_global_space_admins","arguments":{}},"id":2}'
      if [ $? -eq 0 ]; then
        assert_json_array_same_set "get_global_space_admins sees restored admins" "$RESTORED_GLOBAL_ADMINS_TEXT" ".admins // []" "$INITIAL_GLOBAL_ADMINS_JSON"
        GLOBAL_ADMINS_CLEANUP_JSON=""
      fi
    fi
  else
    skip_test "set_global_space_admins" "all-spaces document has no member candidate"
  fi
fi

GENERIC_TYPED_SPACE_TYPE_ID=$(printf '%s\n' "$SPACE_TYPES_TEXT" | jq -r \
  '.spaceTypes[]? | select(.baseClass == "core:class:TypedSpace") | .id' 2>/dev/null | head -n 1)
GENERIC_TYPED_SPACE_TYPE_NAME=$(printf '%s\n' "$SPACE_TYPES_TEXT" | jq -r --arg id "$GENERIC_TYPED_SPACE_TYPE_ID" \
  '.spaceTypes[]? | select(.id == $id) | .name' 2>/dev/null | head -n 1)
if [ -n "$GENERIC_TYPED_SPACE_TYPE_ID" ] && [ -n "$GENERIC_TYPED_SPACE_TYPE_NAME" ]; then
  GENERIC_TYPED_SPACE_NAME="IntTest Generic Typed Space $RUN_ID"
  GENERIC_TYPED_SPACE_NAME_JSON=$(json_string "$GENERIC_TYPED_SPACE_NAME")
  GENERIC_TYPED_SPACE_TYPE_NAME_JSON=$(json_string "$GENERIC_TYPED_SPACE_TYPE_NAME")
  GENERIC_TYPED_SPACE_ARGS=$(jq -nc \
    --argjson spaceType "$GENERIC_TYPED_SPACE_TYPE_NAME_JSON" \
    --argjson name "$GENERIC_TYPED_SPACE_NAME_JSON" \
    '{spaceType:$spaceType,name:$name,description:"generic typed-space integration fixture"}')
  run_capture_to_var CREATE_GENERIC_TYPED_SPACE_TEXT "create_space($GENERIC_TYPED_SPACE_TYPE_NAME)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_space\",\"arguments\":$GENERIC_TYPED_SPACE_ARGS},\"id\":2}"
  if [ $? -eq 0 ]; then
    GENERIC_TYPED_SPACE_ID=$(printf '%s\n' "$CREATE_GENERIC_TYPED_SPACE_TEXT" | jq -r '.id // empty' 2>/dev/null)
    assert_json_field_equals "create_space returns requested type" "$CREATE_GENERIC_TYPED_SPACE_TEXT" ".type" "$GENERIC_TYPED_SPACE_TYPE_ID"
    assert_json_field_equals "create_space returns TypedSpace class" "$CREATE_GENERIC_TYPED_SPACE_TEXT" ".class" "core:class:TypedSpace"
    sleep 2
    run_capture_to_var CREATED_GENERIC_TYPED_SPACE_TEXT "get_space($GENERIC_TYPED_SPACE_ID after create_space)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_space\",\"arguments\":{\"space\":\"$GENERIC_TYPED_SPACE_ID\",\"includeArchived\":true}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_equals "get_space sees generic typed-space type" "$CREATED_GENERIC_TYPED_SPACE_TEXT" ".type" "$GENERIC_TYPED_SPACE_TYPE_ID"
    fi
    run_test "update_space($GENERIC_TYPED_SPACE_ID archive generic typed fixture)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_space\",\"arguments\":{\"space\":\"$GENERIC_TYPED_SPACE_ID\",\"archived\":true}},\"id\":2}"
  fi
else
  skip_test "create_space" "no non-system core:class:TypedSpace-backed SpaceType found"
fi

ROLE_SPACE_FIXTURE=""
if [ -n "$SPACE_TYPES_TEXT" ]; then
  while IFS=$'\t' read -r ROLE_SPACE_TYPE_CANDIDATE _role_count; do
    if [ -z "$ROLE_SPACE_TYPE_CANDIDATE" ]; then
      continue
    fi
    ROLE_SPACE_TYPE_CANDIDATE_JSON=$(json_string "$ROLE_SPACE_TYPE_CANDIDATE")
    ROLE_SPACE_CANDIDATES_TEXT=$(run_capture_only \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_spaces\",\"arguments\":{\"type\":$ROLE_SPACE_TYPE_CANDIDATE_JSON,\"includeArchived\":true,\"limit\":10}},\"id\":2}")
    if [ -z "$ROLE_SPACE_CANDIDATES_TEXT" ]; then
      continue
    fi
    ROLE_SPACE_CANDIDATE=$(printf '%s\n' "$ROLE_SPACE_CANDIDATES_TEXT" | jq -r \
      '.spaces[]? | select(.archived == false and ((.membersCount // 0) > 0)) | .id' 2>/dev/null | head -n 1)
    if [ -n "$ROLE_SPACE_CANDIDATE" ]; then
      ROLE_SPACE_FIXTURE="${ROLE_SPACE_TYPE_CANDIDATE}"$'\t'"${ROLE_SPACE_CANDIDATE}"
      break
    fi
  done < <(printf '%s\n' "$SPACE_TYPES_TEXT" | jq -r '.spaceTypes[]? | select((.rolesCount // 0) > 0) | [.id, .rolesCount] | @tsv' 2>/dev/null)
fi

if [ -n "$ROLE_SPACE_FIXTURE" ]; then
  ROLE_SPACE_TYPE_ID=$(printf '%s\n' "$ROLE_SPACE_FIXTURE" | cut -f1)
  ROLE_SPACE_ID=$(printf '%s\n' "$ROLE_SPACE_FIXTURE" | cut -f2)
  ROLE_SPACE_TYPE_ID_JSON=$(json_string "$ROLE_SPACE_TYPE_ID")
  ROLE_SPACE_ID_JSON=$(json_string "$ROLE_SPACE_ID")

  if run_capture_to_var ROLE_SPACE_TYPE_TEXT "get_space_type($ROLE_SPACE_TYPE_ID role fixture)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_space_type\",\"arguments\":{\"spaceType\":$ROLE_SPACE_TYPE_ID_JSON}},\"id\":2}" \
    && run_capture_to_var ROLE_SPACE_DETAIL_TEXT "get_space($ROLE_SPACE_ID role fixture)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_space\",\"arguments\":{\"space\":$ROLE_SPACE_ID_JSON,\"includeArchived\":true}},\"id\":2}"; then
    ROLE_ID=$(printf '%s\n' "$ROLE_SPACE_TYPE_TEXT" | jq -r '.roles[0].id // empty' 2>/dev/null)
    ROLE_MEMBER_CANDIDATE=$(printf '%s\n' "$ROLE_SPACE_DETAIL_TEXT" | jq -r '.members[0] // empty' 2>/dev/null)
    if [ -n "$ROLE_ID" ] && [ -n "$ROLE_MEMBER_CANDIDATE" ]; then
      ROLE_ID_JSON=$(json_string "$ROLE_ID")
      ROLE_MEMBER_CANDIDATE_JSON=$(json_string "$ROLE_MEMBER_CANDIDATE")
      ROLE_MEMBER_SINGLETON_JSON=$(jq -cn --arg member "$ROLE_MEMBER_CANDIDATE" '[$member]')
      INITIAL_ROLE_MEMBERS_JSON=$(printf '%s\n' "$ROLE_SPACE_DETAIL_TEXT" | jq -c --arg role_id "$ROLE_ID" \
        '(.roleAssignments // []) | map(select(.roleId == $role_id)) | first | .members // [] | sort' 2>/dev/null)
      if [ -z "$INITIAL_ROLE_MEMBERS_JSON" ]; then
        INITIAL_ROLE_MEMBERS_JSON="[]"
      fi

      if run_capture_to_var SET_ROLE_MEMBERS_TEXT "set_space_role_members($ROLE_SPACE_ID,$ROLE_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"set_space_role_members\",\"arguments\":{\"space\":$ROLE_SPACE_ID_JSON,\"role\":$ROLE_ID_JSON,\"members\":$ROLE_MEMBER_SINGLETON_JSON}},\"id\":2}"; then
        assert_json_array_same_set "set_space_role_members returns requested members" "$SET_ROLE_MEMBERS_TEXT" ".members // []" "$ROLE_MEMBER_SINGLETON_JSON"
        sleep 2
        if run_capture_to_var SET_ROLE_MEMBERS_PERSISTED_TEXT "get_space($ROLE_SPACE_ID after set_space_role_members)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_space\",\"arguments\":{\"space\":$ROLE_SPACE_ID_JSON,\"includeArchived\":true}},\"id\":2}"; then
          assert_json_role_members_same_set "get_space sees set_space_role_members persisted" "$SET_ROLE_MEMBERS_PERSISTED_TEXT" "$ROLE_ID" "$ROLE_MEMBER_SINGLETON_JSON"
        fi
      fi

      if run_capture_to_var ADD_ROLE_MEMBERS_TEXT "add_space_role_members($ROLE_SPACE_ID,$ROLE_ID idempotent)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_space_role_members\",\"arguments\":{\"space\":$ROLE_SPACE_ID_JSON,\"role\":$ROLE_ID_JSON,\"members\":[$ROLE_MEMBER_CANDIDATE_JSON]}},\"id\":2}"; then
        assert_json_array_contains "add_space_role_members returns candidate" "$ADD_ROLE_MEMBERS_TEXT" ".members // []" "$ROLE_MEMBER_CANDIDATE"
        sleep 2
        if run_capture_to_var ADD_ROLE_MEMBERS_PERSISTED_TEXT "get_space($ROLE_SPACE_ID after add_space_role_members)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_space\",\"arguments\":{\"space\":$ROLE_SPACE_ID_JSON,\"includeArchived\":true}},\"id\":2}"; then
          assert_json_role_members_contains "get_space sees add_space_role_members persisted" "$ADD_ROLE_MEMBERS_PERSISTED_TEXT" "$ROLE_ID" "$ROLE_MEMBER_CANDIDATE"
        fi
      fi

      if run_capture_to_var REMOVE_ROLE_MEMBERS_TEXT "remove_space_role_members($ROLE_SPACE_ID,$ROLE_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"remove_space_role_members\",\"arguments\":{\"space\":$ROLE_SPACE_ID_JSON,\"role\":$ROLE_ID_JSON,\"members\":[$ROLE_MEMBER_CANDIDATE_JSON]}},\"id\":2}"; then
        assert_json_array_not_contains "remove_space_role_members removes candidate" "$REMOVE_ROLE_MEMBERS_TEXT" ".members // []" "$ROLE_MEMBER_CANDIDATE"
        sleep 2
        if run_capture_to_var REMOVE_ROLE_MEMBERS_PERSISTED_TEXT "get_space($ROLE_SPACE_ID after remove_space_role_members)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_space\",\"arguments\":{\"space\":$ROLE_SPACE_ID_JSON,\"includeArchived\":true}},\"id\":2}"; then
          assert_json_role_members_not_contains "get_space sees remove_space_role_members persisted" "$REMOVE_ROLE_MEMBERS_PERSISTED_TEXT" "$ROLE_ID" "$ROLE_MEMBER_CANDIDATE"
        fi
      fi

      if run_test "set_space_role_members($ROLE_SPACE_ID,$ROLE_ID restore)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"set_space_role_members\",\"arguments\":{\"space\":$ROLE_SPACE_ID_JSON,\"role\":$ROLE_ID_JSON,\"members\":$INITIAL_ROLE_MEMBERS_JSON}},\"id\":2}"; then
        sleep 2
        if run_capture_to_var ROLE_MEMBERS_RESTORE_PERSISTED_TEXT "get_space($ROLE_SPACE_ID after role restore)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_space\",\"arguments\":{\"space\":$ROLE_SPACE_ID_JSON,\"includeArchived\":true}},\"id\":2}"; then
          assert_json_role_members_same_set "get_space sees set_space_role_members restore persisted" "$ROLE_MEMBERS_RESTORE_PERSISTED_TEXT" "$ROLE_ID" "$INITIAL_ROLE_MEMBERS_JSON"
        fi
      fi
    else
      skip_test "set/add/remove_space_role_members" "role fixture missing role or member candidate"
    fi
  else
    skip_test "set/add/remove_space_role_members" "could not load typed role fixture"
  fi
else
  skip_test "set/add/remove_space_role_members" "no typed space with roles and members found"
fi

GENERIC_SPACE_NAME="IntTest Generic Space $RUN_ID"
GENERIC_SPACE_UPDATED_NAME="IntTest Generic Space Updated $RUN_ID"
GENERIC_SPACE_NAME_JSON=$(json_string "$GENERIC_SPACE_NAME")
GENERIC_SPACE_UPDATED_NAME_JSON=$(json_string "$GENERIC_SPACE_UPDATED_NAME")
run_capture_to_var GENERIC_SPACE_TEXT "create_teamspace(for_generic_space)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_teamspace\",\"arguments\":{\"name\":$GENERIC_SPACE_NAME_JSON,\"description\":\"generic spaces integration fixture\",\"private\":false}},\"id\":2}"
if [ $? -eq 0 ]; then
  GENERIC_SPACE_ID=$(echo "$GENERIC_SPACE_TEXT" | jq -r '.id' 2>/dev/null)
  echo "  => generic_space_fixture: $GENERIC_SPACE_ID"
  run_capture_to_var GENERIC_SPACE_GET_TEXT "get_space($GENERIC_SPACE_ID fixture)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_space\",\"arguments\":{\"space\":\"$GENERIC_SPACE_ID\",\"includeArchived\":true}},\"id\":2}"

  run_test "update_space($GENERIC_SPACE_ID metadata)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_space\",\"arguments\":{\"space\":\"$GENERIC_SPACE_ID\",\"name\":$GENERIC_SPACE_UPDATED_NAME_JSON,\"description\":\"generic spaces integration updated\",\"private\":true}},\"id\":2}"
  sleep 2
  run_capture_to_var UPDATED_TEAMSPACE_TEXT "get_teamspace($GENERIC_SPACE_ID after update_space)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_teamspace\",\"arguments\":{\"teamspace\":\"$GENERIC_SPACE_ID\"}},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_field_equals "get_teamspace sees update_space name" "$UPDATED_TEAMSPACE_TEXT" ".name" "$GENERIC_SPACE_UPDATED_NAME"
    assert_json_field_equals "get_teamspace sees update_space private" "$UPDATED_TEAMSPACE_TEXT" ".private" "true"
  fi
  run_test "update_space($GENERIC_SPACE_ID restore public)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_space\",\"arguments\":{\"space\":\"$GENERIC_SPACE_ID\",\"private\":false}},\"id\":2}"
  sleep 1

  MEMBERS_TEXT=$(run_capture_only \
    '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_workspace_members","arguments":{"limit":20}},"id":2}')
  if [ -n "$MEMBERS_TEXT" ] && [ -n "$GENERIC_SPACE_GET_TEXT" ]; then
    INITIAL_OWNERS_JSON=$(printf '%s\n' "$GENERIC_SPACE_GET_TEXT" | jq -c '.owners // []' 2>/dev/null)
    INITIAL_OWNER_COUNT=$(printf '%s\n' "$INITIAL_OWNERS_JSON" | jq -r 'length' 2>/dev/null)
    GENERIC_MEMBER_CANDIDATE=$(jq -nr \
      --argjson members "$MEMBERS_TEXT" \
      --argjson space "$GENERIC_SPACE_GET_TEXT" \
      '$members[]?.personId as $person | select((($space.members // []) | index($person) | not) and (($space.owners // []) | index($person) | not)) | $person' \
      2>/dev/null | head -n 1)
    if [ -n "$GENERIC_MEMBER_CANDIDATE" ]; then
      GENERIC_MEMBER_JSON=$(json_string "$GENERIC_MEMBER_CANDIDATE")
      run_capture_to_var ADD_MEMBERS_TEXT "add_space_members($GENERIC_SPACE_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_space_members\",\"arguments\":{\"space\":\"$GENERIC_SPACE_ID\",\"members\":[$GENERIC_MEMBER_JSON]}},\"id\":2}"
      if [ $? -eq 0 ]; then
        if printf '%s\n' "$ADD_MEMBERS_TEXT" | jq -e --arg member "$GENERIC_MEMBER_CANDIDATE" 'any(.members[]?; . == $member)' >/dev/null 2>&1; then
          echo "PASS: add_space_members includes candidate"
          PASSED=$((PASSED + 1))
        else
          fail_test "add_space_members includes candidate" "member not returned after add"
        fi
        sleep 2
        if run_capture_to_var ADD_MEMBERS_PERSISTED_TEXT "get_space($GENERIC_SPACE_ID after add_space_members)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_space\",\"arguments\":{\"space\":\"$GENERIC_SPACE_ID\",\"includeArchived\":true}},\"id\":2}"; then
          assert_json_array_contains "get_space sees add_space_members persisted" "$ADD_MEMBERS_PERSISTED_TEXT" ".members // []" "$GENERIC_MEMBER_CANDIDATE"
        fi
      fi

      if [ "${INITIAL_OWNER_COUNT:-0}" -gt 0 ]; then
        OWNER_ARGS_JSON=$(printf '%s\n' "$INITIAL_OWNERS_JSON" | jq -c --arg member "$GENERIC_MEMBER_CANDIDATE" '. + [$member] | unique' 2>/dev/null)
        if run_test "set_space_owners($GENERIC_SPACE_ID add candidate owner)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"set_space_owners\",\"arguments\":{\"space\":\"$GENERIC_SPACE_ID\",\"owners\":$OWNER_ARGS_JSON,\"ensureMembers\":true}},\"id\":2}"; then
          sleep 2
          if run_capture_to_var OWNERS_ADD_PERSISTED_TEXT "get_space($GENERIC_SPACE_ID after set_space_owners add)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_space\",\"arguments\":{\"space\":\"$GENERIC_SPACE_ID\",\"includeArchived\":true}},\"id\":2}"; then
            assert_json_array_contains "get_space sees set_space_owners owner persisted" "$OWNERS_ADD_PERSISTED_TEXT" ".owners // []" "$GENERIC_MEMBER_CANDIDATE"
            assert_json_array_contains "get_space sees set_space_owners ensureMembers persisted" "$OWNERS_ADD_PERSISTED_TEXT" ".members // []" "$GENERIC_MEMBER_CANDIDATE"
          fi
        fi
        if run_test "set_space_owners($GENERIC_SPACE_ID restore owners)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"set_space_owners\",\"arguments\":{\"space\":\"$GENERIC_SPACE_ID\",\"owners\":$INITIAL_OWNERS_JSON,\"ensureMembers\":true}},\"id\":2}"; then
          sleep 2
          if run_capture_to_var OWNERS_RESTORE_PERSISTED_TEXT "get_space($GENERIC_SPACE_ID after set_space_owners restore)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_space\",\"arguments\":{\"space\":\"$GENERIC_SPACE_ID\",\"includeArchived\":true}},\"id\":2}"; then
            assert_json_array_same_set "get_space sees set_space_owners restore persisted" "$OWNERS_RESTORE_PERSISTED_TEXT" ".owners // []" "$INITIAL_OWNERS_JSON"
          fi
        fi
      else
        skip_test "set_space_owners" "generic space fixture has no owner list to restore"
      fi

      if run_test "remove_space_members($GENERIC_SPACE_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"remove_space_members\",\"arguments\":{\"space\":\"$GENERIC_SPACE_ID\",\"members\":[$GENERIC_MEMBER_JSON]}},\"id\":2}"; then
        sleep 2
        if run_capture_to_var REMOVE_MEMBERS_PERSISTED_TEXT "get_space($GENERIC_SPACE_ID after remove_space_members)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_space\",\"arguments\":{\"space\":\"$GENERIC_SPACE_ID\",\"includeArchived\":true}},\"id\":2}"; then
          assert_json_array_not_contains "get_space sees remove_space_members persisted" "$REMOVE_MEMBERS_PERSISTED_TEXT" ".members // []" "$GENERIC_MEMBER_CANDIDATE"
        fi
      fi
    else
      GENERIC_EXISTING_MEMBER=$(printf '%s\n' "$GENERIC_SPACE_GET_TEXT" | jq -r '.members[0] // empty' 2>/dev/null)
      if [ -n "$GENERIC_EXISTING_MEMBER" ]; then
        GENERIC_EXISTING_MEMBER_JSON=$(json_string "$GENERIC_EXISTING_MEMBER")
        if run_test "remove_space_members($GENERIC_SPACE_ID existing member)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"remove_space_members\",\"arguments\":{\"space\":\"$GENERIC_SPACE_ID\",\"members\":[$GENERIC_EXISTING_MEMBER_JSON]}},\"id\":2}"; then
          sleep 2
          if run_capture_to_var REMOVE_EXISTING_PERSISTED_TEXT "get_space($GENERIC_SPACE_ID after remove existing member)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_space\",\"arguments\":{\"space\":\"$GENERIC_SPACE_ID\",\"includeArchived\":true}},\"id\":2}"; then
            assert_json_array_not_contains "get_space sees remove existing member persisted" "$REMOVE_EXISTING_PERSISTED_TEXT" ".members // []" "$GENERIC_EXISTING_MEMBER"
          fi
        fi
        if run_test "add_space_members($GENERIC_SPACE_ID restore existing member)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_space_members\",\"arguments\":{\"space\":\"$GENERIC_SPACE_ID\",\"members\":[$GENERIC_EXISTING_MEMBER_JSON]}},\"id\":2}"; then
          sleep 2
          if run_capture_to_var RESTORE_EXISTING_PERSISTED_TEXT "get_space($GENERIC_SPACE_ID after restore existing member)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_space\",\"arguments\":{\"space\":\"$GENERIC_SPACE_ID\",\"includeArchived\":true}},\"id\":2}"; then
            assert_json_array_contains "get_space sees restore existing member persisted" "$RESTORE_EXISTING_PERSISTED_TEXT" ".members // []" "$GENERIC_EXISTING_MEMBER"
          fi
        fi
      else
        skip_test "add/remove_space_members" "generic space fixture has no members to restore"
      fi
      if [ "${INITIAL_OWNER_COUNT:-0}" -gt 0 ]; then
        if run_test "set_space_owners($GENERIC_SPACE_ID existing owners)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"set_space_owners\",\"arguments\":{\"space\":\"$GENERIC_SPACE_ID\",\"owners\":$INITIAL_OWNERS_JSON,\"ensureMembers\":true}},\"id\":2}"; then
          sleep 2
          if run_capture_to_var OWNERS_EXISTING_PERSISTED_TEXT "get_space($GENERIC_SPACE_ID after set existing owners)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_space\",\"arguments\":{\"space\":\"$GENERIC_SPACE_ID\",\"includeArchived\":true}},\"id\":2}"; then
            assert_json_array_same_set "get_space sees set existing owners persisted" "$OWNERS_EXISTING_PERSISTED_TEXT" ".owners // []" "$INITIAL_OWNERS_JSON"
          fi
        fi
      else
        skip_test "set_space_owners" "generic space fixture has no owner list to restore"
      fi
    fi
  else
    skip_test "add/remove_space_members" "workspace members or generic space details unavailable"
    skip_test "set_space_owners" "workspace members or generic space details unavailable"
  fi

  run_test "delete_teamspace($GENERIC_SPACE_ID generic_fixture)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_teamspace\",\"arguments\":{\"teamspace\":\"$GENERIC_SPACE_ID\"}},\"id\":2}"
fi
echo ""

##############################
# 13c. GENERIC ASSOCIATIONS
##############################
echo "=== 13c. Generic Associations ==="
run_capture_to_var ASSOCIATIONS_TEXT "list_associations" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_associations","arguments":{"limit":5}},"id":2}'
ASSOC_ID=$(echo "$ASSOCIATIONS_TEXT" | jq -r '.associations[0].associationId // empty' 2>/dev/null)
ASSOC_SOURCE_CLASS=$(echo "$ASSOCIATIONS_TEXT" | jq -r '.associations[0].sourceClass // empty' 2>/dev/null)
ASSOC_TARGET_CLASS=$(echo "$ASSOCIATIONS_TEXT" | jq -r '.associations[0].targetClass // empty' 2>/dev/null)
ASSOC_KNOWN_CLASS=$(echo "$ASSOCIATIONS_TEXT" | jq -r '
  first(.associations[]? | [.sourceClass, .targetClass][] | select(
    . == "tracker:class:Issue"
    or . == "tracker:class:Project"
    or . == "document:class:Document"
    or . == "document:class:Teamspace"
    or . == "core:class:Relation"
    or . == "core:class:Doc"
  )) // empty
' 2>/dev/null)
case "$ASSOC_KNOWN_CLASS" in
  "tracker:class:Issue") ASSOC_EXPECTED_LABEL="Issue" ;;
  "tracker:class:Project") ASSOC_EXPECTED_LABEL="Project" ;;
  "document:class:Document") ASSOC_EXPECTED_LABEL="Document" ;;
  "document:class:Teamspace") ASSOC_EXPECTED_LABEL="Teamspace" ;;
  "core:class:Relation") ASSOC_EXPECTED_LABEL="Relation" ;;
  "core:class:Doc") ASSOC_EXPECTED_LABEL="Huly document" ;;
  *) ASSOC_EXPECTED_LABEL="" ;;
esac

if [ -n "$ASSOC_ID" ]; then
  assert_json_field_nonempty "list_associations has id" "$ASSOCIATIONS_TEXT" ".associations[0].associationId"
  if [ -n "$ASSOC_KNOWN_CLASS" ] && [ -n "$ASSOC_EXPECTED_LABEL" ]; then
    assert_json_association_has_expected_class_label "list_associations labels $ASSOC_KNOWN_CLASS" \
      "$ASSOCIATIONS_TEXT" "$ASSOC_KNOWN_CLASS" "$ASSOC_EXPECTED_LABEL"
  else
    skip_test "list_associations class labels" "workspace returned no associations for known SDK classes"
  fi
  run_test "list_associations(filter:$ASSOC_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_associations\",\"arguments\":{\"association\":\"$ASSOC_ID\"}},\"id\":2}"
  if [ -n "$ASSOC_SOURCE_CLASS" ] && [ -n "$ASSOC_TARGET_CLASS" ]; then
    run_test "list_associations(class filters)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_associations\",\"arguments\":{\"sourceClass\":\"$ASSOC_SOURCE_CLASS\",\"targetClass\":\"$ASSOC_TARGET_CLASS\",\"limit\":5}},\"id\":2}"
  fi
  run_test "list_relations($ASSOC_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_relations\",\"arguments\":{\"association\":\"$ASSOC_ID\",\"limit\":3}},\"id\":2}"
else
  skip_test "list_associations has id" "no visible associations found in workspace"
  skip_test "list_associations(filter)" "no visible associations found in workspace"
  skip_test "list_relations" "no visible associations found in workspace"
fi

run_capture_to_var WRITABLE_ASSOCIATIONS_TEXT "list_associations(writableOnly)" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_associations","arguments":{"writableOnly":true,"limit":1}},"id":2}'
WRITABLE_ASSOC_ID=$(echo "$WRITABLE_ASSOCIATIONS_TEXT" | jq -r '.associations[0].associationId // empty' 2>/dev/null)
if [ -n "$WRITABLE_ASSOC_ID" ]; then
  assert_json_field_nonempty "list_associations(writableOnly) has writable id" "$WRITABLE_ASSOCIATIONS_TEXT" ".associations[0].associationId"
else
  skip_test "list_associations(writableOnly) has writable id" "workspace returned no writable associations"
fi

GENERIC_ROLE_SOURCE="mcp source $RUN_ID"
GENERIC_ROLE_TARGET="mcp target $RUN_ID"
GENERIC_ROLE_SOURCE_JSON=$(json_string "$GENERIC_ROLE_SOURCE")
GENERIC_ROLE_TARGET_JSON=$(json_string "$GENERIC_ROLE_TARGET")
run_capture_to_var CREATED_ASSOC_TEXT "create_association(generic_issue_one_to_many)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_association\",\"arguments\":{\"sourceClass\":\"tracker:class:Issue\",\"targetClass\":\"tracker:class:Issue\",\"sourceRole\":$GENERIC_ROLE_SOURCE_JSON,\"targetRole\":$GENERIC_ROLE_TARGET_JSON,\"cardinality\":\"one-to-many\"}},\"id\":2}"
if [ $? -eq 0 ]; then
  CREATED_ASSOC_ID=$(echo "$CREATED_ASSOC_TEXT" | jq -r '.association.associationId // empty' 2>/dev/null)
  if [ -n "$CREATED_ASSOC_ID" ]; then
    GENERIC_ASSOCIATION_CLEANUP_IDS="$GENERIC_ASSOCIATION_CLEANUP_IDS $CREATED_ASSOC_ID"
  fi
  assert_json_field_equals "create_association created" "$CREATED_ASSOC_TEXT" ".created" "true"
  run_capture_to_var DUP_ASSOC_TEXT "create_association(idempotent)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_association\",\"arguments\":{\"sourceClass\":\"tracker:class:Issue\",\"targetClass\":\"tracker:class:Issue\",\"sourceRole\":$GENERIC_ROLE_SOURCE_JSON,\"targetRole\":$GENERIC_ROLE_TARGET_JSON,\"cardinality\":\"one-to-many\"}},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_field_equals "create_association idempotent existing" "$DUP_ASSOC_TEXT" ".existing" "true"
  fi
else
  CREATED_ASSOC_ID=""
  skip_test "create_association idempotent existing" "create_association failed"
fi

run_capture_to_var GENERIC_SOURCE_TEXT "create_issue(for_generic_associations)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"title\":\"Generic Associations Source $RUN_ID\"}},\"id\":2}"
if [ $? -eq 0 ]; then
  GENERIC_SOURCE_ID=$(echo "$GENERIC_SOURCE_TEXT" | jq -r '.identifier // empty' 2>/dev/null)
  GENERIC_SOURCE_OBJ_ID=$(echo "$GENERIC_SOURCE_TEXT" | jq -r '.issueId // empty' 2>/dev/null)
  GENERIC_SOURCE_OBJ_ID_JSON=$(json_string "$GENERIC_SOURCE_OBJ_ID")
  if [ -n "$GENERIC_SOURCE_OBJ_ID" ]; then
    run_capture_to_var OMITTED_RELATIONS_TEXT "list_relations(source raw issue)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_relations\",\"arguments\":{\"source\":{\"kind\":\"raw\",\"id\":$GENERIC_SOURCE_OBJ_ID_JSON,\"class\":\"tracker:class:Issue\"},\"limit\":3}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_nonempty "list_relations(source raw issue) has total" "$OMITTED_RELATIONS_TEXT" ".total"
    fi

    run_capture_to_var EITHER_RELATIONS_TEXT "list_relations(source raw issue,either)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_relations\",\"arguments\":{\"source\":{\"kind\":\"raw\",\"id\":$GENERIC_SOURCE_OBJ_ID_JSON,\"class\":\"tracker:class:Issue\"},\"direction\":\"either\",\"limit\":3}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_nonempty "list_relations(source raw issue,either) has total" "$EITHER_RELATIONS_TEXT" ".total"
    fi
  else
    skip_test "list_relations(source raw issue)" "generic association source issue did not return issueId"
    skip_test "list_relations(source raw issue,either)" "generic association source issue did not return issueId"
  fi
  run_capture_to_var GENERIC_TARGET_TEXT "create_issue(for_generic_associations_target)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"title\":\"Generic Associations Target $RUN_ID\"}},\"id\":2}"
  if [ $? -eq 0 ]; then
    GENERIC_TARGET_ID=$(echo "$GENERIC_TARGET_TEXT" | jq -r '.identifier // empty' 2>/dev/null)
    GENERIC_TARGET_OBJ_ID=$(echo "$GENERIC_TARGET_TEXT" | jq -r '.issueId // empty' 2>/dev/null)
  else
    GENERIC_TARGET_ID=""
    GENERIC_TARGET_OBJ_ID=""
  fi
  run_capture_to_var GENERIC_SOURCE2_TEXT "create_issue(for_generic_associations_cardinality)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"title\":\"Generic Associations Cardinality $RUN_ID\"}},\"id\":2}"
  if [ $? -eq 0 ]; then
    GENERIC_SOURCE2_ID=$(echo "$GENERIC_SOURCE2_TEXT" | jq -r '.identifier // empty' 2>/dev/null)
    GENERIC_SOURCE2_OBJ_ID=$(echo "$GENERIC_SOURCE2_TEXT" | jq -r '.issueId // empty' 2>/dev/null)
  else
    GENERIC_SOURCE2_ID=""
    GENERIC_SOURCE2_OBJ_ID=""
  fi
  if [ -n "$CREATED_ASSOC_ID" ] && [ -n "$GENERIC_SOURCE_OBJ_ID" ] && [ -n "$GENERIC_TARGET_OBJ_ID" ] && [ -n "$GENERIC_SOURCE2_OBJ_ID" ]; then
    GENERIC_SOURCE_OBJ_ID_JSON=$(json_string "$GENERIC_SOURCE_OBJ_ID")
    GENERIC_TARGET_OBJ_ID_JSON=$(json_string "$GENERIC_TARGET_OBJ_ID")
    GENERIC_SOURCE2_OBJ_ID_JSON=$(json_string "$GENERIC_SOURCE2_OBJ_ID")
    CREATE_RELATION_ARGS="{\"association\":\"$CREATED_ASSOC_ID\",\"source\":{\"kind\":\"raw\",\"id\":$GENERIC_SOURCE_OBJ_ID_JSON,\"class\":\"tracker:class:Issue\"},\"target\":{\"kind\":\"raw\",\"id\":$GENERIC_TARGET_OBJ_ID_JSON,\"class\":\"tracker:class:Issue\"}}"
    run_capture_to_var CREATED_RELATION_TEXT "create_relation(generic)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_relation\",\"arguments\":$CREATE_RELATION_ARGS},\"id\":2}"
    if [ $? -eq 0 ]; then
      CREATED_RELATION_ID=$(echo "$CREATED_RELATION_TEXT" | jq -r '.relationId // empty' 2>/dev/null)
      assert_json_field_equals "create_relation created" "$CREATED_RELATION_TEXT" ".created" "true"
      run_capture_to_var EXISTING_RELATION_TEXT "create_relation(idempotent)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_relation\",\"arguments\":$CREATE_RELATION_ARGS},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_field_equals "create_relation idempotent existing" "$EXISTING_RELATION_TEXT" ".existing" "true"
      fi
      run_capture_to_var LIST_CREATED_RELATION_TEXT "list_relations(generic created)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_relations\",\"arguments\":{\"association\":\"$CREATED_ASSOC_ID\",\"source\":{\"kind\":\"raw\",\"id\":$GENERIC_SOURCE_OBJ_ID_JSON,\"class\":\"tracker:class:Issue\"},\"target\":{\"kind\":\"raw\",\"id\":$GENERIC_TARGET_OBJ_ID_JSON,\"class\":\"tracker:class:Issue\"},\"limit\":3}},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_field_equals "list_relations(generic created) total" "$LIST_CREATED_RELATION_TEXT" ".total" "1"
      fi
      run_expect_error "delete_association(in use)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_association\",\"arguments\":{\"association\":\"$CREATED_ASSOC_ID\"}},\"id\":2}"
      run_expect_error "create_relation(cardinality violation)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_relation\",\"arguments\":{\"association\":\"$CREATED_ASSOC_ID\",\"source\":{\"kind\":\"raw\",\"id\":$GENERIC_SOURCE2_OBJ_ID_JSON,\"class\":\"tracker:class:Issue\"},\"target\":{\"kind\":\"raw\",\"id\":$GENERIC_TARGET_OBJ_ID_JSON,\"class\":\"tracker:class:Issue\"}}},\"id\":2}"
      run_capture_to_var DELETE_TRIPLE_TEXT "delete_relation(generic triple)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_relation\",\"arguments\":$CREATE_RELATION_ARGS},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_field_equals "delete_relation triple deleted" "$DELETE_TRIPLE_TEXT" ".deleted" "true"
      fi
      run_capture_to_var DELETE_TRIPLE_AGAIN_TEXT "delete_relation(generic triple idempotent)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_relation\",\"arguments\":$CREATE_RELATION_ARGS},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_field_equals "delete_relation triple idempotent" "$DELETE_TRIPLE_AGAIN_TEXT" ".deleted" "false"
      fi
      run_capture_to_var CREATED_RELATION_BY_ID_TEXT "create_relation(generic for id delete)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_relation\",\"arguments\":$CREATE_RELATION_ARGS},\"id\":2}"
      if [ $? -eq 0 ]; then
        RELATION_DELETE_ID=$(echo "$CREATED_RELATION_BY_ID_TEXT" | jq -r '.relationId // empty' 2>/dev/null)
        if [ -n "$RELATION_DELETE_ID" ]; then
          run_capture_to_var DELETE_BY_ID_TEXT "delete_relation(generic id)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_relation\",\"arguments\":{\"relation\":\"$RELATION_DELETE_ID\"}},\"id\":2}"
          if [ $? -eq 0 ]; then
            assert_json_field_equals "delete_relation id deleted" "$DELETE_BY_ID_TEXT" ".deleted" "true"
          fi
          run_capture_to_var DELETE_BY_ID_AGAIN_TEXT "delete_relation(generic id idempotent)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_relation\",\"arguments\":{\"relation\":\"$RELATION_DELETE_ID\"}},\"id\":2}"
          if [ $? -eq 0 ]; then
            assert_json_field_equals "delete_relation id idempotent" "$DELETE_BY_ID_AGAIN_TEXT" ".deleted" "false"
          fi
        fi
      fi
      run_capture_to_var DELETE_ASSOC_TEXT "delete_association(unused)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_association\",\"arguments\":{\"association\":\"$CREATED_ASSOC_ID\"}},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_field_equals "delete_association unused deleted" "$DELETE_ASSOC_TEXT" ".deleted" "true"
        assert_json_field_equals "delete_association unused relation count" "$DELETE_ASSOC_TEXT" ".relationCount" "0"
      fi
      run_capture_to_var DELETE_ASSOC_AGAIN_TEXT "delete_association(idempotent missing)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_association\",\"arguments\":{\"association\":\"$CREATED_ASSOC_ID\"}},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_field_equals "delete_association idempotent missing" "$DELETE_ASSOC_AGAIN_TEXT" ".deleted" "false"
      fi
    fi
  else
    skip_test "create_relation(generic)" "missing disposable association or issue endpoints"
    skip_test "create_relation(idempotent)" "missing disposable association or issue endpoints"
    skip_test "list_relations(generic created)" "missing disposable association or issue endpoints"
    skip_test "delete_association(in use)" "missing disposable association or issue endpoints"
    skip_test "create_relation(cardinality violation)" "missing disposable association or issue endpoints"
    skip_test "delete_relation(generic triple)" "missing disposable association or issue endpoints"
    skip_test "delete_relation(generic triple idempotent)" "missing disposable association or issue endpoints"
    skip_test "delete_relation(generic id)" "missing disposable association or issue endpoints"
    skip_test "delete_relation(generic id idempotent)" "missing disposable association or issue endpoints"
    skip_test "delete_association(unused)" "missing disposable association or issue endpoints"
    skip_test "delete_association(idempotent missing)" "missing disposable association or issue endpoints"
  fi
  if [ -n "$GENERIC_TARGET_ID" ]; then
    run_test "delete_issue(generic_assoc_target:$GENERIC_TARGET_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$GENERIC_TARGET_ID\"}},\"id\":2}"
  fi
  if [ -n "$GENERIC_SOURCE2_ID" ]; then
    run_test "delete_issue(generic_assoc_cardinality:$GENERIC_SOURCE2_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$GENERIC_SOURCE2_ID\"}},\"id\":2}"
  fi
  if [ -n "$GENERIC_SOURCE_ID" ]; then
    run_test "delete_issue(generic_assoc:$GENERIC_SOURCE_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$GENERIC_SOURCE_ID\"}},\"id\":2}"
  fi
else
  skip_test "list_relations(source raw issue)" "could not create disposable source issue"
  skip_test "list_relations(source raw issue,either)" "could not create disposable source issue"
  skip_test "create_relation(generic)" "could not create disposable source issue"
  skip_test "create_relation(idempotent)" "could not create disposable source issue"
  skip_test "list_relations(generic created)" "could not create disposable source issue"
  skip_test "delete_association(in use)" "could not create disposable source issue"
  skip_test "create_relation(cardinality violation)" "could not create disposable source issue"
  skip_test "delete_relation(generic triple)" "could not create disposable source issue"
  skip_test "delete_relation(generic triple idempotent)" "could not create disposable source issue"
  skip_test "delete_relation(generic id)" "could not create disposable source issue"
  skip_test "delete_relation(generic id idempotent)" "could not create disposable source issue"
  skip_test "delete_association(unused)" "could not create disposable source issue"
  skip_test "delete_association(idempotent missing)" "could not create disposable source issue"
fi

run_capture_to_var CARD_LOCATOR_MASTER_TEXT "card locator list_master_tags(Default)" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_master_tags","arguments":{"cardSpace":"Default"}},"id":2}'
CARD_LOCATOR_MASTER_ID=$(echo "$CARD_LOCATOR_MASTER_TEXT" | jq -r '.masterTags[0].id // empty' 2>/dev/null)
if [ -n "$CARD_LOCATOR_MASTER_ID" ]; then
  CARD_LOCATOR_TITLE="IntTest Generic Association Card $RUN_ID"
  CARD_LOCATOR_TITLE_JSON=$(json_string "$CARD_LOCATOR_TITLE")
  CARD_LOCATOR_MASTER_ID_JSON=$(json_string "$CARD_LOCATOR_MASTER_ID")
  run_capture_to_var CARD_LOCATOR_CARD_TEXT "create_card(for_generic_card_locator)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_card\",\"arguments\":{\"cardSpace\":\"Default\",\"type\":$CARD_LOCATOR_MASTER_ID_JSON,\"title\":$CARD_LOCATOR_TITLE_JSON,\"content\":\"Temporary card for generic association locator integration.\"}},\"id\":2}"
  if [ $? -eq 0 ]; then
    CARD_LOCATOR_CARD_ID=$(echo "$CARD_LOCATOR_CARD_TEXT" | jq -r '.id // empty' 2>/dev/null)
  else
    CARD_LOCATOR_CARD_ID=""
  fi

  run_capture_to_var CARD_LOCATOR_ISSUE_TEXT "create_issue(for_generic_card_locator)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"title\":\"Generic Card Locator Target $RUN_ID\"}},\"id\":2}"
  if [ $? -eq 0 ]; then
    CARD_LOCATOR_ISSUE_ID=$(echo "$CARD_LOCATOR_ISSUE_TEXT" | jq -r '.identifier // empty' 2>/dev/null)
    CARD_LOCATOR_ISSUE_OBJ_ID=$(echo "$CARD_LOCATOR_ISSUE_TEXT" | jq -r '.issueId // empty' 2>/dev/null)
  else
    CARD_LOCATOR_ISSUE_ID=""
    CARD_LOCATOR_ISSUE_OBJ_ID=""
  fi

  CARD_LOCATOR_SOURCE_ROLE="mcp card source $RUN_ID"
  CARD_LOCATOR_TARGET_ROLE="mcp issue target $RUN_ID"
  CARD_LOCATOR_SOURCE_ROLE_JSON=$(json_string "$CARD_LOCATOR_SOURCE_ROLE")
  CARD_LOCATOR_TARGET_ROLE_JSON=$(json_string "$CARD_LOCATOR_TARGET_ROLE")
  run_capture_to_var CARD_LOCATOR_ASSOC_TEXT "create_association(generic_card_to_issue)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_association\",\"arguments\":{\"sourceClass\":$CARD_LOCATOR_MASTER_ID_JSON,\"targetClass\":\"tracker:class:Issue\",\"sourceRole\":$CARD_LOCATOR_SOURCE_ROLE_JSON,\"targetRole\":$CARD_LOCATOR_TARGET_ROLE_JSON,\"cardinality\":\"many-to-many\"}},\"id\":2}"
  if [ $? -eq 0 ]; then
    CARD_LOCATOR_ASSOC_ID=$(echo "$CARD_LOCATOR_ASSOC_TEXT" | jq -r '.association.associationId // empty' 2>/dev/null)
    if [ -n "$CARD_LOCATOR_ASSOC_ID" ]; then
      GENERIC_ASSOCIATION_CLEANUP_IDS="$GENERIC_ASSOCIATION_CLEANUP_IDS $CARD_LOCATOR_ASSOC_ID"
    fi
  else
    CARD_LOCATOR_ASSOC_ID=""
  fi

  if [ -n "$CARD_LOCATOR_ASSOC_ID" ] && [ -n "$CARD_LOCATOR_CARD_ID" ] && [ -n "$CARD_LOCATOR_ISSUE_OBJ_ID" ]; then
    CARD_LOCATOR_CARD_ID_JSON=$(json_string "$CARD_LOCATOR_CARD_ID")
    CARD_LOCATOR_ISSUE_OBJ_ID_JSON=$(json_string "$CARD_LOCATOR_ISSUE_OBJ_ID")
    CARD_RELATION_ARGS_BY_ID="{\"association\":\"$CARD_LOCATOR_ASSOC_ID\",\"source\":{\"kind\":\"card\",\"card\":$CARD_LOCATOR_CARD_ID_JSON},\"target\":{\"kind\":\"raw\",\"id\":$CARD_LOCATOR_ISSUE_OBJ_ID_JSON,\"class\":\"tracker:class:Issue\"}}"
    CARD_RELATION_ARGS_BY_TITLE="{\"association\":\"$CARD_LOCATOR_ASSOC_ID\",\"source\":{\"kind\":\"card\",\"card\":$CARD_LOCATOR_TITLE_JSON,\"cardSpace\":\"Default\"},\"target\":{\"kind\":\"raw\",\"id\":$CARD_LOCATOR_ISSUE_OBJ_ID_JSON,\"class\":\"tracker:class:Issue\"}}"
    run_capture_to_var CARD_RELATION_TEXT "create_relation(card locator by id)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_relation\",\"arguments\":$CARD_RELATION_ARGS_BY_ID},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_equals "create_relation card locator by id created" "$CARD_RELATION_TEXT" ".created" "true"
      run_capture_to_var CARD_RELATION_TITLE_TEXT "create_relation(card locator by title)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_relation\",\"arguments\":$CARD_RELATION_ARGS_BY_TITLE},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_field_equals "create_relation card locator by title existing" "$CARD_RELATION_TITLE_TEXT" ".existing" "true"
      fi
      run_capture_to_var CARD_LIST_RELATIONS_TEXT "list_relations(card locator by title)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_relations\",\"arguments\":{\"association\":\"$CARD_LOCATOR_ASSOC_ID\",\"source\":{\"kind\":\"card\",\"card\":$CARD_LOCATOR_TITLE_JSON,\"cardSpace\":\"Default\"},\"target\":{\"kind\":\"raw\",\"id\":$CARD_LOCATOR_ISSUE_OBJ_ID_JSON,\"class\":\"tracker:class:Issue\"},\"limit\":3}},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_field_equals "list_relations card locator by title total" "$CARD_LIST_RELATIONS_TEXT" ".total" "1"
      fi
      run_test "delete_relation(card locator by title)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_relation\",\"arguments\":$CARD_RELATION_ARGS_BY_TITLE},\"id\":2}"
    fi
    run_test "delete_association(generic_card_to_issue)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_association\",\"arguments\":{\"association\":\"$CARD_LOCATOR_ASSOC_ID\"}},\"id\":2}"
  else
    fail_test "generic association card locator setup" "missing disposable card, issue, or association"
    if [ -n "$CARD_LOCATOR_ASSOC_ID" ]; then
      run_test "delete_association(generic_card_to_issue)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_association\",\"arguments\":{\"association\":\"$CARD_LOCATOR_ASSOC_ID\"}},\"id\":2}"
    fi
  fi

  if [ -n "$CARD_LOCATOR_ISSUE_ID" ]; then
    run_test "delete_issue(generic_card_locator:$CARD_LOCATOR_ISSUE_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$CARD_LOCATOR_ISSUE_ID\"}},\"id\":2}"
  fi
  if [ -n "$CARD_LOCATOR_CARD_ID" ]; then
    run_test "delete_card(generic_card_locator:$CARD_LOCATOR_CARD_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_card\",\"arguments\":{\"cardSpace\":\"Default\",\"card\":\"$CARD_LOCATOR_CARD_ID\"}},\"id\":2}"
  fi
else
  fail_test "generic association card locator setup" "Default card space returned no master tags"
fi
echo ""

##############################
# 14. CARDS
##############################
echo "=== 14. Cards ==="
run_test "list_card_spaces" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_card_spaces","arguments":{}},"id":2}'
run_capture_to_var CARDS_MASTER_TEXT "list_master_tags(Default)" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_master_tags","arguments":{"cardSpace":"Default"}},"id":2}'
run_test "list_cards(Default)" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_cards","arguments":{"cardSpace":"Default","limit":3}},"id":2}'
DERIVED_CARD_TYPE_NAME=$(printf '%s\n' "$CARDS_MASTER_TEXT" | jq -r '.masterTags[0].name // empty' 2>/dev/null)
DERIVED_CARD_TYPE_ID=$(printf '%s\n' "$CARDS_MASTER_TEXT" | jq -r '.masterTags[0].id // empty' 2>/dev/null)
if [ -n "$DERIVED_CARD_TYPE_ID" ]; then
  DERIVED_CARD_TYPE_NAME_JSON=$(json_string "$DERIVED_CARD_TYPE_NAME")
  DERIVED_CARD_TYPE_ID_JSON=$(json_string "$DERIVED_CARD_TYPE_ID")
  DERIVED_CARD_LABEL_TITLE="IntTest Derived Label Card $RUN_ID"
  DERIVED_CARD_ID_TITLE="IntTest Derived Id Card $RUN_ID"
  DERIVED_CARD_LABEL_TITLE_JSON=$(json_string "$DERIVED_CARD_LABEL_TITLE")
  DERIVED_CARD_ID_TITLE_JSON=$(json_string "$DERIVED_CARD_ID_TITLE")
  DERIVED_CARD_LABEL_TITLE_LOWER=$(printf '%s' "$DERIVED_CARD_LABEL_TITLE" | tr '[:upper:]' '[:lower:]')
  DERIVED_CARD_LABEL_REGEX_JSON=$(json_string "%$DERIVED_CARD_LABEL_TITLE%")
  DERIVED_CARD_LABEL_PREFIX_REGEX_JSON=$(json_string "$DERIVED_CARD_LABEL_TITLE%")
  DERIVED_CARD_LABEL_CASE_REGEX_JSON=$(json_string "%$DERIVED_CARD_LABEL_TITLE_LOWER%")

  run_capture_to_var DERIVED_CARD_LABEL_TEXT "create_card(derived label:$DERIVED_CARD_TYPE_NAME)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_card\",\"arguments\":{\"cardSpace\":\"Default\",\"type\":$DERIVED_CARD_TYPE_NAME_JSON,\"title\":$DERIVED_CARD_LABEL_TITLE_JSON,\"content\":\"Temporary derived card created by label.\"}},\"id\":2}"
  if [ $? -eq 0 ]; then
    DERIVED_CARD_LABEL_ID=$(printf '%s\n' "$DERIVED_CARD_LABEL_TEXT" | jq -r '.id // empty' 2>/dev/null)
  else
    DERIVED_CARD_LABEL_ID=""
  fi
  if [ -n "$DERIVED_CARD_LABEL_ID" ]; then
    DERIVED_CARD_LABEL_ID_JSON=$(json_string "$DERIVED_CARD_LABEL_ID")
    run_capture_to_var DERIVED_CARD_LABEL_GET_TEXT "get_card(derived label:$DERIVED_CARD_LABEL_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_card\",\"arguments\":{\"cardSpace\":\"Default\",\"card\":$DERIVED_CARD_LABEL_ID_JSON}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_equals "get_card derived label keeps type" "$DERIVED_CARD_LABEL_GET_TEXT" ".type" "$DERIVED_CARD_TYPE_ID"
    fi
    run_capture_to_var DERIVED_CARD_LIST_TEXT "list_cards(Default,type:$DERIVED_CARD_TYPE_NAME)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_cards\",\"arguments\":{\"cardSpace\":\"Default\",\"type\":$DERIVED_CARD_TYPE_NAME_JSON,\"limit\":10}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_array_contains "list_cards derived label includes card" "$DERIVED_CARD_LIST_TEXT" ".cards | map(.id)" "$DERIVED_CARD_LABEL_ID"
    fi
    run_capture_to_var DERIVED_CARD_REGEX_TEXT "list_cards(Default,titleRegex SIMILAR TO contains)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_cards\",\"arguments\":{\"cardSpace\":\"Default\",\"titleRegex\":$DERIVED_CARD_LABEL_REGEX_JSON,\"limit\":10}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_array_contains "list_cards titleRegex SIMILAR TO contains includes card" "$DERIVED_CARD_REGEX_TEXT" ".cards | map(.id)" "$DERIVED_CARD_LABEL_ID"
    fi
    run_capture_to_var DERIVED_CARD_REGEX_PREFIX_TEXT "list_cards(Default,titleRegex SIMILAR TO prefix)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_cards\",\"arguments\":{\"cardSpace\":\"Default\",\"titleRegex\":$DERIVED_CARD_LABEL_PREFIX_REGEX_JSON,\"limit\":10}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_array_contains "list_cards titleRegex SIMILAR TO prefix includes card" "$DERIVED_CARD_REGEX_PREFIX_TEXT" ".cards | map(.id)" "$DERIVED_CARD_LABEL_ID"
    fi
    run_capture_to_var DERIVED_CARD_REGEX_CASE_TEXT "list_cards(Default,titleRegex case-sensitive miss)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_cards\",\"arguments\":{\"cardSpace\":\"Default\",\"titleRegex\":$DERIVED_CARD_LABEL_CASE_REGEX_JSON,\"limit\":10}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_array_not_contains "list_cards titleRegex is case-sensitive" "$DERIVED_CARD_REGEX_CASE_TEXT" ".cards | map(.id)" "$DERIVED_CARD_LABEL_ID"
    fi
  else
    fail_test "create_card(derived label:$DERIVED_CARD_TYPE_NAME) returns id" "missing id"
  fi

  run_capture_to_var DERIVED_CARD_ID_TEXT "create_card(derived id:$DERIVED_CARD_TYPE_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_card\",\"arguments\":{\"cardSpace\":\"Default\",\"type\":$DERIVED_CARD_TYPE_ID_JSON,\"title\":$DERIVED_CARD_ID_TITLE_JSON,\"content\":\"Temporary derived card created by id.\"}},\"id\":2}"
  if [ $? -eq 0 ]; then
    DERIVED_CARD_ID_ID=$(printf '%s\n' "$DERIVED_CARD_ID_TEXT" | jq -r '.id // empty' 2>/dev/null)
  else
    DERIVED_CARD_ID_ID=""
  fi
  if [ -n "$DERIVED_CARD_ID_ID" ]; then
    DERIVED_CARD_ID_ID_JSON=$(json_string "$DERIVED_CARD_ID_ID")
    run_capture_to_var DERIVED_CARD_ID_GET_TEXT "get_card(derived id:$DERIVED_CARD_ID_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_card\",\"arguments\":{\"cardSpace\":\"Default\",\"card\":$DERIVED_CARD_ID_ID_JSON}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_equals "get_card derived id keeps type" "$DERIVED_CARD_ID_GET_TEXT" ".type" "$DERIVED_CARD_TYPE_ID"
    fi
  else
    fail_test "create_card(derived id:$DERIVED_CARD_TYPE_ID) returns id" "missing id"
  fi

  CARD_UNVERSIONED_TITLE="IntTest Unversioned Card $RUN_ID"
  CARD_UNVERSIONED_TITLE_JSON=$(json_string "$CARD_UNVERSIONED_TITLE")
  run_capture_to_var CARD_UNVERSIONED_CREATE_TEXT "create_card(unversioned fixture)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_card\",\"arguments\":{\"cardSpace\":\"Default\",\"type\":$DERIVED_CARD_TYPE_ID_JSON,\"title\":$CARD_UNVERSIONED_TITLE_JSON,\"content\":\"Disposable unversioned fixture.\"}},\"id\":2}"
  CARD_UNVERSIONED_ID=$(printf '%s\n' "$CARD_UNVERSIONED_CREATE_TEXT" | jq -r '.id // empty' 2>/dev/null)
  CARD_UNVERSIONED_CLEANUP_ID="$CARD_UNVERSIONED_ID"
  if [ -n "$CARD_UNVERSIONED_ID" ]; then
    CARD_UNVERSIONED_ID_JSON=$(json_string "$CARD_UNVERSIONED_ID")
    if pnpm exec tsx scripts/integration-card-version-history.ts \
      --mode strip \
      --cardSpace "Default" \
      --card "$CARD_UNVERSIONED_ID" >/dev/null 2>&1; then
      echo "PASS: seed absent/null-normalized card version metadata"
      PASSED=$((PASSED + 1))
      restart_http_transport_if_needed "after unversioned card fixture write" || exit 1
      run_capture_to_var CARD_UNVERSIONED_GET_TEXT "get_card(omits incoherent version metadata)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_card\",\"arguments\":{\"cardSpace\":\"Default\",\"card\":$CARD_UNVERSIONED_ID_JSON}},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_field_equals "get_card omits absent version metadata" "$CARD_UNVERSIONED_GET_TEXT" ".version" "null"
      fi
      run_capture_to_var CARD_UNVERSIONED_HISTORY_TEXT "list_card_versions(unversioned singleton)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_card_versions\",\"arguments\":{\"cardSpace\":\"Default\",\"card\":$CARD_UNVERSIONED_ID_JSON}},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_field_equals "unversioned history length" "$CARD_UNVERSIONED_HISTORY_TEXT" ".versions | length" "1"
        assert_json_field_equals "unversioned history total" "$CARD_UNVERSIONED_HISTORY_TEXT" ".total" "1"
        assert_json_field_equals "unversioned history is complete" "$CARD_UNVERSIONED_HISTORY_TEXT" ".hasMore" "false"
        assert_json_field_equals "unversioned history omits metadata" "$CARD_UNVERSIONED_HISTORY_TEXT" ".versions[0].version" "null"
      fi
    else
      fail_test "seed absent/null-normalized card version metadata" "integration SDK fixture setup failed"
    fi
    if run_test "delete_card(unversioned fixture:$CARD_UNVERSIONED_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_card\",\"arguments\":{\"cardSpace\":\"Default\",\"card\":$CARD_UNVERSIONED_ID_JSON}},\"id\":2}"; then
      CARD_UNVERSIONED_CLEANUP_ID=""
    fi
  else
    fail_test "create_card(unversioned fixture) returns id" "missing id"
  fi

  CARD_VERSION_TITLE="IntTest Card Version History $RUN_ID"
  CARD_VERSION_TITLE_JSON=$(json_string "$CARD_VERSION_TITLE")
  run_capture_to_var CARD_VERSION_BASE_TEXT "create_card(version history base)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_card\",\"arguments\":{\"cardSpace\":\"Default\",\"type\":$DERIVED_CARD_TYPE_ID_JSON,\"title\":$CARD_VERSION_TITLE_JSON,\"content\":\"Disposable read-only version history fixture.\"}},\"id\":2}"
  CARD_VERSION_BASE_ID=$(printf '%s\n' "$CARD_VERSION_BASE_TEXT" | jq -r '.id // empty' 2>/dev/null)
  CARD_VERSION_CLEANUP_BASE_ID="$CARD_VERSION_BASE_ID"
  if [ -n "$CARD_VERSION_BASE_ID" ]; then
    CARD_VERSION_BASE_ID_JSON=$(json_string "$CARD_VERSION_BASE_ID")
    CARD_VERSION_SETUP_TEXT=$(pnpm exec tsx scripts/integration-card-version-history.ts \
      --mode setup \
      --cardSpace "Default" \
      --card "$CARD_VERSION_BASE_ID" \
      --additionalVersions 50 2>/dev/null)
    if [ $? -eq 0 ]; then
      CARD_VERSION_OLD_ID=$(printf '%s\n' "$CARD_VERSION_SETUP_TEXT" | jq -r '.versionIds[0] // empty' 2>/dev/null)
      CARD_VERSION_OLD_ID_JSON=$(json_string "$CARD_VERSION_OLD_ID")
      echo "PASS: seed card version history beyond default page"
      PASSED=$((PASSED + 1))
      restart_http_transport_if_needed "after card version fixture writes" || exit 1

      run_capture_to_var CARD_VERSION_GET_TEXT "get_card(coherent version metadata)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_card\",\"arguments\":{\"cardSpace\":\"Default\",\"card\":$CARD_VERSION_BASE_ID_JSON}},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_field_equals "get_card version chain identity" "$CARD_VERSION_GET_TEXT" ".version.chainId" "$CARD_VERSION_BASE_ID"
        assert_json_field_equals "get_card version number" "$CARD_VERSION_GET_TEXT" ".version.number" "1"
      fi

      run_capture_to_var CARD_VERSION_DEFAULT_PAGE_TEXT "list_card_versions(default page by old version id)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_card_versions\",\"arguments\":{\"cardSpace\":\"Default\",\"card\":$CARD_VERSION_OLD_ID_JSON}},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_field_equals "list_card_versions default page length" "$CARD_VERSION_DEFAULT_PAGE_TEXT" ".versions | length" "50"
        assert_json_field_equals "list_card_versions authoritative total" "$CARD_VERSION_DEFAULT_PAGE_TEXT" ".total" "51"
        assert_json_field_equals "list_card_versions default page has more" "$CARD_VERSION_DEFAULT_PAGE_TEXT" ".hasMore" "true"
        assert_json_field_equals "list_card_versions oldest first" "$CARD_VERSION_DEFAULT_PAGE_TEXT" ".versions[0].version.number" "1"
      fi

      run_capture_to_var CARD_VERSION_TITLE_PAGE_TEXT "list_card_versions(exact title limited page)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_card_versions\",\"arguments\":{\"cardSpace\":\"Default\",\"card\":$CARD_VERSION_TITLE_JSON,\"limit\":2}},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_field_equals "list_card_versions title page length" "$CARD_VERSION_TITLE_PAGE_TEXT" ".versions | length" "2"
        assert_json_field_equals "list_card_versions title total" "$CARD_VERSION_TITLE_PAGE_TEXT" ".total" "51"
        assert_json_field_equals "list_card_versions title page has more" "$CARD_VERSION_TITLE_PAGE_TEXT" ".hasMore" "true"
        assert_json_field_equals "list_card_versions deterministic second version" "$CARD_VERSION_TITLE_PAGE_TEXT" ".versions[1].version.number" "2"
      fi
    else
      fail_test "seed card version history beyond default page" "integration SDK fixture setup failed"
    fi

    if ! cleanup_card_version_artifacts; then
      fail_test "cleanup card version history fixtures" "cleanup failed after 3 attempts; exit trap will retry"
    fi
    restart_http_transport_if_needed "after card version fixture cleanup" || exit 1
  else
    fail_test "create_card(version history base) returns id" "missing id"
  fi

  if [ -n "$DERIVED_CARD_LABEL_ID" ] && [ -n "$DERIVED_CARD_ID_ID" ]; then
    CARD_COMMENT_BODY="MCP card comment $RUN_ID"
    CARD_NATIVE_COMMENT_BODY="Huly-native card comment $RUN_ID"
    CARD_COMMENT_BODY_JSON=$(json_string "$CARD_COMMENT_BODY")
    CARD_UPDATED_COMMENT_BODY_JSON=$(json_string "Updated MCP card comment $RUN_ID")

    run_capture_to_var CARD_COMMENT_ADD_TEXT "add_card_comment(friendly locators)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_card_comment\",\"arguments\":{\"cardSpace\":\"Default\",\"card\":$DERIVED_CARD_LABEL_TITLE_JSON,\"body\":$CARD_COMMENT_BODY_JSON}},\"id\":2}"
    CARD_COMMENT_ID=$(printf '%s\n' "$CARD_COMMENT_ADD_TEXT" | jq -r '.commentId // empty' 2>/dev/null)
    CARD_COMMENT_ID_JSON=$(json_string "$CARD_COMMENT_ID")

    CARD_NATIVE_COMMENT_TEXT=$(pnpm exec tsx scripts/integration-card-native-comment.ts \
      --cardSpace "Default" \
      --card "$DERIVED_CARD_LABEL_ID" \
      --body "$CARD_NATIVE_COMMENT_BODY" 2>/dev/null)
    if [ $? -eq 0 ]; then
      CARD_NATIVE_COMMENT_ID=$(printf '%s\n' "$CARD_NATIVE_COMMENT_TEXT" | jq -r '.commentId // empty' 2>/dev/null)
    else
      CARD_NATIVE_COMMENT_ID=""
    fi
    if [ -n "$CARD_NATIVE_COMMENT_ID" ]; then
      echo "PASS: create Huly-native card comment"
      PASSED=$((PASSED + 1))
    else
      fail_test "create Huly-native card comment" "direct Huly addCollection failed"
    fi
    CARD_NATIVE_COMMENT_ID_JSON=$(json_string "$CARD_NATIVE_COMMENT_ID")

    restart_http_transport_if_needed "after card comment writes" || exit 1
    run_capture_to_var CARD_COMMENT_PAGE_TEXT "list_card_comments(pagination)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_card_comments\",\"arguments\":{\"cardSpace\":\"Default\",\"card\":$DERIVED_CARD_LABEL_TITLE_JSON,\"limit\":1}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_equals "list_card_comments page length" "$CARD_COMMENT_PAGE_TEXT" ".comments | length" "1"
      assert_json_field_equals "list_card_comments total includes MCP and Huly-native comments" "$CARD_COMMENT_PAGE_TEXT" ".total" "2"
    fi
    run_capture_to_var CARD_COMMENT_LIST_TEXT "list_card_comments(all compatible comments)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_card_comments\",\"arguments\":{\"cardSpace\":\"Default\",\"card\":$DERIVED_CARD_LABEL_ID_JSON,\"limit\":10}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_array_contains "list_card_comments includes MCP comment" "$CARD_COMMENT_LIST_TEXT" ".comments | map(.id)" "$CARD_COMMENT_ID"
      assert_json_array_contains "list_card_comments includes Huly-native comment" "$CARD_COMMENT_LIST_TEXT" ".comments | map(.id)" "$CARD_NATIVE_COMMENT_ID"
    fi

    run_capture_to_var CARD_COMMENT_UPDATE_TEXT "update_card_comment" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_card_comment\",\"arguments\":{\"cardSpace\":\"Default\",\"card\":$DERIVED_CARD_LABEL_ID_JSON,\"commentId\":$CARD_COMMENT_ID_JSON,\"body\":$CARD_UPDATED_COMMENT_BODY_JSON}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_equals "update_card_comment reports updated" "$CARD_COMMENT_UPDATE_TEXT" ".updated" "true"
    fi
    run_expect_error_contains "update_card_comment rejects comment from another card" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_card_comment\",\"arguments\":{\"cardSpace\":\"Default\",\"card\":$DERIVED_CARD_ID_ID_JSON,\"commentId\":$CARD_COMMENT_ID_JSON,\"body\":\"Unauthorized cross-card update\"}},\"id\":2}" \
      "not found on card"

    run_test "delete_card_comment(MCP-created)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_card_comment\",\"arguments\":{\"cardSpace\":\"Default\",\"card\":$DERIVED_CARD_LABEL_ID_JSON,\"commentId\":$CARD_COMMENT_ID_JSON}},\"id\":2}"
    run_test "delete_card_comment(Huly-native)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_card_comment\",\"arguments\":{\"cardSpace\":\"Default\",\"card\":$DERIVED_CARD_LABEL_ID_JSON,\"commentId\":$CARD_NATIVE_COMMENT_ID_JSON}},\"id\":2}"
    restart_http_transport_if_needed "after card comment deletes" || exit 1
    run_expect_error_contains "delete_card_comment(missing)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_card_comment\",\"arguments\":{\"cardSpace\":\"Default\",\"card\":$DERIVED_CARD_LABEL_ID_JSON,\"commentId\":$CARD_COMMENT_ID_JSON}},\"id\":2}" \
      "not found on card"
  else
    skip_test "card comment CRUD" "requires two disposable cards"
  fi

  if [ -n "$DERIVED_CARD_LABEL_ID" ]; then
    run_test "delete_card(derived label:$DERIVED_CARD_LABEL_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_card\",\"arguments\":{\"cardSpace\":\"Default\",\"card\":\"$DERIVED_CARD_LABEL_ID\"}},\"id\":2}"
  fi
  if [ -n "$DERIVED_CARD_ID_ID" ]; then
    run_test "delete_card(derived id:$DERIVED_CARD_ID_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_card\",\"arguments\":{\"cardSpace\":\"Default\",\"card\":\"$DERIVED_CARD_ID_ID\"}},\"id\":2}"
  fi
else
  skip_test "create_card(derived label)" "Default card space has no master tags"
  skip_test "get_card(derived label)" "Default card space has no master tags"
  skip_test "list_cards(Default,type)" "Default card space has no master tags"
  skip_test "create_card(derived id)" "Default card space has no master tags"
  skip_test "get_card(derived id)" "Default card space has no master tags"
  skip_test "delete_card(derived cards)" "Default card space has no master tags"
fi
skip_test "update_card" "requires card"
echo ""

##############################
# 14b. BOARDS
##############################
echo "=== 14b. Boards ==="
run_test "list_boards" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_boards","arguments":{"limit":3}},"id":2}'
run_test "list_board_menu_pages" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_board_menu_pages","arguments":{}},"id":2}'
run_test "list_board_saved_views" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_board_saved_views","arguments":{"limit":3}},"id":2}'
run_capture_to_var BOARD_SAVED_VIEWS_TEXT "list_board_saved_views(get probe)" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_board_saved_views","arguments":{"limit":1}},"id":2}'
if [ $? -eq 0 ]; then
  BOARD_SAVED_VIEW_ID=$(printf '%s\n' "$BOARD_SAVED_VIEWS_TEXT" | jq -r '.savedViews[0].id // empty' 2>/dev/null)
else
  BOARD_SAVED_VIEW_ID=""
fi
if [ -n "$BOARD_SAVED_VIEW_ID" ]; then
  BOARD_SAVED_VIEW_ID_JSON=$(json_string "$BOARD_SAVED_VIEW_ID")
  run_test "get_board_saved_view($BOARD_SAVED_VIEW_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_board_saved_view\",\"arguments\":{\"savedView\":$BOARD_SAVED_VIEW_ID_JSON}},\"id\":2}"
else
  run_expect_error_contains "get_board_saved_view(missing probe)" \
    '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_board_saved_view","arguments":{"savedView":"IntTest Missing Saved View"}},"id":2}' \
    "Board saved view 'IntTest Missing Saved View' not found"
fi
run_test "list_board_viewlets" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_board_viewlets","arguments":{}},"id":2}'
run_test "get_board_common_preference" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_board_common_preference","arguments":{}},"id":2}'
run_test "list_filtered_views" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_filtered_views","arguments":{"limit":3}},"id":2}'
run_capture_to_var FILTERED_VIEWS_TEXT "list_filtered_views(get probe)" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_filtered_views","arguments":{"limit":1}},"id":2}'
if [ $? -eq 0 ]; then
  FILTERED_VIEW_ID=$(printf '%s\n' "$FILTERED_VIEWS_TEXT" | jq -r '.filteredViews[0].id // empty' 2>/dev/null)
else
  FILTERED_VIEW_ID=""
fi
if [ -n "$FILTERED_VIEW_ID" ]; then
  FILTERED_VIEW_ID_JSON=$(json_string "$FILTERED_VIEW_ID")
  run_test "get_filtered_view($FILTERED_VIEW_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_filtered_view\",\"arguments\":{\"filteredView\":$FILTERED_VIEW_ID_JSON}},\"id\":2}"
else
  run_expect_error_contains "get_filtered_view(missing probe)" \
    '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_filtered_view","arguments":{"filteredView":"IntTest Missing Filtered View"}},"id":2}' \
    "Filtered view 'IntTest Missing Filtered View' not found"
fi
run_test "list_viewlets" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_viewlets","arguments":{"attachTo":"board:class:Card"}},"id":2}'

BOARD_NAME="IntTest Board $RUN_ID"
BOARD_UPDATED_NAME="IntTest Board Updated $RUN_ID"
BOARD_CARD_TITLE="IntTest Board Card $RUN_ID"
BOARD_CARD_UPDATED_TITLE="IntTest Board Card Updated $RUN_ID"
BOARD_LABEL_TITLE="IntTest Board Label $RUN_ID"
BOARD_LABEL_UPDATED_TITLE="IntTest Board Label Updated $RUN_ID"
BOARD_CARD_LABEL_TITLE="IntTest Board Card Label $RUN_ID"
BOARD_NAME_JSON=$(json_string "$BOARD_NAME")
BOARD_UPDATED_NAME_JSON=$(json_string "$BOARD_UPDATED_NAME")
BOARD_CARD_TITLE_JSON=$(json_string "$BOARD_CARD_TITLE")
BOARD_CARD_UPDATED_TITLE_JSON=$(json_string "$BOARD_CARD_UPDATED_TITLE")
BOARD_LABEL_TITLE_JSON=$(json_string "$BOARD_LABEL_TITLE")
BOARD_LABEL_UPDATED_TITLE_JSON=$(json_string "$BOARD_LABEL_UPDATED_TITLE")
BOARD_CARD_LABEL_TITLE_JSON=$(json_string "$BOARD_CARD_LABEL_TITLE")

run_capture_to_var BOARD_LABEL_CREATE_TEXT "create_board_label($BOARD_LABEL_TITLE)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_board_label\",\"arguments\":{\"title\":$BOARD_LABEL_TITLE_JSON,\"color\":2,\"description\":\"Temporary integration board label\"}},\"id\":2}"
if [ $? -eq 0 ]; then
  BOARD_CLEANUP_LABEL_ID=$(printf '%s\n' "$BOARD_LABEL_CREATE_TEXT" | jq -r '.id // empty' 2>/dev/null)
  assert_json_field_equals "create_board_label reports created" "$BOARD_LABEL_CREATE_TEXT" ".created" "true"
  restart_http_transport_if_needed "after create_board_label" || exit 1
  sleep 2
  run_capture_to_var BOARD_LABEL_LIST_TEXT "list_board_labels($BOARD_LABEL_TITLE)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_board_labels\",\"arguments\":{\"titleSearch\":$BOARD_LABEL_TITLE_JSON,\"limit\":10}},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_array_contains "list_board_labels includes created label" "$BOARD_LABEL_LIST_TEXT" ".labels | map(.title)" "$BOARD_LABEL_TITLE"
  fi
  run_capture_to_var BOARD_LABEL_UPDATE_TEXT "update_board_label($BOARD_LABEL_TITLE)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_board_label\",\"arguments\":{\"label\":$BOARD_LABEL_TITLE_JSON,\"title\":$BOARD_LABEL_UPDATED_TITLE_JSON,\"description\":\"Updated integration board label\",\"color\":3}},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_field_equals "update_board_label reports updated" "$BOARD_LABEL_UPDATE_TEXT" ".updated" "true"
  fi
  restart_http_transport_if_needed "after update_board_label" || exit 1
  sleep 2
  BOARD_LABEL_DELETE_JSON=$(json_string "${BOARD_CLEANUP_LABEL_ID:-$BOARD_LABEL_UPDATED_TITLE}")
  run_capture_to_var BOARD_LABEL_DELETE_TEXT "delete_board_label(${BOARD_CLEANUP_LABEL_ID:-$BOARD_LABEL_UPDATED_TITLE})" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_board_label\",\"arguments\":{\"label\":$BOARD_LABEL_DELETE_JSON}},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_field_equals "delete_board_label reports deleted" "$BOARD_LABEL_DELETE_TEXT" ".deleted" "true"
    BOARD_CLEANUP_LABEL_ID=""
  fi
else
  skip_test "list/update/delete board label" "create_board_label failed"
fi

run_capture_to_var BOARD_PROJECT_TYPES_TEXT "list_project_types(board model probe)" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_project_types","arguments":{}},"id":2}'
if [ $? -eq 0 ]; then
  BOARD_PROJECT_TYPE_ID=$(printf '%s\n' "$BOARD_PROJECT_TYPES_TEXT" | jq -r '.projectTypes[]? | select(.descriptor == "board:descriptors:BoardType") | .id' 2>/dev/null | head -n1)
else
  BOARD_PROJECT_TYPE_ID=""
fi

if [ -z "$BOARD_PROJECT_TYPE_ID" ]; then
  run_expect_error_contains "create_board($BOARD_NAME missing board model)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_board\",\"arguments\":{\"name\":$BOARD_NAME_JSON,\"description\":\"Temporary integration board\",\"private\":true}},\"id\":2}" \
    "Board project type 'board:descriptors:BoardType' not found"
  echo "INFO: board write and card CRUD checks require a board project type model in the workspace"
  echo "INFO: add/list/remove board card labels require the board project type model"
else
run_capture_to_var BOARD_CREATE_TEXT "create_board($BOARD_NAME)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_board\",\"arguments\":{\"name\":$BOARD_NAME_JSON,\"description\":\"Temporary integration board\",\"private\":true,\"projectType\":\"$BOARD_PROJECT_TYPE_ID\"}},\"id\":2}"
if [ $? -eq 0 ]; then
  BOARD_CLEANUP_BOARD_ID=$(printf '%s\n' "$BOARD_CREATE_TEXT" | jq -r '.id // empty' 2>/dev/null)
else
  BOARD_CLEANUP_BOARD_ID=""
fi

if [ -n "$BOARD_CLEANUP_BOARD_ID" ]; then
  restart_http_transport_if_needed "after create_board" || exit 1
  sleep 2
  BOARD_ID_JSON=$(json_string "$BOARD_CLEANUP_BOARD_ID")
  assert_json_field_equals "create_board returns created true" "$BOARD_CREATE_TEXT" ".created" "true"
  run_capture_to_var BOARD_GET_TEXT "get_board($BOARD_CLEANUP_BOARD_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_board\",\"arguments\":{\"board\":$BOARD_ID_JSON}},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_field_equals "get_board returns created board" "$BOARD_GET_TEXT" ".id" "$BOARD_CLEANUP_BOARD_ID"
  fi

  run_capture_to_var BOARD_UPDATE_TEXT "update_board($BOARD_CLEANUP_BOARD_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_board\",\"arguments\":{\"board\":$BOARD_ID_JSON,\"name\":$BOARD_UPDATED_NAME_JSON,\"description\":\"Updated integration board\",\"private\":false}},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_field_equals "update_board reports updated" "$BOARD_UPDATE_TEXT" ".updated" "true"
  fi
  restart_http_transport_if_needed "after update_board" || exit 1

  run_capture_to_var BOARD_GET_BY_NAME_TEXT "get_board($BOARD_UPDATED_NAME)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_board\",\"arguments\":{\"board\":$BOARD_UPDATED_NAME_JSON}},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_field_equals "get_board by updated name returns id" "$BOARD_GET_BY_NAME_TEXT" ".id" "$BOARD_CLEANUP_BOARD_ID"
  fi

  run_capture_to_var BOARD_ARCHIVE_TEXT "archive_board($BOARD_CLEANUP_BOARD_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"archive_board\",\"arguments\":{\"board\":$BOARD_ID_JSON}},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_field_equals "archive_board reports updated" "$BOARD_ARCHIVE_TEXT" ".updated" "true"
  fi
  restart_http_transport_if_needed "after archive_board" || exit 1
  run_capture_to_var BOARD_UNARCHIVE_TEXT "unarchive_board($BOARD_CLEANUP_BOARD_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"unarchive_board\",\"arguments\":{\"board\":$BOARD_ID_JSON}},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_field_equals "unarchive_board reports updated" "$BOARD_UNARCHIVE_TEXT" ".updated" "true"
  fi
  restart_http_transport_if_needed "after unarchive_board" || exit 1

  run_capture_to_var BOARD_CARD_CREATE_TEXT "create_board_card($BOARD_CARD_TITLE)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_board_card\",\"arguments\":{\"board\":$BOARD_ID_JSON,\"title\":$BOARD_CARD_TITLE_JSON,\"description\":\"Temporary **board** card\",\"location\":\"Integration lab\",\"cover\":{\"color\":2,\"size\":\"small\"},\"startDate\":1700000000000,\"dueDate\":1700086400000}},\"id\":2}"
  if [ $? -eq 0 ]; then
    BOARD_CARD_ID=$(printf '%s\n' "$BOARD_CARD_CREATE_TEXT" | jq -r '.id // empty' 2>/dev/null)
    BOARD_CARD_IDENTIFIER=$(printf '%s\n' "$BOARD_CARD_CREATE_TEXT" | jq -r '.identifier // empty' 2>/dev/null)
    BOARD_CARD_NUMBER=$(printf '%s\n' "$BOARD_CARD_CREATE_TEXT" | jq -r '.number // empty' 2>/dev/null)
  else
    BOARD_CARD_ID=""
    BOARD_CARD_IDENTIFIER=""
    BOARD_CARD_NUMBER=""
  fi

  if [ -n "$BOARD_CARD_ID" ]; then
    restart_http_transport_if_needed "after create_board_card" || exit 1
    sleep 2
    BOARD_CARD_ID_JSON=$(json_string "$BOARD_CARD_ID")
    BOARD_CARD_IDENTIFIER_JSON=$(json_string "$BOARD_CARD_IDENTIFIER")
    BOARD_CARD_NUMBER_JSON=$(json_string "$BOARD_CARD_NUMBER")
    run_capture_to_var BOARD_CARD_GET_TEXT "get_board_card(id:$BOARD_CARD_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_board_card\",\"arguments\":{\"board\":$BOARD_ID_JSON,\"card\":$BOARD_CARD_ID_JSON}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_equals "get_board_card by id returns title" "$BOARD_CARD_GET_TEXT" ".title" "$BOARD_CARD_TITLE"
    fi
    run_capture_to_var BOARD_CARD_GET_IDENTIFIER_TEXT "get_board_card(identifier:$BOARD_CARD_IDENTIFIER)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_board_card\",\"arguments\":{\"board\":$BOARD_ID_JSON,\"card\":$BOARD_CARD_IDENTIFIER_JSON}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_equals "get_board_card by identifier returns id" "$BOARD_CARD_GET_IDENTIFIER_TEXT" ".id" "$BOARD_CARD_ID"
    fi
    run_capture_to_var BOARD_CARD_GET_NUMBER_TEXT "get_board_card(number:$BOARD_CARD_NUMBER)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_board_card\",\"arguments\":{\"board\":$BOARD_ID_JSON,\"card\":$BOARD_CARD_NUMBER_JSON}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_equals "get_board_card by bare number returns id" "$BOARD_CARD_GET_NUMBER_TEXT" ".id" "$BOARD_CARD_ID"
    fi
    run_capture_to_var BOARD_CARD_LIST_TEXT "list_board_cards($BOARD_CLEANUP_BOARD_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_board_cards\",\"arguments\":{\"board\":$BOARD_ID_JSON,\"titleSearch\":\"IntTest Board Card\",\"limit\":10}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_array_contains "list_board_cards includes created card" "$BOARD_CARD_LIST_TEXT" ".cards | map(.id)" "$BOARD_CARD_ID"
    fi

    run_capture_to_var BOARD_CARD_LABEL_ADD_TEXT "add_board_card_label($BOARD_CARD_LABEL_TITLE)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_board_card_label\",\"arguments\":{\"board\":$BOARD_ID_JSON,\"card\":$BOARD_CARD_ID_JSON,\"label\":$BOARD_CARD_LABEL_TITLE_JSON,\"color\":4}},\"id\":2}"
    if [ $? -eq 0 ]; then
      BOARD_CLEANUP_CARD_LABEL_ID=$(printf '%s\n' "$BOARD_CARD_LABEL_ADD_TEXT" | jq -r '.label // empty' 2>/dev/null)
      assert_json_field_equals "add_board_card_label attaches label" "$BOARD_CARD_LABEL_ADD_TEXT" ".attached" "true"
      assert_json_field_equals "add_board_card_label creates definition" "$BOARD_CARD_LABEL_ADD_TEXT" ".labelCreated" "true"
      restart_http_transport_if_needed "after add_board_card_label" || exit 1
      sleep 2
      run_capture_to_var BOARD_CARD_LABEL_LIST_TEXT "list_board_card_labels($BOARD_CARD_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_board_card_labels\",\"arguments\":{\"board\":$BOARD_ID_JSON,\"card\":$BOARD_CARD_ID_JSON}},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_array_contains "list_board_card_labels includes attached label" "$BOARD_CARD_LABEL_LIST_TEXT" ".labels | map(.title)" "$BOARD_CARD_LABEL_TITLE"
      fi
      run_capture_to_var BOARD_CARD_LABEL_REMOVE_TEXT "remove_board_card_label($BOARD_CARD_LABEL_TITLE)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"remove_board_card_label\",\"arguments\":{\"board\":$BOARD_ID_JSON,\"card\":$BOARD_CARD_ID_JSON,\"label\":$BOARD_CARD_LABEL_TITLE_JSON}},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_field_equals "remove_board_card_label detaches label" "$BOARD_CARD_LABEL_REMOVE_TEXT" ".detached" "true"
      fi
      BOARD_CARD_LABEL_DELETE_JSON=$(json_string "${BOARD_CLEANUP_CARD_LABEL_ID:-$BOARD_CARD_LABEL_TITLE}")
      run_capture_to_var BOARD_CARD_LABEL_DELETE_TEXT "delete_board_label(${BOARD_CLEANUP_CARD_LABEL_ID:-$BOARD_CARD_LABEL_TITLE})" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_board_label\",\"arguments\":{\"label\":$BOARD_CARD_LABEL_DELETE_JSON}},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_field_equals "delete_board_label removes card label definition" "$BOARD_CARD_LABEL_DELETE_TEXT" ".deleted" "true"
        BOARD_CLEANUP_CARD_LABEL_ID=""
      fi
    else
      echo "INFO: list/remove board card labels require add_board_card_label to succeed"
    fi

    run_capture_to_var BOARD_CARD_UPDATE_TEXT "update_board_card($BOARD_CARD_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_board_card\",\"arguments\":{\"board\":$BOARD_ID_JSON,\"card\":$BOARD_CARD_ID_JSON,\"title\":$BOARD_CARD_UPDATED_TITLE_JSON,\"description\":\"Updated board card\",\"location\":null,\"cover\":null,\"startDate\":null,\"dueDate\":null}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_equals "update_board_card reports updated" "$BOARD_CARD_UPDATE_TEXT" ".updated" "true"
    fi
    restart_http_transport_if_needed "after update_board_card" || exit 1
    sleep 2
    run_capture_to_var BOARD_CARD_GET_UPDATED_TEXT "get_board_card(updated title)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_board_card\",\"arguments\":{\"board\":$BOARD_ID_JSON,\"card\":$BOARD_CARD_UPDATED_TITLE_JSON}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_equals "get_board_card by updated title returns id" "$BOARD_CARD_GET_UPDATED_TEXT" ".id" "$BOARD_CARD_ID"
    fi

    run_expect_error_contains "delete_board_card(active rejected)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_board_card\",\"arguments\":{\"board\":$BOARD_ID_JSON,\"card\":$BOARD_CARD_ID_JSON}},\"id\":2}" \
      "must be archived before delete_board_card"
    run_capture_to_var BOARD_CARD_ARCHIVE_TEXT "archive_board_card($BOARD_CARD_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"archive_board_card\",\"arguments\":{\"board\":$BOARD_ID_JSON,\"card\":$BOARD_CARD_ID_JSON}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_equals "archive_board_card reports updated" "$BOARD_CARD_ARCHIVE_TEXT" ".updated" "true"
    fi
    restart_http_transport_if_needed "after archive_board_card" || exit 1
    run_capture_to_var BOARD_CARD_UNARCHIVE_TEXT "unarchive_board_card($BOARD_CARD_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"unarchive_board_card\",\"arguments\":{\"board\":$BOARD_ID_JSON,\"card\":$BOARD_CARD_ID_JSON}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_equals "unarchive_board_card reports updated" "$BOARD_CARD_UNARCHIVE_TEXT" ".updated" "true"
    fi
    restart_http_transport_if_needed "after unarchive_board_card" || exit 1
    run_capture_to_var BOARD_CARD_ARCHIVE_DELETE_TEXT "archive_board_card(before delete:$BOARD_CARD_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"archive_board_card\",\"arguments\":{\"board\":$BOARD_ID_JSON,\"card\":$BOARD_CARD_ID_JSON}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_equals "archive_board_card before delete reports updated" "$BOARD_CARD_ARCHIVE_DELETE_TEXT" ".updated" "true"
    fi
    restart_http_transport_if_needed "after archive_board_card before delete" || exit 1
    run_capture_to_var BOARD_CARD_DELETE_TEXT "delete_board_card($BOARD_CARD_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_board_card\",\"arguments\":{\"board\":$BOARD_ID_JSON,\"card\":$BOARD_CARD_ID_JSON}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_equals "delete_board_card deletes archived card" "$BOARD_CARD_DELETE_TEXT" ".deleted" "true"
    fi
  else
    fail_test "create_board_card($BOARD_CARD_TITLE) returns id" "missing id"
    skip_test "get/list/update/archive/delete board card" "create_board_card did not return a card id"
    echo "INFO: add/list/remove board card labels require create_board_card to return a card id"
  fi

  run_capture_to_var BOARD_FINAL_ARCHIVE_TEXT "archive_board(cleanup:$BOARD_CLEANUP_BOARD_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"archive_board\",\"arguments\":{\"board\":$BOARD_ID_JSON}},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_field_equals "archive_board cleanup reports updated" "$BOARD_FINAL_ARCHIVE_TEXT" ".updated" "true"
    BOARD_CLEANUP_BOARD_ID=""
  fi
else
  fail_test "create_board($BOARD_NAME) returns id" "missing id"
  skip_test "get/update/archive/unarchive board" "create_board did not return a board id"
  skip_test "create/get/update/archive/delete board card" "create_board did not return a board id"
  echo "INFO: add/list/remove board card labels require create_board to return a board id"
fi
fi
echo ""

##############################
# 14B. MAIL THREAD METADATA
##############################
echo "=== 14B. Mail thread metadata ==="
MAIL_THREAD_SETUP_TEXT=$(pnpm exec tsx scripts/integration-mail-threads.ts --mode setup --runId "$RUN_ID" 2>/dev/null)
if [ $? -eq 0 ]; then
  MAIL_THREAD_CLEANUP_OUTER_ID=$(printf '%s\n' "$MAIL_THREAD_SETUP_TEXT" | jq -r '.outerId // empty' 2>/dev/null)
  MAIL_THREAD_CLEANUP_CHILD_ID=$(printf '%s\n' "$MAIL_THREAD_SETUP_TEXT" | jq -r '.childId // empty' 2>/dev/null)
  MAIL_THREAD_CHANNEL_TITLE=$(printf '%s\n' "$MAIL_THREAD_SETUP_TEXT" | jq -r '.channelTitle // empty' 2>/dev/null)
  MAIL_THREAD_SUBJECT=$(printf '%s\n' "$MAIL_THREAD_SETUP_TEXT" | jq -r '.subject // empty' 2>/dev/null)
  MAIL_THREAD_SPACE_ID=$(printf '%s\n' "$MAIL_THREAD_SETUP_TEXT" | jq -r '.spaceId // empty' 2>/dev/null)
  MAIL_THREAD_SPACE_NAME=$(printf '%s\n' "$MAIL_THREAD_SETUP_TEXT" | jq -r '.spaceName // empty' 2>/dev/null)
  echo "PASS: seed Mail thread metadata fixture"
  PASSED=$((PASSED + 1))
  restart_http_transport_if_needed "after Mail thread fixture writes" || exit 1

  MAIL_THREAD_CHANNEL_TITLE_JSON=$(json_string "$MAIL_THREAD_CHANNEL_TITLE")
  MAIL_THREAD_SPACE_ID_JSON=$(json_string "$MAIL_THREAD_SPACE_ID")
  MAIL_THREAD_PAYLOAD="{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_mail_threads\",\"arguments\":{\"space\":$MAIL_THREAD_SPACE_ID_JSON,\"channelTitleSearch\":$MAIL_THREAD_CHANNEL_TITLE_JSON,\"limit\":5}},\"id\":2}"
  wait_for_json_array_contains_to_var MAIL_THREAD_LIST_TEXT "list_mail_threads includes fixture" \
    "$MAIL_THREAD_PAYLOAD" ".threads | map(.id)" "$MAIL_THREAD_CLEANUP_OUTER_ID" 10 1
  if [ $? -eq 0 ]; then
    assert_json_field_equals "list_mail_threads resolves space name" "$MAIL_THREAD_LIST_TEXT" ".threads[0].space.name" "$MAIL_THREAD_SPACE_NAME"
    assert_json_field_equals "list_mail_threads returns neutral channel title" "$MAIL_THREAD_LIST_TEXT" ".threads[0].channelTitle" "$MAIL_THREAD_CHANNEL_TITLE"
    assert_json_array_contains "list_mail_threads includes child subject" "$MAIL_THREAD_LIST_TEXT" ".threads[0].subjects | map(.subject)" "$MAIL_THREAD_SUBJECT"
    assert_json_field_equals "list_mail_threads omits body and attachment fields" "$MAIL_THREAD_LIST_TEXT" "[.. | objects | keys[]] | any(. == \"content\" or . == \"attachments\" or . == \"body\")" "false"
  fi

  if ! cleanup_mail_thread_artifacts; then
    fail_test "cleanup Mail thread metadata fixture" "cleanup failed after 3 attempts; exit trap will retry"
  fi
  restart_http_transport_if_needed "after Mail thread fixture cleanup" || exit 1
else
  fail_test "seed Mail thread metadata fixture" "integration SDK fixture setup failed"
fi
echo ""

##############################
# 14C. TELEGRAM STORED MESSAGES
##############################
echo "=== 14C. Telegram stored messages ==="
TELEGRAM_SETUP_TEXT=$(pnpm exec tsx scripts/integration-telegram-messages.ts --mode setup --runId "$RUN_ID" 2>/dev/null)
if [ $? -eq 0 ]; then
  TELEGRAM_CLEANUP_CHANNEL_ID=$(printf '%s\n' "$TELEGRAM_SETUP_TEXT" | jq -r '.channelId // empty' 2>/dev/null)
  TELEGRAM_CLEANUP_MESSAGE_ID=$(printf '%s\n' "$TELEGRAM_SETUP_TEXT" | jq -r '.messageId // empty' 2>/dev/null)
  TELEGRAM_CONTENT_MARKDOWN=$(printf '%s\n' "$TELEGRAM_SETUP_TEXT" | jq -r '.contentMarkdown // empty' 2>/dev/null)
  echo "PASS: seed Telegram stored-message fixture"
  PASSED=$((PASSED + 1))
  restart_http_transport_if_needed "after Telegram message fixture writes" || exit 1

  TELEGRAM_CHANNEL_ID_JSON=$(json_string "$TELEGRAM_CLEANUP_CHANNEL_ID")
  TELEGRAM_PAYLOAD="{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_external_channel_messages\",\"arguments\":{\"provider\":\"telegram\",\"channel\":$TELEGRAM_CHANNEL_ID_JSON,\"limit\":5}},\"id\":2}"
  wait_for_json_array_contains_to_var TELEGRAM_STORED_TEXT "list_external_channel_messages includes Telegram fixture" \
    "$TELEGRAM_PAYLOAD" ".messages | map(.id)" "$TELEGRAM_CLEANUP_MESSAGE_ID" 10 1
  if [ $? -eq 0 ]; then
    assert_json_field_equals "list_external_channel_messages Telegram supported=true" "$TELEGRAM_STORED_TEXT" ".supported" "true"
    assert_json_field_equals "list_external_channel_messages resolves Telegram channel ID" "$TELEGRAM_STORED_TEXT" ".channel.id" "$TELEGRAM_CLEANUP_CHANNEL_ID"
    assert_json_field_equals "list_external_channel_messages converts Telegram markup" "$TELEGRAM_STORED_TEXT" ".messages[0].contentMarkdown" "$TELEGRAM_CONTENT_MARKDOWN"
    assert_json_field_equals "list_external_channel_messages returns Telegram direction" "$TELEGRAM_STORED_TEXT" ".messages[0].direction" "incoming"
    assert_json_field_equals "list_external_channel_messages returns Telegram attachment count" "$TELEGRAM_STORED_TEXT" ".messages[0].attachmentCount" "0"
  fi

  if ! cleanup_telegram_message_artifacts; then
    fail_test "cleanup Telegram stored-message fixture" "cleanup failed after 3 attempts; exit trap will retry"
  fi
  restart_http_transport_if_needed "after Telegram message fixture cleanup" || exit 1
else
  fail_test "seed Telegram stored-message fixture" "integration SDK fixture setup failed"
fi
echo ""

##############################
# 15. ACTIVITY & COMMENTS
##############################
echo "=== 15. Activity ==="
run_test "list_mentions" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_mentions","arguments":{"limit":3}},"id":2}'
run_test "list_saved_messages" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_saved_messages","arguments":{"limit":3}},"id":2}'
echo ""

##############################
# 16. WORKSPACE
##############################
echo "=== 16. Workspace ==="
run_test "get_workspace_info" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_workspace_info","arguments":{}},"id":2}'
run_test "list_workspace_members" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_workspace_members","arguments":{}},"id":2}'
ACCESS_LINK_NOT_BEFORE="$(date +%s)"
ACCESS_LINK_EXPIRATION="$((ACCESS_LINK_NOT_BEFORE + 300))"
run_test "create_access_link(anonymous_guest)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_access_link\",\"arguments\":{\"role\":\"GUEST\",\"personalized\":false,\"notBefore\":${ACCESS_LINK_NOT_BEFORE},\"expiration\":${ACCESS_LINK_EXPIRATION}}},\"id\":2}"
# list_workspaces, create_workspace, delete_workspace, get_regions, update_member_role, update_guest_settings
# — workspace management tools are dangerous for integration tests, skip
skip_test "list_workspaces" "workspace management"
skip_test "create_workspace" "workspace management"
skip_test "delete_workspace" "workspace management"
skip_test "get_regions" "workspace management"
skip_test "update_member_role" "workspace management"
skip_test "update_guest_settings" "workspace management"
skip_test "update_user_profile" "would modify test user"
echo ""

##############################
# 17. ATTACHMENTS
##############################
echo "=== 17. Attachments ==="
# Create a temp issue for attachment tests
run_capture_to_var ATT_ISSUE_TEXT "create_issue(for_attachment)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"title\":\"Attachment Test\"}},\"id\":2}"
if [ $? -eq 0 ]; then
  ATT_ISSUE_ID=$(echo "$ATT_ISSUE_TEXT" | jq -r '.identifier' 2>/dev/null)
  ATT_ISSUE_OBJ=$(echo "$ATT_ISSUE_TEXT" | jq -r '.issueId' 2>/dev/null)

  # upload_file — skipped standalone (no blob delete tool); covered via add_issue_attachment
  skip_test "upload_file(standalone)" "no blob delete tool — would leak data"

  echo "test attachment content" > "$TEST_TMPDIR/inttest_attach.txt"

  # add_issue_attachment (also exercises upload internally)
  run_capture_to_var ATT_TEXT "add_issue_attachment($ATT_ISSUE_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_issue_attachment\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$ATT_ISSUE_ID\",\"filePath\":\"$TEST_TMPDIR/inttest_attach.txt\",\"filename\":\"test.txt\",\"contentType\":\"text/plain\"}},\"id\":2}"
  if [ $? -eq 0 ]; then
    ATT_ID=$(echo "$ATT_TEXT" | jq -r '.attachmentId' 2>/dev/null)
    echo "  => attachment: $ATT_ID"
    run_test "list_attachments($ATT_ISSUE_OBJ)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_attachments\",\"arguments\":{\"objectId\":\"$ATT_ISSUE_OBJ\",\"objectClass\":\"tracker:class:Issue\"}},\"id\":2}"
    run_test "get_attachment($ATT_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_attachment\",\"arguments\":{\"attachmentId\":\"$ATT_ID\"}},\"id\":2}"
    run_test "pin_attachment($ATT_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"pin_attachment\",\"arguments\":{\"attachmentId\":\"$ATT_ID\",\"pinned\":true}},\"id\":2}"
    run_test "update_attachment($ATT_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_attachment\",\"arguments\":{\"attachmentId\":\"$ATT_ID\",\"description\":\"updated\"}},\"id\":2}"
    run_test "download_attachment($ATT_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"download_attachment\",\"arguments\":{\"attachmentId\":\"$ATT_ID\",\"outputPath\":\"$TEST_TMPDIR/inttest_download.txt\"}},\"id\":2}"

    ATT_IMAGE_DATA="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    run_capture_to_var ATT_IMAGE_TEXT "add_issue_attachment(image:$ATT_ISSUE_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_issue_attachment\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$ATT_ISSUE_ID\",\"data\":\"$ATT_IMAGE_DATA\",\"filename\":\"pixel.png\",\"contentType\":\"image/png\"}},\"id\":2}"
    ATT_IMAGE_ID=$(echo "$ATT_IMAGE_TEXT" | jq -r '.attachmentId // empty' 2>/dev/null)
    if [ -n "$ATT_IMAGE_ID" ]; then
      run_result_to_var ATT_IMAGE_RESULT "read_attachment_content($ATT_IMAGE_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"read_attachment_content\",\"arguments\":{\"attachmentId\":\"$ATT_IMAGE_ID\"}},\"id\":2}"
      assert_json_field_count "read_attachment_content returns exactly one image block" "$ATT_IMAGE_RESULT" \
        '[.content[] | select(.type == "image")] | length' "1"
      assert_json_field_equals "read_attachment_content returns image MIME" "$ATT_IMAGE_RESULT" \
        '.content[] | select(.type == "image") | .mimeType' "image/png"
      assert_json_field_equals "read_attachment_content structured content omits base64" "$ATT_IMAGE_RESULT" \
        '.structuredContent.result.data // ""' ""
      run_test "delete_attachment(image:$ATT_IMAGE_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_attachment\",\"arguments\":{\"attachmentId\":\"$ATT_IMAGE_ID\"}},\"id\":2}"
    else
      skip_test "read_attachment_content" "image attachment upload did not return an attachment id"
    fi

    run_test "delete_attachment($ATT_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_attachment\",\"arguments\":{\"attachmentId\":\"$ATT_ID\"}},\"id\":2}"
  fi

  skip_test "add_attachment" "generic — covered by add_issue_attachment"
  skip_test "add_document_attachment" "requires doc + file"

  run_test "delete_issue(attachment:$ATT_ISSUE_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$ATT_ISSUE_ID\"}},\"id\":2}"
  rm -f "$TEST_TMPDIR/inttest_attach.txt" "$TEST_TMPDIR/inttest_download.txt"
fi
echo ""

##############################
# 18. TEST MANAGEMENT
##############################
echo "=== 18. Test Management ==="
run_test "list_test_projects" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_test_projects","arguments":{}},"id":2}'

TM_PROJ=$(run_capture_only \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_test_projects","arguments":{}},"id":2}')
TM_PROJ_ID=$(echo "$TM_PROJ" | jq -r '.projects[0].identifier // empty' 2>/dev/null)

if [ -n "$TM_PROJ_ID" ]; then
  echo "  Using TM project: $TM_PROJ_ID"

  # Test Suite
  run_capture_to_var TS_TEXT "create_test_suite" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_test_suite\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"name\":\"IntTest Suite\"}},\"id\":2}"
  if [ $? -eq 0 ]; then
    TSID=$(echo "$TS_TEXT" | jq -r '.id' 2>/dev/null)
    echo "  => suite: $TSID"
    run_test "list_test_suites" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_test_suites\",\"arguments\":{\"project\":\"$TM_PROJ_ID\"}},\"id\":2}"
    run_test "get_test_suite($TSID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_test_suite\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"testSuite\":\"$TSID\"}},\"id\":2}"
    run_test "update_test_suite($TSID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_test_suite\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"testSuite\":\"$TSID\",\"name\":\"Updated Suite\"}},\"id\":2}"

    # Test Case
    run_capture_to_var TC_TEXT "create_test_case" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_test_case\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"name\":\"IntTest Case\",\"testSuite\":\"$TSID\"}},\"id\":2}"
    if [ $? -eq 0 ]; then
      TCID=$(echo "$TC_TEXT" | jq -r '.id' 2>/dev/null)
      echo "  => case: $TCID"
      run_test "list_test_cases" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_test_cases\",\"arguments\":{\"project\":\"$TM_PROJ_ID\"}},\"id\":2}"
      run_test "get_test_case($TCID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_test_case\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"testCase\":\"$TCID\"}},\"id\":2}"
      run_test "update_test_case($TCID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_test_case\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"testCase\":\"$TCID\",\"name\":\"Updated Case\"}},\"id\":2}"

      # Test Plan
      run_capture_to_var TP_TEXT "create_test_plan" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_test_plan\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"name\":\"IntTest Plan\"}},\"id\":2}"
      if [ $? -eq 0 ]; then
        TPID=$(echo "$TP_TEXT" | jq -r '.id' 2>/dev/null)
        echo "  => plan: $TPID"
        run_test "list_test_plans" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_test_plans\",\"arguments\":{\"project\":\"$TM_PROJ_ID\"}},\"id\":2}"
        run_test "get_test_plan($TPID)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_test_plan\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"testPlan\":\"$TPID\"}},\"id\":2}"
        run_test "update_test_plan($TPID)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_test_plan\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"testPlan\":\"$TPID\",\"name\":\"Updated Plan\"}},\"id\":2}"

        # add_test_plan_item
        run_test "add_test_plan_item($TPID,$TCID)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_test_plan_item\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"testPlan\":\"$TPID\",\"testCase\":\"$TCID\"}},\"id\":2}"
        run_test "remove_test_plan_item($TPID,$TCID)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"remove_test_plan_item\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"testPlan\":\"$TPID\",\"testCase\":\"$TCID\"}},\"id\":2}"

        # Test Run
        run_capture_to_var TR_TEXT "create_test_run" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_test_run\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"name\":\"IntTest Run\",\"testPlan\":\"$TPID\"}},\"id\":2}"
        if [ $? -eq 0 ]; then
          TRID=$(echo "$TR_TEXT" | jq -r '.id' 2>/dev/null)
          echo "  => run: $TRID"
          run_test "list_test_runs" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_test_runs\",\"arguments\":{\"project\":\"$TM_PROJ_ID\"}},\"id\":2}"
          run_test "get_test_run($TRID)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_test_run\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"testRun\":\"$TRID\"}},\"id\":2}"
          run_test "update_test_run($TRID)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_test_run\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"testRun\":\"$TRID\",\"name\":\"Updated Run\"}},\"id\":2}"

          # Test Result
          run_capture_to_var RESULT_TEXT "create_test_result" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_test_result\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"testRun\":\"$TRID\",\"testCase\":\"$TCID\",\"status\":\"passed\"}},\"id\":2}"
          if [ $? -eq 0 ]; then
            RESID=$(echo "$RESULT_TEXT" | jq -r '.id' 2>/dev/null)
            echo "  => result: $RESID"
            run_test "list_test_results" \
              "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_test_results\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"testRun\":\"$TRID\"}},\"id\":2}"
            run_test "get_test_result($RESID)" \
              "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_test_result\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"testResult\":\"$RESID\"}},\"id\":2}"
            run_test "update_test_result($RESID)" \
              "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_test_result\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"testResult\":\"$RESID\",\"status\":\"failed\"}},\"id\":2}"
            run_test "delete_test_result($RESID)" \
              "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_test_result\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"testResult\":\"$RESID\"}},\"id\":2}"
          fi

          # run_test_plan — creates a new test run; capture and clean up
          run_capture_to_var RTP_TEXT "run_test_plan($TPID)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"run_test_plan\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"testPlan\":\"$TPID\"}},\"id\":2}"
          if [ $? -eq 0 ]; then
            RTP_RUN_ID=$(echo "$RTP_TEXT" | jq -r '.runId // empty' 2>/dev/null)
            if [ -n "$RTP_RUN_ID" ]; then
              echo "  => run_test_plan run: $RTP_RUN_ID"
              run_test "delete_test_run(from_plan:$RTP_RUN_ID)" \
                "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_test_run\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"testRun\":\"$RTP_RUN_ID\"}},\"id\":2}"
            fi
          fi

          run_test "delete_test_run($TRID)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_test_run\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"testRun\":\"$TRID\"}},\"id\":2}"
        fi

        run_test "delete_test_plan($TPID)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_test_plan\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"testPlan\":\"$TPID\"}},\"id\":2}"
      fi

      run_test "delete_test_case($TCID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_test_case\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"testCase\":\"$TCID\"}},\"id\":2}"
    fi

    run_test "delete_test_suite($TSID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_test_suite\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"testSuite\":\"$TSID\"}},\"id\":2}"
  fi
else
  skip_test "test_management" "no TM project found — create one in Huly UI"
fi
echo ""

##############################
# 19. PROCESSES
##############################
echo "=== 19. Processes ==="
run_test "list_processes" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_processes","arguments":{}},"id":2}'

run_test "list_process_executions" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_process_executions","arguments":{"limit":5}},"id":2}'

PROCESSES_TEXT=$(run_capture_only \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_processes","arguments":{}},"id":2}')
PROCESS_ID=$(echo "$PROCESSES_TEXT" | jq -r '.processes[0].id // empty' 2>/dev/null)
PROCESS_DETAIL_TEXT=""

if [ -n "$PROCESS_ID" ]; then
  echo "  Using process: $PROCESS_ID"
  run_test "get_process($PROCESS_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_process\",\"arguments\":{\"process\":\"$PROCESS_ID\"}},\"id\":2}"
  PROCESS_DETAIL_TEXT=$(run_capture_only \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_process\",\"arguments\":{\"process\":\"$PROCESS_ID\"}},\"id\":2}")
  run_test "list_process_executions(process:$PROCESS_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_process_executions\",\"arguments\":{\"process\":\"$PROCESS_ID\",\"limit\":5}},\"id\":2}"
else
  skip_test "get_process" "no process definitions found in workspace"
  skip_test "list_process_executions(process)" "no process definitions found in workspace"
fi

PROCESS_INITIAL_STATE=$(echo "$PROCESS_DETAIL_TEXT" | jq -r '.initialStateId // empty' 2>/dev/null)
PROCESS_TYPE=$(echo "$PROCESS_DETAIL_TEXT" | jq -r '.masterTagName // .masterTagId // empty' 2>/dev/null)
PROCESS_PARALLEL_FORBIDDEN=$(echo "$PROCESS_DETAIL_TEXT" | jq -r '.parallelExecutionForbidden // false' 2>/dev/null)
SAFE_CARD_ID=""

if [ -n "$PROCESS_ID" ] && [ -n "$PROCESS_INITIAL_STATE" ] && [ -n "$PROCESS_TYPE" ]; then
  CARD_SPACES_TEXT=$(run_capture_only \
    '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_card_spaces","arguments":{"limit":20}},"id":2}')
  CARD_SPACE_COUNT=$(echo "$CARD_SPACES_TEXT" | jq -r '.cardSpaces | length' 2>/dev/null)
  i=0
  while [ "$i" -lt "${CARD_SPACE_COUNT:-0}" ] && [ -z "$SAFE_CARD_ID" ]; do
    CARD_SPACE_NAME=$(echo "$CARD_SPACES_TEXT" | jq -r ".cardSpaces[$i].name // empty" 2>/dev/null)
    if [ -n "$CARD_SPACE_NAME" ]; then
      CARD_SPACE_JSON=$(json_string "$CARD_SPACE_NAME")
      PROCESS_TYPE_JSON=$(json_string "$PROCESS_TYPE")
      CARDS_TEXT=$(run_capture_only \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_cards\",\"arguments\":{\"cardSpace\":$CARD_SPACE_JSON,\"type\":$PROCESS_TYPE_JSON,\"limit\":1}},\"id\":2}")
      SAFE_CARD_ID=$(echo "$CARDS_TEXT" | jq -r '.cards[0].id // empty' 2>/dev/null)
    fi
    i=$((i + 1))
  done
fi

if [ -n "$PROCESS_ID" ] && [ -n "$PROCESS_INITIAL_STATE" ] && [ -n "$SAFE_CARD_ID" ]; then
  if [ "$PROCESS_PARALLEL_FORBIDDEN" = "true" ]; then
    EXISTING_ACTIVE=$(run_capture_only \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_process_executions\",\"arguments\":{\"process\":\"$PROCESS_ID\",\"card\":\"$SAFE_CARD_ID\",\"status\":\"active\",\"limit\":1}},\"id\":2}" | jq -r '.executions[0].id // empty' 2>/dev/null)
  else
    EXISTING_ACTIVE=""
  fi

  if [ -n "$EXISTING_ACTIVE" ]; then
    skip_test "start_process/cancel_execution" "safe card already has an active execution and process forbids parallel executions"
  else
    run_capture_to_var START_TEXT "start_process($PROCESS_ID,$SAFE_CARD_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"start_process\",\"arguments\":{\"process\":\"$PROCESS_ID\",\"card\":\"$SAFE_CARD_ID\"}},\"id\":2}"
    STARTED_EXECUTION_ID=$(echo "$START_TEXT" | jq -r '.executionId // empty' 2>/dev/null)
    if [ -n "$STARTED_EXECUTION_ID" ]; then
      run_test "cancel_execution($STARTED_EXECUTION_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"cancel_execution\",\"arguments\":{\"execution\":\"$STARTED_EXECUTION_ID\"}},\"id\":2}"
    else
      skip_test "cancel_execution(started)" "start_process did not return an execution ID"
    fi
  fi
else
  skip_test "start_process/cancel_execution" "requires a process with an initial state and a matching safe card fixture"
fi
echo ""

##############################
# 20. DRIVE
##############################
echo "=== 20. Drive ==="
run_capture_to_var DRIVES_TEXT "list_drives" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_drives","arguments":{"limit":5}},"id":2}'

DRIVE_ID=$(echo "$DRIVES_TEXT" | jq -r '.drives[0].id // empty' 2>/dev/null)

if [ -n "$DRIVE_ID" ]; then
  DRIVE_JSON=$(json_string "$DRIVE_ID")
  DRIVE_TEST_FOLDER="/mcp-integration-$RUN_ID"
  DRIVE_TEST_NESTED="$DRIVE_TEST_FOLDER/nested"
  DRIVE_TEST_FILE="$DRIVE_TEST_NESTED/hello.txt"
  DRIVE_TEST_MOVED_FILE="$DRIVE_TEST_FOLDER/hello.txt"
  DRIVE_TEST_RENAMED_FILE="$DRIVE_TEST_FOLDER/hello-renamed.txt"
  DRIVE_TEST_FOLDER_JSON=$(json_string "$DRIVE_TEST_FOLDER")
  DRIVE_TEST_NESTED_JSON=$(json_string "$DRIVE_TEST_NESTED")
  DRIVE_TEST_FILE_JSON=$(json_string "$DRIVE_TEST_FILE")
  DRIVE_TEST_MOVED_FILE_JSON=$(json_string "$DRIVE_TEST_MOVED_FILE")
  DRIVE_TEST_RENAMED_FILE_JSON=$(json_string "$DRIVE_TEST_RENAMED_FILE")
  DRIVE_TEST_DATA=$(printf 'Drive integration %s' "$RUN_ID" | base64 | tr -d '\n')
  DRIVE_TEST_VERSION_DATA=$(printf 'Drive integration version 2 %s' "$RUN_ID" | base64 | tr -d '\n')
  DRIVE_TEST_DATA_JSON=$(json_string "$DRIVE_TEST_DATA")
  DRIVE_TEST_VERSION_DATA_JSON=$(json_string "$DRIVE_TEST_VERSION_DATA")
  DRIVE_TEST_COMMENT_BODY_JSON=$(json_string "Drive comment $RUN_ID")
  DRIVE_TEST_COMMENT_UPDATED_BODY_JSON=$(json_string "Drive comment updated $RUN_ID")
  remember_drive_item_cleanup "$DRIVE_ID" "$DRIVE_TEST_RENAMED_FILE"
  remember_drive_item_cleanup "$DRIVE_ID" "$DRIVE_TEST_MOVED_FILE"
  remember_drive_item_cleanup "$DRIVE_ID" "$DRIVE_TEST_FILE"
  remember_drive_item_cleanup "$DRIVE_ID" "$DRIVE_TEST_NESTED"
  remember_drive_item_cleanup "$DRIVE_ID" "$DRIVE_TEST_FOLDER"

  run_test "get_drive($DRIVE_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_drive\",\"arguments\":{\"drive\":$DRIVE_JSON}},\"id\":2}"
  run_test "list_drive_items(root)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_drive_items\",\"arguments\":{\"drive\":$DRIVE_JSON,\"path\":\"/\",\"limit\":10}},\"id\":2}"
  run_capture_to_var DRIVE_FOLDER_TEXT "create_drive_folder($DRIVE_TEST_NESTED)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_drive_folder\",\"arguments\":{\"drive\":$DRIVE_JSON,\"path\":$DRIVE_TEST_NESTED_JSON}},\"id\":2}"
  run_test "get_drive_item(folder)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_drive_item\",\"arguments\":{\"drive\":$DRIVE_JSON,\"path\":$DRIVE_TEST_FOLDER_JSON}},\"id\":2}"
  run_capture_to_var DRIVE_UPLOAD_TEXT "upload_drive_file($DRIVE_TEST_FILE)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"upload_drive_file\",\"arguments\":{\"drive\":$DRIVE_JSON,\"path\":$DRIVE_TEST_FILE_JSON,\"contentType\":\"text/plain\",\"data\":$DRIVE_TEST_DATA_JSON}},\"id\":2}"
  DRIVE_FILE_ID=$(echo "$DRIVE_UPLOAD_TEXT" | jq -r '.file.id // empty' 2>/dev/null)
  if [ -n "$DRIVE_FILE_ID" ]; then
    DRIVE_FILE_ID_JSON=$(json_string "$DRIVE_FILE_ID")
    run_test "get_drive_item(file)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_drive_item\",\"arguments\":{\"drive\":$DRIVE_JSON,\"itemId\":$DRIVE_FILE_ID_JSON}},\"id\":2}"
    run_test "list_drive_file_versions($DRIVE_FILE_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_drive_file_versions\",\"arguments\":{\"drive\":$DRIVE_JSON,\"file\":$DRIVE_FILE_ID_JSON}},\"id\":2}"
    run_capture_to_var DRIVE_ADD_COMMENT_TEXT "add_drive_file_comment($DRIVE_FILE_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_drive_file_comment\",\"arguments\":{\"drive\":$DRIVE_JSON,\"fileId\":$DRIVE_FILE_ID_JSON,\"body\":$DRIVE_TEST_COMMENT_BODY_JSON}},\"id\":2}"
    DRIVE_COMMENT_ID=$(echo "$DRIVE_ADD_COMMENT_TEXT" | jq -r '.commentId // empty' 2>/dev/null)
    if [ -n "$DRIVE_COMMENT_ID" ]; then
      DRIVE_COMMENT_ID_JSON=$(json_string "$DRIVE_COMMENT_ID")
      run_capture_to_var DRIVE_COMMENTS_TEXT "list_drive_file_comments($DRIVE_FILE_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_drive_file_comments\",\"arguments\":{\"drive\":$DRIVE_JSON,\"fileId\":$DRIVE_FILE_ID_JSON,\"limit\":10}},\"id\":2}"
      assert_json_field_equals "list_drive_file_comments sees comment" "$DRIVE_COMMENTS_TEXT" ".comments[0].id" "$DRIVE_COMMENT_ID"
      run_capture_to_var DRIVE_UPDATE_COMMENT_TEXT "update_drive_file_comment($DRIVE_COMMENT_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_drive_file_comment\",\"arguments\":{\"drive\":$DRIVE_JSON,\"fileId\":$DRIVE_FILE_ID_JSON,\"commentId\":$DRIVE_COMMENT_ID_JSON,\"body\":$DRIVE_TEST_COMMENT_UPDATED_BODY_JSON}},\"id\":2}"
      assert_json_field_equals "update_drive_file_comment updates comment" "$DRIVE_UPDATE_COMMENT_TEXT" ".updated" "true"
      run_test "list_drive_file_activity($DRIVE_FILE_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_drive_file_activity\",\"arguments\":{\"drive\":$DRIVE_JSON,\"fileId\":$DRIVE_FILE_ID_JSON,\"limit\":10}},\"id\":2}"
      run_capture_to_var DRIVE_DELETE_COMMENT_TEXT "delete_drive_file_comment($DRIVE_COMMENT_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_drive_file_comment\",\"arguments\":{\"drive\":$DRIVE_JSON,\"fileId\":$DRIVE_FILE_ID_JSON,\"commentId\":$DRIVE_COMMENT_ID_JSON}},\"id\":2}"
      assert_json_field_equals "delete_drive_file_comment deletes comment" "$DRIVE_DELETE_COMMENT_TEXT" ".deleted" "true"
    else
      skip_test "list_drive_file_comments" "add_drive_file_comment did not return a comment id"
      skip_test "update_drive_file_comment" "add_drive_file_comment did not return a comment id"
      skip_test "list_drive_file_activity" "add_drive_file_comment did not return a comment id"
      skip_test "delete_drive_file_comment" "add_drive_file_comment did not return a comment id"
    fi
    run_capture_to_var DRIVE_VERSION_TEXT "upload_drive_file_version($DRIVE_FILE_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"upload_drive_file_version\",\"arguments\":{\"drive\":$DRIVE_JSON,\"file\":$DRIVE_FILE_ID_JSON,\"contentType\":\"text/plain\",\"data\":$DRIVE_TEST_VERSION_DATA_JSON}},\"id\":2}"
    assert_json_field_equals "upload_drive_file_version increments version" "$DRIVE_VERSION_TEXT" ".currentVersion.version" "2"
    run_capture_to_var DRIVE_VERSIONS_TEXT "list_drive_file_versions($DRIVE_FILE_ID, after version)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_drive_file_versions\",\"arguments\":{\"drive\":$DRIVE_JSON,\"file\":$DRIVE_FILE_ID_JSON}},\"id\":2}"
    assert_json_field_equals "list_drive_file_versions sees two versions" "$DRIVE_VERSIONS_TEXT" ".total" "2"
    run_capture_to_var DRIVE_MOVE_TEXT "move_drive_item($DRIVE_FILE_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"move_drive_item\",\"arguments\":{\"drive\":$DRIVE_JSON,\"itemId\":$DRIVE_FILE_ID_JSON,\"targetFolderPath\":$DRIVE_TEST_FOLDER_JSON}},\"id\":2}"
    assert_json_field_equals "move_drive_item updates path" "$DRIVE_MOVE_TEXT" ".toPath" "$DRIVE_TEST_MOVED_FILE"
    run_capture_to_var DRIVE_RENAME_TEXT "rename_drive_item($DRIVE_FILE_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"rename_drive_item\",\"arguments\":{\"drive\":$DRIVE_JSON,\"itemId\":$DRIVE_FILE_ID_JSON,\"title\":\"hello-renamed.txt\"}},\"id\":2}"
    assert_json_field_equals "rename_drive_item updates path" "$DRIVE_RENAME_TEXT" ".toPath" "$DRIVE_TEST_RENAMED_FILE"
    run_capture_to_var DRIVE_DELETE_TEXT "delete_drive_item($DRIVE_FILE_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_drive_item\",\"arguments\":{\"drive\":$DRIVE_JSON,\"itemId\":$DRIVE_FILE_ID_JSON}},\"id\":2}"
    assert_json_field_equals "delete_drive_item deletes file" "$DRIVE_DELETE_TEXT" ".deleted" "true"
    run_test "delete_drive_item(empty nested folder)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_drive_item\",\"arguments\":{\"drive\":$DRIVE_JSON,\"path\":$DRIVE_TEST_NESTED_JSON}},\"id\":2}"
    run_test "delete_drive_item(empty parent folder)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_drive_item\",\"arguments\":{\"drive\":$DRIVE_JSON,\"path\":$DRIVE_TEST_FOLDER_JSON}},\"id\":2}"
  else
    skip_test "get_drive_item(file)" "upload_drive_file did not return a file id"
    skip_test "list_drive_file_versions" "upload_drive_file did not return a file id"
    skip_test "add_drive_file_comment" "upload_drive_file did not return a file id"
    skip_test "list_drive_file_comments" "upload_drive_file did not return a file id"
    skip_test "update_drive_file_comment" "upload_drive_file did not return a file id"
    skip_test "list_drive_file_activity" "upload_drive_file did not return a file id"
    skip_test "delete_drive_file_comment" "upload_drive_file did not return a file id"
    skip_test "upload_drive_file_version" "upload_drive_file did not return a file id"
    skip_test "move_drive_item" "upload_drive_file did not return a file id"
    skip_test "rename_drive_item" "upload_drive_file did not return a file id"
    skip_test "delete_drive_item(file)" "upload_drive_file did not return a file id"
  fi
else
  skip_test "get_drive" "no Drive spaces found in workspace"
  skip_test "list_drive_items" "no Drive spaces found in workspace"
  skip_test "create_drive_folder" "no Drive spaces found in workspace"
  skip_test "upload_drive_file" "no Drive spaces found in workspace"
  skip_test "add_drive_file_comment" "no Drive spaces found in workspace"
  skip_test "list_drive_file_comments" "no Drive spaces found in workspace"
  skip_test "update_drive_file_comment" "no Drive spaces found in workspace"
  skip_test "list_drive_file_activity" "no Drive spaces found in workspace"
  skip_test "delete_drive_file_comment" "no Drive spaces found in workspace"
  skip_test "upload_drive_file_version" "no Drive spaces found in workspace"
  skip_test "move_drive_item" "no Drive spaces found in workspace"
  skip_test "rename_drive_item" "no Drive spaces found in workspace"
  skip_test "delete_drive_item" "no Drive spaces found in workspace"
  skip_test "list_drive_file_versions" "no Drive spaces found in workspace"
  skip_test "restore_drive_file_version" "no Drive spaces found in workspace"
fi

DRIVE_ADMIN_NAME="MCP Integration Drive $RUN_ID"
DRIVE_ADMIN_UPDATED_NAME="MCP Integration Drive Updated $RUN_ID"
DRIVE_ADMIN_FOLDER="/non-empty"
DRIVE_ADMIN_NAME_JSON=$(json_string "$DRIVE_ADMIN_NAME")
DRIVE_ADMIN_UPDATED_NAME_JSON=$(json_string "$DRIVE_ADMIN_UPDATED_NAME")
DRIVE_ADMIN_FOLDER_JSON=$(json_string "$DRIVE_ADMIN_FOLDER")
run_capture_to_var DRIVE_ADMIN_CREATE_TEXT "create_drive($DRIVE_ADMIN_NAME)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_drive\",\"arguments\":{\"name\":$DRIVE_ADMIN_NAME_JSON,\"description\":\"Drive admin integration fixture\",\"private\":true,\"members\":[],\"owners\":[]}},\"id\":2}"
DRIVE_ADMIN_ID=$(echo "$DRIVE_ADMIN_CREATE_TEXT" | jq -r '.drive.id // empty' 2>/dev/null)
if [ -n "$DRIVE_ADMIN_ID" ]; then
  DRIVE_ADMIN_JSON=$(json_string "$DRIVE_ADMIN_ID")
  remember_drive_cleanup "$DRIVE_ADMIN_ID"
  remember_drive_item_cleanup "$DRIVE_ADMIN_ID" "$DRIVE_ADMIN_FOLDER"
  run_capture_to_var DRIVE_ADMIN_UPDATE_TEXT "update_drive($DRIVE_ADMIN_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_drive\",\"arguments\":{\"drive\":$DRIVE_ADMIN_JSON,\"name\":$DRIVE_ADMIN_UPDATED_NAME_JSON,\"description\":\"Drive admin integration updated\",\"autoJoin\":true}},\"id\":2}"
  assert_json_field_equals "update_drive updates name" "$DRIVE_ADMIN_UPDATE_TEXT" ".drive.name" "$DRIVE_ADMIN_UPDATED_NAME"
  assert_json_field_equals "update_drive updates autoJoin" "$DRIVE_ADMIN_UPDATE_TEXT" ".drive.autoJoin" "true"
  if [ -n "${HULY_EMAIL:-}" ]; then
    HULY_EMAIL_JSON=$(json_string "$HULY_EMAIL")
    run_test "add_drive_members($DRIVE_ADMIN_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_drive_members\",\"arguments\":{\"drive\":$DRIVE_ADMIN_JSON,\"members\":[$HULY_EMAIL_JSON]}},\"id\":2}"
    run_test "remove_drive_members($DRIVE_ADMIN_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"remove_drive_members\",\"arguments\":{\"drive\":$DRIVE_ADMIN_JSON,\"members\":[$HULY_EMAIL_JSON]}},\"id\":2}"
    run_test "set_drive_owners($DRIVE_ADMIN_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"set_drive_owners\",\"arguments\":{\"drive\":$DRIVE_ADMIN_JSON,\"owners\":[$HULY_EMAIL_JSON]}},\"id\":2}"
  else
    skip_test "add_drive_members" "HULY_EMAIL not set"
    skip_test "remove_drive_members" "HULY_EMAIL not set"
    skip_test "set_drive_owners" "HULY_EMAIL not set"
  fi
  run_test "create_drive_folder($DRIVE_ADMIN_FOLDER in temp Drive)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_drive_folder\",\"arguments\":{\"drive\":$DRIVE_ADMIN_JSON,\"path\":$DRIVE_ADMIN_FOLDER_JSON}},\"id\":2}"
  run_expect_error_contains "delete_drive(non-empty)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_drive\",\"arguments\":{\"drive\":$DRIVE_ADMIN_JSON}},\"id\":2}" \
    "is not empty"
  run_test "delete_drive_item(temp Drive folder)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_drive_item\",\"arguments\":{\"drive\":$DRIVE_ADMIN_JSON,\"path\":$DRIVE_ADMIN_FOLDER_JSON}},\"id\":2}"
  run_capture_to_var DRIVE_ADMIN_DELETE_TEXT "delete_drive($DRIVE_ADMIN_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_drive\",\"arguments\":{\"drive\":$DRIVE_ADMIN_JSON}},\"id\":2}"
  assert_json_field_equals "delete_drive deletes empty Drive" "$DRIVE_ADMIN_DELETE_TEXT" ".deleted" "true"
else
  skip_test "update_drive" "create_drive did not return a Drive id"
  skip_test "add_drive_members" "create_drive did not return a Drive id"
  skip_test "remove_drive_members" "create_drive did not return a Drive id"
  skip_test "set_drive_owners" "create_drive did not return a Drive id"
  skip_test "delete_drive(non-empty)" "create_drive did not return a Drive id"
  skip_test "delete_drive" "create_drive did not return a Drive id"
fi
echo ""

##############################
# 21. USER STATUSES
##############################
echo "=== 21. User Statuses ==="
run_capture_to_var USER_STATUSES_TEXT "list_user_statuses" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_user_statuses","arguments":{"limit":5}},"id":2}'

USER_STATUS_USER=$(echo "$USER_STATUSES_TEXT" | jq -r '.statuses[0].user // empty' 2>/dev/null)
USER_STATUS_ONLINE=$(echo "$USER_STATUSES_TEXT" | jq -r 'if (.statuses[0] | has("online")) then (.statuses[0].online | tostring) else "" end' 2>/dev/null)

if [ -n "$USER_STATUS_USER" ]; then
  run_test "list_user_statuses(user:$USER_STATUS_USER)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_user_statuses\",\"arguments\":{\"user\":\"$USER_STATUS_USER\",\"limit\":5}},\"id\":2}"
elif [ -n "$USER_STATUS_ONLINE" ]; then
  run_test "list_user_statuses(online:$USER_STATUS_ONLINE)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_user_statuses\",\"arguments\":{\"online\":$USER_STATUS_ONLINE,\"limit\":5}},\"id\":2}"
else
  skip_test "list_user_statuses(filtered)" "no user status rows found in workspace"
fi
echo ""

if ! cleanup_workflow_artifacts; then
  echo "FAIL: task-management workflow artifact cleanup failed"
  FAILED=$((FAILED + 1))
  ERRORS="${ERRORS}\n  - task-management workflow artifact cleanup failed"
fi

##############################
# SUMMARY
##############################
TOTAL=$((PASSED + FAILED + SKIPPED))
echo "========================================="
echo "  RESULTS: $PASSED passed, $FAILED failed, $SKIPPED skipped (of $TOTAL)"
echo "========================================="
if [ $FAILED -gt 0 ]; then
  echo ""
  echo "Failures:"
  printf '%b\n' "$ERRORS"
  exit 1
fi
