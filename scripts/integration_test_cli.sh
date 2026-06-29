#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required for CLI integration tests." >&2
  exit 1
fi

if [[ ! -f packages/huly-cli/dist/index.cjs ]]; then
  pnpm --filter @firfi/huly-cli build
fi

is_container_environment() {
  [[ -f /.dockerenv ]] && return 0
  [[ -r /proc/1/cgroup ]] && grep -Eq "(docker|containerd|kubepods)" /proc/1/cgroup
}

if [[ "${HULY_URL:-}" == *localhost* ]] && is_container_environment; then
  export HULY_URL="${HULY_URL/localhost/host.docker.internal}"
fi

CLI=(node packages/huly-cli/dist/index.cjs)
PROJECT="${HULY_TEST_PROJECT:-HULY}"
RUN_ID="${HULY_CLI_INTEGRATION_RUN_ID:-$(printf '%s-%s' "$$" "$RANDOM")}"
TEST_TMPDIR="${TEST_TMPDIR:-$(mktemp -d)}"

ISSUE_ID=""
ISSUE_OBJECT_ID=""
COMMENT_ID=""
TEAMSPACE=""
DOCUMENT_ID=""
ATTACHMENT_ID=""

cleanup() {
  set +e
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

cover_cli_json "list_projects" "projects list" projects list
cover_cli_json "get_project" "projects get" projects get "$PROJECT"
cover_cli_json "list_statuses" "projects statuses" projects statuses "$PROJECT"
cover_cli_json "list_project_types" "project-types list" project-types list
cover_cli_json "get_project_type" "project-types get" project-types get
cover_cli_json "list_mentions" "activity mentions list" activity mentions list
cover_cli_json "list_boards" "boards list" boards list
cover_cli_json "list_channels" "channels list" channels list
cover_cli_json "list_persons" "contacts persons list" contacts persons list
cover_cli_json "get_unread_notification_count" "notifications unread-count get" notifications unread-count get
cover_cli_json "list_spaces" "spaces list" spaces list
cover_cli_json "list_message_templates" "templates list" templates list
cover_cli_json "list_events" "calendar events list" calendar events list
cover_cli_json "list_calendars" "calendar calendars list" calendar calendars list
cover_cli_json "list_card_spaces" "cards spaces list" cards spaces list
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
cover_cli_json "get_workspace_info" "workspace info get" workspace info get

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

cover_cli_json "get_issue" "issues get" issues get "$PROJECT" "$ISSUE_ID"
cover_cli_json "update_issue" "issues update" issues update "$PROJECT" "$ISSUE_ID" --title "$ISSUE_TITLE updated"
cover_cli_json "list_issues" "issues list" issues list --project "$PROJECT" --title-search "CLI Integration Issue"

printf 'body from file for %s\n' "$RUN_ID" >"$TEST_TMPDIR/comment.md"
capture_cli_json "add_comment" "comments add" COMMENT_JSON \
  comments add --project "$PROJECT" --issue-identifier "$ISSUE_ID" --body-file "$TEST_TMPDIR/comment.md"
assert_json "add_comment returns comment id" "$COMMENT_JSON" '.commentId | type == "string" and length > 0'
COMMENT_ID="$(json_value "$COMMENT_JSON" '.commentId')"
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
capture_cli_json "download_attachment" "attachments download output" DOWNLOAD_JSON \
  attachments download "$ATTACHMENT_ID" --output "$TEST_TMPDIR/downloaded-attachment.txt"
assert_json "download_attachment output returns metadata" "$DOWNLOAD_JSON" '.attachmentId | type == "string" and length > 0'
grep -q "attachment from cli integration" "$TEST_TMPDIR/downloaded-attachment.txt"
echo "PASS: attachment bytes downloaded"
cover_cli_json "delete_attachment" "attachments delete" attachments delete "$ATTACHMENT_ID" --yes
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
cover_cli_json "delete_document" "documents delete" documents delete "$TEAMSPACE" "$DOCUMENT_ID" --yes
DOCUMENT_ID=""

cover_cli_json "fulltext_search" "search" search "CLI Integration" --limit 3
cover_cli_json "delete_issue" "issues delete" issues delete "$PROJECT" "$ISSUE_ID" --yes
ISSUE_ID=""

echo "=== CLI Integration Suite: PASS ==="
