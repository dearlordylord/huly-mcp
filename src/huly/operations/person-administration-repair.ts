import type { Employee, Person, SocialIdentity } from "@hcengineering/contact"
import { buildSocialIdString, type DocumentUpdate, type SocialId } from "@hcengineering/core"
import { Effect } from "effect"

import type {
  RepairPersonSocialIdentitiesParams,
  RepairPersonSocialIdentitiesResult,
  SocialIdentityId
} from "../../domain/schemas/person-administration.js"
import { SocialIdentityId as SocialIdentityIdSchema } from "../../domain/schemas/person-administration.js"
import { Count, NonEmptyString, PersonId } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import {
  type HulyDataInvalidError,
  type PersonIdentifierAmbiguousError,
  PersonIdentityRepairUnsupportedError,
  type PersonNotFoundError
} from "../errors.js"
import { contact } from "../huly-plugins.js"
import { WorkspaceClient } from "../workspace-client.js"
import { hulyQuery } from "./query-helpers.js"
import { toAccountUuid, toRef, toSocialIdentityRef } from "./sdk-boundary.js"
import { resolvePersonAdministrationTarget } from "./person-administration-shared.js"

type PersonAdministrationRepairError =
  | HulyClientError
  | HulyDataInvalidError
  | PersonIdentifierAmbiguousError
  | PersonNotFoundError
type ExistingIdentityDecision =
  | { readonly _tag: "unchanged" }
  | { readonly _tag: "updated"; readonly operations: DocumentUpdate<SocialIdentity> }
  | { readonly _tag: "unsupported"; readonly reason: NonEmptyString }

const activeIdentityDiffers = (identity: SocialIdentity, authoritative: SocialId): boolean =>
  identity.type !== authoritative.type ||
  identity.value !== authoritative.value ||
  identity.key !== buildSocialIdString(authoritative)

const identityRepairOperations = (
  identity: SocialIdentity,
  authoritative: SocialId,
  person: Person
): DocumentUpdate<SocialIdentity> => ({
  ...(identity.verifiedOn === undefined && authoritative.verifiedOn !== undefined
    ? { verifiedOn: authoritative.verifiedOn }
    : {}),
  ...(identity.attachedTo === person._id ? {} : { attachedTo: person._id }),
  ...(authoritative.isDeleted === true && identity.isDeleted !== true
    ? { value: authoritative.value, key: authoritative.key, isDeleted: true }
    : {})
})

const existingIdentityDecision = (
  identity: SocialIdentity,
  authoritative: SocialId,
  person: Person
): ExistingIdentityDecision => {
  if (identity.attachedTo !== person._id && identity.verifiedOn !== undefined) {
    return {
      _tag: "unsupported",
      reason: NonEmptyString.make("verified native identity is attached to another Person; reassignment is unsafe")
    }
  }
  if (authoritative.isDeleted !== true && activeIdentityDiffers(identity, authoritative)) {
    return {
      _tag: "unsupported",
      reason: NonEmptyString.make(
        "existing active identity differs from authoritative type, value, or key; arbitrary mutation is unsupported"
      )
    }
  }
  const operations = identityRepairOperations(identity, authoritative, person)
  return Object.keys(operations).length === 0 ? { _tag: "unchanged" } : { _tag: "updated", operations }
}

type IdentityRepairOutcome =
  | { readonly _tag: "created" }
  | { readonly _tag: "updated" }
  | { readonly _tag: "unchanged" }
  | { readonly _tag: "unsupported"; readonly identityId: SocialIdentityId; readonly reason: NonEmptyString }

const repairAuthoritativeIdentity = (
  client: HulyClient["Service"],
  person: Person,
  current: ReadonlyArray<SocialIdentity>,
  existing: SocialIdentity | undefined,
  social: SocialId
): Effect.Effect<IdentityRepairOutcome, HulyClientError> =>
  Effect.gen(function* () {
    if (existing !== undefined) {
      const decision = existingIdentityDecision(existing, social, person)
      if (decision._tag === "unsupported")
        return { _tag: "unsupported", identityId: SocialIdentityIdSchema.make(social._id), reason: decision.reason }
      if (decision._tag === "unchanged") return decision
      yield* client.updateDoc(contact.class.SocialIdentity, existing.space, existing._id, decision.operations)
      return { _tag: "updated" }
    }
    if (social.isDeleted === true) return { _tag: "unchanged" }
    const expectedKey = buildSocialIdString(social)
    if (current.some((candidate) => candidate.key === social.key || candidate.key === expectedKey)) {
      return {
        _tag: "unsupported",
        identityId: SocialIdentityIdSchema.make(social._id),
        reason: NonEmptyString.make("workspace identity key already exists under a different native identity ID")
      }
    }
    yield* client.addCollection(
      contact.class.SocialIdentity,
      contact.space.Contacts,
      person._id,
      contact.class.Person,
      "socialIds",
      {
        type: social.type,
        value: social.value,
        key: expectedKey,
        isDeleted: false,
        ...(social.displayValue === undefined ? {} : { displayValue: social.displayValue }),
        ...(social.verifiedOn === undefined ? {} : { verifiedOn: social.verifiedOn })
      },
      toSocialIdentityRef(social._id)
    )
    return { _tag: "created" }
  })

export const repairPersonSocialIdentities = (
  params: RepairPersonSocialIdentitiesParams
): Effect.Effect<
  RepairPersonSocialIdentitiesResult,
  PersonAdministrationRepairError | PersonIdentityRepairUnsupportedError,
  HulyClient | WorkspaceClient
> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const workspace = yield* WorkspaceClient
    const person = yield* resolvePersonAdministrationTarget(client, params.person)
    const employee = yield* client.findOne<Employee>(
      contact.mixin.Employee,
      hulyQuery<Employee>({ _id: toRef<Employee>(person._id) })
    )
    const personUuid = employee?.personUuid ?? person.personUuid
    if (personUuid === undefined) {
      return yield* new PersonIdentityRepairUnsupportedError({
        personId: PersonId.make(person._id),
        reason: NonEmptyString.make(
          "the Person is not linked to an account personUuid, so no authoritative account identities exist"
        )
      })
    }
    const accountPerson = yield* workspace.getPersonInfo(toAccountUuid(personUuid))
    const current = yield* client.findAll<SocialIdentity>(
      contact.class.SocialIdentity,
      hulyQuery<SocialIdentity>({ attachedTo: person._id })
    )
    const authoritativeSocials = accountPerson.socialIds
    const authoritativeIds = authoritativeSocials.map((social) => toSocialIdentityRef(social._id))
    const globallyExisting =
      authoritativeIds.length === 0
        ? []
        : yield* client.findAll<SocialIdentity>(
            contact.class.SocialIdentity,
            hulyQuery<SocialIdentity>({ _id: { $in: authoritativeIds } })
          )
    const existingById = new Map(globallyExisting.map((identity) => [identity._id, identity]))
    const outcomes = yield* Effect.forEach(authoritativeSocials, (social) =>
      repairAuthoritativeIdentity(client, person, current, existingById.get(toSocialIdentityRef(social._id)), social)
    )
    const authoritativeIdSet = new Set(authoritativeSocials.map((social) => social._id))
    const workspaceOnlyUnsupported = current
      .filter((identity) => !authoritativeIdSet.has(identity._id))
      .map((identity) => ({
        identityId: SocialIdentityIdSchema.make(identity._id),
        reason: NonEmptyString.make(
          "workspace identity is absent from the authoritative account record; removal is unsupported"
        )
      }))
    const unsupported = [
      ...outcomes.flatMap((outcome) =>
        outcome._tag === "unsupported" ? [{ identityId: outcome.identityId, reason: outcome.reason }] : []
      ),
      ...workspaceOnlyUnsupported
    ]
    return {
      personId: PersonId.make(person._id),
      created: Count.make(outcomes.filter((outcome) => outcome._tag === "created").length),
      updated: Count.make(outcomes.filter((outcome) => outcome._tag === "updated").length),
      unchanged: Count.make(outcomes.filter((outcome) => outcome._tag === "unchanged").length),
      unsupported
    }
  })
