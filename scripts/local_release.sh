#!/usr/bin/env bash
set -euo pipefail

PACKAGE_NAME="@firfi/huly-mcp"
RELEASE_BRANCH="master"
CHANGES_DIR=".changeset"
CHANGES_VERSION="2.30.0"
ESBUILD_VERSION="0.27.2"

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
npm dist-tag ls "$PACKAGE_NAME"

pending_changeset="$(find "$CHANGES_DIR" -maxdepth 1 -type f -name "*.md" ! -name "README.md" -print -quit)"
if [[ -n "$pending_changeset" ]]; then
  pnpm dlx "@changesets/cli@$CHANGES_VERSION" version
  pnpm sync-registry-metadata
  git add package.json CHANGELOG.md server.json "$CHANGES_DIR"
  if ! git diff --cached --quiet; then
    HUSKY=0 git commit -m "RELEASING: Releasing 1 package(s)"
  fi
fi

package_version="$(node -p "require('./package.json').version")"

pnpm dlx "esbuild@$ESBUILD_VERSION" src/index.ts --bundle --platform=node --format=cjs --outfile=dist/index.cjs --external:ws "--define:PKG_VERSION=\"$package_version\""
pnpm verify-version

npm_config_ignore_scripts=true pnpm dlx "@changesets/cli@$CHANGES_VERSION" publish

git push origin "$RELEASE_BRANCH"
git push origin "v$package_version"
gh release create "v$package_version" --generate-notes --latest --verify-tag
npm dist-tag ls "$PACKAGE_NAME"

echo "Published $PACKAGE_NAME@$package_version under the npm 'latest' dist-tag."
