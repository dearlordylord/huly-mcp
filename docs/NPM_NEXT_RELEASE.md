# NPM Next Release

Use this flow to publish a branch build to npm without moving the `latest` dist-tag.

The goal is to make the version installable for testers as `@firfi/huly-mcp@next` and by exact version, while users on `@firfi/huly-mcp@latest` remain on the previous stable release.

Do not use `pnpm local-release` for this flow. That script publishes without a dist-tag override and creates the GitHub release with `--latest`.

## Preflight

- Start from the branch or release commit you want to publish. For the tool-scope filtering PR, that is `codex/tool-scope-filtering`.
- Confirm the worktree is clean except for intentional release metadata.
- Confirm `gh auth status` and npm publish access before the final publish step.
- Keep OTP/2FA values out of shell history and logs.
- Decide the release type before creating the changeset. The tool-scope filtering branch changes default tool exposure semantics, so a minor release is expected from `0.43.0` to `0.44.0`.

```bash
git checkout codex/tool-scope-filtering
git pull --ff-only
git status --short
gh auth status
npm whoami
npm dist-tag ls @firfi/huly-mcp
```

## Version Without Publishing

Create the Changeset entry and apply it to package metadata. This updates `package.json`, `CHANGELOG.md`, and any generated registry metadata, but does not publish.

```bash
pnpm exec changeset
pnpm dlx @changesets/cli@2.30.0 version
pnpm sync-registry-metadata
git add package.json CHANGELOG.md server.json .changeset
HUSKY=0 git commit -m "RELEASING: Releasing 1 package(s)"
```

After this commit, record the version:

```bash
PKG_VERSION=$(node -p "require('./package.json').version")
echo "$PKG_VERSION"
```

## Validate The Release Commit

Run the normal gate on the exact commit that will be published.

```bash
pnpm check-all
pnpm build
pnpm verify-version
```

For this branch, also run local Huly integration with the container URL override:

```bash
set -a && source .env.local && set +a
HULY_URL="${HULY_URL/localhost/host.docker.internal}" pnpm integration:tool-scope
HULY_URL="${HULY_URL/localhost/host.docker.internal}" bash scripts/integration_test_full.sh
```

## Publish Under `next`

This is the first command that publishes to npm. The `--tag next` flag is the important part: it prevents npm from moving `latest`.

```bash
PKG_VERSION=$(node -p "require('./package.json').version")
npm_config_ignore_scripts=true pnpm dlx @changesets/cli@2.30.0 publish --tag next
```

Verify npm tags immediately after publish:

```bash
npm dist-tag ls @firfi/huly-mcp
npm view @firfi/huly-mcp@next version
npm view @firfi/huly-mcp@latest version
```

Expected result:

- `next` points to `$PKG_VERSION`.
- `latest` still points to the previous stable version.

## Push Release Metadata

Changesets creates the git tag after a successful publish. Push both the branch and the tag.

```bash
PKG_VERSION=$(node -p "require('./package.json').version")
git push origin codex/tool-scope-filtering
git push origin "v$PKG_VERSION"
```

Create the GitHub release as a prerelease, not latest:

```bash
gh release create "v$PKG_VERSION" --generate-notes --prerelease --verify-tag
```

## Tester Install Command

Give testers the dist-tag or exact version:

```bash
npx -y @firfi/huly-mcp@next
npx -y @firfi/huly-mcp@$PKG_VERSION
```

## Promote Later

When the `next` build is ready for all users, move `latest` to the same version. Do not republish.

```bash
PKG_VERSION=<the-tested-version>
npm dist-tag add @firfi/huly-mcp@$PKG_VERSION latest
npm dist-tag ls @firfi/huly-mcp
gh release edit "v$PKG_VERSION" --prerelease=false --latest
```

Leaving `next` pointing at the promoted version is fine. Move it again on the next staged release.

## If `latest` Moves By Mistake

Do not unpublish. Put `latest` back on the previous stable version:

```bash
npm dist-tag ls @firfi/huly-mcp
npm dist-tag add @firfi/huly-mcp@<previous-stable-version> latest
npm dist-tag ls @firfi/huly-mcp
```
