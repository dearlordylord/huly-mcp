# Huly SDK Upgrade Revisit

> Status: blocked. Do not merge SDK upgrades from PR #44 or similar until the npm artifacts are verified.

Created: 2026-05-16

## Current Finding

- [ ] Revisit when a newer `@hcengineering/*` release is available after `0.7.423`.
- [ ] Verify published tarballs, not only npm metadata.
- [ ] Require every direct Huly package to either publish a valid `types` or `typings` entry with matching `.d.ts` files, or otherwise be proven compatible with our TypeScript settings.
- [ ] Upgrade all direct `@hcengineering/*` package declarations coherently in `package.json`; do not accept a lockfile-only transitive rewrite.
- [ ] Run `pnpm check-all`.
- [ ] Run integration tests against local Huly before treating the upgrade as viable.

PR #44 is not viable because it changes only `pnpm-lock.yaml` and resolves a mixed SDK graph. The `0.7.423` tarballs also advertise `types/index.d.ts` for several packages while omitting the `types/` directory.

Our currently pinned Huly package versions do publish real declaration files. A spot check showed declarations present in our pinned versions and in `0.7.382`, then missing by `0.7.411`, `0.7.413`, and `0.7.423` for packages such as `@hcengineering/client`, `@hcengineering/platform`, `@hcengineering/text`, and `@hcengineering/core`.

Detailed upstream evidence and suggested issue/PR wording lives in `plans/hcengineering-types-publication-evidence.md`.

## Revisit Candidates

- [ ] Document printing/export: evaluate `print documents by class and id` for a high-level MCP tool.
- [ ] Social identity repair/inspection: evaluate the upstream missing `SocialIdentity` work and whether it can improve person/contact resolution.
- [ ] User status coverage: expose user statuses and inactive-user filtering if the SDK shape is stable.
- [ ] Card and relation improvements: evaluate relation arrays, bulk associations, nested association attributes, automation-only execution visibility, and card layout metadata.
- [ ] Guest access visibility: consider read-only tools for guest space configuration if useful for workspace diagnostics.
- [ ] Controlled document content copy/export: check whether this unlocks safer document content workflows.

## Upgrade Gate

Before opening a follow-up upgrade PR:

- [ ] Download representative tarballs with `pnpm view <package>@<version> dist.tarball` and inspect contents with `tar -tzf`.
- [ ] Confirm the declared `types` path exists in the tarball for every direct Huly dependency.
- [ ] Confirm no package relies on `main: src/index.ts` or missing DOM/browser declarations in a way that breaks our NodeNext server build.
- [ ] Confirm `@hcengineering/text` still exports the markup helpers used by `src/huly/operations/markup.ts`, `src/huly/operations/documents-inline-comments.ts`, and `src/huly/sdk-deps.ts`, or migrate those imports deliberately.
- [ ] Check the upstream changelog for SDK/model shape changes that affect activity, notifications, calendar preferences, task types, and document teamspaces.
- [ ] Keep `vitest` and `@effect/vitest` version churn separate from the Huly SDK upgrade unless there is a direct reason to combine them.
