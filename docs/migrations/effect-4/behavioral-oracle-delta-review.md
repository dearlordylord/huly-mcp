# Effect 4 behavioral-oracle delta review

The immutable Effect 3 baseline remains
`docs/migrations/effect-4/behavioral-oracle.json`. The Effect 4 comparison was
captured independently after the #227 and #228 bundled builds became runnable;
the baseline was not regenerated.

## Reviewed corpus identity

- Effect 3 baseline SHA-256:
  `02bb5e4bf2fdb0e4dd30f980810bd0fe70d5c91482c309b4621264c373d6adac`
- Reviewed Effect 4 corpus SHA-256:
  `e9c11e5626fd1ae8dc0cb060466205a727743653ff87a1f0277adbe7a25edfa8`
- Exact structural deltas: 24,442
- Added: 8,491
- Changed: 8,786
- Removed: 7,165

Each category records its exact delta count and the SHA-256 of its sorted exact
delta identities. The compact `behavioral-oracle-delta-review.json` certificate
also pins the immutable baseline and reviewed current-corpus hashes, rationale,
and owning issue. Verification rejects unclassified paths, changed delta sets,
stale categories, duplicate categories, and corpus hash drift.

## Classification

| Count | Classification | Evidence |
| ---: | --- | --- |
| 3,120 | Draft-07 structural dialect | Effect 4 refs, definitions, optional/null unions, refinements, and composition wrappers. All 576 native and 6 proxy schemas compile under strict Ajv Draft-07. |
| 1,192 | Schema metadata | Authored descriptions restored by the central adapter and obsolete Effect 3 generator-default titles/descriptions removed. |
| 977 | Authored-constraint projection | Pre-administration tools remain represented; generated ref/composition paths changed. Manual cross-field constraints remain in the corpus and representative runtime/Ajv agreement passes. |
| 6 | Direct issue-assignee descriptions | Direct issue create, update, and list advertise exact agent UserProfile titles in both their tool and assignee input descriptions (#245). |
| 19,137 | Issue #97 administration | Employee-position, HR-department, Staff-assignment, funnel, lead-mutation, HR-request, public-holiday, HR-report, and person-administration operations and their schemas are attributed by tool identity across native, registry, and CLI ordered surfaces (#97). |
| 6 | CLI JSON parse diagnostics | Effect 4 adds deterministic line/column context; code, hint, retryability, and exit status are unchanged. |
| 4 | CLI help rendering | The Effect 4 CLI renderer intentionally uses concise help and omits patterns that are not shared by every string-capable union branch, while retaining string patterns across nullable alternatives. Funnel, HR-request, public-holiday, HR-report, and person-administration routes extend the inventory without changing other route behavior. |

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

The full verifier re-renders the current bundled corpus and matches all 24,442
exact entries. Any future semantic or structural drift is unexpected; an
accepted entry that stops occurring is stale and also fails verification.
