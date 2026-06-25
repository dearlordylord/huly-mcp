# NPM Production Release

Use this flow to publish the current `master` release to npm as production.

The one-command flow is:

```bash
pnpm local-release
```

That command versions the package from the pending changeset when one exists, builds the npm bundle with `pnpm dlx esbuild` so host-local native binaries are not required, verifies the bundled version, publishes to npm with the default `latest` dist-tag, pushes the release commit and git tag, and creates a latest GitHub release. It fails before changing files if npm auth is not available.

## Preflight

- Start from `master`.
- Confirm the worktree is clean.
- Confirm `gh auth status` and npm publish access before the final publish step.
- Keep OTP/2FA values out of shell history and logs.
- The tool-scope filtering release is expected to bump `@firfi/huly-mcp` from `0.43.0` to `0.44.0`.

```bash
git checkout master
git pull --ff-only origin master
git status --short
gh auth status
npm whoami
npm dist-tag ls @firfi/huly-mcp
```

## Publish Production

Run:

```bash
pnpm local-release
```

The script runs:

- `changeset version`
- registry metadata sync
- release metadata commit
- host-safe bundle build through `pnpm dlx esbuild`
- `pnpm verify-version`
- `changeset publish` without a prerelease tag, so npm `latest` moves
- release commit/tag push
- latest GitHub release creation

Run `pnpm check-all` and the local Huly integration suites before starting the production release. The publish script intentionally does not run them because host machines may have platform-specific `node_modules` binaries from a different environment.

## Verify After Publish

```bash
npm dist-tag ls @firfi/huly-mcp
npm view @firfi/huly-mcp@latest version
npx -y @firfi/huly-mcp@latest
```

Expected result:

- `latest` points to the new package version.
- The GitHub release for `v<version>` is marked as latest.

## If `latest` Points At The Wrong Version

Do not unpublish. Move `latest` to the intended version:

```bash
npm dist-tag ls @firfi/huly-mcp
npm dist-tag add @firfi/huly-mcp@<intended-version> latest
npm dist-tag ls @firfi/huly-mcp
```
