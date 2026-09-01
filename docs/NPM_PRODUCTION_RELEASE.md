# NPM Production Release

Use this flow to publish the current `master` release to npm as production.

The one-command flow is:

```bash
mise exec node@24.15.0 -- pnpm local-release
```

Use that exact command even when another Node version is active locally. The
release script deliberately accepts only the two certified runtimes, Node
22.22.2 and 24.15.0; Node 24.15.0 is the preferred release environment.
That release-build restriction is intentionally narrower than the published
packages' consumer requirement, Node `>=22.19.0`. Users may run the packages on
newer Node releases; maintainers publish from an exact certified runtime so the
generated artifacts remain reproducible.

That command versions packages from pending changesets when they exist and pushes a uniquely named release-candidate branch. GitHub Actions builds that candidate on canonical Linux x64, refreshes version-sensitive MCP and CLI artifact evidence, and runs the complete Package Smoke workflow. Only after Package Smoke passes does the host fast-forward and push `master`, build the packages with host-safe `pnpm dlx esbuild`, publish to npm, push package tags, and create the MCP GitHub release when MCP changed. It fails before changing files if GitHub or npm auth is unavailable.

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
mise exec node@24.15.0 -- pnpm local-release
```

The script runs:

- `changeset version`
- registry metadata sync
- release metadata commit
- temporary release-candidate branch push
- canonical Linux x64 MCP and CLI artifact-evidence generation in GitHub Actions
- Package Smoke on the exact versioned and certified release candidate
- fast-forward of `master` only after Package Smoke passes
- package publish-plan detection from npm registry versions
- host-safe bundle build through `pnpm dlx esbuild` for packages that need publishing
- package bundle version verification
- CLI integration coverage metadata verification when `@firfi/huly-cli` needs publishing
- `changeset publish` without a prerelease tag, so npm `latest` moves
- release commit/tag push
- latest GitHub release creation from the `@firfi/huly-mcp@<version>` package tag when MCP changed

Run `pnpm check-all` and the local Huly integration suites before starting the production release. `pnpm local-release` intentionally does not repeat the full quality gate or live Huly integration tests; those remain explicit pre-release and CI gates. It does require the canonical Package Smoke workflow to pass before publication. The temporary release-candidate branch is deleted after its certified commit is fast-forwarded to `master`; a failed workflow leaves the branch available for diagnosis and a safe rerun.

## Rerunning After A Failed Release

The certified release command is intended to be rerunnable. If it created the changeset release commit and then failed during build, verification, publish, push, or GitHub release creation, fix the underlying problem and run the exact same command again from clean `master`:

```bash
mise exec node@24.15.0 -- pnpm local-release
```

The rerun recomputes local package versions against npm:

- Packages whose local version is already published are skipped.
- Packages whose local version is missing from npm are built, verified, and published.
- A CLI-only release skips MCP build and MCP GitHub release creation.
- If all package versions are already published, the script still pushes the current `master`, pushes the current package-version tags when they exist locally, and creates the MCP GitHub release if its package tag exists and the release is missing.

If host-local `node_modules` contains the wrong native binary, the script's release builds still use `pnpm dlx esbuild` instead of the workspace esbuild. For normal development commands, repair local dependencies with:

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
- The GitHub release for `@firfi/huly-mcp@<version>` is marked as latest.

## If `latest` Points At The Wrong Version

Do not unpublish. Move `latest` to the intended version:

```bash
npm dist-tag ls @firfi/huly-mcp
npm dist-tag add @firfi/huly-mcp@<intended-version> latest
npm dist-tag ls @firfi/huly-mcp
```
