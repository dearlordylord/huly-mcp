#!/usr/bin/env bash
set -euo pipefail

MCP_PACKAGE_NAME="@firfi/huly-mcp"
CLI_PACKAGE_NAME="@firfi/huly-cli"
RELEASE_BRANCH="master"
CHANGES_DIR=".changeset"
CHANGES_VERSION="2.30.0"

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

stage_if_exists() {
  local path
  for path in "$@"; do
    if [[ -e "$path" ]]; then
      git add "$path"
    fi
  done
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

pnpm build
pnpm verify-version
pnpm --filter "$CLI_PACKAGE_NAME" verify-version

npm_config_ignore_scripts=true pnpm dlx "@changesets/cli@$CHANGES_VERSION" publish

git push origin "$RELEASE_BRANCH"
mapfile -t release_tags < <(git tag --points-at HEAD)
if [[ "${#release_tags[@]}" -gt 0 ]]; then
  git push origin "${release_tags[@]}"
fi

mcp_release_tag="v$mcp_package_version"
if printf '%s\n' "${release_tags[@]}" | grep -Fxq "$mcp_release_tag"; then
  gh release create "$mcp_release_tag" --generate-notes --latest --verify-tag
fi

show_dist_tags "$MCP_PACKAGE_NAME" false
show_dist_tags "$CLI_PACKAGE_NAME" false

echo "Published $MCP_PACKAGE_NAME@$mcp_package_version and $CLI_PACKAGE_NAME@$cli_package_version when changed."
