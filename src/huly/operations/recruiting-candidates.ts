import { SortingOrder } from "@hcengineering/core"
import type { TagElement } from "@hcengineering/tags"
import { Effect } from "effect"

import type {
  CandidateDetail,
  ListRecruitingCandidateSkillsResult,
  ListRecruitingCandidatesResult,
  ListRecruitingSkillsResult,
  RecruitingCandidateMutationResult,
  RecruitingSkillAttachResult,
  RecruitingSkillDetachResult
} from "../../domain/schemas/recruiting-common.js"
import type {
  AddRecruitingCandidateSkillParams,
  GetRecruitingCandidateParams,
  ListRecruitingCandidateSkillsParams,
  ListRecruitingCandidatesParams,
  ListRecruitingSkillsParams,
  RemoveRecruitingCandidateSkillParams,
  SetRecruitingCandidateProfileParams
} from "../../domain/schemas/recruiting.js"
import { Count, TagElementId, Timestamp } from "../../domain/schemas/shared.js"
import type { AttachedTagSummary } from "../../domain/schemas/tags.js"
import { normalizeForComparison } from "../../utils/normalize.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type {
  PersonIdentifierAmbiguousError,
  PersonNotFoundError,
  RecruitingCandidateNotFoundError,
  TagCategoryNotFoundError,
  TagNotFoundError
} from "../errors.js"
import { tags } from "../huly-plugins.js"
import { recruitIds } from "../recruit-plugin.js"
import type { Candidate } from "../types/recruiting.js"
import { hulyQuery, type StrictDocumentQuery } from "./query-helpers.js"
import {
  CANDIDATE_SKILL_COLLECTION,
  CANDIDATE_SKILL_TARGET_CLASS,
  candidateEmail,
  type CandidateMixinAttributes,
  candidateSearchFilter,
  ensureCandidateMixin,
  resolveCandidate,
  resolveCandidatePerson,
  toCandidateRef
} from "./recruiting-candidate-shared.js"
import { listLimit, optionalCount } from "./recruiting-shared.js"
import {
  attachTagReference,
  detachTagReference,
  ensureTagElement,
  findTagElementOrFail,
  listTagReferencesForObject,
  normalizeColorCode,
  resolveTagCategoryRef,
  toAttachedTagSummary,
  toResolvedTagElement,
  toTargetClassRef
} from "./tags-shared.js"

type CandidateReadError =
  | HulyClientError
  | PersonIdentifierAmbiguousError
  | PersonNotFoundError
  | RecruitingCandidateNotFoundError
type CandidateWriteError = HulyClientError | PersonIdentifierAmbiguousError | PersonNotFoundError
type SkillReadError = HulyClientError | TagCategoryNotFoundError
type SkillWriteError =
  | HulyClientError
  | PersonIdentifierAmbiguousError
  | PersonNotFoundError
  | TagCategoryNotFoundError
  | TagNotFoundError

const candidateMatchesQuery = (candidate: Candidate, query: string | undefined): boolean => {
  const normalized = normalizeForComparison(query?.trim() ?? "")
  if (normalized === "") return true
  return [
    candidate.name,
    candidate.title,
    candidate.source
  ].some((value) => value !== undefined && normalizeForComparison(value).includes(normalized))
}

const listCandidateSkillsForObject = (
  candidate: Candidate
): Effect.Effect<ReadonlyArray<AttachedTagSummary>, HulyClientError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const tagRefs = yield* listTagReferencesForObject(client, {
      objectId: candidate._id,
      objectClass: CANDIDATE_SKILL_TARGET_CLASS,
      space: candidate.space,
      collection: CANDIDATE_SKILL_COLLECTION
    })
    return tagRefs.map(toAttachedTagSummary)
  })

const toCandidateDetail = (candidate: Candidate): Effect.Effect<CandidateDetail, HulyClientError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const [email, skills] = yield* Effect.all([
      candidateEmail(client, candidate._id),
      listCandidateSkillsForObject(candidate)
    ])
    const applications = optionalCount(candidate.applications)
    const reviews = optionalCount(candidate.reviews)
    return {
      ...toCandidateRef(candidate, email),
      ...(candidate.title === undefined || candidate.title === "" ? {} : { title: candidate.title }),
      ...(candidate.source === undefined || candidate.source === "" ? {} : { source: candidate.source }),
      ...(candidate.onsite === undefined ? {} : { onsite: candidate.onsite }),
      ...(candidate.remote === undefined ? {} : { remote: candidate.remote }),
      ...(applications === undefined ? {} : { applications }),
      ...(reviews === undefined ? {} : { reviews }),
      skills: [...skills],
      modifiedOn: Timestamp.make(candidate.modifiedOn),
      ...(candidate.createdOn === undefined ? {} : { createdOn: Timestamp.make(candidate.createdOn) })
    }
  })

const toSkillSummary = (tag: TagElement) => ({
  id: TagElementId.make(tag._id),
  title: tag.title,
  color: normalizeColorCode(tag.color),
  category: tag.category,
  ...(tag.refCount === undefined ? {} : { refCount: Count.make(tag.refCount) })
})

export const listRecruitingCandidates = (
  params: ListRecruitingCandidatesParams
): Effect.Effect<ListRecruitingCandidatesResult, HulyClientError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const candidates = yield* client.findAll<Candidate>(
      recruitIds.mixin.Candidate,
      hulyQuery<Candidate>(candidateSearchFilter(params.query)),
      { limit: listLimit(params.limit), sort: { modifiedOn: SortingOrder.Descending } }
    )
    const filtered = candidates.filter((candidate) => candidateMatchesQuery(candidate, params.query))
    const emailMap = yield* Effect.map(
      Effect.forEach(filtered, (candidate) => candidateEmail(client, candidate._id)),
      (emails) => new Map(filtered.map((candidate, index) => [candidate._id, emails[index]] as const))
    )
    return {
      candidates: filtered.map((candidate) => toCandidateRef(candidate, emailMap.get(candidate._id))),
      total: Count.make(filtered.length)
    }
  })

export const getRecruitingCandidate = (
  params: GetRecruitingCandidateParams
): Effect.Effect<CandidateDetail, CandidateReadError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    return yield* toCandidateDetail(yield* resolveCandidate(client, params.candidate))
  })

export const setRecruitingCandidateProfile = (
  params: SetRecruitingCandidateProfileParams
): Effect.Effect<RecruitingCandidateMutationResult, CandidateWriteError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const person = yield* resolveCandidatePerson(client, params.candidate)
    const attributes: CandidateMixinAttributes = {
      ...(params.title === undefined ? {} : { title: params.title }),
      ...(params.source === undefined ? {} : { source: params.source }),
      ...(params.onsite === undefined ? {} : { onsite: params.onsite }),
      ...(params.remote === undefined ? {} : { remote: params.remote })
    }
    const { candidate, created } = yield* ensureCandidateMixin(client, person, attributes)
    const email = yield* candidateEmail(client, person._id)
    return { candidate: toCandidateRef(candidate, email), created }
  })

export const listRecruitingSkills = (
  params: ListRecruitingSkillsParams
): Effect.Effect<ListRecruitingSkillsResult, SkillReadError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const categoryFilter: StrictDocumentQuery<TagElement> = params.category === undefined
      ? {}
      : { category: yield* resolveTagCategoryRef(client, CANDIDATE_SKILL_TARGET_CLASS, params.category) }
    const search = params.titleSearch?.trim() ?? ""
    const titleFilter: StrictDocumentQuery<TagElement> = search === ""
      ? {}
      : { title: { $like: `%${search}%` } }
    const skillTags = yield* client.findAll<TagElement>(
      tags.class.TagElement,
      hulyQuery<TagElement>({
        targetClass: toTargetClassRef(CANDIDATE_SKILL_TARGET_CLASS),
        ...categoryFilter,
        ...titleFilter
      }),
      { limit: listLimit(params.limit), sort: { title: SortingOrder.Ascending } }
    )
    return { skills: skillTags.map(toSkillSummary), total: Count.make(skillTags.length) }
  })

export const listRecruitingCandidateSkills = (
  params: ListRecruitingCandidateSkillsParams
): Effect.Effect<ListRecruitingCandidateSkillsResult, CandidateReadError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const candidate = yield* resolveCandidate(client, params.candidate)
    const skills = yield* listCandidateSkillsForObject(candidate)
    return { skills: [...skills], total: Count.make(skills.length) }
  })

export const addRecruitingCandidateSkill = (
  params: AddRecruitingCandidateSkillParams
): Effect.Effect<RecruitingSkillAttachResult, SkillWriteError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const person = yield* resolveCandidatePerson(client, params.candidate)
    const { candidate } = yield* ensureCandidateMixin(client, person, {})
    const tag = yield* ensureTagElement({
      targetClass: CANDIDATE_SKILL_TARGET_CLASS,
      titleOrId: params.skill,
      color: params.color,
      category: params.category
    })
    return yield* attachTagReference({
      tag,
      objectId: candidate._id,
      objectClass: CANDIDATE_SKILL_TARGET_CLASS,
      space: candidate.space,
      collection: CANDIDATE_SKILL_COLLECTION,
      weight: params.weight,
      matchTitleCaseInsensitive: true
    })
  })

export const removeRecruitingCandidateSkill = (
  params: RemoveRecruitingCandidateSkillParams
): Effect.Effect<RecruitingSkillDetachResult, SkillWriteError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const person = yield* resolveCandidatePerson(client, params.candidate)
    const tag = toResolvedTagElement(
      yield* findTagElementOrFail(client, CANDIDATE_SKILL_TARGET_CLASS, params.skill),
      false
    )
    return yield* detachTagReference({
      tag,
      objectId: person._id,
      objectClass: CANDIDATE_SKILL_TARGET_CLASS,
      space: person.space,
      collection: CANDIDATE_SKILL_COLLECTION
    })
  })
