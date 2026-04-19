/* eslint-disable max-lines -- Contacts module covers Persons, Employees, and Organizations which share helpers and plugin imports. Splitting would duplicate imports for marginal gain. */
import type { MarkupRef } from "@hcengineering/api-client"
import type {
  Channel,
  Employee as HulyEmployee,
  Member as HulyMember,
  Organization as HulyOrganization,
  Person as HulyPerson
} from "@hcengineering/contact"
import { AvatarType } from "@hcengineering/contact"
import {
  type Data,
  type Doc,
  type DocumentQuery,
  type DocumentUpdate,
  generateId,
  type MarkupBlobRef,
  type Ref,
  SortingOrder
} from "@hcengineering/core"
import { Effect } from "effect"

import type {
  AddOrganizationChannelParams,
  AddOrganizationMemberParams,
  CreateOrganizationParams,
  CreatePersonParams,
  DeleteOrganizationParams,
  DeletePersonParams,
  EmployeeSummary,
  GetOrganizationParams,
  GetPersonParams,
  ListEmployeesParams,
  ListOrganizationMembersParams,
  ListOrganizationsParams,
  ListPersonOrganizationsParams,
  ListPersonsParams,
  OrganizationMembershipSummary,
  OrganizationSummary,
  Person,
  PersonSummary,
  RemoveOrganizationMemberParams,
  UpdateOrganizationParams,
  UpdatePersonParams
} from "../../domain/schemas.js"
import type {
  CreateOrganizationResult,
  CreatePersonResult,
  DeleteOrganizationResult,
  DeletePersonResult,
  GetOrganizationResult,
  ListOrganizationMembersResult,
  ListPersonOrganizationsResult,
  OrganizationMemberEntry,
  RemoveOrganizationMemberResult,
  UpdateOrganizationResult,
  UpdatePersonResult
} from "../../domain/schemas/contacts.js"
import { ContactProvider, Email, OrganizationId, PersonId, PersonName } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { InvalidContactProviderError, OrganizationNotFoundError, PersonNotFoundError } from "../errors.js"
import { escapeLikeWildcards } from "./query-helpers.js"
import { clampLimit, toRef } from "./shared.js"

import { contact } from "../huly-plugins.js"
import { leadClassIds } from "../lead-plugin.js"

type ListPersonsError = HulyClientError
type GetPersonError = HulyClientError | PersonNotFoundError
type CreatePersonError = HulyClientError
type UpdatePersonError = HulyClientError | PersonNotFoundError
type DeletePersonError = HulyClientError | PersonNotFoundError
type ListEmployeesError = HulyClientError
type ListOrganizationsError = HulyClientError
type CreateOrganizationError = HulyClientError
type GetOrganizationError = HulyClientError | OrganizationNotFoundError
type UpdateOrganizationError = HulyClientError | OrganizationNotFoundError
type DeleteOrganizationError = HulyClientError | OrganizationNotFoundError
type AddOrganizationChannelError = HulyClientError | InvalidContactProviderError | OrganizationNotFoundError
type AddOrganizationMemberError = HulyClientError | OrganizationNotFoundError | PersonNotFoundError
type RemoveOrganizationMemberError = HulyClientError | OrganizationNotFoundError | PersonNotFoundError

const formatName = (firstName: string, lastName: string): string => `${lastName},${firstName}`

const parseName = (name: string): { firstName: string; lastName: string } => {
  const parts = name.split(",")
  const FIRST_LAST_PARTS = 2
  if (parts.length >= FIRST_LAST_PARTS) {
    return { lastName: parts[0], firstName: parts.slice(1).join(",") }
  }
  return { firstName: name, lastName: "" }
}

const batchGetEmailsForPersons = <T extends Doc>(
  client: HulyClient["Type"],
  personIds: Array<Ref<T>>
): Effect.Effect<Map<string, string>, HulyClientError> =>
  Effect.gen(function*() {
    if (personIds.length === 0) {
      return new Map()
    }

    const channels = yield* client.findAll<Channel>(
      contact.class.Channel,
      {
        attachedTo: { $in: personIds },
        provider: contact.channelProvider.Email
      }
    )

    const emailMap = new Map<string, string>()
    for (const channel of channels) {
      if (!emailMap.has(channel.attachedTo)) {
        emailMap.set(channel.attachedTo, channel.value)
      }
    }
    return emailMap
  })

const findPersonIdsByEmail = (
  client: HulyClient["Type"],
  emailSearch: string
): Effect.Effect<Array<Ref<HulyPerson>>, HulyClientError> =>
  Effect.gen(function*() {
    const channels = yield* client.findAll<Channel>(
      contact.class.Channel,
      {
        provider: contact.channelProvider.Email,
        value: { $like: `%${escapeLikeWildcards(emailSearch)}%` }
      }
    )
    return channels.map(c => toRef<HulyPerson>(c.attachedTo))
  })

export const listPersons = (
  params: ListPersonsParams
): Effect.Effect<Array<PersonSummary>, ListPersonsError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const limit = clampLimit(params.limit)
    const emailSearch = params.emailSearch?.trim()

    const query: DocumentQuery<HulyPerson> = {}

    if (params.nameSearch !== undefined && params.nameSearch.trim() !== "") {
      query.name = { $like: `%${escapeLikeWildcards(params.nameSearch)}%` }
    }

    if (params.nameRegex !== undefined && params.nameRegex.trim() !== "") {
      query.name = { $regex: params.nameRegex }
    }

    if (emailSearch !== undefined && emailSearch !== "") {
      const matchingPersonIds = yield* findPersonIdsByEmail(client, emailSearch)
      if (matchingPersonIds.length === 0) {
        return []
      }
      query._id = { $in: matchingPersonIds }
    }

    const persons = yield* client.findAll<HulyPerson>(
      contact.class.Person,
      query,
      {
        limit,
        sort: { modifiedOn: SortingOrder.Descending }
      }
    )

    const personIds = persons.map(p => p._id)
    const emailMap = yield* batchGetEmailsForPersons(client, personIds)

    return persons.map(person => {
      const emailValue = emailMap.get(person._id)
      return {
        id: PersonId.make(person._id),
        name: PersonName.make(person.name),
        city: person.city,
        email: emailValue !== undefined ? Email.make(emailValue) : undefined,
        modifiedOn: person.modifiedOn
      }
    })
  })

const findPersonById = (
  client: HulyClient["Type"],
  personId: string
): Effect.Effect<HulyPerson | undefined, HulyClientError> =>
  client.findOne<HulyPerson>(
    contact.class.Person,
    { _id: toRef<HulyPerson>(personId) }
  )

const findPersonByEmail = (
  client: HulyClient["Type"],
  email: string
): Effect.Effect<HulyPerson | undefined, HulyClientError> =>
  Effect.gen(function*() {
    const channels = yield* client.findAll<Channel>(
      contact.class.Channel,
      {
        value: email,
        provider: contact.channelProvider.Email
      }
    )

    if (channels.length === 0) {
      return undefined
    }

    const channel = channels[0]
    return yield* client.findOne<HulyPerson>(
      contact.class.Person,
      { _id: toRef<HulyPerson>(channel.attachedTo) }
    )
  })

export const getPerson = (
  params: GetPersonParams
): Effect.Effect<Person, GetPersonError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const person: HulyPerson | undefined = "personId" in params
      ? yield* findPersonById(client, params.personId)
      : yield* findPersonByEmail(client, params.email)

    if (person === undefined) {
      const identifier = "personId" in params ? params.personId : params.email
      return yield* new PersonNotFoundError({ identifier })
    }

    const channels = yield* client.findAll<Channel>(
      contact.class.Channel,
      {
        attachedTo: person._id,
        attachedToClass: contact.class.Person
      }
    )

    const organizations = yield* findOrganizationsForPerson(client, person._id)

    const { firstName, lastName } = parseName(person.name)
    const emailChannel = channels.find(c => c.provider === contact.channelProvider.Email)

    return {
      id: PersonId.make(person._id),
      name: PersonName.make(person.name),
      firstName,
      lastName,
      city: person.city,
      email: emailChannel?.value !== undefined ? Email.make(emailChannel.value) : undefined,
      channels: channels.map(c => ({
        provider: ContactProvider.make(c.provider),
        value: c.value
      })),
      organizations: organizations.length > 0 ? organizations : undefined,
      modifiedOn: person.modifiedOn,
      createdOn: person.createdOn
    }
  })

/**
 * Find all organizations that a person is a member of.
 */
const findOrganizationsForPerson = (
  client: HulyClient["Type"],
  personId: Ref<HulyPerson>
): Effect.Effect<Array<OrganizationMembershipSummary>, HulyClientError> =>
  Effect.gen(function*() {
    const members = yield* client.findAll<HulyMember>(
      contact.class.Member,
      { contact: personId }
    )

    if (members.length === 0) {
      return []
    }

    const orgIds = [...new Set(members.map(m => toRef<HulyOrganization>(m.attachedTo)))]
    const orgs = yield* client.findAll<HulyOrganization>(
      contact.class.Organization,
      { _id: { $in: orgIds } }
    )

    return orgs.map(org => ({
      id: OrganizationId.make(org._id),
      name: org.name
    }))
  })

export const createPerson = (
  params: CreatePersonParams
): Effect.Effect<CreatePersonResult, CreatePersonError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const personId = generateId<HulyPerson>()

    const personData: Data<HulyPerson> = {
      name: formatName(params.firstName, params.lastName),
      // Huly API requires city field to be set, even if empty
      city: params.city ?? "",
      avatarType: AvatarType.COLOR
    }

    yield* client.createDoc(
      contact.class.Person,
      contact.space.Contacts,
      personData,
      personId
    )

    if (params.email !== undefined && params.email.trim() !== "") {
      yield* client.addCollection(
        contact.class.Channel,
        contact.space.Contacts,
        personId,
        contact.class.Person,
        "channels",
        {
          provider: contact.channelProvider.Email,
          value: params.email
        }
      )
    }

    return { id: PersonId.make(personId) }
  })

export const updatePerson = (
  params: UpdatePersonParams
): Effect.Effect<UpdatePersonResult, UpdatePersonError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const person = yield* findPersonById(client, params.personId)
    if (person === undefined) {
      return yield* new PersonNotFoundError({ identifier: params.personId })
    }

    const updateOps: DocumentUpdate<HulyPerson> = {}

    if (params.firstName !== undefined || params.lastName !== undefined) {
      const { firstName: currentFirst, lastName: currentLast } = parseName(person.name)
      const newFirst = params.firstName ?? currentFirst
      const newLast = params.lastName ?? currentLast
      updateOps.name = formatName(newFirst, newLast)
    }

    if (params.city !== undefined) {
      updateOps.city = params.city === null ? "" : params.city
    }

    if (Object.keys(updateOps).length === 0) {
      return { id: PersonId.make(params.personId), updated: false }
    }

    yield* client.updateDoc(
      contact.class.Person,
      contact.space.Contacts,
      person._id,
      updateOps
    )

    return { id: PersonId.make(params.personId), updated: true }
  })

export const deletePerson = (
  params: DeletePersonParams
): Effect.Effect<DeletePersonResult, DeletePersonError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const person = yield* findPersonById(client, params.personId)
    if (person === undefined) {
      return yield* new PersonNotFoundError({ identifier: params.personId })
    }

    yield* client.removeDoc(
      contact.class.Person,
      contact.space.Contacts,
      person._id
    )

    return { id: PersonId.make(params.personId), deleted: true }
  })

export const listEmployees = (
  params: ListEmployeesParams
): Effect.Effect<Array<EmployeeSummary>, ListEmployeesError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const limit = clampLimit(params.limit)

    const employees = yield* client.findAll<HulyEmployee>(
      contact.mixin.Employee,
      {},
      {
        limit,
        sort: { modifiedOn: SortingOrder.Descending }
      }
    )

    const employeeIds = employees.map(e => e._id)
    const emailMap = yield* batchGetEmailsForPersons(client, employeeIds)

    return employees.map(emp => {
      const emailValue = emailMap.get(emp._id)
      return {
        id: PersonId.make(emp._id),
        name: PersonName.make(emp.name),
        email: emailValue !== undefined ? Email.make(emailValue) : undefined,
        position: emp.position ?? undefined,
        active: emp.active,
        modifiedOn: emp.modifiedOn
      }
    })
  })

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

    if (params.members !== undefined && params.members.length > 0) {
      for (const memberRef of params.members) {
        const personId = (yield* findPersonById(client, memberRef))?._id
          ?? (yield* findPersonByEmail(client, memberRef))?._id

        if (personId !== undefined) {
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
    }

    return { id: OrganizationId.make(orgId) }
  })

/**
 * Find an organization by ID or exact name.
 */
const findOrganizationByIdentifier = (
  client: HulyClient["Type"],
  identifier: string
): Effect.Effect<HulyOrganization | undefined, HulyClientError> =>
  Effect.gen(function*() {
    // Try by ID first
    const byId = yield* client.findOne<HulyOrganization>(
      contact.class.Organization,
      { _id: toRef<HulyOrganization>(identifier) }
    )
    if (byId !== undefined) return byId
    // Fall back to exact name match
    return yield* client.findOne<HulyOrganization>(
      contact.class.Organization,
      { name: identifier }
    )
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
    // Fetch the markdown content if present.
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
    if (params.description !== undefined) {
      // Description is rich-text stored as MarkupBlobRef.
      // Upload markdown and attach the resulting ref.
      if (params.description === null || params.description === "") {
        updateOps.description = null
      } else {
        const markupRef: MarkupBlobRef = yield* client.uploadMarkup(
          contact.class.Organization,
          org._id,
          "description",
          params.description,
          "markdown"
        )
        updateOps.description = markupRef
      }
    }

    if (Object.keys(updateOps).length === 0) {
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
 * in the Huly Leads > Customers view. Idempotent - safe to call on
 * orgs that already have the mixin.
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

    // Check if mixin is already applied by looking for the mixin key on the doc
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

// --- Channel Providers ---
// Maps user-friendly names to Huly contact.channelProvider refs
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

/**
 * Add a channel (phone, email, website, LinkedIn, etc.) to an organization.
 * Does NOT check for duplicates - caller should verify beforehand if needed.
 */
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

/**
 * Link a person as a member of an organization.
 */
export const addOrganizationMember = (
  params: AddOrganizationMemberParams
): Effect.Effect<{ id: OrganizationId; added: boolean }, AddOrganizationMemberError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const org = yield* findOrganizationByIdentifier(client, params.organizationId)
    if (org === undefined) {
      return yield* new OrganizationNotFoundError({ identifier: params.organizationId })
    }

    const person = (yield* findPersonById(client, params.personIdentifier))
      ?? (yield* findPersonByEmail(client, params.personIdentifier))

    if (person === undefined) {
      return yield* new PersonNotFoundError({ identifier: params.personIdentifier })
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

/**
 * List all persons who are members of an organization.
 */
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

/**
 * List all organizations a person is a member of.
 */
export const listPersonOrganizations = (
  params: ListPersonOrganizationsParams
): Effect.Effect<ListPersonOrganizationsResult, GetPersonError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const person: HulyPerson | undefined = "personId" in params
      ? yield* findPersonById(client, params.personId)
      : yield* findPersonByEmail(client, params.email)

    if (person === undefined) {
      const identifier = "personId" in params ? params.personId : params.email
      return yield* new PersonNotFoundError({ identifier })
    }

    const organizations = yield* findOrganizationsForPerson(client, person._id)

    return {
      personId: PersonId.make(person._id),
      organizations
    }
  })

/**
 * Remove a person from an organization's members.
 */
export const removeOrganizationMember = (
  params: RemoveOrganizationMemberParams
): Effect.Effect<RemoveOrganizationMemberResult, RemoveOrganizationMemberError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const org = yield* findOrganizationByIdentifier(client, params.organizationId)
    if (org === undefined) {
      return yield* new OrganizationNotFoundError({ identifier: params.organizationId })
    }

    const person = (yield* findPersonById(client, params.personIdentifier))
      ?? (yield* findPersonByEmail(client, params.personIdentifier))

    if (person === undefined) {
      return yield* new PersonNotFoundError({ identifier: params.personIdentifier })
    }

    const memberDocs = yield* client.findAll<HulyMember>(
      contact.class.Member,
      { attachedTo: org._id, contact: person._id }
    )

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
