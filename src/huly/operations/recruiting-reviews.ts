import { AccessLevel, type Calendar } from "@hcengineering/calendar"
import type { Contact, Organization, Person } from "@hcengineering/contact"
import type { AttachedData, DocumentUpdate, Ref } from "@hcengineering/core"
import { generateId, SortingOrder } from "@hcengineering/core"
import { Effect } from "effect"

import type {
  ApplicantIdentifier,
  CandidateIdentifier,
  RecruitingReviewTitle,
  ReviewIdentifier,
  ReviewRef
} from "../../domain/schemas/recruiting-common.js"
import {
  RecruitingReviewTitle as ReviewTitleSchema,
  ReviewId,
  ReviewIdentifier as ReviewIdentifierSchema
} from "../../domain/schemas/recruiting-common.js"
import type {
  DeleteRecruitingReviewResult,
  ListRecruitingReviewsResult,
  ReviewDetail
} from "../../domain/schemas/recruiting-extended-results.js"
import type {
  CreateRecruitingReviewParams,
  DeleteRecruitingReviewParams,
  GetRecruitingReviewParams,
  ListRecruitingReviewsParams,
  UpdateRecruitingReviewParams
} from "../../domain/schemas/recruiting-extended.js"
import { Count, DocId, PersonName, Timestamp } from "../../domain/schemas/shared.js"
import { assertAt } from "../../utils/assertions.js"
import { normalizeForComparison } from "../../utils/normalize.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type { Diagnostics } from "../diagnostics.js"
import type {
  OrganizationIdentifierAmbiguousError,
  OrganizationNotFoundError,
  PersonIdentifierAmbiguousError,
  PersonNotFoundError,
  RecruitingApplicantIdentifierAmbiguousError,
  RecruitingApplicantNotFoundError,
  RecruitingReviewIdentifierAmbiguousError,
  RecruitingReviewNotFoundError
} from "../errors.js"
import {
  RecruitingModelMissingError,
  RecruitingMutationUnsupportedError,
  RecruitingReviewIdentifierAmbiguousError as ReviewAmbiguous,
  RecruitingReviewNotFoundError as ReviewMissing
} from "../errors.js"
import { contact, core } from "../huly-plugins.js"
import { recruitIds } from "../recruit-plugin.js"
import type { Applicant, Candidate, Review } from "../types/recruiting.js"
import { buildParticipants, resolveParticipantLocators } from "./calendar-shared.js"
import { markdownToMarkupString, optionalMarkupToMarkdown } from "./markup.js"
import { hulyNonEmptyTextOrFallback } from "./non-empty-text.js"
import { resolveOrganizationByIdentifier } from "./organization-resolvers.js"
import { hulyQuery, type StrictDocumentQuery } from "./query-helpers.js"
import {
  candidateEmail,
  ensureCandidateMixin,
  resolveCandidatePerson,
  toCandidateRef
} from "./recruiting-candidate-shared.js"
import { applicantRefFromDoc, findApplicant, incrementSequence, listLimit, optionalCount } from "./recruiting-shared.js"
import { toRef } from "./sdk-boundary.js"

const REVIEW_DEFAULT_DURATION_MINUTES = 30
const MILLISECONDS_PER_SECOND = 1000
const SECONDS_PER_MINUTE = 60
const DEFAULT_REVIEW_DURATION_MS = REVIEW_DEFAULT_DURATION_MINUTES * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND
const UNTITLED_REVIEW = ReviewTitleSchema.make("Untitled Review")

// Huly's Recruiting review UI stores an empty calendar ref, so MCP mirrors that model-specific sentinel.
// eslint-disable-next-line no-restricted-syntax -- SDK boundary: empty calendar ref is the upstream Recruiting UI sentinel
const reviewUiEmptyCalendar = "" as Ref<Calendar>

type ReviewReadError =
  | HulyClientError
  | PersonIdentifierAmbiguousError
  | PersonNotFoundError
  | RecruitingApplicantIdentifierAmbiguousError
  | RecruitingApplicantNotFoundError
  | RecruitingModelMissingError
  | RecruitingReviewIdentifierAmbiguousError
  | RecruitingReviewNotFoundError

type ReviewWriteError =
  | ReviewReadError
  | OrganizationIdentifierAmbiguousError
  | OrganizationNotFoundError
  | RecruitingMutationUnsupportedError

const prefixedReviewNumber = (identifier: string): number | undefined => {
  const match = /^RVE-(\d+)$/i.exec(identifier)
  return match === null ? undefined : Number(match[1])
}

const reviewIdentifierFromNumber = (number: number): ReviewIdentifier => ReviewIdentifierSchema.make(`RVE-${number}`)

const reviewTitle = (title: string): RecruitingReviewTitle =>
  hulyNonEmptyTextOrFallback(ReviewTitleSchema, title, UNTITLED_REVIEW)

const reviewRefFromCandidate = (
  id: Ref<Review>,
  number: number,
  title: string,
  person: Person,
  email: string | undefined
): ReviewRef => ({
  id: ReviewId.make(id),
  identifier: reviewIdentifierFromNumber(number),
  title: reviewTitle(title),
  candidate: toCandidateRef(person, email)
})

const optionalApplication = (
  client: HulyClient["Type"],
  identifier: ApplicantIdentifier | undefined,
  candidate?: Person
) => identifier === undefined ? Effect.succeed(undefined) : findApplicant(client, identifier, undefined, candidate)

const optionalCandidate = (
  client: HulyClient["Type"],
  identifier: CandidateIdentifier | undefined
) => identifier === undefined ? Effect.succeed(undefined) : resolveCandidatePerson(client, identifier)

const companySummary = (
  client: HulyClient["Type"],
  company: Ref<Organization> | undefined
) =>
  company === undefined
    ? Effect.succeed(undefined)
    : Effect.map(
      client.findOne<Organization>(contact.class.Organization, { _id: company }),
      (org) => org === undefined ? undefined : { id: DocId.make(org._id), name: org.name }
    )

const matchesReviewText = (review: Review, query: string | undefined): boolean => {
  const normalized = normalizeForComparison(query ?? "")
  if (normalized === "") return true
  return [review.title, review.verdict, review.location ?? ""].some((value) =>
    normalizeForComparison(value).includes(normalized)
  )
}

const reviewMatchesFilters = (
  review: Review,
  candidate: Person | undefined,
  application: Applicant | undefined
): boolean =>
  (candidate === undefined || String(review.attachedTo) === String(candidate._id))
  && (application === undefined || String(review.application) === String(application._id))

export const reviewRefFromDoc = (
  client: HulyClient["Type"],
  review: Review
): Effect.Effect<ReviewRef, HulyClientError | RecruitingModelMissingError> =>
  Effect.gen(function*() {
    const person = yield* client.findOne<Person>(
      contact.class.Person,
      hulyQuery<Person>({ _id: toRef<Person>(review.attachedTo) })
    )
    if (person === undefined) {
      return yield* new RecruitingModelMissingError({
        message: `Review '${review._id}' references missing candidate '${review.attachedTo}'`
      })
    }
    const email = yield* candidateEmail(client, person._id)
    return {
      id: ReviewId.make(review._id),
      identifier: reviewIdentifierFromNumber(review.number),
      title: reviewTitle(review.title),
      candidate: toCandidateRef(person, email)
    }
  })

const reviewDetail = (
  client: HulyClient["Type"],
  review: Review
): Effect.Effect<ReviewDetail, HulyClientError | RecruitingModelMissingError, Diagnostics> =>
  Effect.gen(function*() {
    const ref = yield* reviewRefFromDoc(client, review)
    const description = optionalMarkupToMarkdown(review.description, client.markupUrlConfig, undefined)
    const application = review.application === undefined
      ? undefined
      : yield* Effect.flatMap(
        client.findOne<Applicant>(recruitIds.class.Applicant, hulyQuery<Applicant>({ _id: review.application })),
        (applicant) => applicant === undefined ? Effect.succeed(undefined) : applicantRefFromDoc(client, applicant)
      )
    const participants = yield* buildParticipants(client, review.participants)
    const company = yield* companySummary(client, review.company)
    const opinions = optionalCount(review.opinions)
    return {
      ...ref,
      ...(description === undefined || description === "" ? {} : { description }),
      ...(review.verdict === "" ? {} : { verdict: review.verdict }),
      ...(application === undefined ? {} : { application }),
      ...(company === undefined ? {} : { company }),
      ...(review.location === undefined || review.location === "" ? {} : { location: review.location }),
      date: Timestamp.make(review.date),
      dueDate: Timestamp.make(review.dueDate),
      participants: participants.map((participant) => ({
        id: participant.id,
        /* v8 ignore next -- buildParticipants resolves person refs and always supplies names. */
        name: participant.name ?? PersonName.make(String(participant.id))
      })),
      ...(opinions === undefined ? {} : { opinions }),
      modifiedOn: Timestamp.make(review.modifiedOn),
      ...(review.createdOn === undefined ? {} : { createdOn: Timestamp.make(review.createdOn) })
    }
  })

export const findReview = (
  client: HulyClient["Type"],
  identifier: ReviewIdentifier,
  candidate?: Person,
  application?: Applicant
): Effect.Effect<
  Review,
  HulyClientError | RecruitingReviewIdentifierAmbiguousError | RecruitingReviewNotFoundError
> =>
  Effect.gen(function*() {
    const byId = yield* client.findOne<Review>(
      recruitIds.class.Review,
      hulyQuery<Review>({ _id: toRef<Review>(identifier) })
    )
    if (byId !== undefined) {
      if (reviewMatchesFilters(byId, candidate, application)) return byId
      return yield* new ReviewMissing({ identifier })
    }

    const number = prefixedReviewNumber(identifier)
    const filters: StrictDocumentQuery<Review> = {
      ...(number === undefined ? { title: identifier } : { number }),
      ...(candidate === undefined ? {} : { attachedTo: toRef<Candidate>(candidate._id) }),
      ...(application === undefined ? {} : { application: application._id })
    }
    const reviews = yield* client.findAll<Review>(recruitIds.class.Review, hulyQuery(filters))
    if (reviews.length === 0) return yield* new ReviewMissing({ identifier })
    if (reviews.length > 1) {
      return yield* new ReviewAmbiguous({ identifier, matches: Count.make(reviews.length) })
    }
    return assertAt(reviews, 0)
  })

export const resolveReviewLocator = (
  client: HulyClient["Type"],
  params: GetRecruitingReviewParams | DeleteRecruitingReviewParams
) =>
  Effect.gen(function*() {
    const candidate = yield* optionalCandidate(client, params.candidate)
    const application = yield* optionalApplication(client, params.application, candidate)
    return yield* findReview(client, params.review, candidate, application)
  })

export const listRecruitingReviews = (
  params: ListRecruitingReviewsParams
): Effect.Effect<ListRecruitingReviewsResult, ReviewReadError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const candidate = yield* optionalCandidate(client, params.candidate)
    const application = yield* optionalApplication(client, params.application, candidate)
    const query: StrictDocumentQuery<Review> = {
      ...(candidate === undefined ? {} : { attachedTo: toRef<Candidate>(candidate._id) }),
      ...(application === undefined ? {} : { application: application._id }),
      ...(params.from === undefined ? {} : { date: { $gte: params.from } }),
      ...(params.to === undefined ? {} : { dueDate: { $lte: params.to } })
    }
    const reviews = yield* client.findAll<Review>(
      recruitIds.class.Review,
      hulyQuery(query),
      { sort: { date: SortingOrder.Descending } }
    )
    const limited = reviews.filter((review) => matchesReviewText(review, params.query)).slice(
      0,
      listLimit(params.limit)
    )
    const refs = yield* Effect.forEach(limited, (review) => reviewRefFromDoc(client, review))
    return { reviews: refs, total: Count.make(refs.length) }
  })

export const getRecruitingReview = (
  params: GetRecruitingReviewParams
): Effect.Effect<ReviewDetail, ReviewReadError, HulyClient | Diagnostics> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    return yield* reviewDetail(client, yield* resolveReviewLocator(client, params))
  })

const resolveParticipants = (
  client: HulyClient["Type"],
  params: CreateRecruitingReviewParams | UpdateRecruitingReviewParams
) =>
  params.participants === undefined
    ? Effect.succeed([toRef<Contact>(client.getPrimarySocialId())])
    : resolveParticipantLocators(client, params.participants)

export const createRecruitingReview = (
  params: CreateRecruitingReviewParams
): Effect.Effect<{ readonly review: ReviewRef }, ReviewWriteError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const person = yield* resolveCandidatePerson(client, params.candidate)
    yield* ensureCandidateMixin(client, person, {})
    const application = yield* optionalApplication(client, params.application, person)
    const company = params.company === undefined
      ? undefined
      : (yield* resolveOrganizationByIdentifier(client, params.company))._id
    const number = yield* incrementSequence(client, recruitIds.class.Review, "review")
    const reviewId = generateId<Review>()
    const data: AttachedData<Review> = {
      number,
      date: params.date,
      dueDate: params.dueDate ?? (params.date + DEFAULT_REVIEW_DURATION_MS),
      description: params.description === undefined
        ? ""
        : markdownToMarkupString(params.description, client.markupUrlConfig),
      verdict: params.verdict ?? "",
      title: params.title,
      participants: yield* resolveParticipants(client, params),
      company,
      application: application?._id,
      location: params.location ?? "",
      access: AccessLevel.Reader,
      allDay: false,
      eventId: "",
      calendar: reviewUiEmptyCalendar,
      user: client.getPrimarySocialId(),
      blockTime: false
    }
    yield* client.addCollection(
      recruitIds.class.Review,
      core.space.Workspace,
      person._id,
      recruitIds.mixin.Candidate,
      "reviews",
      data,
      reviewId
    )
    return {
      review: reviewRefFromCandidate(reviewId, number, data.title, person, yield* candidateEmail(client, person._id))
    }
  })

export const updateRecruitingReview = (
  params: UpdateRecruitingReviewParams
): Effect.Effect<{ readonly review: ReviewRef }, ReviewWriteError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const updateCollection = client.updateCollection
    if (updateCollection === undefined) {
      return yield* new RecruitingMutationUnsupportedError({ message: "Huly client does not support updateCollection" })
    }
    const candidate = yield* optionalCandidate(client, params.candidate)
    const applicationContext = yield* optionalApplication(client, params.applicationContext, candidate)
    const review = yield* findReview(client, params.review, candidate, applicationContext)
    const application = params.application === undefined
      ? undefined
      : params.application === null
      ? null
      : yield* optionalApplication(client, params.application)
    const company = params.company === undefined
      ? undefined
      : params.company === null
      ? null
      : (yield* resolveOrganizationByIdentifier(client, params.company))._id
    const direct: DocumentUpdate<Review> = {
      ...(params.title === undefined ? {} : { title: params.title }),
      ...(params.description === undefined ? {} : {
        description: params.description === null
          ? ""
          : markdownToMarkupString(params.description, client.markupUrlConfig)
      }),
      ...(params.verdict === undefined ? {} : { verdict: params.verdict ?? "" }),
      ...(params.date === undefined ? {} : { date: params.date }),
      ...(params.dueDate === undefined ? {} : { dueDate: params.dueDate }),
      ...(params.location === undefined ? {} : { location: params.location ?? "" }),
      ...(params.participants === undefined ? {} : { participants: yield* resolveParticipants(client, params) }),
      ...(application === undefined || application === null ? {} : { application: application._id }),
      ...(company === undefined || company === null ? {} : { company })
    }
    const unset = {
      ...(application === null ? { application: "" } : {}),
      ...(company === null ? { company: "" } : {})
    }
    const operations = Object.keys(unset).length === 0 ? direct : { ...direct, $unset: unset }
    yield* updateCollection(
      recruitIds.class.Review,
      review.space,
      review._id,
      review.attachedTo,
      recruitIds.mixin.Candidate,
      "reviews",
      operations
    )
    return { review: yield* reviewRefFromDoc(client, { ...review, ...direct }) }
  })

export const deleteRecruitingReview = (
  params: DeleteRecruitingReviewParams
): Effect.Effect<DeleteRecruitingReviewResult, ReviewWriteError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const removeCollection = client.removeCollection
    if (removeCollection === undefined) {
      return yield* new RecruitingMutationUnsupportedError({ message: "Huly client does not support removeCollection" })
    }
    const review = yield* resolveReviewLocator(client, params)
    const ref = yield* reviewRefFromDoc(client, review)
    yield* removeCollection(
      recruitIds.class.Review,
      review.space,
      review._id,
      review.attachedTo,
      recruitIds.mixin.Candidate,
      "reviews"
    )
    return { review: ref, deleted: true }
  })
