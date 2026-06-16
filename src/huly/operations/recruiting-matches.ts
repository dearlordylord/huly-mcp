import type { Person } from "@hcengineering/contact"
import { SortingOrder } from "@hcengineering/core"
import { Effect } from "effect"

import type { ApplicantMatchRef } from "../../domain/schemas/recruiting-common.js"
import { ApplicantMatchId } from "../../domain/schemas/recruiting-common.js"
import type {
  ApplicantMatchDetail,
  ListRecruitingApplicantMatchesResult
} from "../../domain/schemas/recruiting-extended-results.js"
import type {
  GetRecruitingApplicantMatchParams,
  ListRecruitingApplicantMatchesParams
} from "../../domain/schemas/recruiting-extended.js"
import { Count, Timestamp } from "../../domain/schemas/shared.js"
import { normalizeForComparison } from "../../utils/normalize.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type {
  PersonIdentifierAmbiguousError,
  PersonNotFoundError,
  RecruitingApplicantMatchNotFoundError,
  RecruitingModelMissingError
} from "../errors.js"
import {
  RecruitingApplicantMatchNotFoundError as MatchMissing,
  RecruitingModelMissingError as ModelMissing
} from "../errors.js"
import { contact } from "../huly-plugins.js"
import { recruitIds } from "../recruit-plugin.js"
import type { ApplicantMatch, Candidate } from "../types/recruiting.js"
import { optionalMarkupToMarkdown } from "./markup.js"
import { hulyQuery, type StrictDocumentQuery } from "./query-helpers.js"
import { candidateEmail, resolveCandidatePerson, toCandidateRef } from "./recruiting-candidate-shared.js"
import { listLimit } from "./recruiting-shared.js"
import { toRef } from "./sdk-boundary.js"

type MatchReadError =
  | HulyClientError
  | PersonIdentifierAmbiguousError
  | PersonNotFoundError
  | RecruitingApplicantMatchNotFoundError
  | RecruitingModelMissingError

const matchesText = (match: ApplicantMatch, query: string | undefined): boolean => {
  const normalized = normalizeForComparison(query ?? "")
  if (normalized === "") return true
  return [match.vacancy, match.summary].some((value) => normalizeForComparison(value).includes(normalized))
}

const toMatchRef = (
  client: HulyClient["Type"],
  match: ApplicantMatch
): Effect.Effect<ApplicantMatchRef, HulyClientError | RecruitingModelMissingError> =>
  Effect.gen(function*() {
    const person = yield* client.findOne<Person>(
      contact.class.Person,
      hulyQuery<Person>({ _id: toRef<Person>(match.attachedTo) })
    )
    if (person === undefined) {
      return yield* new ModelMissing({
        message: `Applicant match '${match._id}' references missing candidate '${match.attachedTo}'`
      })
    }
    const email = yield* candidateEmail(client, person._id)
    return {
      id: ApplicantMatchId.make(match._id),
      candidate: toCandidateRef(person, email),
      complete: match.complete,
      vacancy: match.vacancy
    }
  })

const toMatchDetail = (
  client: HulyClient["Type"],
  match: ApplicantMatch
): Effect.Effect<ApplicantMatchDetail, HulyClientError | RecruitingModelMissingError> =>
  Effect.gen(function*() {
    const ref = yield* toMatchRef(client, match)
    const response = optionalMarkupToMarkdown(match.response, client.markupUrlConfig, undefined)
    return {
      ...ref,
      ...(match.summary === "" ? {} : { summary: match.summary }),
      ...(response === undefined || response === "" ? {} : { response }),
      modifiedOn: Timestamp.make(match.modifiedOn),
      ...(match.createdOn === undefined ? {} : { createdOn: Timestamp.make(match.createdOn) })
    }
  })

export const listRecruitingApplicantMatches = (
  params: ListRecruitingApplicantMatchesParams
): Effect.Effect<ListRecruitingApplicantMatchesResult, MatchReadError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const candidate = params.candidate === undefined
      ? undefined
      : yield* resolveCandidatePerson(client, params.candidate)
    const query: StrictDocumentQuery<ApplicantMatch> = {
      ...(candidate === undefined ? {} : { attachedTo: toRef<Candidate>(candidate._id) }),
      ...(params.complete === undefined ? {} : { complete: params.complete })
    }
    const matches = yield* client.findAll<ApplicantMatch>(
      recruitIds.class.ApplicantMatch,
      hulyQuery(query),
      { sort: { modifiedOn: SortingOrder.Descending } }
    )
    const limited = matches.filter((match) => matchesText(match, params.query)).slice(0, listLimit(params.limit))
    const refs = yield* Effect.forEach(limited, (match) => toMatchRef(client, match))
    return { matches: refs, total: Count.make(refs.length) }
  })

export const getRecruitingApplicantMatch = (
  params: GetRecruitingApplicantMatchParams
): Effect.Effect<ApplicantMatchDetail, MatchReadError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const match = yield* client.findOne<ApplicantMatch>(
      recruitIds.class.ApplicantMatch,
      hulyQuery<ApplicantMatch>({ _id: toRef<ApplicantMatch>(params.match) })
    )
    if (match === undefined) {
      return yield* new MatchMissing({ identifier: params.match })
    }
    return yield* toMatchDetail(client, match)
  })
