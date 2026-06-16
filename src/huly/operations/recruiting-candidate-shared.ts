import type { Person } from "@hcengineering/contact"
import type { Ref } from "@hcengineering/core"
import { Effect, Schema } from "effect"

import type { CandidateIdentifier, CandidateRef } from "../../domain/schemas/recruiting-common.js"
import { PersonId, PersonName, PersonRefInput } from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import type { PersonIdentifierAmbiguousError } from "../errors.js"
import { PersonNotFoundError, RecruitingCandidateNotFoundError } from "../errors.js"
import { contact } from "../huly-plugins.js"
import { recruitIds } from "../recruit-plugin.js"
import type { Candidate } from "../types/recruiting.js"
import { batchGetEmailsForPersons, findPersonByExactEmailOrName, findPersonById } from "./contacts-shared.js"
import { escapeLikeWildcards, hulyQuery, type StrictDocumentQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

export const CANDIDATE_SKILL_TARGET_CLASS = "recruit:mixin:Candidate"
export const CANDIDATE_SKILL_COLLECTION = "skills"

export type CandidateMixinAttributes = Partial<Pick<Candidate, "onsite" | "remote" | "source" | "title">>

export const toCandidateRef = (candidate: Pick<Person, "_id" | "name">, email?: string): CandidateRef => ({
  id: PersonId.make(candidate._id),
  name: PersonName.make(candidate.name),
  ...(email === undefined ? {} : { email })
})

export const resolveCandidatePerson = (
  client: HulyClient["Type"],
  identifier: CandidateIdentifier
): Effect.Effect<
  Person,
  HulyClientError | PersonIdentifierAmbiguousError | PersonNotFoundError
> =>
  Effect.gen(function*() {
    const byId = yield* findPersonById(client, identifier)
    if (byId !== undefined) return byId

    const decodedIdentifier = Schema.decodeUnknownSync(PersonRefInput)(identifier)
    const byEmailOrName = yield* findPersonByExactEmailOrName(client, decodedIdentifier)
    if (byEmailOrName === undefined) {
      return yield* new PersonNotFoundError({ identifier })
    }
    return byEmailOrName
  })

export const resolveCandidate = (
  client: HulyClient["Type"],
  identifier: CandidateIdentifier
): Effect.Effect<
  Candidate,
  HulyClientError | PersonIdentifierAmbiguousError | PersonNotFoundError | RecruitingCandidateNotFoundError
> =>
  Effect.gen(function*() {
    const person = yield* resolveCandidatePerson(client, identifier)
    const candidate = yield* client.findOne<Candidate>(
      recruitIds.mixin.Candidate,
      hulyQuery<Candidate>({ _id: toRef<Candidate>(person._id) })
    )
    if (candidate === undefined) {
      return yield* new RecruitingCandidateNotFoundError({ identifier })
    }
    return candidate
  })

export const ensureCandidateMixin = (
  client: HulyClient["Type"],
  person: Person,
  attributes: CandidateMixinAttributes
): Effect.Effect<{ readonly candidate: Candidate; readonly created: boolean }, HulyClientError> =>
  Effect.gen(function*() {
    const existing = yield* client.findOne<Candidate>(
      recruitIds.mixin.Candidate,
      hulyQuery<Candidate>({ _id: toRef<Candidate>(person._id) })
    )
    if (existing !== undefined) {
      if (Object.keys(attributes).length > 0) {
        yield* client.updateMixin(
          person._id,
          person._class,
          person.space,
          recruitIds.mixin.Candidate,
          attributes
        )
      }
      return { candidate: { ...existing, ...attributes }, created: false }
    }

    yield* client.createMixin(
      person._id,
      person._class,
      person.space,
      recruitIds.mixin.Candidate,
      attributes
    )
    return { candidate: { ...person, ...attributes }, created: true }
  })

export const candidateEmail = (
  client: HulyClient["Type"],
  candidateId: Ref<Person>
): Effect.Effect<string | undefined, HulyClientError> =>
  Effect.gen(function*() {
    const emailMap = yield* batchGetEmailsForPersons(client, [candidateId])
    return emailMap.get(candidateId)
  })

export const findPersonByApplicantAssignee = (
  client: HulyClient["Type"],
  assignee: Ref<Person> | null
): Effect.Effect<CandidateRef | undefined, HulyClientError> =>
  Effect.gen(function*() {
    if (assignee === null) return undefined
    const person = yield* client.findOne<Person>(contact.class.Person, { _id: assignee })
    if (person === undefined) return undefined
    const email = yield* candidateEmail(client, person._id)
    return toCandidateRef(person, email)
  })

export const candidateSearchFilter = (query: string | undefined): StrictDocumentQuery<Candidate> => {
  const search = query?.trim() ?? ""
  return search === ""
    ? {}
    : {
      $search: escapeLikeWildcards(search)
    }
}
