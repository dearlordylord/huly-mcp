# Effect 4 behavioral-oracle delta review

The immutable Effect 3 baseline remains
`docs/migrations/effect-4/behavioral-oracle.json`. The Effect 4 comparison was
captured independently after the #227 and #228 bundled builds became runnable;
the baseline was not regenerated.

## Reviewed corpus identity

- Effect 3 baseline SHA-256:
  `02bb5e4bf2fdb0e4dd30f980810bd0fe70d5c91482c309b4621264c373d6adac`
- Reviewed Effect 4 corpus SHA-256:
  `13cf2b85c17ac11e4e3bd70866537d21b11c7f34b605c97c7d4a45d0db5f5b15`
- Exact structural deltas: 29,431
- Added: 11,512
- Changed: 10,775
- Removed: 7,144

Each category records its exact delta count and the SHA-256 of its sorted exact
delta identities. The compact `behavioral-oracle-delta-review.json` certificate
also pins the immutable baseline and reviewed current-corpus hashes, rationale,
and non-empty set of owning issues. Verification rejects unclassified paths,
changed delta sets, stale categories, duplicate categories, duplicate issue
references, and corpus hash drift.

## Classification

| Count | Classification | Evidence |
| ---: | --- | --- |
| 16,010 | Draft-07 structural dialect and feature schemas | Effect 4 refs, definitions, optional/null unions, refinements, and composition wrappers are reviewed together with the new or changed #97 and #264-#268 schemas, including the shared `calendar_meeting_room_metadata_degraded` warning code. All 603 native and 6 proxy schemas compile under strict Ajv Draft-07. |
| 2,328 | Schema metadata | Authored descriptions restored by the central adapter and obsolete Effect 3 generator-default titles/descriptions removed; metadata from #97, #245, and #264-#268 is explicitly co-owned instead of being inferred from array position. |
| 968 | Authored-constraint projection | Pre-administration tools remain represented; generated ref/composition paths and #245 assignee-alternative descriptions changed. Manual cross-field constraints remain in the corpus and representative runtime/Ajv agreement passes. |
| 6 | Direct issue-assignee descriptions | Direct issue create, update, and list advertise exact agent UserProfile titles in both their tool and assignee input descriptions (#245). |
| 10,109 | Post-baseline operation expansion | The ordered expansion and shifted registry/CLI surfaces are jointly attributed to #97 and #264-#267, while Planner (#265) and meeting-room (#268) changes in that ordered region remain explicit co-owners. Feature schemas are classified before this positional expansion category. |
| 6 | CLI JSON parse diagnostics | Effect 4 adds deterministic line/column context; code, hint, retryability, and exit status are unchanged. |
| 4 | CLI help rendering | The Effect 4 CLI renderer intentionally uses concise help and omits patterns that are not shared by every string-capable union branch, while retaining string patterns across nullable alternatives. The complete outputs explicitly carry #228 renderer ownership plus the #97, #245, and #264-#268 content represented in them. |

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

The full verifier re-renders the current bundled corpus and matches all 29,431
exact entries. Any future semantic or structural drift is unexpected; an
accepted entry that stops occurring is stale and also fails verification.
