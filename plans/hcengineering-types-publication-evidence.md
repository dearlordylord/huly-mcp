# hcengineering npm declaration publication evidence

> Draft evidence for an upstream issue or PR against `hcengineering/platform`.
> Created: 2026-05-16.

## Summary

`@hcengineering/*` packages have a known declaration publishing regression. Upstream already had an issue and PR for the `0.7.411`/`0.7.413` line, but the fix was applied only to `.github/workflows/publish-npm.yml`. The automatic tag release path in `.github/workflows/main.yml` still publishes npm packages after `rush build` without running `rush validate`, so `0.7.423` was published without `types/` again.

## Existing upstream issues and PRs

- Issue: https://github.com/hcengineering/platform/issues/10767
  - Title: `@hcengineering/* packages at 0.7.413 published without TypeScript declarations`
  - State: closed.
  - Opened on 2026-04-14.
  - Author: `dearlordylord`.
  - It reports `package.json` declaring `types/index.d.ts` while published tarballs omit the `types/` directory.

- PR: https://github.com/hcengineering/platform/pull/10768
  - Title: `fix(ci): emit TypeScript declarations before npm publish`
  - State: merged on 2026-04-15.
  - Author: `dearlordylord`.
  - It added `node common/scripts/install-run-rush.js validate` to `.github/workflows/publish-npm.yml`.
  - It already contains the root-cause research: `rush build` runs only `_phase:build`, declaration emit lives in `_phase:validate`, and the post-migration publish workflow did not carry over the old `huly.core` `rush validate` step.
  - It did not change the `publish-npm` job inside `.github/workflows/main.yml`.

- Related issue: https://github.com/hcengineering/platform/issues/10773
  - Title: `@hcengineering/* packages at 0.7.413 reference unpublished internal packages`
  - Related package-publication problem, not the declaration problem.

- Related PR: https://github.com/hcengineering/platform/pull/10788
  - Title: `Fix published packages`
  - Published additional packages by changing `rush.json` `shouldPublish` flags.
  - Does not address declaration generation.

Searches did not find a follow-up issue or PR for `0.7.423` missing declarations or for the `main.yml` publish job missing the validation step.

## Timeline

- Older packages published from `hcengineering/huly.core` included declarations. The old `huly.core` CI ran `rush validate` before publishing.
- 2026-02-23: PR https://github.com/hcengineering/platform/pull/10542 added tag-based npm publishing in `.github/workflows/main.yml`.
  - The job runs `rush build`, then `safe-publish.js`.
  - It does not run `rush validate`.
- 2026-03-02: PR https://github.com/hcengineering/platform/pull/10580 added manual `.github/workflows/publish-npm.yml`.
  - This separate workflow also initially ran build then publish.
- 2026-04-12/13: `0.7.411` and `0.7.413` packages were published without declarations.
- 2026-04-15: PR #10768 added `rush validate` to manual `.github/workflows/publish-npm.yml`.
- 2026-05-10: `0.7.423` was published without declarations again.
  - npm metadata for `@hcengineering/core@0.7.423` and `@hcengineering/client@0.7.423` has `gitHead` `a00c01352d8ca78cf4a1367d57d136c7908d2dcb`.
  - GitHub Actions run `25616518363` for head branch `v0.7.423` and the same head SHA had a successful `publish-npm` job.
  - That job is from `.github/workflows/main.yml`, whose `publish-npm` job still lacks a validation step on both `upstream/main` and `upstream/develop`.

## Reproduction evidence

### Tarball contents

The published metadata advertises declarations:

```bash
pnpm view @hcengineering/core@0.7.423 types
# types/index.d.ts
```

But the tarball omits them:

```bash
tmp=$(mktemp -d)
url=$(pnpm view @hcengineering/core@0.7.423 dist.tarball)
curl -fsSL "$url" -o "$tmp/core.tgz"
tar -tzf "$tmp/core.tgz" | rg '^package/types/'
# no output
```

Observed spot check:

| Package | Version | `types` field | `.d.ts` files in tarball | Declared types file exists |
| --- | --- | --- | ---: | --- |
| `@hcengineering/core` | `0.7.382` | `types/index.d.ts` | 44 | yes |
| `@hcengineering/core` | `0.7.411` | `types/index.d.ts` | 0 | no |
| `@hcengineering/core` | `0.7.413` | `types/index.d.ts` | 0 | no |
| `@hcengineering/core` | `0.7.423` | `types/index.d.ts` | 0 | no |
| `@hcengineering/client` | `0.7.382` | `types/index.d.ts` | 2 | yes |
| `@hcengineering/client` | `0.7.411` | `types/index.d.ts` | 0 | no |
| `@hcengineering/client` | `0.7.413` | `types/index.d.ts` | 0 | no |
| `@hcengineering/client` | `0.7.423` | `types/index.d.ts` | 0 | no |
| `@hcengineering/text` | `0.7.382` | `types/index.d.ts` | 26 | yes |
| `@hcengineering/text` | `0.7.411` | `types/index.d.ts` | 0 | no |
| `@hcengineering/text` | `0.7.413` | `types/index.d.ts` | 0 | no |
| `@hcengineering/text` | `0.7.423` | `types/index.d.ts` | 0 | no |

### Local workflow before/after

The proposed workflow change can be tested locally on the known-bad tag without publishing anything:

```bash
git -C .reference/platform worktree add /tmp/huly-platform-v0.7.423 v0.7.423
cd /tmp/huly-platform-v0.7.423
node common/scripts/install-run-rush.js install

rm -rf foundations/core/packages/core/lib \
  foundations/core/packages/core/types \
  foundations/core/packages/core/.build \
  foundations/core/packages/core/.validate

node common/scripts/install-run-rush.js build --to @hcengineering/core
cd foundations/core/packages/core
npm pack --dry-run --json | jq '.[0].files | map(.path) | {
  hasLibIndex: any(. == "lib/index.js"),
  hasTypesIndex: any(. == "types/index.d.ts"),
  libCount: map(select(startswith("lib/"))) | length,
  typesCount: map(select(startswith("types/"))) | length
}'

cd /tmp/huly-platform-v0.7.423
node common/scripts/install-run-rush.js validate --to @hcengineering/core
cd foundations/core/packages/core
npm pack --dry-run --json | jq '.[0].files | map(.path) | {
  hasLibIndex: any(. == "lib/index.js"),
  hasTypesIndex: any(. == "types/index.d.ts"),
  libCount: map(select(startswith("lib/"))) | length,
  typesCount: map(select(startswith("types/"))) | length
}'
```

Observed result on 2026-05-16:

| Local step | `lib/index.js` packed | `types/index.d.ts` packed | `lib/` entries | `types/` entries |
| --- | --- | --- | ---: | ---: |
| `rush build --to @hcengineering/core` | yes | no | 95 | 0 |
| `rush validate --to @hcengineering/core` after build | yes | yes | 95 | 94 |

### Current consumer impact

`dearlordylord/huly-mcp` currently uses older package versions that do contain declarations. Dependabot PR https://github.com/dearlordylord/huly-mcp/pull/44 tries to resolve transitive packages to `0.7.423`, and `pnpm typecheck` fails when checked out locally.

Representative failures include missing `@hcengineering/text` exports:

- `jsonToMarkup`
- `markupToJSON`
- `MarkupMark`
- `MarkupNode`

And package-resolution/type errors from mixed old direct dependencies with newer transitive dependencies.

## Root cause

There are two npm publish paths:

1. Manual workflow: `.github/workflows/publish-npm.yml`
2. Tag release workflow job: `.github/workflows/main.yml` -> `publish-npm`

PR #10768 fixed only the manual workflow. The tag release workflow remains:

```yaml
- name: Building...
  run: node common/scripts/install-run-rush.js build
- name: Publish to npm
  run: |
    node common/scripts/bump.js --check "$VERSION"
    node common/scripts/safe-publish.js
```

`rush build` runs only `_phase:build`, which transpiles to `lib/`. Declaration output is produced by `_phase:validate` through `compile validate`, with `declarationDir: ./types`.

Because `main.yml` publishes without `_phase:validate`, a clean release job can publish packages with `package.json` pointing at `types/index.d.ts` while no `types/` directory exists.

## Suggested upstream fix

Minimal PR:

```diff
diff --git a/.github/workflows/main.yml b/.github/workflows/main.yml
@@
       - name: Building...
         run: node common/scripts/install-run-rush.js build
+      - name: Emit TypeScript declarations
+        run: node common/scripts/install-run-rush.js validate
       - name: Publish to npm
```

Better follow-up:

- Consolidate npm publication into one reusable workflow or composite action so `main.yml` and `publish-npm.yml` cannot drift again.
- Add a pre-publish guard in `safe-publish.js`:
  - Run `npm pack --dry-run --json` for each package before `npm publish`.
  - If `package.json` has `types` or `typings`, verify the packed file list includes that path.
  - Fail before publishing if the declaration path is absent.
- Optionally fail if `exports["."].types` points at a missing file.

## Suggested issue wording

Title:

`0.7.423 @hcengineering/* packages were published without TypeScript declarations via tag workflow`

Body outline:

1. Link #10767 and #10768 as the original report and merged fix.
2. Explain that #10768 correctly fixed `.github/workflows/publish-npm.yml`, but `.github/workflows/main.yml` has a separate tag-release `publish-npm` job that still lacks the validation step.
3. Provide npm metadata for `@hcengineering/core@0.7.423`, showing `gitHead` `a00c01352d8ca78cf4a1367d57d136c7908d2dcb`.
4. Link GitHub Actions run `25616518363`, whose `publish-npm` job succeeded for the same head SHA.
5. Show tarball reproduction proving `types/index.d.ts` is advertised but absent.
6. Show the local before/after proof that `rush validate --to @hcengineering/core` changes `npm pack --dry-run` from zero `types/` entries to a tarball containing `types/index.d.ts`.
7. Suggest adding `rush validate` to `main.yml` and adding a tarball preflight in `safe-publish.js`.
