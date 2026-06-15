# Recruiting Tools Preplan

Last updated: 2026-06-15

Issue: https://github.com/dearlordylord/huly-mcp/issues/95

## Objective

Expose Huly Recruiting as LLM-first MCP tools with enough write support to make the first slice useful in real workflows. The first PR should include read-only discovery plus constrained writes for vacancies, candidate recruiting profiles, and applications/applicants.

## Source Findings

- `@hcengineering/recruit` is not installed in this project. A published `0.7.0` package exists, but the current repo does not depend on it and newer package metadata uses workspace dependencies. The safer first implementation should mirror the Leads approach with a small local `recruit-plugin` SDK boundary instead of adding the dependency.
- Upstream plugin id is `recruit`. Stable refs needed for the first slice include:
  - `recruit:class:Vacancy`
  - `recruit:class:Applicant`
  - `recruit:mixin:Candidate`
  - `recruit:mixin:DefaultVacancyTypeData`
  - `recruit:mixin:ApplicantTypeData`
  - `recruit:template:DefaultVacancy`
  - `recruit:descriptors:VacancyType`
  - `recruit:descriptors:Application`
  - `recruit:taskTypes:Applicant`
  - `recruit:attribute:State`
- `Vacancy` extends `task.class.Project`, so each vacancy is a typed space. The UI creates it in `core.space.Space`, increments `core.class.Sequence` attached to `recruit.class.Vacancy`, stores `number`, and applies the vacancy type-data mixin.
- `Candidate` is a mixin on `contact.class.Person`. Candidate writes should operate on existing persons by id/email/exact name and create or update the `recruit:mixin:Candidate` mixin.
- `Applicant` extends `task.class.Task`, has `space: Ref<Vacancy>`, is attached to the candidate, and uses `collection: "applications"` under `recruit:mixin:Candidate`. The UI validator rejects duplicate `(vacancy, candidate)` applications.
- The default applicant workflow statuses are `Backlog`, `HR Interview`, `Technical Interview`, `Test task`, `Offer`, `Won`, and `Lost`; actual tools should resolve statuses from the vacancy project type rather than hardcoding names.

## Recommended PR Scope

Do read-only plus write support in one PR, but keep the write surface narrow:

- `list_recruiting_vacancy_types`
- `list_recruiting_vacancies`
- `get_recruiting_vacancy`
- `create_recruiting_vacancy`
- `update_recruiting_vacancy`
- `archive_recruiting_vacancy`
- `list_recruiting_candidates`
- `get_recruiting_candidate`
- `set_recruiting_candidate_profile`
- `list_recruiting_vacancy_statuses`
- `list_recruiting_applicants`
- `get_recruiting_applicant`
- `create_recruiting_applicant`
- `update_recruiting_applicant`

Defer from the first PR:

- Reviews, verdicts, and opinions. Reviews are `calendar.class.Event`-derived and should be planned with calendar semantics instead of squeezed into the first slice.
- Applicant matches. They look read-only/generated and need separate verification.
- Candidate skill wrappers. They use `tags.class.TagReference`; add after the core candidate/application path lands unless implementation remains very small.
- Recruiting comments, attachments, activity, and relations. Friendly object-scoped wrappers can reuse existing shared helpers in a follow-up.
- Full candidate creation with resume, avatar, and channels. Use existing person/contact tools first, then `set_recruiting_candidate_profile`.

## LLM-First Locator Design

- Vacancy locator accepts `{ vacancy }`, where `vacancy` may be raw `_id`, UI identifier such as `VCN-12`, or exact name. Duplicate names must return an ambiguous error listing candidate ids/names.
- Candidate locator accepts `{ candidate }`, where `candidate` may be person `_id`, email, or exact person display name.
- Applicant locator accepts `{ applicant, vacancy?, candidate? }`, where `applicant` may be raw `_id` or `APP-12`. Optional vacancy/candidate fields disambiguate numeric identifiers or duplicate matches.
- Status inputs are names resolved within the target vacancy's project type.
- Assignee/recruiter inputs should reuse person email/name resolution and require the resolved person to have the employee mixin when Huly requires an employee ref.

## Implementation Approach

- Add `src/huly/recruit-plugin.ts` as the only string-ref boundary for Recruiting refs. Keep casts there, with comments like `lead-plugin.ts`.
- Add schema modules for `recruiting` params/results. Output should use small references:
  - Vacancy: `{ id, identifier, name, archived }`
  - Candidate: `{ id, name, email?, title?, source?, onsite?, remote? }`
  - Applicant: `{ id, identifier, vacancy, candidate, status, assignee?, startDate?, dueDate? }`
- Split operations if needed:
  - `recruiting-vacancies.ts`
  - `recruiting-candidates.ts`
  - `recruiting-applicants.ts`
  - shared workflow/status resolver helpers
- Create vacancies by incrementing `core.class.Sequence` for `recruit.class.Vacancy`; fail with an actionable model-missing error if the sequence or default vacancy type is unavailable.
- Create applicants by incrementing `core.class.Sequence` for `recruit.class.Applicant`, resolving status from the vacancy workflow, checking duplicate `(space, attachedTo)`, computing rank with `makeRank`, and using `addCollection(recruit.class.Applicant, vacancy._id, candidate._id, recruit.mixin.Candidate, "applications", data, applicantId)`.
- Avoid generic record guards for normal runtime parsing. Use Effect Schema decoders for tx result shapes and boundary data; keep any unavoidable opaque-ref casts in the plugin boundary or local SDK-boundary comments.

## Tests

- Unit tests with `HulyClient.testLayer` and in-memory state; no module mocks.
- Schema tests for empty locators, missing update fields, invalid status/category fields, and ambiguous locator inputs.
- Vacancy create tests assert sequence increment, `createDoc` class/space/data, and vacancy type-data mixin call.
- Candidate profile tests assert idempotent create/update of `recruit:mixin:Candidate`.
- Applicant create tests assert status resolution, duplicate rejection, exact `addCollection` target class/collection, and sequence-derived `APP-N` identifier.
- MCP tests assert the `recruiting` category exports every new tool and structured success responses encode cleanly.
- Error mapping tests should map missing/ambiguous vacancy, candidate, applicant, status, and Recruiting model-missing errors to invalid params where appropriate.
- Integration tests should skip only when the local Huly workspace clearly lacks the Recruiting model. If present, run a reversible path: create vacancy, recruit-enable a test person, create applicant, update applicant status, archive vacancy.

## Open Checks Before Implementation

- Verify whether local Huly has `recruit` enabled by probing `recruit:class:Vacancy`, `recruit:class:Applicant`, `recruit:mixin:Candidate`, and the two sequence docs.
- Confirm whether `client.removeCollection` is available and reliable before adding applicant delete in the first PR. If not, skip delete until the collection-counter-safe path is known.
- Confirm vacancy type-data mixin creation shape for role assignments. The first implementation can pass `{}` for role assignment unless the API already exposes role member inputs.
