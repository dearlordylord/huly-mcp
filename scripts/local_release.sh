#!/usr/bin/env bash
set -euo pipefail

PACKAGE_NAME="@firfi/huly-mcp"
RELEASE_BRANCH="master"
CHANGES_DIR=".changeset"
CHANGES_VERSION="2.30.0"

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

pnpm dlx "@changesets/cli@$CHANGES_VERSION" version
pnpm sync-registry-metadata
git add package.json CHANGELOG.md server.json "$CHANGES_DIR"
if ! git diff --cached --quiet; then
  HUSKY=0 git commit -m "RELEASING: Releasing 1 package(s)"
fi

package_version="$(node -p "require('./package.json').version")"

pnpm check-all
pnpm verify-version

set -a
source .env.local
set +a
HULY_URL="${HULY_URL/localhost/host.docker.internal}" pnpm integration:tool-scope
HULY_URL="${HULY_URL/localhost/host.docker.internal}" bash scripts/integration_test_full.sh

npm_config_ignore_scripts=true pnpm dlx "@changesets/cli@$CHANGES_VERSION" publish

git push origin "$RELEASE_BRANCH"
git push origin "v$package_version"
gh release create "v$package_version" --generate-notes --latest --verify-tag
npm dist-tag ls "$PACKAGE_NAME"

echo "Published $PACKAGE_NAME@$package_version under the npm 'latest' dist-tag."
