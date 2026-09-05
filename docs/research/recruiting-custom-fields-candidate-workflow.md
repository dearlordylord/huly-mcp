# Recruiting custom fields and candidate creation

Research date: 2026-09-05  
Issue: [#260](https://github.com/dearlordylord/huly-mcp/issues/260)  
Repository snapshot: `@firfi/huly-mcp@0.51.0`, commit `c35010cce2ba3e0be3e19ae3c77b9bb142f921b9`  
Huly authority: `hcengineering/platform@63e28dc96483967b2fc21c881b3f1023c1de7718` (2026-08-27); installed declarations include `@hcengineering/core@0.7.26` and `@hcengineering/contact@0.7.0`. `@hcengineering/recruit` is not installed, so the repository's Recruiting references are intentionally kept behind an opaque-ID boundary.

## Conclusion

There is no additional Recruiting entity for either custom fields or candidate creation.

1. Recruiting custom fields are ordinary Huly `core.class.Attribute` model documents. Their owner is the native Recruiting class/mixin in `attributeOf`; the field's type, name, label, and `isCustom` marker remain Huly metadata. Candidate-specific fields belong to `recruit:mixin:Candidate`; fields inherited from the underlying person belong to `contact:class:Person`. Vacancy, Applicant, ApplicantMatch, Review, Opinion, VacancyList, and the Recruiting type-data mixins are also native owners when a workspace has a custom attribute whose `attributeOf` is that class/mixin. No fixed list of custom Recruiting fields is declared by Huly.
2. The generic custom-field tools cover metadata discovery and scalar writes, but they are not yet an honest friendly Candidate wrapper. Huly stores mixin values under a nested mixin key, while the current generic read checks only top-level enumerable keys. The generic write also requires the base object class for `updateMixin` and does not ensure that a Person has the Candidate mixin or that the field owner applies to the target. A Recruiting-specific wrapper, or a carefully scoped generic fix, needs an integration test before it can be called parity-complete.
3. Huly's native new-Talent UI is a client-side composition: one `ApplyOperations` commit creates a `contact.class.Person`, then creates `recruit.mixin.Candidate` on that same ID, and optionally adds native channels, attachments, skills, avatar data, and metadata-defined extra values. The model's `CreateTalent` action only opens that component; the Recruiting server plugin exposes presenters and a vacancy trigger, not a candidate-creation RPC.
4. An existing Person is enabled by `createMixin(personId, contact.class.Person, person.space, recruit.mixin.Candidate, {})`. Huly's Create Application UI performs that step when needed before adding the Applicant collection entry. This repository already exposes the equivalent profile operation and also ensures the mixin inside `create_recruiting_applicant`.
5. Keep the basic new-person workflow as a short composed/guided workflow for now: `create_person`, then `set_recruiting_candidate_profile` using the returned Person ID. Do not add a partial `create_recruiting_candidate` tool merely to mirror the competitor/UI name. Revisit a one-call operation only if its contract includes the native optional payload and uses one `ApplyOperations` commit with reversible integration cleanup. One call would reduce an orphan-Person window, but Huly does not publish a server-side candidate operation and a partial wrapper would be less honest than the explicit composition.

The recommended disposition is therefore to implement the missing Candidate custom-field behavior as a native-metadata wrapper (or fix the generic operation with the same semantics), document the explicit Person-to-Candidate composition, and keep a new one-call candidate creator blocked until its full atomic contract is approved. This adds no entity or lifecycle that Huly does not already own.

## Huly model and stable locators

The official Recruiting plugin exports the native classes `Applicant`, `ApplicantMatch`, `Vacancy`, `Review`, and `Opinion`, the action `CreateTalent`, and the mixins `Candidate`, `VacancyList`, `DefaultVacancyTypeData`, and `ApplicantTypeData` ([official plugin source](https://github.com/hcengineering/platform/blob/63e28dc96483967b2fc21c881b3f1023c1de7718/plugins/recruit/src/index.ts#L35-L60)). The current repository preserves those IDs in [`src/huly/recruit-plugin.ts`](../../src/huly/recruit-plugin.ts#L21-L40), without adding the unpublished package as a dependency.

The Candidate model is explicitly a mixin over `contact.class.Person`, not a separate Candidate document class. Its native profile fields are `title`, `onsite`, `remote`, `source`, and native collections/counters for applications, skills, reviews, vacancy matches, and polls ([official model](https://github.com/hcengineering/platform/blob/63e28dc96483967b2fc21c881b3f1023c1de7718/models/recruit/src/types.ts#L100-L139)). The published plugin also defines `CandidateDraft` with first/last name, city, channels, resume fields, avatar, work-mode flags, and skills ([official types](https://github.com/hcengineering/platform/blob/63e28dc96483967b2fc21c881b3f1023c1de7718/plugins/recruit/src/types.ts#L49-L78)).

Use these locators, in this order:

- exact model IDs such as `recruit:mixin:Candidate`, `recruit:class:Vacancy`, `recruit:class:Applicant`, and `contact:class:Person`;
- the Person ID returned by `list_recruiting_candidates`, `get_recruiting_candidate`, or `create_person`;
- candidate email or exact display name only where the existing candidate resolver is used; ambiguity must remain an error;
- custom attribute `_id` returned by `list_custom_fields`/`list_huly_attributes`, with its `attributeOf` owner retained.

`Talent` is Huly's translated UX label for the Candidate mixin, not a stable class ID. Likewise, a translated attribute label is not a unique locator. The model-administration schema already accepts exact class IDs or exact case-insensitive class names/labels, and its resolver rejects ambiguous matches ([`ModelIdentifier`](../../src/domain/schemas/model-administration.ts#L15-L18), [attribute owner schema](../../src/domain/schemas/model-administration.ts#L86-L95), [resolver](../../src/huly/operations/model-administration-shared.ts#L52-L75)). The generic custom-field schema deliberately takes an owner ID for `targetClass` and a field ID for writes ([`custom-fields` schema](../../src/domain/schemas/custom-fields.ts#L17-L55)).

## Custom-field evidence and gap

Huly's core metadata model defines each attribute with `attributeOf`, `name`, `type`, `label`, and optional `isCustom`/behavior flags ([official `TAttribute`](https://github.com/hcengineering/platform/blob/63e28dc96483967b2fc21c881b3f1023c1de7718/models/core/src/core.ts#L241-L251)). The official settings UI creates a custom attribute by setting `attributeOf` to the selected class or mixin and `isCustom: true`; it does not create a Recruiting-specific field record ([official settings source](https://github.com/hcengineering/platform/blob/63e28dc96483967b2fc21c881b3f1023c1de7718/plugins/setting-resources/src/components/CreateAttribute.svelte#L64-L85)). This is the authority for which Recruiting custom fields exist in a particular workspace.

The current generic implementation already does the right metadata lookup for definitions: `list_custom_fields` queries `core.class.Attribute` with `isCustom: true` and can filter by exact `attributeOf` ([`listCustomFields`](../../src/huly/operations/custom-fields.ts#L222-L245)). Model administration resolves the owner class/mixin, preserves the native type, and creates only a Huly `core.class.Attribute` with `isCustom: true` ([`createHulyAttribute`](../../src/huly/operations/model-attribute-writes.ts#L226-L258)). A wrapper must call this metadata; it must never invent a field name, type, enum, ref target, or Recruiting entity.

There are two implementation hazards that prevent the current generic operation from being promoted as reliable Candidate parity:

- Huly stores a mixin's values below the mixin ID. The official transaction processor applies `TxMixin` into `doc[tx.mixin]` ([official transaction processor](https://github.com/hcengineering/platform/blob/63e28dc96483967b2fc21c881b3f1023c1de7718/foundations/core/packages/core/src/tx.ts#L389-L404)); the official migration code reads a mixin attribute as `doc[attribute.attributeOf]?.[attribute.name]` and emits the owner-qualified path ([official migration](https://github.com/hcengineering/platform/blob/63e28dc96483967b2fc21c881b3f1023c1de7718/models/core/src/migration.ts#L219-L230)). Huly's mixin proxy makes `candidate.title` readable, but it does not make the nested value an own enumerable property ([official proxy](https://github.com/hcengineering/platform/blob/63e28dc96483967b2fc21c881b3f1023c1de7718/foundations/core/packages/core/src/proxy.ts#L11-L27)). The current [`getCustomFieldValues`](../../src/huly/operations/custom-fields.ts#L247-L276) uses `Object.keys(doc)` and `docKeys.has(attr.name)`, so it can miss a Candidate-owned custom attribute.
- Huly's `createMixin`/`updateMixin` contract takes `objectId`, the base `objectClass`, object space, mixin ref, and attributes ([installed declaration](../../node_modules/@hcengineering/core/types/operations.d.ts#L27-L35); [official implementation](https://github.com/hcengineering/platform/blob/63e28dc96483967b2fc21c881b3f1023c1de7718/foundations/core/packages/core/src/operations.ts#L217-L256)). The official Candidate UI passes `contact.class.Person` as the object class when creating `recruit.mixin.Candidate` ([official CreateCandidate source](https://github.com/hcengineering/platform/blob/63e28dc96483967b2fc21c881b3f1023c1de7718/plugins/recruit-resources/src/components/CreateCandidate.svelte#L228-L237)). Current [`setCustomField`](../../src/huly/operations/custom-fields.ts#L278-L328) forwards the caller's `objectClass` unchanged, so passing `recruit:mixin:Candidate` as if it were the base class is not a valid contract. It also checks only `isCustom` and document existence; it does not check owner applicability or ensure the Candidate mixin exists.

The resulting proposed contract is:

1. Resolve a candidate using the existing `CandidateIdentifier` (Person ID, exact email, or exact name), and fail on missing/ambiguous Person or missing Candidate when a read is requested.
2. Resolve custom attributes from Huly metadata. Candidate-specific fields must have `attributeOf = recruit:mixin:Candidate`; inherited Person fields may have `attributeOf = contact:class:Person`. Do not silently accept an attribute owned by an unrelated Recruiting class.
3. Read Candidate-owned values from the Candidate projection or the nested mixin payload by attribute name; read Person-owned values from the Person payload. Return field ID, label, owner ID, type, and value using schemas rather than raw documents.
4. For a write, ensure the Person has the Candidate mixin first, then call `updateMixin(personId, contact.class.Person, person.space, recruit.mixin.Candidate, {[attribute.name]: parsedValue})` for Candidate-owned fields. Use `updateDoc` only for a Person-owned field. Reuse the existing Huly type parser and reject unsupported array/ref/unknown writes rather than guessing a representation.
5. Verify this path with a temporary native custom Attribute owned by `recruit:mixin:Candidate`, a temporary Person/Candidate, read-after-write in separate fresh sessions, and cleanup. Also test a Person-owned custom Attribute and rejection of an unrelated owner. The test must run against the actual local Huly model; unit fixtures alone are not enough.

This is `native-field` origin with currently `missing` friendly Candidate coverage, and the disposition is `implement`. It is a wrapper/fix over Huly metadata and mixin transactions, not a new Recruiting field system.

## Candidate creation and enablement

The model action `CreateTalent` targets `core.class.Doc` and opens `recruit.component.CreateCandidate`; it is not a server-side create function ([official model action](https://github.com/hcengineering/platform/blob/63e28dc96483967b2fc21c881b3f1023c1de7718/models/recruit/src/index.ts#L1034-L1055)). The official component creates a generated Person ID, builds native Person data, builds Candidate mixin data, and routes extra values according to `hierarchy.findAttribute(recruit.mixin.Candidate, key)`: Candidate-owned values go into the mixin payload, while inherited/base values go into the Person payload ([official component](https://github.com/hcengineering/platform/blob/63e28dc96483967b2fc21c881b3f1023c1de7718/plugins/recruit-resources/src/components/CreateCandidate.svelte#L192-L237)). It then adds optional native attachments, channels, and skill references before committing the accumulated operations ([same component](https://github.com/hcengineering/platform/blob/63e28dc96483967b2fc21c881b3f1023c1de7718/plugins/recruit-resources/src/components/CreateCandidate.svelte#L241-L302)). `ApplyOperations.commit` sends multiple queued transactions together as one `TxApplyIf` when needed ([official core operations](https://github.com/hcengineering/platform/blob/63e28dc96483967b2fc21c881b3f1023c1de7718/foundations/core/packages/core/src/operations.ts#L461-L553)).

There is no hidden server operation to reuse. The official server Recruiting plugin exports presenter resources and `OnRecruitUpdate`, with no candidate create/enable function ([official server plugin](https://github.com/hcengineering/platform/blob/63e28dc96483967b2fc21c881b3f1023c1de7718/server-plugins/recruit/src/index.ts#L25-L40)); its model only registers notification/search presenters, a vacancy trigger, and link providers ([official server model](https://github.com/hcengineering/platform/blob/63e28dc96483967b2fc21c881b3f1023c1de7718/models/server-recruit/src/index.ts#L30-L107)).

For an existing Person, the official Create Application component reads `contact.class.Person`, creates the Candidate mixin only when absent using the Person class as the base, then adds an Applicant to the Candidate's `applications` collection ([official CreateApplication source](https://github.com/hcengineering/platform/blob/63e28dc96483967b2fc21c881b3f1023c1de7718/plugins/recruit-resources/src/components/CreateApplication.svelte#L117-L174)). Its Person selector also offers the native CreateCandidate component for a new Person ([same component](https://github.com/hcengineering/platform/blob/63e28dc96483967b2fc21c881b3f1023c1de7718/plugins/recruit-resources/src/components/CreateApplication.svelte#L299-L315)).

The official Huly Person example confirms the base operation and required Person data: `createDoc(contact.class.Person, contact.space.Contacts, { name, city, avatarType }, personId)`, followed by an optional `Channel` collection entry ([pinned official example](https://github.com/hcengineering/huly-examples/blob/29b9f7f060d6308842d2897996776ef42374b5c6/platform-api/examples/person-create.ts#L35-L70)).

The current MCP maps cleanly to this composition:

- [`create_person`](../../src/huly/operations/persons.ts#L201-L229) creates the Person and optional email Channel, but intentionally does not claim Candidate enablement.
- [`set_recruiting_candidate_profile`](../../src/huly/operations/recruiting-candidates.ts#L172-L187) resolves the existing Person by ID/email/name and `ensureCandidateMixin` creates or updates `recruit:mixin:Candidate` using `person._class` and `person.space` ([shared helper](../../src/huly/operations/recruiting-candidate-shared.ts#L29-L83)).
- [`create_recruiting_applicant`](../../src/huly/operations/recruiting-applicants.ts#L225-L286) resolves an existing Person, calls `ensureCandidateMixin`, and then adds the Applicant to the Candidate `applications` collection.

The native origin is therefore `composable-workflow`, not `native-operation`. Existing-Person enablement is already `direct` through the profile tool and is also composed into Applicant creation; disposition `keep` (with the existing tool descriptions as guidance). New Person plus minimal Candidate profile is `composed` in two short, deterministic calls; disposition `instruct`. The full UI-equivalent payload (avatar, resume attachment, arbitrary metadata-defined values, channels beyond the email helper, and skills) is not a reason to add a partial one-call tool; leave it out of this issue until a complete schema and atomic integration contract are approved.

## Disposition summary

| Residual | Huly origin | Current coverage | Disposition |
| --- | --- | --- | --- |
| Discover definitions owned by Recruiting classes/mixins | `native-entity` (`core.class.Attribute`) | `composed` through `list_huly_classes`, `list_huly_attributes`, and `list_custom_fields` | `keep`; improve guidance with exact owner IDs |
| Read/write Candidate-owned custom values by friendly candidate locator | `native-field` plus native mixin transaction | `missing` for reliable friendly coverage; generic read/write has mixin-owner hazards | `implement` a metadata-checked wrapper or equivalently fix the generic operation |
| Enable an existing Person as Candidate | `composable-workflow` over Person + Candidate mixin | `direct` via `set_recruiting_candidate_profile`; also composed in Applicant creation | `keep` |
| Create a minimal Candidate from a new Person | `composable-workflow` over `createDoc` + `createMixin` | `composed` as `create_person` then `set_recruiting_candidate_profile` | `instruct`; no new entity or partial convenience tool |
| Atomic/full UI-equivalent one-call creator | `composable-workflow`; no Huly server operation | `research-needed` for a complete MCP contract and live apply semantics | `research`; unlock only with a schema for native optional payload, one `ApplyOperations` commit, and cleanup-tested integration |

These classifications use the parity methodology: competitor names cannot change the Huly SDK denominator, and no competitor-created entity or lifecycle is proposed. The one-call creator is not “excluded” as competitor-only; it is deferred because the native operation is a client composition and the complete MCP contract is not yet specified.

## Runtime verification and unlock condition

Static authority is complete, but the requested read-only local metadata probe could not connect. The command used the local credentials with `HULY_URL` rewritten from `localhost` to `host.docker.internal` and attempted `list_huly_classes`, `list_huly_attributes`, and `list_custom_fields` for `recruit:mixin:Candidate`. The bundle stopped before Huly connection with:

```text
Huly MCP startup failed: unsupported Node.js runtime.
Detected 20.20.1 at /usr/local/bin/node; required >=22.19.0.
```

No workspace data was mutated. The runtime evidence is consequently `research-needed`, not evidence that Recruiting metadata is absent. Repeat the three read-only calls under Node `>=22.19.0`, then run the temporary-attribute Candidate integration described above. Do not mark the custom-field wrapper complete until both the Candidate-owned and Person-owned paths pass against the live model.

## Recommended issue disposition/spec

Split #260's outcome into two decisions without adding a competitor matrix to planning:

1. **Custom fields: implement.** Add a native-metadata-aware Candidate custom-field read/write surface (or repair the generic operation and add a Recruiting adapter). Inputs use the existing candidate locator and Huly field ID/owner metadata. Candidate values are written with base class `contact.class.Person` and `recruit:mixin:Candidate`; unrelated owners, missing mixins, unsupported types, and ambiguous locators are typed errors. Add schema/MCP/unit coverage and a reversible live integration fixture.
2. **Candidate creation: document/instruct.** Keep `create_person` followed by `set_recruiting_candidate_profile` as the supported minimal workflow; explain that `create_person` alone does not enable Recruiting. Keep existing-Person enablement direct and let Applicant creation continue to ensure the mixin. Do not add `create_recruiting_candidate` now. Reopen a separate implementation issue only if the requested contract includes the native optional payload and an `ApplyOperations`-backed atomic commit.

The only runtime blocker for the first decision is Node `>=22.19.0` for live verification. No new persistent entity, field namespace, or server-owned reconciliation lifecycle is required.
