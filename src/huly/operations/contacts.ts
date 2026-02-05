import type {
  Channel,
  Employee as HulyEmployee,
  Organization as HulyOrganization,
  Person as HulyPerson
} from "@hcengineering/contact"
import { AvatarType } from "@hcengineering/contact"
import { type Data, type Doc, type DocumentUpdate, generateId, type Ref, SortingOrder } from "@hcengineering/core"
import { Effect } from "effect"

import { assertExists } from "../../utils/assertions.js"
import type {
  CreateOrganizationParams,
  CreatePersonParams,
  DeletePersonParams,
  EmployeeSummary,
  GetPersonParams,
  ListEmployeesParams,
  ListOrganizationsParams,
  ListPersonsParams,
  OrganizationSummary,
  Person,
  PersonSummary,
  UpdatePersonParams
} from "../../domain/schemas.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { PersonNotFoundError } from "../errors.js"

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports -- CJS interop
const contact = require("@hcengineering/contact").default as typeof import("@hcengineering/contact").default

export type ListPersonsError = HulyClientError
export type GetPersonError = HulyClientError | PersonNotFoundError
export type CreatePersonError = HulyClientError
export type UpdatePersonError = HulyClientError | PersonNotFoundError
export type DeletePersonError = HulyClientError | PersonNotFoundError
export type ListEmployeesError = HulyClientError
export type ListOrganizationsError = HulyClientError
export type CreateOrganizationError = HulyClientError

const formatName = (firstName: string, lastName: string): string => `${lastName},${firstName}`

const parseName = (name: string): { firstName: string; lastName: string } => {
  const parts = name.split(",")
  if (parts.length >= 2) {
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
      const personIdStr = String(channel.attachedTo)
      if (!emailMap.has(personIdStr)) {
        emailMap.set(personIdStr, channel.value)
      }
    }
    return emailMap
  })

export const listPersons = (
  params: ListPersonsParams
): Effect.Effect<Array<PersonSummary>, ListPersonsError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const limit = Math.min(params.limit ?? 50, 200)

    // Build query with search filters
    const query: Record<string, unknown> = {}

    // Apply name search using $like operator
    if (params.nameSearch !== undefined && params.nameSearch.trim() !== "") {
      query.name = { $like: `%${params.nameSearch}%` }
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

    // If emailSearch is provided, filter results by email
    let filteredPersons = [...persons]
    if (params.emailSearch !== undefined && params.emailSearch.trim() !== "") {
      const searchLower = params.emailSearch.toLowerCase()
      filteredPersons = persons.filter(person => {
        const email = emailMap.get(String(person._id))
        return email !== undefined && email.toLowerCase().includes(searchLower)
      })
    }

    return filteredPersons.map(person => ({
      id: String(person._id),
      name: person.name,
      city: person.city,
      email: emailMap.get(String(person._id)),
      modifiedOn: person.modifiedOn
    }))
  })

const findPersonById = (
  client: HulyClient["Type"],
  personId: string
): Effect.Effect<HulyPerson | undefined, HulyClientError> =>
  client.findOne<HulyPerson>(
    contact.class.Person,
    { _id: personId as Ref<HulyPerson> }
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
      { _id: channel.attachedTo as Ref<HulyPerson> }
    )
  })

export const getPerson = (
  params: GetPersonParams
): Effect.Effect<Person, GetPersonError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    let person: HulyPerson | undefined

    if (params.personId !== undefined) {
      person = yield* findPersonById(client, params.personId)
    } else if (params.email !== undefined) {
      person = yield* findPersonByEmail(client, params.email)
    }

    if (person === undefined) {
      return yield* new PersonNotFoundError({
        identifier: assertExists(
          params.personId ?? params.email,
          "personId or email required"
        )
      })
    }

    const channels = yield* client.findAll<Channel>(
      contact.class.Channel,
      {
        attachedTo: person._id,
        attachedToClass: contact.class.Person
      }
    )

    const { firstName, lastName } = parseName(person.name)
    const emailChannel = channels.find(c => c.provider === contact.channelProvider.Email)

    return {
      id: String(person._id),
      name: person.name,
      firstName,
      lastName,
      city: person.city,
      email: emailChannel?.value,
      channels: channels.map(c => ({
        provider: String(c.provider),
        value: c.value
      })),
      modifiedOn: person.modifiedOn,
      createdOn: person.createdOn
    }
  })

export interface CreatePersonResult {
  id: string
}

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

    return { id: String(personId) }
  })

export interface UpdatePersonResult {
  id: string
  updated: boolean
}

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
      return { id: params.personId, updated: false }
    }

    yield* client.updateDoc(
      contact.class.Person,
      contact.space.Contacts,
      person._id,
      updateOps
    )

    return { id: params.personId, updated: true }
  })

export interface DeletePersonResult {
  id: string
  deleted: boolean
}

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

    return { id: params.personId, deleted: true }
  })

export const listEmployees = (
  params: ListEmployeesParams
): Effect.Effect<Array<EmployeeSummary>, ListEmployeesError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const limit = Math.min(params.limit ?? 50, 200)

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

    return employees.map(emp => ({
      id: String(emp._id),
      name: emp.name,
      email: emailMap.get(String(emp._id)),
      position: emp.position ?? undefined,
      active: emp.active,
      modifiedOn: emp.modifiedOn
    }))
  })

export const listOrganizations = (
  params: ListOrganizationsParams
): Effect.Effect<Array<OrganizationSummary>, ListOrganizationsError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const limit = Math.min(params.limit ?? 50, 200)

    const orgs = yield* client.findAll<HulyOrganization>(
      contact.class.Organization,
      {},
      {
        limit,
        sort: { modifiedOn: SortingOrder.Descending }
      }
    )

    return orgs.map(org => ({
      id: String(org._id),
      name: org.name,
      city: org.city,
      members: org.members,
      modifiedOn: org.modifiedOn
    }))
  })

export interface CreateOrganizationResult {
  id: string
}

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
        let personId: Ref<HulyPerson> | undefined

        const byId = yield* findPersonById(client, memberRef)
        if (byId !== undefined) {
          personId = byId._id
        } else {
          const byEmail = yield* findPersonByEmail(client, memberRef)
          if (byEmail !== undefined) {
            personId = byEmail._id
          }
        }

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

    return { id: String(orgId) }
  })
