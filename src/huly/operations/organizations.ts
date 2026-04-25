import type { MarkupRef } from "@hcengineering/api-client"
import type {
  Member as HulyMember,
  Organization as HulyOrganization,
  Person as HulyPerson
} from "@hcengineering/contact"
import { AvatarType } from "@hcengineering/contact"
import { type Data, type DocumentUpdate, generateId, type Ref, SortingOrder } from "@hcengineering/core"
import { Effect } from "effect"

import type {
  AddOrganizationChannelParams,
  AddOrganizationMemberParams,
  CreateOrganizationParams,
  DeleteOrganizationParams,
  GetOrganizationParams,
  ListOrganizationMembersParams,
  ListOrganizationsParams,
  OrganizationSummary,
  RemoveOrganizationMemberParams,
  UpdateOrganizationParams
} from "../../domain/schemas.js"
import type {
  CreateOrganizationResult,
  DeleteOrganizationResult,
  GetOrganizationResult,
  ListOrganizationMembersResult,
  OrganizationMemberEntry,
  RemoveOrganizationMemberResult,
  UpdateOrganizationResult
} from "../../domain/schemas/contacts.js"
import { Email, OrganizationId, PersonId, PersonName } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import {
  InvalidContactProviderError,
  OrganizationIdentifierAmbiguousError,
  OrganizationNotFoundError,
  PersonNotFoundError
} from "../errors.js"
import { contact } from "../huly-plugins.js"
import { leadClassIds } from "../lead-plugin.js"
import { batchGetEmailsForPersons, findPersonByEmail, findPersonById } from "./contacts-shared.js"
import { clampLimit } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

type ListOrganizationsError = HulyClientError
type CreateOrganizationError = HulyClientError | PersonNotFoundError
type GetOrganizationError = HulyClientError | OrganizationIdentifierAmbiguousError | OrganizationNotFoundError
type UpdateOrganizationError = HulyClientError | OrganizationIdentifierAmbiguousError | OrganizationNotFoundError
type DeleteOrganizationError = HulyClientError | OrganizationIdentifierAmbiguousError | OrganizationNotFoundError
type AddOrganizationChannelError =
  | HulyClientError
  | InvalidContactProviderError
  | OrganizationIdentifierAmbiguousError
  | OrganizationNotFoundError
type AddOrganizationMemberError =
  | HulyClientError
  | OrganizationIdentifierAmbiguousError
  | OrganizationNotFoundError
  | PersonNotFoundError
type RemoveOrganizationMemberError =
  | HulyClientError
  | OrganizationIdentifierAmbiguousError
  | OrganizationNotFoundError
  | PersonNotFoundError

const findOrganizationByIdentifier = (
  client: HulyClient["Type"],
  identifier: string
): Effect.Effect<
  HulyOrganization | undefined,
  HulyClientError | OrganizationIdentifierAmbiguousError
> =>
  Effect.gen(function*() {
    const byId = yield* client.findOne<HulyOrganization>(
      contact.class.Organization,
      { _id: toRef<HulyOrganization>(identifier) }
    )
    if (byId !== undefined) return byId

    const byName = yield* client.findAll<HulyOrganization>(
      contact.class.Organization,
      { name: identifier }
    )

    if (byName.length === 0) {
      return undefined
    }

    if (byName.length > 1) {
      return yield* new OrganizationIdentifierAmbiguousError({
        identifier,
        matches: byName.length
      })
    }

    return byName[0]
  })

const resolvePersonIdentifier = (
  client: HulyClient["Type"],
  identifier: string
): Effect.Effect<HulyPerson, HulyClientError | PersonNotFoundError> =>
  Effect.gen(function*() {
    const person = (yield* findPersonById(client, identifier))
      ?? (yield* findPersonByEmail(client, identifier))

    if (person === undefined) {
      return yield* new PersonNotFoundError({ identifier })
    }

    return person
  })

const resolvePersonIdentifiers = (
  client: HulyClient["Type"],
  identifiers: ReadonlyArray<string>
): Effect.Effect<Array<Ref<HulyPerson>>, HulyClientError | PersonNotFoundError> =>
  Effect.gen(function*() {
    const resolvedPeople: Array<HulyPerson> = []

    for (const identifier of identifiers) {
      resolvedPeople.push(yield* resolvePersonIdentifier(client, identifier))
    }

    return Array.from(new Set(resolvedPeople.map(person => person._id)))
  })

const findOrganizationMemberships = (
  client: HulyClient["Type"],
  organizationId: Ref<HulyOrganization>,
  personId: Ref<HulyPerson>
): Effect.Effect<Array<HulyMember>, HulyClientError> =>
  client.findAll<HulyMember>(
    contact.class.Member,
    { attachedTo: organizationId, contact: personId }
  )

export const listOrganizations = (
  params: ListOrganizationsParams
): Effect.Effect<Array<OrganizationSummary>, ListOrganizationsError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const limit = clampLimit(params.limit)

    const orgs = yield* client.findAll<HulyOrganization>(
      contact.class.Organization,
      {},
      {
        limit,
        sort: { modifiedOn: SortingOrder.Descending }
      }
    )

    return orgs.map(org => ({
      id: OrganizationId.make(org._id),
      name: org.name,
      city: org.city,
      members: org.members,
      modifiedOn: org.modifiedOn
    }))
  })

export const createOrganization = (
  params: CreateOrganizationParams
): Effect.Effect<CreateOrganizationResult, CreateOrganizationError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const orgId = generateId<HulyOrganization>()
    const memberPersonIds = params.members !== undefined && params.members.length > 0
      ? yield* resolvePersonIdentifiers(client, params.members)
      : []

    const orgData: Data<HulyOrganization> = {
      name: params.name,
      city: "",
      members: 0,
      description: null,
      avatarType: AvatarType.COLOR
    }

    yield* client.createDoc(
      contact.class.Organization,
      contact.space.Contacts,
      orgData,
      orgId
    )

    if (memberPersonIds.length > 0) {
      for (const personId of memberPersonIds) {
        yield* client.addCollection(
          contact.class.Member,
          contact.space.Contacts,
          orgId,
          contact.class.Organization,
          "members",
          { contact: personId }
        )
      }
    }

    return { id: OrganizationId.make(orgId) }
  })

export const getOrganization = (
  params: GetOrganizationParams
): Effect.Effect<GetOrganizationResult, GetOrganizationError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const org = yield* findOrganizationByIdentifier(client, params.identifier)
    if (org === undefined) {
      return yield* new OrganizationNotFoundError({ identifier: params.identifier })
    }

    // description on Organization is a MarkupBlobRef (rich text stored separately).
    /* eslint-disable no-restricted-syntax -- SDK boundary: Huly types Organization.description as MarkupBlobRef, fetchMarkup wants MarkupRef; both are opaque ID strings. */
    const descriptionText = org.description !== null
      ? yield* client.fetchMarkup(
        contact.class.Organization,
        org._id,
        "description",
        org.description as unknown as MarkupRef,
        "markdown"
      )
      : undefined
    /* eslint-enable no-restricted-syntax */

    return {
      id: OrganizationId.make(org._id),
      name: org.name,
      city: org.city || undefined,
      description: descriptionText,
      members: org.members,
      modifiedOn: org.modifiedOn
    }
  })

export const updateOrganization = (
  params: UpdateOrganizationParams
): Effect.Effect<UpdateOrganizationResult, UpdateOrganizationError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const org = yield* findOrganizationByIdentifier(client, params.identifier)
    if (org === undefined) {
      return yield* new OrganizationNotFoundError({ identifier: params.identifier })
    }

    const updateOps: DocumentUpdate<HulyOrganization> = {}

    if (params.name !== undefined) {
      updateOps.name = params.name
    }
    if (params.city !== undefined) {
      updateOps.city = params.city === null ? "" : params.city
    }
    const descriptionUpdatedInPlace = yield* Effect.gen(function*() {
      if (params.description === undefined) return false
      if (params.description === null || params.description === "") {
        updateOps.description = null
        return false
      }
      if (org.description !== null) {
        yield* client.updateMarkup(contact.class.Organization, org._id, "description", params.description, "markdown")
        return true
      }
      updateOps.description = yield* client.uploadMarkup(
        contact.class.Organization,
        org._id,
        "description",
        params.description,
        "markdown"
      )
      return false
    })

    if (Object.keys(updateOps).length === 0 && !descriptionUpdatedInPlace) {
      return { id: OrganizationId.make(org._id), updated: false }
    }

    yield* client.updateDoc(
      contact.class.Organization,
      contact.space.Contacts,
      org._id,
      updateOps
    )

    return { id: OrganizationId.make(org._id), updated: true }
  })

export const deleteOrganization = (
  params: DeleteOrganizationParams
): Effect.Effect<DeleteOrganizationResult, DeleteOrganizationError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const org = yield* findOrganizationByIdentifier(client, params.identifier)
    if (org === undefined) {
      return yield* new OrganizationNotFoundError({ identifier: params.identifier })
    }

    yield* client.removeDoc(
      contact.class.Organization,
      contact.space.Contacts,
      org._id
    )

    return { id: OrganizationId.make(org._id), deleted: true }
  })

/**
 * Apply the lead:mixin:Customer mixin to an organization so it appears
 * in the Huly Leads > Customers view. Idempotent.
 */
export const makeOrganizationCustomer = (
  params: GetOrganizationParams
): Effect.Effect<{ id: OrganizationId; applied: boolean }, GetOrganizationError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const org = yield* findOrganizationByIdentifier(client, params.identifier)
    if (org === undefined) {
      return yield* new OrganizationNotFoundError({ identifier: params.identifier })
    }

    // eslint-disable-next-line no-restricted-syntax -- SDK boundary: mixin check uses string key lookup
    const alreadyCustomer = (org as unknown as Record<string, unknown>)[leadClassIds.mixin.Customer] !== undefined

    if (alreadyCustomer) {
      return { id: OrganizationId.make(org._id), applied: false }
    }

    yield* client.createMixin(
      org._id,
      contact.class.Organization,
      contact.space.Contacts,
      leadClassIds.mixin.Customer,
      {}
    )

    return { id: OrganizationId.make(org._id), applied: true }
  })

// Maps user-friendly names to Huly contact.channelProvider refs.
const CHANNEL_PROVIDERS: Partial<Record<string, typeof contact.channelProvider.Email>> = {
  email: contact.channelProvider.Email,
  phone: contact.channelProvider.Phone,
  linkedin: contact.channelProvider.LinkedIn,
  twitter: contact.channelProvider.Twitter,
  github: contact.channelProvider.GitHub,
  facebook: contact.channelProvider.Facebook,
  telegram: contact.channelProvider.Telegram,
  homepage: contact.channelProvider.Homepage
}

export const addOrganizationChannel = (
  params: AddOrganizationChannelParams
): Effect.Effect<{ id: OrganizationId; added: boolean }, AddOrganizationChannelError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const org = yield* findOrganizationByIdentifier(client, params.organizationId)
    if (org === undefined) {
      return yield* new OrganizationNotFoundError({ identifier: params.organizationId })
    }

    const providerKey = params.provider.toLowerCase()
    const providerRef = CHANNEL_PROVIDERS[providerKey] ?? undefined
    if (providerRef === undefined) {
      return yield* new InvalidContactProviderError({ provider: params.provider })
    }

    yield* client.addCollection(
      contact.class.Channel,
      contact.space.Contacts,
      org._id,
      contact.class.Organization,
      "channels",
      { provider: providerRef, value: params.value }
    )

    return { id: OrganizationId.make(org._id), added: true }
  })

export const addOrganizationMember = (
  params: AddOrganizationMemberParams
): Effect.Effect<{ id: OrganizationId; added: boolean }, AddOrganizationMemberError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const org = yield* findOrganizationByIdentifier(client, params.organizationId)
    if (org === undefined) {
      return yield* new OrganizationNotFoundError({ identifier: params.organizationId })
    }

    const person = yield* resolvePersonIdentifier(client, params.personIdentifier)
    const existingMemberships = yield* findOrganizationMemberships(client, org._id, person._id)

    if (existingMemberships.length > 0) {
      return { id: OrganizationId.make(org._id), added: false }
    }

    yield* client.addCollection(
      contact.class.Member,
      contact.space.Contacts,
      org._id,
      contact.class.Organization,
      "members",
      { contact: person._id }
    )

    return { id: OrganizationId.make(org._id), added: true }
  })

export const listOrganizationMembers = (
  params: ListOrganizationMembersParams
): Effect.Effect<ListOrganizationMembersResult, GetOrganizationError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const org = yield* findOrganizationByIdentifier(client, params.organizationId)
    if (org === undefined) {
      return yield* new OrganizationNotFoundError({ identifier: params.organizationId })
    }

    const members = yield* client.findAll<HulyMember>(
      contact.class.Member,
      { attachedTo: org._id }
    )

    if (members.length === 0) {
      return { organizationId: OrganizationId.make(org._id), members: [] }
    }

    const personIds = [...new Set(members.map(m => toRef<HulyPerson>(m.contact)))]
    const persons = yield* client.findAll<HulyPerson>(
      contact.class.Person,
      { _id: { $in: personIds } }
    )

    const emails = yield* batchGetEmailsForPersons(client, personIds)

    const entries: Array<OrganizationMemberEntry> = persons.map(p => {
      const email = emails.get(p._id)
      return {
        personId: PersonId.make(p._id),
        name: PersonName.make(p.name),
        email: email !== undefined ? Email.make(email) : undefined
      }
    })

    return {
      organizationId: OrganizationId.make(org._id),
      members: entries
    }
  })

export const removeOrganizationMember = (
  params: RemoveOrganizationMemberParams
): Effect.Effect<RemoveOrganizationMemberResult, RemoveOrganizationMemberError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const org = yield* findOrganizationByIdentifier(client, params.organizationId)
    if (org === undefined) {
      return yield* new OrganizationNotFoundError({ identifier: params.organizationId })
    }

    const person = yield* resolvePersonIdentifier(client, params.personIdentifier)

    const memberDocs = yield* findOrganizationMemberships(client, org._id, person._id)

    if (memberDocs.length === 0) {
      return { id: OrganizationId.make(org._id), removed: false }
    }

    for (const memberDoc of memberDocs) {
      yield* client.removeDoc(
        contact.class.Member,
        contact.space.Contacts,
        memberDoc._id
      )
    }

    return { id: OrganizationId.make(org._id), removed: true }
  })
