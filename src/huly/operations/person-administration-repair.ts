import type { Employee, Person, SocialIdentity } from "@hcengineering/contact"
import { buildSocialIdString, SocialIdType, type DocumentUpdate, type Space } from "@hcengineering/core"
import { Effect } from "effect"

import type {
  RepairPersonSocialIdentitiesParams,
  RepairPersonSocialIdentitiesResult,
  SocialIdentityId
} from "../../domain/schemas/person-administration.js"
import { Count, NonEmptyString } from "../../domain/schemas/shared.js"
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
import { toRef, toSocialIdentityRef } from "./sdk-boundary.js"
import {
  type AccountSocialIdentity,
  decodeAccountCurrentPerson,
  decodeAccountSocialIdentities,
  decodeResolvedEmployee,
  decodeWorkspaceSocialIdentitiesForRepair,
  type ResolvedPerson,
  type WorkspaceSocialIdentity
} from "./person-administration-boundaries.js"
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

const nativeSocialIdentityTypes: Record<AccountSocialIdentity["type"], SocialIdType> = {
  email: SocialIdType.EMAIL,
  github: SocialIdType.GITHUB,
  google: SocialIdType.GOOGLE,
  phone: SocialIdType.PHONE,
  oidc: SocialIdType.OIDC,
  huly: SocialIdType.HULY,
  telegram: SocialIdType.TELEGRAM,
  "huly-assistant": SocialIdType.HULY_ASSISTANT
}

const identityKey = (identity: AccountSocialIdentity): string =>
  buildSocialIdString({ type: nativeSocialIdentityTypes[identity.type], value: identity.value })

const activeIdentityDiffers = (identity: WorkspaceSocialIdentity, authoritative: AccountSocialIdentity): boolean =>
  identity.type !== authoritative.type ||
  identity.value !== authoritative.value ||
  identity.key !== identityKey(authoritative)

const identityRepairOperations = (
  identity: WorkspaceSocialIdentity,
  authoritative: AccountSocialIdentity,
  person: ResolvedPerson
): DocumentUpdate<SocialIdentity> => ({
  ...(identity.verifiedOn === undefined && authoritative.verifiedOn !== undefined
    ? { verifiedOn: authoritative.verifiedOn }
    : {}),
  ...(identity.attachedTo === person._id ? {} : { attachedTo: toRef<Person>(person._id) }),
  ...(authoritative.isDeleted === true && identity.isDeleted !== true
    ? { value: authoritative.value, key: authoritative.key, isDeleted: true }
    : {})
})

const existingIdentityDecision = (
  identity: WorkspaceSocialIdentity,
  authoritative: AccountSocialIdentity,
  person: ResolvedPerson
): ExistingIdentityDecision => {
  if (authoritative.isDeleted !== true && identity.isDeleted === true) {
    return {
      _tag: "unsupported",
      reason: NonEmptyString.make(
        "the workspace identity is deleted while the account identity is active; native repair does not reactivate identities"
      )
    }
  }
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

const repairAuthoritativeIdentity = Effect.fn("PersonAdministration.repairAuthoritativeIdentity")(function* (
  client: HulyClient["Service"],
  person: ResolvedPerson,
  globalIdentities: ReadonlyArray<WorkspaceSocialIdentity>,
  existing: WorkspaceSocialIdentity | undefined,
  social: AccountSocialIdentity
): Effect.fn.Return<IdentityRepairOutcome, HulyClientError> {
  if (existing !== undefined) {
    const decision = existingIdentityDecision(existing, social, person)
    if (decision._tag === "unsupported") return { _tag: "unsupported", identityId: social._id, reason: decision.reason }
    if (decision._tag === "unchanged") return decision
    yield* client.updateDoc(
      contact.class.SocialIdentity,
      toRef<Space>(existing.space),
      toSocialIdentityRef(existing._id),
      decision.operations
    )
    return { _tag: "updated" }
  }
  if (social.isDeleted === true) return { _tag: "unchanged" }
  const expectedKey = identityKey(social)
  if (globalIdentities.some((candidate) => candidate.key === social.key || candidate.key === expectedKey)) {
    return {
      _tag: "unsupported",
      identityId: social._id,
      reason: NonEmptyString.make("workspace identity key already exists under a different native identity ID")
    }
  }
  yield* client.addCollection(
    contact.class.SocialIdentity,
    contact.space.Contacts,
    toRef<Person>(person._id),
    contact.class.Person,
    "socialIds",
    {
      type: nativeSocialIdentityTypes[social.type],
      value: social.value,
      key: expectedKey,
      isDeleted: false,
      ...(social.displayValue == null ? {} : { displayValue: social.displayValue }),
      ...(social.verifiedOn === undefined ? {} : { verifiedOn: social.verifiedOn })
    },
    toSocialIdentityRef(social._id)
  )
  return { _tag: "created" }
})

export const repairPersonSocialIdentities = Effect.fn("PersonAdministration.repairSocialIdentities")(function* (
  params: RepairPersonSocialIdentitiesParams
): Effect.fn.Return<
  RepairPersonSocialIdentitiesResult,
  PersonAdministrationRepairError | PersonIdentityRepairUnsupportedError,
  HulyClient | WorkspaceClient
> {
  const client = yield* HulyClient
  const workspace = yield* WorkspaceClient
  const person = yield* resolvePersonAdministrationTarget(client, params.person)
  const employeeDto = yield* client.findOne<Employee>(
    contact.mixin.Employee,
    hulyQuery<Employee>({ _id: toRef<Employee>(person._id) })
  )
  const employee = yield* decodeResolvedEmployee(employeeDto)
  const personUuid = employee?.personUuid ?? person.personUuid
  if (personUuid === undefined) {
    return yield* new PersonIdentityRepairUnsupportedError({
      personId: person._id,
      reason: NonEmptyString.make(
        "the Person is not linked to an account personUuid, so no authoritative account identities exist"
      )
    })
  }
  const currentAccountPerson = yield* workspace.getCurrentPerson().pipe(Effect.flatMap(decodeAccountCurrentPerson))
  if (currentAccountPerson.uuid !== personUuid) {
    return yield* new PersonIdentityRepairUnsupportedError({
      personId: person._id,
      reason: NonEmptyString.make(
        "the account API only exposes authoritative identities for the authenticated person; this target belongs to another account"
      )
    })
  }
  const authoritativeSocials = yield* workspace
    .getCurrentSocialIds(true)
    .pipe(Effect.flatMap(decodeAccountSocialIdentities))
  const currentDtos = yield* client.findAll<SocialIdentity>(
    contact.class.SocialIdentity,
    hulyQuery<SocialIdentity>({ attachedTo: toRef<Person>(person._id) })
  )
  const current = yield* decodeWorkspaceSocialIdentitiesForRepair(currentDtos)
  const authoritativeIdSet = new Set(authoritativeSocials.map((social) => social._id))
  const authoritativeIds = authoritativeSocials.map((social) => toSocialIdentityRef(social._id))
  const authoritativeKeys = [...new Set(authoritativeSocials.flatMap((social) => [social.key, identityKey(social)]))]
  const globallyExistingByIdDtos =
    authoritativeIds.length === 0
      ? []
      : yield* client.findAll<SocialIdentity>(
          contact.class.SocialIdentity,
          hulyQuery<SocialIdentity>({ _id: { $in: authoritativeIds } })
        )
  const globallyExistingByKeyDtos =
    authoritativeKeys.length === 0
      ? []
      : yield* client.findAll<SocialIdentity>(
          contact.class.SocialIdentity,
          hulyQuery<SocialIdentity>({ key: { $in: authoritativeKeys } })
        )
  const globallyExistingById = yield* decodeWorkspaceSocialIdentitiesForRepair(globallyExistingByIdDtos)
  const globallyExistingByKey = yield* decodeWorkspaceSocialIdentitiesForRepair(globallyExistingByKeyDtos)
  const globalIdentities = [
    ...new Map([...globallyExistingById, ...globallyExistingByKey].map((identity) => [identity._id, identity])).values()
  ]
  const globallyExisting = globalIdentities.filter((identity) => authoritativeIdSet.has(identity._id))
  const existingById = new Map(globallyExisting.map((identity) => [identity._id, identity]))
  const outcomes = yield* Effect.forEach(authoritativeSocials, (social) =>
    repairAuthoritativeIdentity(client, person, globalIdentities, existingById.get(social._id), social)
  )
  const workspaceOnlyUnsupported = current
    .filter((identity) => !authoritativeIdSet.has(identity._id))
    .map((identity) => ({
      identityId: identity._id,
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
    personId: person._id,
    created: Count.make(outcomes.filter((outcome) => outcome._tag === "created").length),
    updated: Count.make(outcomes.filter((outcome) => outcome._tag === "updated").length),
    unchanged: Count.make(outcomes.filter((outcome) => outcome._tag === "unchanged").length),
    unsupported
  }
})
