#!/usr/bin/env bash
set -euo pipefail

MCP_PACKAGE_NAME="@firfi/huly-mcp"
CLI_PACKAGE_NAME="@firfi/huly-cli"
RELEASE_BRANCH="master"
CHANGES_DIR=".changeset"
CHANGES_VERSION="2.30.0"
ESBUILD_VERSION="0.27.2"
TSX_VERSION="4.21.0"

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

  pnpm dlx "esbuild@$ESBUILD_VERSION" src/index.ts \
    --bundle \
    --platform=node \
    --format=cjs \
    --outfile=dist/index.cjs \
    --external:ws \
    "--define:PKG_VERSION=\"$package_version\""
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

huly_env_present() {
  [[ -n "${HULY_URL:-}" ]] \
    && [[ -n "${HULY_WORKSPACE:-}" ]] \
    && { [[ -n "${HULY_TOKEN:-}" ]] || { [[ -n "${HULY_EMAIL:-}" ]] && [[ -n "${HULY_PASSWORD:-}" ]]; }; }
}

run_cli_integration_gate() (
  if ! huly_env_present && [[ -f ".env.local" ]]; then
    set -a
    # shellcheck disable=SC1091
    source ".env.local"
    set +a
  fi

  if ! huly_env_present; then
    echo "CLI release integration requires Huly env. Set HULY_URL, HULY_WORKSPACE, and either HULY_TOKEN or HULY_EMAIL/HULY_PASSWORD, or provide .env.local." >&2
    exit 1
  fi

  HULY_CLI_TELEMETRY=0 pnpm integration:cli
)

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

if [[ "$mcp_needs_publish" == "true" ]]; then
  build_mcp_package "$mcp_package_version"
fi

if [[ "$cli_needs_publish" == "true" ]]; then
  build_cli_package "$cli_package_version"
  pnpm dlx "tsx@$TSX_VERSION" scripts/verify-cli-integration-coverage.ts
  run_cli_integration_gate
fi

if [[ "$mcp_needs_publish" == "true" || "$cli_needs_publish" == "true" ]]; then
  npm_config_ignore_scripts=true pnpm dlx "@changesets/cli@$CHANGES_VERSION" publish
fi

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

echo "Release finished for changed packages."
