#!/usr/bin/env bash

release_content_matches() {
  local verified_commit="$1"
  [[ "$verified_commit" =~ ^[0-9a-f]{40}$ ]] || return 1
  git cat-file -e "$verified_commit^{commit}" 2>/dev/null || return 1
  # These files orchestrate publication; Package Smoke does not consume them.
  git diff --quiet "$verified_commit" HEAD -- . \
    ':(exclude)scripts/local_release.sh' \
    ':(exclude)scripts/release-verification.sh' \
    ':(exclude)docs/NPM_PRODUCTION_RELEASE.md'
}

find_verified_package_smoke() {
  local workflow="$1"
  local runs
  local run_id verified_commit run_url
  if ! runs="$(gh run list --workflow "$workflow" --limit 100 \
    --json databaseId,headSha,event,status,conclusion,url \
    --jq '.[] | select((.event == "workflow_dispatch" or .event == "push") and .status == "completed" and .conclusion == "success") | [.databaseId, .headSha, .url] | @tsv')"; then
    echo "Unable to read Package Smoke evidence from GitHub." >&2
    return 2
  fi
  while IFS=$'\t' read -r run_id verified_commit run_url; do
    [[ "$run_id" =~ ^[0-9]+$ && "$verified_commit" =~ ^[0-9a-f]{40}$ ]] || continue
    if ! git cat-file -e "$verified_commit^{commit}" 2>/dev/null; then
      git fetch --quiet origin "$verified_commit" || return 2
    fi
    if release_content_matches "$verified_commit"; then
      printf '%s\n' "$run_url"
      return 0
    fi
  done <<<"$runs"
  return 1
}
