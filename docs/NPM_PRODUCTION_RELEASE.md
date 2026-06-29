# NPM Production Release

Use this flow to publish the current `master` release to npm as production.

The one-command flow is:

```bash
pnpm local-release
```

That command versions packages from pending changesets when they exist, computes which package versions are not yet published on npm, builds only those package bundles with `pnpm dlx esbuild` so host-local native binaries are not required, verifies the bundled versions, publishes to npm with the default `latest` dist-tag, pushes the release commit and git tags, and creates the MCP GitHub release when MCP changed. It fails before changing files if npm auth is not available.

## Preflight

- Start from `master`.
- Confirm the worktree is clean.
- Confirm `gh auth status` and npm publish access before the final publish step.
- Keep OTP/2FA values out of shell history and logs.
- Confirm the expected changesets only bump the intended package. A CLI-only changeset should publish `@firfi/huly-cli` without bumping or rebuilding `@firfi/huly-mcp`.

```bash
git checkout master
git pull --ff-only origin master
git status --short
gh auth status
npm whoami
npm dist-tag ls @firfi/huly-mcp
npm dist-tag ls @firfi/huly-cli || true
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
- package publish-plan detection from npm registry versions
- host-safe bundle build through `pnpm dlx esbuild` for packages that need publishing
- package bundle version verification
- CLI integration coverage verification and live CLI integration when `@firfi/huly-cli` needs publishing
- `changeset publish` without a prerelease tag, so npm `latest` moves
- release commit/tag push
- latest GitHub release creation when `@firfi/huly-mcp` changed

Run `pnpm check-all` and the local Huly integration suites before starting the production release. The publish script runs the CLI live integration gate only when the CLI package needs publishing. It does not run the full MCP integration suite automatically.

For the CLI live integration gate, `pnpm local-release` uses the current Huly environment when it is already set. If it is not set, it sources `.env.local` inside the integration subprocess. The gate runs with `HULY_CLI_TELEMETRY=0` so release verification does not emit analytics.

## Rerunning After A Failed Release

`pnpm local-release` is intended to be rerunnable. If it created the changeset release commit and then failed during build, verification, publish, push, or GitHub release creation, fix the underlying problem and run the same command again from clean `master`.

The rerun recomputes local package versions against npm:

- Packages whose local version is already published are skipped.
- Packages whose local version is missing from npm are built, verified, and published.
- A CLI-only release skips MCP build and MCP GitHub release creation.
- If all package versions are already published, the script still pushes the current `master` and any tags already created at `HEAD`.

If host-local `node_modules` contains the wrong native binary, the script's release builds still use `pnpm dlx esbuild`. For normal development commands, repair local dependencies with:

```bash
pnpm rebuild esbuild
# or, if node_modules came from another machine/container:
rm -rf node_modules packages/huly-cli/node_modules
pnpm install --frozen-lockfile
```

## Verify After Publish

```bash
npm dist-tag ls @firfi/huly-mcp
npm view @firfi/huly-mcp@latest version
npm dist-tag ls @firfi/huly-cli
npm view @firfi/huly-cli@latest version
npx -y @firfi/huly-mcp@latest
npx -y @firfi/huly-cli@latest --help
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
