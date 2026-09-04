# Effect 4 behavioral-oracle delta review

The immutable Effect 3 baseline remains
`docs/migrations/effect-4/behavioral-oracle.json`. The Effect 4 comparison was
captured independently after the #227 and #228 bundled builds became runnable;
the baseline was not regenerated.

## Reviewed corpus identity

- Effect 3 baseline SHA-256:
  `02bb5e4bf2fdb0e4dd30f980810bd0fe70d5c91482c309b4621264c373d6adac`
- Reviewed Effect 4 corpus SHA-256:
  `abeb3a1fe816b770a4d7102a19b21b4cb9a5d37e9038852f80a854a639fa76d3`
- Exact structural deltas: 23,836
- Added: 8,531
- Changed: 6,380
- Removed: 8,925

Each category records its exact delta count and the SHA-256 of its sorted exact
delta identities. The compact `behavioral-oracle-delta-review.json` certificate
also pins the immutable baseline and reviewed current-corpus hashes, rationale,
and owning issue. Verification rejects unclassified paths, changed delta sets,
stale categories, duplicate categories, and corpus hash drift.

## Classification

| Count | Classification | Evidence |
| ---: | --- | --- |
| 7,146 | Draft-07 structural dialect | Effect 4 refs, definitions, optional/null unions, refinements, and composition wrappers. All 529 native and 6 proxy schemas compile under strict Ajv Draft-07. |
| 2,688 | Schema metadata | Authored descriptions restored by the central adapter and obsolete Effect 3 generator-default titles/descriptions removed. |
| 1,674 | Authored-constraint projection | Pre-funnel tools remain represented; generated ref/composition paths changed. Manual cross-field constraints remain in the corpus and representative runtime/Ajv agreement passes. |
| 6 | Direct issue-assignee descriptions | Direct issue create, update, and list advertise exact agent UserProfile titles in both their tool and assignee input descriptions (#245). |
| 12,312 | Funnel administration | Five workflow-aware funnel operations and their schemas are attributed by tool identity across native, registry, and CLI ordered surfaces (#256). |
| 6 | CLI JSON parse diagnostics | Effect 4 adds deterministic line/column context; code, hint, retryability, and exit status are unchanged. |
| 4 | CLI help rendering | The Effect 4 CLI renderer intentionally uses concise help and omits patterns that are not shared by every string-capable union branch, while retaining string patterns across nullable alternatives. Route inventory and ordering remain unchanged. |

The comparison deliberately retains public array order, descriptions, titles,
refs, required fields, enums, patterns, bounds, compositions, help, and error
messages. Only the pre-existing package-version normalization is applied; no
schema or constraint difference is hidden by wildcard normalization.

## Verification

```bash
mise exec node@22.22.2 -- pnpm verify:effect4-oracle:built
mise exec node@22.22.2 -- pnpm exec vitest run \
  src/domain/schemas/json-schema.test.ts \
  test/mcp/input-schema-compat.test.ts \
  test/mcp/input-schema-compat.property.test.ts \
  test/mcp/json-schema-refs.test.ts \
  test/scripts/effect4-oracle.test.ts \
  test/scripts/effect4-oracle-parity.test.ts
```

The full verifier re-renders the current bundled corpus and matches all 23,836
exact entries. Any future semantic or structural drift is unexpected; an
accepted entry that stops occurring is stale and also fails verification.
