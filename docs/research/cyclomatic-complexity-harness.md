# Cyclomatic complexity harness research

Date: 2026-07-24

## Recommendation

Use ESLint's built-in `complexity` rule as the cyclomatic-complexity gate now. It is already installed, parses this
repository through `@typescript-eslint/parser`, and reports the exact function and line that failed. No second
parser, report format, or dependency is needed.

The implemented gate uses a dedicated config so `pnpm complexity` is a visible, isolated harness stage beside
`pnpm circular`:

```js
{
  files: ["src/**/*.ts", "packages/**/src/**/*.ts"],
  ignores: ["**/*.test.ts", "**/*.spec.ts"],
  rules: {
    complexity: ["error", { max: 8, variant: "classic" }]
  }
}
```

The cap is 8, matching `crap4java`'s threshold when function coverage is 100% because CRAP then equals cyclomatic
complexity. The adoption scan found 64 existing violations across 46 production files, with a maximum of 31. Those
violations are recorded in `eslint-complexity-suppressions.json` using ESLint's bulk-suppression mechanism. The
complexity scripts pass that dedicated location explicitly so the baseline cannot affect ordinary ESLint runs. New
violations fail `pnpm complexity`; reducing the number of violations makes the check fail on stale suppressions
until `pnpm complexity:prune` removes them. This establishes 8 as the enforced target without requiring a risky
cross-cutting refactor of 46 files in the harness change.
([ESLint bulk suppressions](https://eslint.org/docs/latest/use/suppressions))

Bulk suppressions are counts per rule and file, not permanent exemptions for named functions. This makes the debt
visible and monotonically removable at file granularity. It also means replacing one suppressed violation with
another in the same file without changing the count is not distinguishable by ESLint; reviews should reject that
kind of complexity transfer.

The removal work is tracked in
[GitHub issue #161](https://github.com/dearlordylord/huly-mcp/issues/161).

ESLint defines the metric as the number of linearly independent paths, supports explicit `classic` and `modified`
variants, defaults to classic with a maximum of 20, and counts modern JavaScript branching constructs such as
logical assignment, default parameters, destructuring defaults, and optional chaining. The modified variant differs
only in counting an entire `switch` as one branch; classic is the less surprising strict gate here.
([ESLint rule documentation](https://eslint.org/docs/latest/rules/complexity))

## What `crap4java` contributes

`crap4java` is not merely a complexity cap. It combines method cyclomatic complexity with method coverage using:

```text
CRAP = CC² × (1 - coverage)³ + CC
```

It clears stale JaCoCo output, runs the tests and coverage report, analyzes methods, and exits `2` when a CRAP score
exceeds `8.0`. That single-command, stale-artifact-safe workflow is the useful design idea to carry over; its Java
implementation cannot be reused directly.
([crap4java README](https://github.com/unclebob/crap4java#readme))

For this repository, CRAP remains a possible complementary gate, not a replacement for the structural cap. At 100%
function coverage CRAP equals cyclomatic complexity, but the repository's 99% aggregate coverage does not guarantee
that every complex function is well covered. A CRAP gate would therefore add a distinct per-function risk signal
once a compatible, maintainable implementation is available.

## Tool comparison

| Tool | Fit for this repository | Decision |
| --- | --- | --- |
| ESLint `complexity` | Maintained core rule; per-function failure at the source line; classic/modified variants; zero new dependencies; fits an isolated `check-all` stage. ([docs](https://eslint.org/docs/latest/rules/complexity), [rule source](https://github.com/eslint/eslint/blob/main/lib/rules/complexity.js)) | **Use now.** |
| `cyclomatic-complexity` | Dedicated JS/TS CLI with warning/error thresholds and JSON output. It works, but duplicates parsing and introduces another dependency for a gate ESLint already supplies. ([official repository](https://github.com/pilotpirxie/cyclomatic-complexity#readme)) | Viable fallback, no advantage here. |
| `complexity-report` / `escomplex` | Produces broader module/function reports including cyclomatic density, Halstead metrics, and maintainability. The backend describes itself as JavaScript-AST analysis; the published line is still `2.0.0-alpha`, and the surrounding tooling is not a current TypeScript-first lint gate. ([escomplex repository](https://github.com/escomplex/escomplex#readme), [complexity-report repository](https://github.com/escomplex/complexity-report#readme)) | Do not adopt. |
| `typhonjs-escomplex` | Explicitly claims JS and TS support through Babel and provides programmatic reports, but its README still points to a planned 2018 major release and presents the package as an unfinished shim. ([official repository](https://github.com/typhonjs-node-escomplex/typhonjs-escomplex#readme)) | Do not adopt. |
| `crap-score` | MIT tool that combines Istanbul coverage with an ESLint-derived complexity rule and emits HTML/JSON. Its documented test integration is Jest, not Vitest, and the documented CLI is report-oriented rather than a threshold exit gate. ([official repository](https://github.com/ahilke/js-crap-score#readme), [package manifest](https://github.com/ahilke/js-crap-score/blob/main/package.json)) | Useful reporting experiment, weak harness fit. |
| `crap4ts` | Reads existing `coverage-final.json` or `coverage-v8.json`, supports Node 18+, thresholds, changed-file analysis, and meaningful exit codes. However, v1 is GPL-3.0-or-later and explicitly in maintenance mode while v2 is rewritten. ([official repository](https://github.com/breezy-bays-labs/crap4ts#readme), [package manifest](https://github.com/breezy-bays-labs/crap4ts/blob/main/package.json)) | Technically compatible, but do not make a maintenance-mode GPL tool the reference harness. |
| `@barney-media/crap-typescript` | Most complete current CRAP design: TypeScript compiler analysis, Istanbul coverage, explicit unknown coverage, workspace lookup, CLI failure thresholds, and a Vitest adapter. It uses the minimum of function statement and branch coverage and has golden compatibility fixtures for Vitest-style coverage. ([official repository](https://github.com/fabian-barney/crap-typescript#readme), [compatibility matrix](https://github.com/fabian-barney/crap-typescript/blob/main/docs/compatibility-matrix.md)) | Revisit after Node upgrade. Published packages require Node `>=22.13.0`; this checkout currently runs Node 20. ([CLI manifest](https://github.com/fabian-barney/crap-typescript/blob/main/packages/cli/package.json), [Vitest adapter manifest](https://github.com/fabian-barney/crap-typescript/blob/main/packages/vitest/package.json)) |

## If CRAP is added later

Prefer `@barney-media/crap-typescript` after the project baseline moves to Node 22. Run it against the coverage JSON
created by the same `test:coverage` invocation, after coverage in `check-all`; do not let it launch a second test run.
Start with a measured threshold that keeps the tree green, then ratchet it. Keep the ESLint complexity cap as the
coverage-independent architectural guard.
