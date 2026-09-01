#!/usr/bin/env bash
set -euo pipefail

MCP_PACKAGE_NAME="@firfi/huly-mcp"
CLI_PACKAGE_NAME="@firfi/huly-cli"
RELEASE_BRANCH="master"
CHANGES_DIR=".changeset"
CHANGES_VERSION="2.30.0"
ESBUILD_VERSION="0.27.2"
EVIDENCE_WORKFLOW="prepare-release-evidence.yml"
PACKAGE_SMOKE_WORKFLOW="package-smoke.yml"

show_dist_tags() {
  local package_name="$1"
  local allow_missing="$2"
  local output

  if output="$(npm dist-tag ls "$package_name" 2>&1)"; then
    printf '%s\n' "$output"
    return 0
  fi

  if [[ "$allow_missing" == "true" ]] && grep -q "E404" <<<"$output"; then
    echo "$package_name is not published yet; continuing for first publish."
    return 0
  fi

  printf '%s\n' "$output" >&2
  return 1
}

published_version() {
  local package_name="$1"
  local allow_missing="$2"
  local output
  local error_file
  error_file="$(mktemp)"

  if output="$(npm view "$package_name" version --json 2>"$error_file")"; then
    rm -f "$error_file"
    printf '%s\n' "$output" | tr -d '"'
    return 0
  fi

  if [[ "$allow_missing" == "true" ]] && grep -q "E404" "$error_file"; then
    rm -f "$error_file"
    return 0
  fi

  cat "$error_file" >&2
  rm -f "$error_file"
  return 1
}

package_needs_publish() {
  local package_name="$1"
  local local_version="$2"
  local allow_missing="$3"
  local registry_version

  registry_version="$(published_version "$package_name" "$allow_missing")"
  [[ "$registry_version" != "$local_version" ]]
}

stage_if_exists() {
  local path
  for path in "$@"; do
    if [[ -e "$path" ]]; then
      git add "$path"
    fi
  done
}

build_mcp_package() {
  local package_version="$1"
  local node_engine_requirement
  node_engine_requirement="$(node -p "require('./package.json').engines.node")"

  pnpm dlx "esbuild@$ESBUILD_VERSION" src/launcher.ts \
    --bundle \
    --platform=node \
    --format=cjs \
    --outfile=dist/index.cjs \
    --external:ws \
    "--define:PKG_VERSION=\"$package_version\"" \
    "--define:NODE_ENGINE_REQUIREMENT=\"$node_engine_requirement\""
  pnpm verify-version
}

build_cli_package() {
  local package_version="$1"

  pnpm dlx "esbuild@$ESBUILD_VERSION" packages/huly-cli/src/index.ts \
    --bundle \
    --platform=node \
    --format=cjs \
    --outfile=packages/huly-cli/dist/index.cjs \
    --external:ws \
    "--define:PKG_VERSION=\"$package_version\""
  pnpm --filter "$CLI_PACKAGE_NAME" verify-version
}

add_release_tag_if_present() {
  local tag_name="$1"

  if ! git rev-parse -q --verify "refs/tags/$tag_name" >/dev/null; then
    return 0
  fi

  if printf '%s\n' "${release_tags[@]}" | grep -Fxq "$tag_name"; then
    return 0
  fi

  release_tags+=("$tag_name")
}

release_tag_exists_locally() {
  local tag_name="$1"

  git rev-parse -q --verify "refs/tags/$tag_name" >/dev/null
}

create_github_release_if_needed() {
  local release_tag="$1"

  if ! release_tag_exists_locally "$release_tag"; then
    return 0
  fi

  if gh release view "$release_tag" >/dev/null 2>&1; then
    echo "GitHub release $release_tag already exists."
    return 0
  fi

  gh release create "$release_tag" --generate-notes --latest --verify-tag
}

latest_dispatched_run_id() {
  local workflow="$1"
  local branch="$2"

  gh run list \
    --workflow "$workflow" \
    --branch "$branch" \
    --limit 20 \
    --json databaseId,event \
    --jq '[.[] | select(.event == "workflow_dispatch")][0].databaseId // empty'
}

dispatch_and_watch_workflow() {
  local workflow="$1"
  local branch="$2"
  local previous_run_id
  local run_id
  local attempt
  previous_run_id="$(latest_dispatched_run_id "$workflow" "$branch")"

  gh workflow run "$workflow" --ref "$branch"
  for ((attempt = 0; attempt < 30; attempt++)); do
    run_id="$(latest_dispatched_run_id "$workflow" "$branch")"
    if [[ -n "$run_id" && "$run_id" != "$previous_run_id" ]]; then
      gh run watch "$run_id" --exit-status
      return 0
    fi
    sleep 1
  done

  echo "Timed out waiting for $workflow to start on $branch." >&2
  return 1
}

prepare_release_candidate() {
  local mcp_version="$1"
  local cli_version="$2"
  local release_commit
  local release_candidate_branch
  release_commit="$(git rev-parse --short=12 HEAD)"
  release_candidate_branch="release-candidate/mcp-${mcp_version}-cli-${cli_version}-${release_commit}"

  if git ls-remote --exit-code --heads origin "$release_candidate_branch" >/dev/null 2>&1; then
    git fetch origin "$release_candidate_branch"
    if ! git merge-base --is-ancestor HEAD "origin/$release_candidate_branch"; then
      echo "Existing release candidate branch $release_candidate_branch is not based on the local release commit." >&2
      return 1
    fi
  else
    git push origin "HEAD:refs/heads/$release_candidate_branch"
  fi

  echo "Refreshing canonical x64 package evidence on $release_candidate_branch."
  dispatch_and_watch_workflow "$EVIDENCE_WORKFLOW" "$release_candidate_branch"
  git fetch origin "$release_candidate_branch"
  git merge --ff-only "origin/$release_candidate_branch"

  echo "Running Package Smoke against $release_candidate_branch before publication."
  dispatch_and_watch_workflow "$PACKAGE_SMOKE_WORKFLOW" "$release_candidate_branch"

  git push origin "$RELEASE_BRANCH"
  git push origin --delete "$release_candidate_branch"
}

current_branch="$(git branch --show-current)"
if [[ "$current_branch" != "$RELEASE_BRANCH" ]]; then
  echo "Refusing production release from branch '$current_branch'; expected '$RELEASE_BRANCH'." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Refusing production release with a dirty worktree." >&2
  git status --short
  exit 1
fi

node_version="$(node -p 'process.versions.node')"
if [[ "$node_version" != "22.22.2" && "$node_version" != "24.15.0" ]]; then
  echo "Refusing production release under Node $node_version; expected 22.22.2 or 24.15.0." >&2
  echo "Run the release with the preferred certified runtime:" >&2
  echo "  mise exec node@24.15.0 -- pnpm local-release" >&2
  exit 1
fi

# Release builds bundle dependencies from the project checkout. A clean clone may
# not have node_modules yet, so make the one-command release path self-contained.
CI=true pnpm install --frozen-lockfile --prod=false

gh auth status >/dev/null
npm whoami >/dev/null
show_dist_tags "$MCP_PACKAGE_NAME" false
show_dist_tags "$CLI_PACKAGE_NAME" true

pending_changeset="$(find "$CHANGES_DIR" -maxdepth 1 -type f -name "*.md" ! -name "README.md" -print -quit)"
if [[ -n "$pending_changeset" ]]; then
  pnpm dlx "@changesets/cli@$CHANGES_VERSION" version
  pnpm sync-registry-metadata
  git add package.json packages/huly-cli/package.json server.json "$CHANGES_DIR"
  stage_if_exists CHANGELOG.md packages/huly-cli/CHANGELOG.md
  if ! git diff --cached --quiet; then
    HUSKY=0 git commit -m "RELEASING: Releasing package(s)"
  fi
fi

mcp_package_version="$(node -p "require('./package.json').version")"
cli_package_version="$(node -p "require('./packages/huly-cli/package.json').version")"
mcp_needs_publish=false
cli_needs_publish=false

if package_needs_publish "$MCP_PACKAGE_NAME" "$mcp_package_version" false; then
  mcp_needs_publish=true
fi

if package_needs_publish "$CLI_PACKAGE_NAME" "$cli_package_version" true; then
  cli_needs_publish=true
fi

if [[ "$mcp_needs_publish" == "false" && "$cli_needs_publish" == "false" ]]; then
  echo "No package versions need publishing; pushing any existing release commit/tags."
else
  echo "Publish plan:"
  if [[ "$mcp_needs_publish" == "true" ]]; then
    echo "  - $MCP_PACKAGE_NAME@$mcp_package_version"
  fi
  if [[ "$cli_needs_publish" == "true" ]]; then
    echo "  - $CLI_PACKAGE_NAME@$cli_package_version"
  fi
fi

if [[ "$mcp_needs_publish" == "true" || "$cli_needs_publish" == "true" ]]; then
  prepare_release_candidate "$mcp_package_version" "$cli_package_version"
else
  git push origin "$RELEASE_BRANCH"
fi

if [[ "$mcp_needs_publish" == "true" ]]; then
  build_mcp_package "$mcp_package_version"
fi

if [[ "$cli_needs_publish" == "true" ]]; then
  build_cli_package "$cli_package_version"
  pnpm verify-cli-integration-coverage
fi

if [[ "$mcp_needs_publish" == "true" || "$cli_needs_publish" == "true" ]]; then
  npm_config_ignore_scripts=true pnpm dlx "@changesets/cli@$CHANGES_VERSION" publish
fi

release_tags=()
while IFS= read -r release_tag_at_head; do
  release_tags[${#release_tags[@]}]="$release_tag_at_head"
done < <(git tag --points-at HEAD)
mcp_release_tag="$MCP_PACKAGE_NAME@$mcp_package_version"
cli_release_tag="$CLI_PACKAGE_NAME@$cli_package_version"
add_release_tag_if_present "$mcp_release_tag"
add_release_tag_if_present "$cli_release_tag"
if [[ "${#release_tags[@]}" -gt 0 ]]; then
  git push origin "${release_tags[@]}"
fi

create_github_release_if_needed "$mcp_release_tag"

show_dist_tags "$MCP_PACKAGE_NAME" false
show_dist_tags "$CLI_PACKAGE_NAME" false

echo "Release finished for changed packages."
