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
  type DocumentQuery,
  type DocumentUpdate,
  generateId,
  type Ref,
  SortingOrder
} from "@hcengineering/core"
import { Effect } from "effect"

import type {
  CreatePersonParams,
  DeletePersonParams,
  EmployeeSummary,
  GetPersonParams,
  ListEmployeesParams,
  ListPersonOrganizationsParams,
  ListPersonsParams,
  OrganizationMembershipSummary,
  Person,
  PersonSummary,
  UpdatePersonParams
} from "../../domain/schemas.js"
import type {
  CreatePersonResult,
  DeletePersonResult,
  ListPersonOrganizationsResult,
  UpdatePersonResult
} from "../../domain/schemas/contacts.js"
import { ContactProvider, Email, OrganizationId, PersonId, PersonName } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { PersonNotFoundError } from "../errors.js"
import { contact } from "../huly-plugins.js"
import { batchGetEmailsForPersons, findPersonByEmail, findPersonById } from "./contacts-shared.js"
import { clampLimit, escapeLikeWildcards } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

type ListPersonsError = HulyClientError
type GetPersonError = HulyClientError | PersonNotFoundError
type CreatePersonError = HulyClientError
type UpdatePersonError = HulyClientError | PersonNotFoundError
type DeletePersonError = HulyClientError | PersonNotFoundError
type ListEmployeesError = HulyClientError

const formatName = (firstName: string, lastName: string): string => `${lastName},${firstName}`

const parseName = (name: string): { firstName: string; lastName: string } => {
  const parts = name.split(",")
  const FIRST_LAST_PARTS = 2
  if (parts.length >= FIRST_LAST_PARTS) {
    return { lastName: parts[0], firstName: parts.slice(1).join(",") }
  }
  return { firstName: name, lastName: "" }
}

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
