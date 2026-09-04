#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
source scripts/packed-cli-test-helpers.sh

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required for CLI integration tests." >&2
  exit 1
fi

is_container_environment() {
  [[ -f /.dockerenv ]] && return 0
  [[ -r /proc/1/cgroup ]] && grep -Eq "(docker|containerd|kubepods)" /proc/1/cgroup
}

if [[ "${HULY_URL:-}" == *localhost* ]] && is_container_environment; then
  export HULY_URL="${HULY_URL/localhost/host.docker.internal}"
fi

PROJECT="${HULY_TEST_PROJECT:-HULY}"
PROJECT_ID=""
RUN_ID="${HULY_CLI_INTEGRATION_RUN_ID:-$(printf '%s-%s' "$$" "$RANDOM")}"
TEST_TMPDIR="${TEST_TMPDIR:-$(mktemp -d)}"
CLI=()

ISSUE_ID=""
ISSUE_OBJECT_ID=""
COMMENT_ID=""
TEAMSPACE=""
DOCUMENT_ID=""
ATTACHMENT_ID=""
DOCUMENT_LABEL_ID=""
TODO_ID=""
TODO_LABEL_ID=""
DRAWING_ID=""
EVENT_ID=""
HR_DEPARTMENT_ID=""
HR_STAFF_EMPLOYEE=""
HR_STAFF_ORIGINAL_DEPARTMENT=""
HR_STAFF_NEEDS_RESTORE=""
HR_REQUEST_ID=""
FUNNEL_ID=""
PERSON_ADMIN_ID=""
PERSON_ADMIN_COMMENT_ID=""
PERSON_ADMIN_ATTACHMENT_ID=""

cleanup() {
  set +e
  if [[ -n "$HR_REQUEST_ID" ]]; then
    HR_REQUEST_CLEANUP_STDERR="$TEST_TMPDIR/hr-request-cleanup-stderr"
    "${CLI[@]}" hr requests delete "$HR_REQUEST_ID" --yes --json >/dev/null 2>&1 || true
    if ! "${CLI[@]}" hr requests get "$HR_REQUEST_ID" --json >/dev/null 2>"$HR_REQUEST_CLEANUP_STDERR" \
      && grep -Fq -- "not found" "$HR_REQUEST_CLEANUP_STDERR"; then
      HR_REQUEST_ID=""
    fi
  fi
  if [[ -n "$PERSON_ADMIN_ATTACHMENT_ID" && -n "$PERSON_ADMIN_ID" ]]; then
    "${CLI[@]}" contacts persons attachments delete --person "{\"id\":\"$PERSON_ADMIN_ID\"}" \
      --attachment-id "$PERSON_ADMIN_ATTACHMENT_ID" --yes --json >/dev/null 2>&1
  fi
  if [[ -n "$PERSON_ADMIN_COMMENT_ID" && -n "$PERSON_ADMIN_ID" ]]; then
    "${CLI[@]}" contacts persons comments delete --person "{\"id\":\"$PERSON_ADMIN_ID\"}" \
      --comment-id "$PERSON_ADMIN_COMMENT_ID" --yes --json >/dev/null 2>&1
  fi
  if [[ -n "$PERSON_ADMIN_ID" ]]; then
    "${CLI[@]}" contacts persons delete "$PERSON_ADMIN_ID" --yes --json >/dev/null 2>&1
  fi
  if [[ -n "$FUNNEL_ID" ]]; then
    if "${CLI[@]}" leads funnels archive "$FUNNEL_ID" --yes --json >/dev/null 2>&1; then
      FUNNEL_CLEANUP_READ="$("${CLI[@]}" leads funnels get "$FUNNEL_ID" --json 2>/dev/null)"
      if jq -e '.archived == true' >/dev/null <<<"$FUNNEL_CLEANUP_READ" \
        && "${CLI[@]}" leads funnels delete "$FUNNEL_ID" --expected-leads 0 --expected-comments 0 \
          --expected-attachments 0 --yes --json >/dev/null 2>&1 \
        && ! "${CLI[@]}" leads funnels get "$FUNNEL_ID" --json >/dev/null 2>&1; then
        FUNNEL_ID=""
      fi
    fi
  fi
  if [[ -n "$HR_STAFF_NEEDS_RESTORE" ]]; then
    if [[ -n "$HR_STAFF_ORIGINAL_DEPARTMENT" ]]; then
      "${CLI[@]}" hr staff assign-department "$HR_STAFF_EMPLOYEE" \
        "$HR_STAFF_ORIGINAL_DEPARTMENT" --yes --json >/dev/null 2>&1
    else
      "${CLI[@]}" hr staff assign-department "$HR_STAFF_EMPLOYEE" null --yes --json >/dev/null 2>&1
    fi
    for _ in $(seq 1 20); do
      HR_STAFF_JSON="$(run_cli_json_output hr staff list --limit 200 2>/dev/null)"
      HR_RESTORED_DEPARTMENT="$(json_value "$HR_STAFF_JSON" ".staff[] | select(.id == \"$HR_STAFF_EMPLOYEE\") | .department.id // empty")"
      HR_RESTORED_PRESENT="$(json_value "$HR_STAFF_JSON" "[.staff[] | select(.id == \"$HR_STAFF_EMPLOYEE\")] | length")"
      if [[ "$HR_RESTORED_PRESENT" == "1" && "$HR_RESTORED_DEPARTMENT" == "$HR_STAFF_ORIGINAL_DEPARTMENT" ]]; then
        HR_STAFF_NEEDS_RESTORE=""
        break
      fi
      sleep 0.25
    done
  fi
  if [[ -z "$HR_STAFF_NEEDS_RESTORE" && -n "$HR_DEPARTMENT_ID" ]]; then
    "${CLI[@]}" hr departments delete "$HR_DEPARTMENT_ID" --execute \
      --expected-subdepartments 0 --expected-assigned-staff 0 --yes --json >/dev/null 2>&1
  elif [[ -n "$HR_STAFF_NEEDS_RESTORE" && -n "$HR_DEPARTMENT_ID" ]]; then
    echo "HR Staff restoration remains unconfirmed; retaining department '$HR_DEPARTMENT_ID'." >&2
  fi
  if [[ -n "$EVENT_ID" ]]; then
    "${CLI[@]}" calendar events delete "$EVENT_ID" --yes --json >/dev/null 2>&1
  fi
  if [[ -n "$DRAWING_ID" ]]; then
    "${CLI[@]}" drawings delete "$DRAWING_ID" --yes --json >/dev/null 2>&1
  fi
  if [[ -n "$TODO_ID" && -n "$TODO_LABEL_ID" ]]; then
    "${CLI[@]}" planner todos labels remove "{\"todoId\":\"$TODO_ID\"}" "$TODO_LABEL_ID" --yes --json >/dev/null 2>&1
    "${CLI[@]}" tags delete "time:class:ToDo" "$TODO_LABEL_ID" --yes --json >/dev/null 2>&1
  fi
  if [[ -n "$TODO_ID" ]]; then
    "${CLI[@]}" planner todos delete "{\"todoId\":\"$TODO_ID\"}" --yes --json >/dev/null 2>&1
  fi
  if [[ -n "$DOCUMENT_ID" && -n "$DOCUMENT_LABEL_ID" && -n "$TEAMSPACE" ]]; then
    "${CLI[@]}" documents labels remove "$TEAMSPACE" "$DOCUMENT_ID" "$DOCUMENT_LABEL_ID" --yes --json >/dev/null 2>&1
    "${CLI[@]}" tags delete "document:class:Document" "$DOCUMENT_LABEL_ID" --yes --json >/dev/null 2>&1
  fi
  if [[ -n "$ATTACHMENT_ID" ]]; then
    "${CLI[@]}" attachments delete "$ATTACHMENT_ID" --yes --json >/dev/null 2>&1
  fi
  if [[ -n "$ISSUE_ID" ]]; then
    "${CLI[@]}" issues delete "$PROJECT" "$ISSUE_ID" --yes --json >/dev/null 2>&1
  fi
  if [[ -n "$DOCUMENT_ID" && -n "$TEAMSPACE" ]]; then
    "${CLI[@]}" documents delete "$TEAMSPACE" "$DOCUMENT_ID" --yes --json >/dev/null 2>&1
  fi
  rm -rf "$TEST_TMPDIR"
}
trap cleanup EXIT

prepare_packed_cli "$TEST_TMPDIR"
CLI=("$HULY_PREPARED_CLI")

run_cli_json_output() {
  local stdout_file
  local stderr_file
  stdout_file="$(mktemp)"
  stderr_file="$(mktemp)"

  if ! timeout 30 "${CLI[@]}" "$@" --json >"$stdout_file" 2>"$stderr_file"; then
    echo ":: command ::" >&2
    printf 'huly' >&2
    printf ' %q' "$@" >&2
    printf ' --json\n' >&2
    echo ":: stdout ::" >&2
    cat "$stdout_file" >&2
    echo ":: stderr ::" >&2
    cat "$stderr_file" >&2
    rm -f "$stdout_file" "$stderr_file"
    return 1
  fi

  if ! jq -e . "$stdout_file" >/dev/null; then
    echo "CLI command did not emit valid JSON." >&2
    echo ":: command ::" >&2
    printf 'huly' >&2
    printf ' %q' "$@" >&2
    printf ' --json\n' >&2
    echo ":: stdout ::" >&2
    cat "$stdout_file" >&2
    echo ":: stderr ::" >&2
    cat "$stderr_file" >&2
    rm -f "$stdout_file" "$stderr_file"
    return 1
  fi

  cat "$stdout_file"
  rm -f "$stdout_file" "$stderr_file"
}

cover_cli_json() {
  local tool_name="$1"
  local label="$2"
  shift 2

  run_cli_json_output "$@" >/dev/null
  echo "PASS: $label [$tool_name]"
}

capture_cli_json() {
  local tool_name="$1"
  local label="$2"
  local output_var="$3"
  local output
  shift 3

  output="$(run_cli_json_output "$@")"
  printf -v "$output_var" '%s' "$output"
  echo "PASS: $label [$tool_name]"
}

cover_cli_failure() {
  local tool_name="$1"
  local label="$2"
  local expected="$3"
  local stdout_file="$TEST_TMPDIR/failure-stdout"
  local stderr_file="$TEST_TMPDIR/failure-stderr"
  shift 3

  if timeout 30 "${CLI[@]}" "$@" --json >"$stdout_file" 2>"$stderr_file"; then
    echo "FAIL: $label unexpectedly succeeded [$tool_name]" >&2
    return 1
  fi
  if ! grep -Fq -- "$expected" "$stderr_file"; then
    echo "FAIL: $label did not report '$expected' [$tool_name]" >&2
    cat "$stderr_file" >&2
    return 1
  fi
  echo "PASS: $label [$tool_name]"
}

cover_cli_confirmed_failure() {
  local tool_name="$1"
  local label="$2"
  local expected="$3"
  local stdout_file="$TEST_TMPDIR/confirmed-failure-stdout"
  local stderr_file="$TEST_TMPDIR/confirmed-failure-stderr"
  shift 3

  if timeout 30 "${CLI[@]}" "$@" --yes --json >"$stdout_file" 2>"$stderr_file"; then
    echo "FAIL: $label unexpectedly succeeded [$tool_name]" >&2
    return 1
  fi
  if grep -Fq -- "requires --yes" "$stderr_file"; then
    echo "FAIL: $label did not cross the confirmation boundary [$tool_name]" >&2
    cat "$stderr_file" >&2
    return 1
  fi
  if ! grep -Fq -- "$expected" "$stderr_file"; then
    echo "FAIL: $label did not report operation-specific evidence '$expected' [$tool_name]" >&2
    cat "$stderr_file" >&2
    return 1
  fi
  echo "PASS: $label reached the Huly operation [$tool_name]"
}

cli_live_case_begin() {
  echo "BEGIN: CLI live behavior/risk case [$1]"
}

cli_live_case_end() {
  echo "PASS: CLI live behavior/risk case [$1]"
}

assert_json() {
  local label="$1"
  local json="$2"
  local jq_filter="$3"

  if jq -e "$jq_filter" >/dev/null <<<"$json"; then
    echo "PASS: $label"
    return 0
  fi

  echo "FAIL: $label" >&2
  echo "$json" | jq . >&2
  return 1
}

json_value() {
  local json="$1"
  local jq_filter="$2"
  jq -r "$jq_filter" <<<"$json"
}

echo "=== CLI Integration Suite ==="
echo "URL: ${HULY_URL:-<unset>}"
echo "Project: $PROJECT"
echo "Run: $RUN_ID"

cli_live_case_begin "scalar-structured-read"
cover_cli_json "list_projects" "projects list" projects list
cli_live_case_end "scalar-structured-read"
capture_cli_json "list_funnels" "funnels list for lifecycle fixture" FUNNELS_JSON leads funnels list
EXISTING_FUNNEL_ID="$(json_value "$FUNNELS_JSON" '.funnels[0].identifier // empty')"
if [[ -z "$EXISTING_FUNNEL_ID" ]]; then
  echo "No existing funnel found for CLI funnel lifecycle." >&2
  exit 1
fi
printf 'Funnel lifecycle description from file for %s\n' "$RUN_ID" >"$TEST_TMPDIR/funnel-description.md"
cli_live_case_begin "funnel-administration-lifecycle"
capture_cli_json "get_funnel" "funnel lifecycle project-type preflight" FUNNEL_PREFLIGHT_JSON \
  leads funnels get "$EXISTING_FUNNEL_ID"
FUNNEL_PROJECT_TYPE="$(json_value "$FUNNEL_PREFLIGHT_JSON" '.projectType.id // empty')"
if [[ -z "$FUNNEL_PROJECT_TYPE" ]]; then
  echo "get_funnel did not return a project type ID." >&2
  exit 1
fi
capture_cli_json "create_funnel" "funnel lifecycle create with description file" FUNNEL_CREATE_JSON \
  leads funnels create "CLI Integration Funnel $RUN_ID" --project-type "$FUNNEL_PROJECT_TYPE" \
  --full-description-file "$TEST_TMPDIR/funnel-description.md"
FUNNEL_ID="$(json_value "$FUNNEL_CREATE_JSON" '.identifier // empty')"
if [[ -z "$FUNNEL_ID" ]]; then
  echo "create_funnel did not return a funnel ID." >&2
  exit 1
fi
cover_cli_json "update_funnel" "funnel lifecycle nullable structured update" leads funnels update "$FUNNEL_ID" \
  --input-json '{"description":null}'
capture_cli_json "get_funnel" "funnel lifecycle updated-state fresh-session read" FUNNEL_UPDATED_JSON \
  leads funnels get "$FUNNEL_ID"
assert_json "updated funnel cleared summary" "$FUNNEL_UPDATED_JSON" '.description == ""'
cover_cli_json "archive_funnel" "funnel lifecycle archive" leads funnels archive "$FUNNEL_ID" --yes
capture_cli_json "get_funnel" "funnel lifecycle archived-state fresh-session read" FUNNEL_ARCHIVED_JSON \
  leads funnels get "$FUNNEL_ID"
assert_json "archived funnel is visible before deletion" "$FUNNEL_ARCHIVED_JSON" '.archived == true'
cover_cli_json "delete_funnel" "funnel lifecycle snapshot-confirmed delete" leads funnels delete "$FUNNEL_ID" \
  --expected-leads 0 --expected-comments 0 --expected-attachments 0 --yes
cover_cli_failure "get_funnel" "funnel lifecycle post-delete absence" "not found" leads funnels get "$FUNNEL_ID"
FUNNEL_ID=""
cli_live_case_end "funnel-administration-lifecycle"
capture_cli_json "get_project" "projects get" PROJECT_JSON projects get "$PROJECT"
cover_cli_json "list_statuses" "projects statuses" projects statuses "$PROJECT"
cover_cli_json "list_project_types" "project-types list" project-types list
cover_cli_json "get_project_type" "project-types get" project-types get
cover_cli_json "list_mentions" "activity mentions list" activity mentions list
cover_cli_json "list_boards" "boards list" boards list
cover_cli_json "list_channels" "channels list" channels list
cli_live_case_begin "external-channel-privacy"
capture_cli_json "list_external_channel_messages" "Telegram missing-channel assessment" TELEGRAM_EXTERNAL_JSON \
  channels external-messages list telegram "mcp-cli-no-channel-$RUN_ID" --limit 1
assert_json "Telegram missing-channel assessment is explicit" "$TELEGRAM_EXTERNAL_JSON" \
  '.supported == false and .unsupportedReasonCode == "channel-unavailable" and .messages == []'
cli_live_case_end "external-channel-privacy"
cli_live_case_begin "mail-thread-privacy"
cover_cli_json "list_mail_threads" "mail threads list" mail threads list --limit 1
cli_live_case_end "mail-thread-privacy"
cli_live_case_begin "caller-private-status"
capture_cli_json "get_support_status" "support status get" SUPPORT_STATUS_JSON support status get
assert_json "support status reports the local missing setup" "$SUPPORT_STATUS_JSON" \
  '.supported == true and .setup.status == "missing" and (.statusRecords | type) == "array"'
cli_live_case_end "caller-private-status"
capture_cli_json "list_workbench_applications" "workbench applications list" WORKBENCH_APPLICATIONS_JSON \
  workbench applications list --alias board
assert_json "workbench returns the Board model declaration independently of disabled plugin capability" "$WORKBENCH_APPLICATIONS_JSON" \
  '.total == 1 and (.applications | length) == 1 and .applications[0].alias == "board" and (.applications[0].navigation.spaces | type) == "array"'
cli_live_case_begin "agent-warning"
capture_cli_json "list_workbench_applications" "workbench warning projection" WORKBENCH_WARNING_JSON \
  workbench applications list --limit 100
assert_json "workbench degradation is agent-visible" "$WORKBENCH_WARNING_JSON" \
  '(.warnings | type) == "array" and (.warnings | length) > 0'
cli_live_case_end "agent-warning"
cover_cli_json "list_persons" "contacts persons list" contacts persons list
cover_cli_json "get_unread_notification_count" "notifications unread-count get" notifications unread-count get
cover_cli_json "list_spaces" "spaces list" spaces list
cover_cli_json "get_global_space_admins" "spaces admins get" spaces admins get
cover_cli_json "list_message_templates" "templates list" templates list
cover_cli_json "list_events" "calendar events list" calendar events list
cover_cli_json "list_calendars" "calendar calendars list" calendar calendars list
cover_cli_json "list_card_spaces" "cards spaces list" cards spaces list
capture_cli_json "list_cards" "cards list" CARDS_JSON cards list Default --limit 1
CARD_ID="$(json_value "$CARDS_JSON" '.cards[0].id // empty')"
if [[ -z "$CARD_ID" ]]; then
  echo "No Default-space card found for CLI version-history read." >&2
  exit 1
fi
GENERIC_OBJECT_ID="$CARD_ID"
GENERIC_OBJECT_CLASS="card:class:Card"
GENERIC_SPACE_ID="card:space:Default"
cover_cli_json "list_card_versions" "cards versions list" cards versions list Default "$CARD_ID" --limit 1
cover_cli_json "list_drives" "drive list" drive list
cover_cli_json "list_inventory_categories" "inventory categories list" inventory categories list
cover_cli_json "list_funnels" "leads funnels list" leads funnels list
cover_cli_json "list_todos" "planner todos list" planner todos list
cover_cli_json "list_recruiting_candidates" "recruiting candidates list" recruiting candidates list
cover_cli_json "list_test_projects" "tests projects list" tests projects list
cover_cli_json "list_office_floors" "office floors list" office floors list
cover_cli_json "list_associations" "platform associations list" platform associations list
cover_cli_json "list_custom_fields" "custom-fields list" custom-fields list
cover_cli_json "list_processes" "processes list" processes list
cover_cli_json "list_user_statuses" "user-statuses list" user-statuses list
cli_live_case_begin "workspace-client-read"
cover_cli_json "get_workspace_info" "workspace info get" workspace info get
cli_live_case_end "workspace-client-read"

cli_live_case_begin "typed-error"
cover_cli_failure "get_issue" "typed not-found error" "not found" issues get "$PROJECT" "CLI-NOT-FOUND-$RUN_ID"
cli_live_case_end "typed-error"

cli_live_case_begin "consequential-refusals"
cover_cli_failure "create_workspace" "workspace creation confirmation" "requires --yes" \
  workspace create "CLI Guard $RUN_ID"
cover_cli_failure "approve_approval_request" "approval confirmation" "requires --yes" approvals approve "missing-$RUN_ID"
cover_cli_failure "add_space_members" "space membership confirmation" "requires --yes" \
  spaces members add "missing-$RUN_ID" '["missing@example.com"]'
cover_cli_failure "start_process" "process start confirmation" "requires --yes" \
  processes start "missing-process-$RUN_ID" "missing-card-$RUN_ID"
cover_cli_failure "mark_all_notifications_read" "bulk notification confirmation" "requires --yes" \
  notifications all read
cover_cli_confirmed_failure "update_member_role" "confirmed workspace role update" \
  "Connection error while communicating with Huly" \
  workspace members role update "00000000-0000-0000-0000-000000000000" USER
cover_cli_confirmed_failure "approve_approval_request" "confirmed approval decision" \
  "Approval request 'missing-$RUN_ID' not found" approvals approve "missing-$RUN_ID"
cover_cli_confirmed_failure "add_space_members" "confirmed space membership update" \
  "Space 'missing-$RUN_ID' not found" \
  spaces members add "missing-$RUN_ID" '["missing@example.com"]'
cover_cli_confirmed_failure "start_process" "confirmed process start" \
  "Process 'missing-process-$RUN_ID' not found" \
  processes start "missing-process-$RUN_ID" "missing-card-$RUN_ID"
cover_cli_json "mark_all_notifications_read" "confirmed bulk notification update" notifications all read --yes
cli_live_case_end "consequential-refusals"

cli_live_case_begin "structured-calendar-lifecycle"
EVENT_AT=1893456000000
capture_cli_json "create_event" "calendar structured event create" EVENT_JSON \
  calendar events create "CLI Integration Event $RUN_ID" "$EVENT_AT" --reminders '[1893455940000]'
EVENT_ID="$(json_value "$EVENT_JSON" '.eventId // .id // empty')"
if [[ -z "$EVENT_ID" ]]; then
  echo "create_event did not return an event ID." >&2
  exit 1
fi
cover_cli_json "delete_event" "calendar event cleanup" calendar events delete "$EVENT_ID" --yes
EVENT_ID=""
cli_live_case_end "structured-calendar-lifecycle"

cli_live_case_begin "hr-department-lifecycle"
HR_DEPARTMENT_NAME="CLI HR $RUN_ID"
capture_cli_json "create_department" "HR department create" HR_DEPARTMENT_JSON \
  hr departments create "$HR_DEPARTMENT_NAME" --description "CLI integration fixture"
HR_DEPARTMENT_ID="$(json_value "$HR_DEPARTMENT_JSON" '.id // empty')"
if [[ -z "$HR_DEPARTMENT_ID" ]]; then
  echo "create_department did not return a department ID." >&2
  exit 1
fi
cover_cli_json "update_department" "HR department update" \
  hr departments update "$HR_DEPARTMENT_ID" --description "Updated CLI integration fixture"
HR_STAFF_FIXTURE="$(pnpm exec tsx scripts/integration-hr-staff-fixture.ts)"
HR_STAFF_EMPLOYEE="$(json_value "$HR_STAFF_FIXTURE" '.employeeId // empty')"
HR_STAFF_ORIGINAL_DEPARTMENT="$(json_value "$HR_STAFF_FIXTURE" '.departmentId // empty')"
if [[ -z "$HR_STAFF_EMPLOYEE" ]]; then
  echo "Authenticated workspace user did not resolve to an Employee." >&2
  exit 1
fi
HR_STAFF_NEEDS_RESTORE=1
cover_cli_json "assign_staff_department" "HR staff department assignment" \
  hr staff assign-department "$HR_STAFF_EMPLOYEE" "$HR_DEPARTMENT_ID" --yes
if [[ -n "$HR_STAFF_ORIGINAL_DEPARTMENT" ]]; then
  cover_cli_json "assign_staff_department" "HR staff department restoration" \
    hr staff assign-department "$HR_STAFF_EMPLOYEE" "$HR_STAFF_ORIGINAL_DEPARTMENT" --yes
else
  cover_cli_json "assign_staff_department" "HR staff department restoration" \
    hr staff assign-department "$HR_STAFF_EMPLOYEE" null --yes
fi
for _ in $(seq 1 20); do
  HR_STAFF_JSON="$(run_cli_json_output hr staff list --limit 200)"
  HR_RESTORED_DEPARTMENT="$(json_value "$HR_STAFF_JSON" ".staff[] | select(.id == \"$HR_STAFF_EMPLOYEE\") | .department.id // empty")"
  HR_RESTORED_PRESENT="$(json_value "$HR_STAFF_JSON" "[.staff[] | select(.id == \"$HR_STAFF_EMPLOYEE\")] | length")"
  [[ "$HR_RESTORED_PRESENT" == "1" && "$HR_RESTORED_DEPARTMENT" == "$HR_STAFF_ORIGINAL_DEPARTMENT" ]] && break
  sleep 0.25
done
if [[ "$HR_RESTORED_PRESENT" != "1" || "$HR_RESTORED_DEPARTMENT" != "$HR_STAFF_ORIGINAL_DEPARTMENT" ]]; then
  echo "HR Staff fixture restoration was not confirmed; cleanup marker retained." >&2
  exit 1
fi
HR_STAFF_NEEDS_RESTORE=""
cover_cli_json "delete_department" "HR department cleanup" \
  hr departments delete "$HR_DEPARTMENT_ID" --execute \
    --expected-subdepartments 0 --expected-assigned-staff 0 --yes
cover_cli_failure "get_department" "HR department cleanup confirmation" "not found" \
  hr departments get "$HR_DEPARTMENT_ID"
HR_DEPARTMENT_ID=""
cli_live_case_end "hr-department-lifecycle"

cli_live_case_begin "hr-request-lifecycle"
printf '%s\n' "CLI HR request $RUN_ID with **native Markdown**" >"$TEST_TMPDIR/hr-request-description.md"
HR_REQUEST_TYPES_JSON="$(run_cli_json_output hr request-types list --limit 20)"
cover_cli_json "list_hr_request_types" "HR request type discovery" hr request-types list --limit 20
HR_REQUEST_TYPES_FR_JSON="$(run_cli_json_output hr request-types list --locale fr --limit 20)"
if ! jq -e \
  '[.requestTypes[] | select(.labelResource == "hr:string:PTO" and .label == "Congé payé" and .labelLocale == "fr")] | length == 1' \
  >/dev/null 2>&1 <<<"$HR_REQUEST_TYPES_FR_JSON"; then
  echo "French HR request type discovery did not localize PTO through the Huly HR asset." >&2
  exit 1
fi
HR_REQUEST_TYPE_ID="$(json_value "$HR_REQUEST_TYPES_JSON" '.requestTypes[0].id // empty')"
if [[ -z "$HR_REQUEST_TYPE_ID" ]]; then
  echo "No installed HR request type available." >&2
  exit 1
fi
capture_cli_json "create_hr_request" "HR request create" HR_REQUEST_JSON \
  hr requests create "$HR_STAFF_EMPLOYEE" "$HR_REQUEST_TYPE_ID" 2026-09-04 2026-09-04 \
  --department "hr:ids:Head" --description-file "$TEST_TMPDIR/hr-request-description.md"
HR_REQUEST_ID="$(json_value "$HR_REQUEST_JSON" '.request.id // empty')"
if [[ -z "$HR_REQUEST_ID" ]]; then
  echo "create_hr_request did not return a request ID." >&2
  exit 1
fi
cover_cli_json "list_hr_requests" "HR request list" hr requests list --employee "$HR_STAFF_EMPLOYEE" --limit 1
cover_cli_json "get_hr_request" "HR request get" hr requests get "$HR_REQUEST_ID"
cover_cli_json "update_hr_request" "HR request update" hr requests update "$HR_REQUEST_ID" \
  --input-json '{"description":"Updated CLI HR request"}'
cover_cli_json "delete_hr_request" "HR request cleanup" hr requests delete "$HR_REQUEST_ID" --yes
cover_cli_failure "get_hr_request" "HR request cleanup confirmation" "not found" hr requests get "$HR_REQUEST_ID"
HR_REQUEST_ID=""
cli_live_case_end "hr-request-lifecycle"

capture_cli_json "list_teamspaces" "teamspaces list" TEAMSPACES_JSON teamspaces list
TEAMSPACE="$(json_value "$TEAMSPACES_JSON" '.teamspaces[0].name // .teamspaces[0].id // empty')"
if [[ -z "$TEAMSPACE" ]]; then
  echo "No teamspace found for CLI document lifecycle." >&2
  exit 1
fi
cover_cli_json "get_teamspace" "teamspaces get" teamspaces get "$TEAMSPACE"

ISSUE_TITLE="CLI Integration Issue $RUN_ID"
capture_cli_json "create_issue" "issues create" ISSUE_JSON \
  issues create --project "$PROJECT" --title "$ISSUE_TITLE" --description "Created by CLI integration" --priority low
assert_json "create_issue returns identifier" "$ISSUE_JSON" '.identifier | type == "string" and length > 0'
assert_json "create_issue returns issue object id" "$ISSUE_JSON" '.issueId | type == "string" and length > 0'
ISSUE_ID="$(json_value "$ISSUE_JSON" '.identifier')"
ISSUE_OBJECT_ID="$(json_value "$ISSUE_JSON" '.issueId')"

printf 'raw attachment from cli integration %s\n' "$RUN_ID" >"$TEST_TMPDIR/raw-attachment.bin"
cli_live_case_begin "raw-upload"
capture_cli_json "add_attachment" "generic attachment base64-file upload" RAW_ATTACHMENT_JSON \
  attachments add "$GENERIC_OBJECT_ID" "$GENERIC_OBJECT_CLASS" "$GENERIC_SPACE_ID" "raw-$RUN_ID.bin" \
    application/octet-stream --data-base64-file "$TEST_TMPDIR/raw-attachment.bin"
ATTACHMENT_ID="$(json_value "$RAW_ATTACHMENT_JSON" '.attachmentId')"
assert_json "add_attachment returns attachment id" "$RAW_ATTACHMENT_JSON" \
  '.attachmentId | type == "string" and length > 0'
cli_live_case_end "raw-upload"
cover_cli_json "delete_attachment" "generic attachment cleanup" attachments delete "$ATTACHMENT_ID" --yes
ATTACHMENT_ID=""

cli_live_case_begin "person-administration-lifecycle"
capture_cli_json "create_person" "person administration fixture" PERSON_ADMIN_JSON \
  contacts persons create "CLI-$RUN_ID" Person --email "cli-person-$RUN_ID@example.test"
PERSON_ADMIN_ID="$(json_value "$PERSON_ADMIN_JSON" '.id')"
PERSON_ADMIN_TARGET="{\"id\":\"$PERSON_ADMIN_ID\"}"
cover_cli_json "get_person_administration" "person administration read" \
  contacts persons administration get --person "$PERSON_ADMIN_TARGET"
cover_cli_json "list_social_identity_providers" "person identity providers" \
  contacts persons identities providers
cover_cli_failure "repair_person_social_identities" "unlinked person repair refusal" "not linked to an account personUuid" \
  contacts persons identities repair --person "$PERSON_ADMIN_TARGET" --yes
capture_cli_json "add_person_comment" "person comment add" PERSON_ADMIN_COMMENT_JSON \
  contacts persons comments add --person "$PERSON_ADMIN_TARGET" --body "CLI person note $RUN_ID"
PERSON_ADMIN_COMMENT_ID="$(json_value "$PERSON_ADMIN_COMMENT_JSON" '.commentId')"
cover_cli_json "list_person_comments" "person comments list" \
  contacts persons comments list --person "$PERSON_ADMIN_TARGET"
cover_cli_json "update_person_comment" "person comment update" \
  contacts persons comments update --person "$PERSON_ADMIN_TARGET" --comment-id "$PERSON_ADMIN_COMMENT_ID" \
    --body "CLI person note updated $RUN_ID"
printf 'person attachment %s\n' "$RUN_ID" >"$TEST_TMPDIR/person-attachment.txt"
capture_cli_json "add_person_attachment" "person attachment add" PERSON_ADMIN_ATTACHMENT_JSON \
  contacts persons attachments add --person "$PERSON_ADMIN_TARGET" --filename "person-$RUN_ID.txt" \
    --content-type text/plain --data-base64-file "$TEST_TMPDIR/person-attachment.txt"
PERSON_ADMIN_ATTACHMENT_ID="$(json_value "$PERSON_ADMIN_ATTACHMENT_JSON" '.attachmentId')"
cover_cli_json "list_person_attachments" "person attachments list" \
  contacts persons attachments list --person "$PERSON_ADMIN_TARGET"
cover_cli_json "get_person_attachment" "person attachment get" \
  contacts persons attachments get --person "$PERSON_ADMIN_TARGET" --attachment-id "$PERSON_ADMIN_ATTACHMENT_ID"
cover_cli_json "update_person_attachment" "person attachment update" \
  contacts persons attachments update --person "$PERSON_ADMIN_TARGET" \
    --attachment-id "$PERSON_ADMIN_ATTACHMENT_ID" --pinned true
cover_cli_json "delete_person_attachment" "person attachment delete" \
  contacts persons attachments delete --person "$PERSON_ADMIN_TARGET" \
    --attachment-id "$PERSON_ADMIN_ATTACHMENT_ID" --yes
PERSON_ADMIN_ATTACHMENT_ID=""
cover_cli_json "delete_person_comment" "person comment delete" \
  contacts persons comments delete --person "$PERSON_ADMIN_TARGET" --comment-id "$PERSON_ADMIN_COMMENT_ID" --yes
PERSON_ADMIN_COMMENT_ID=""
cover_cli_json "delete_person" "person administration cleanup" contacts persons delete "$PERSON_ADMIN_ID" --yes
PERSON_ADMIN_ID=""
cli_live_case_end "person-administration-lifecycle"

printf '{"nodes":[{"id":"%s"}]}\n' "$RUN_ID" >"$TEST_TMPDIR/drawing.json"
cli_live_case_begin "nullable-drawing-lifecycle"
capture_cli_json "create_drawing" "drawing content-file create" DRAWING_JSON \
  drawings create "$GENERIC_OBJECT_ID" "$GENERIC_OBJECT_CLASS" "$GENERIC_SPACE_ID" --content-file "$TEST_TMPDIR/drawing.json"
DRAWING_ID="$(json_value "$DRAWING_JSON" '.drawingId // .id // empty')"
if [[ -z "$DRAWING_ID" ]]; then
  echo "create_drawing did not return a drawing ID." >&2
  exit 1
fi
cover_cli_json "update_drawing" "drawing nullable clear" drawings update "$DRAWING_ID" --content null
cover_cli_json "delete_drawing" "drawing cleanup" drawings delete "$DRAWING_ID" --yes
DRAWING_ID=""
cli_live_case_end "nullable-drawing-lifecycle"

cover_cli_json "get_issue" "issues get" issues get "$PROJECT" "$ISSUE_ID"
cover_cli_json "update_issue" "issues update" issues update "$PROJECT" "$ISSUE_ID" --title "$ISSUE_TITLE updated"
cover_cli_json "list_issues" "issues list" issues list --project "$PROJECT" --title-search "CLI Integration Issue"

printf 'body from file for %s\n' "$RUN_ID" >"$TEST_TMPDIR/comment.md"
cli_live_case_begin "text-file-input"
capture_cli_json "add_comment" "comments add" COMMENT_JSON \
  comments add --project "$PROJECT" --issue-identifier "$ISSUE_ID" --body-file "$TEST_TMPDIR/comment.md"
assert_json "add_comment returns comment id" "$COMMENT_JSON" '.commentId | type == "string" and length > 0'
COMMENT_ID="$(json_value "$COMMENT_JSON" '.commentId')"
cli_live_case_end "text-file-input"
cover_cli_json "list_comments" "comments list" comments list --project "$PROJECT" --issue-identifier "$ISSUE_ID"
cover_cli_json "update_comment" "comments update" \
  comments update --project "$PROJECT" --issue-identifier "$ISSUE_ID" --comment-id "$COMMENT_ID" --body "updated $RUN_ID"
cover_cli_json "delete_comment" "comments delete" \
  comments delete --project "$PROJECT" --issue-identifier "$ISSUE_ID" --comment-id "$COMMENT_ID" --yes
COMMENT_ID=""

printf 'attachment from cli integration %s\n' "$RUN_ID" >"$TEST_TMPDIR/attachment.txt"
capture_cli_json "add_issue_attachment" "attachments add-to-issue" ATTACHMENT_JSON \
  attachments add-to-issue --project "$PROJECT" --identifier "$ISSUE_ID" --file-path "$TEST_TMPDIR/attachment.txt" \
    --filename "cli-integration-$RUN_ID.txt" --content-type text/plain
assert_json "add_issue_attachment returns attachment id" "$ATTACHMENT_JSON" '.attachmentId | type == "string" and length > 0'
ATTACHMENT_ID="$(json_value "$ATTACHMENT_JSON" '.attachmentId')"
cover_cli_json "list_attachments" "attachments list" \
  attachments list --object-id "$ISSUE_OBJECT_ID" --object-class "tracker:class:Issue"
cover_cli_json "get_attachment" "attachments get" attachments get "$ATTACHMENT_ID"
cover_cli_json "download_attachment" "attachments download metadata" attachments download "$ATTACHMENT_ID"
cli_live_case_begin "binary-download"
capture_cli_json "download_attachment" "attachments download output" DOWNLOAD_JSON \
  attachments download "$ATTACHMENT_ID" --output "$TEST_TMPDIR/downloaded-attachment.txt"
assert_json "download_attachment output returns metadata" "$DOWNLOAD_JSON" '.attachmentId | type == "string" and length > 0'
grep -q "attachment from cli integration" "$TEST_TMPDIR/downloaded-attachment.txt"
echo "PASS: attachment bytes downloaded"
cli_live_case_end "binary-download"
cover_cli_json "delete_attachment" "attachments delete" attachments delete "$ATTACHMENT_ID" --yes
ATTACHMENT_ID=""

printf '%s' 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=' \
  | base64 -d >"$TEST_TMPDIR/pixel.png"
capture_cli_json "add_issue_attachment" "image attachment upload" IMAGE_ATTACHMENT_JSON \
  attachments add-to-issue --project "$PROJECT" --identifier "$ISSUE_ID" \
    --data-base64-file "$TEST_TMPDIR/pixel.png" --filename "pixel-$RUN_ID.png" --content-type image/png
ATTACHMENT_ID="$(json_value "$IMAGE_ATTACHMENT_JSON" '.attachmentId')"
cli_live_case_begin "image-output"
capture_cli_json "read_attachment_content" "image attachment output" IMAGE_JSON \
  attachments read-image "$ATTACHMENT_ID" --output "$TEST_TMPDIR/pixel-output.png"
assert_json "read_attachment_content returns image metadata" "$IMAGE_JSON" \
  '.result.type == "image/png" and .image.mimeType == "image/png" and .image.encoding == "base64"'
cmp "$TEST_TMPDIR/pixel.png" "$TEST_TMPDIR/pixel-output.png"
echo "PASS: image bytes written"
cli_live_case_end "image-output"
cover_cli_json "delete_attachment" "image attachment cleanup" attachments delete "$ATTACHMENT_ID" --yes
ATTACHMENT_ID=""

DOC_TITLE="CLI Integration Document $RUN_ID"
printf '# CLI Integration\n\nOriginal body %s\n' "$RUN_ID" >"$TEST_TMPDIR/document.md"
capture_cli_json "create_document" "documents create" DOCUMENT_JSON \
  documents create --teamspace "$TEAMSPACE" --title "$DOC_TITLE" --content-file "$TEST_TMPDIR/document.md"
assert_json "create_document returns document id" "$DOCUMENT_JSON" '.id | type == "string" and length > 0'
DOCUMENT_ID="$(json_value "$DOCUMENT_JSON" '.id')"
cover_cli_json "get_document" "documents get" documents get --teamspace "$TEAMSPACE" --document "$DOCUMENT_ID"
cover_cli_json "edit_document" "documents edit" \
  documents edit --teamspace "$TEAMSPACE" --document "$DOCUMENT_ID" --old-text "Original body" --new-text "Updated body"
cover_cli_json "list_documents" "documents list" documents list --teamspace "$TEAMSPACE" --title-search "CLI Integration Document"
cover_cli_json "list_inline_comments" "documents comments" documents comments --teamspace "$TEAMSPACE" --document "$DOCUMENT_ID"
DOCUMENT_LABEL_TITLE="cli-document-label-$RUN_ID"
capture_cli_json "add_document_label" "documents labels add" DOCUMENT_LABEL_JSON \
  documents labels add "$TEAMSPACE" "$DOCUMENT_ID" "$DOCUMENT_LABEL_TITLE"
assert_json "add_document_label returns label id" "$DOCUMENT_LABEL_JSON" '.label | type == "string" and length > 0'
DOCUMENT_LABEL_ID="$(json_value "$DOCUMENT_LABEL_JSON" '.label')"
cover_cli_json "list_document_labels" "documents labels list" documents labels list "$TEAMSPACE" "$DOCUMENT_ID"
cover_cli_json "list_document_label_definitions" "documents label definitions list" \
  documents labels definitions list --title-search "$DOCUMENT_LABEL_TITLE"
cover_cli_json "remove_document_label" "documents labels remove" \
  documents labels remove "$TEAMSPACE" "$DOCUMENT_ID" "$DOCUMENT_LABEL_ID" --yes
cover_cli_json "delete_tag" "document label definition cleanup" \
  tags delete "document:class:Document" "$DOCUMENT_LABEL_ID" --yes
DOCUMENT_LABEL_ID=""
cover_cli_json "delete_document" "documents delete" documents delete "$TEAMSPACE" "$DOCUMENT_ID" --yes
DOCUMENT_ID=""

TODO_TITLE="CLI Integration Todo $RUN_ID"
capture_cli_json "create_todo" "planner todos create" TODO_JSON planner todos create "$TODO_TITLE"
assert_json "create_todo returns todo id" "$TODO_JSON" '.todoId | type == "string" and length > 0'
TODO_ID="$(json_value "$TODO_JSON" '.todoId')"
TODO_LOCATOR="{\"todoId\":\"$TODO_ID\"}"
TODO_LABEL_TITLE="cli-todo-label-$RUN_ID"
capture_cli_json "add_todo_label" "planner todo labels add" TODO_LABEL_JSON \
  planner todos labels add "$TODO_LOCATOR" "$TODO_LABEL_TITLE"
assert_json "add_todo_label returns label id" "$TODO_LABEL_JSON" '.label | type == "string" and length > 0'
TODO_LABEL_ID="$(json_value "$TODO_LABEL_JSON" '.label')"
cover_cli_json "list_todo_labels" "planner todo labels list" planner todos labels list "$TODO_LOCATOR"
cover_cli_json "list_todo_label_definitions" "planner todo label definitions list" \
  planner todos labels definitions list --title-search "$TODO_LABEL_TITLE"
cover_cli_json "remove_todo_label" "planner todo labels remove" \
  planner todos labels remove "$TODO_LOCATOR" "$TODO_LABEL_ID" --yes
cover_cli_json "delete_tag" "todo label definition cleanup" tags delete "time:class:ToDo" "$TODO_LABEL_ID" --yes
TODO_LABEL_ID=""
cover_cli_json "delete_todo" "planner todos delete" planner todos delete "$TODO_LOCATOR" --yes
TODO_ID=""

cover_cli_json "fulltext_search" "search" search "CLI Integration" --limit 3
cover_cli_json "delete_issue" "issues delete" issues delete "$PROJECT" "$ISSUE_ID" --yes
ISSUE_ID=""

echo "=== CLI Integration Suite: PASS ==="
