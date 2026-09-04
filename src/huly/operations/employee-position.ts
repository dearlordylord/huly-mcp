import type { Employee as HulyEmployee, Person as HulyPerson } from "@hcengineering/contact"
import { Effect } from "effect"

import type {
  EmployeeLocator,
  SetEmployeePositionParams,
  SetEmployeePositionResult
} from "../../domain/schemas/contacts.js"
import { PersonId } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { PersonIdentifierAmbiguousError, PersonNotAnEmployeeError, PersonNotFoundError } from "../errors.js"
import { contact } from "../huly-plugins.js"
import { findPersonByExactEmail, findPersonByExactName } from "./contacts-shared.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

type SetEmployeePositionError =
  | HulyClientError
  | PersonIdentifierAmbiguousError
  | PersonNotAnEmployeeError
  | PersonNotFoundError

type EmployeeTextLocator =
  | Extract<EmployeeLocator, { readonly email: string }>["email"]
  | Extract<EmployeeLocator, { readonly name: string }>["name"]

const resolveEmployeeByTextLocator = <T extends EmployeeTextLocator>(
  client: HulyClient["Service"],
  identifier: T,
  resolvePerson: (
    client: HulyClient["Service"],
    identifier: T
  ) => Effect.Effect<HulyPerson | undefined, HulyClientError | PersonIdentifierAmbiguousError>
): Effect.Effect<HulyEmployee, SetEmployeePositionError> =>
  Effect.gen(function* () {
    const person = yield* resolvePerson(client, identifier)
    if (person === undefined) {
      return yield* new PersonNotFoundError({ identifier })
    }

    const employee = yield* client.findOne<HulyEmployee>(
      contact.mixin.Employee,
      hulyQuery<HulyEmployee>({ _id: toRef<HulyEmployee>(person._id) })
    )
    if (employee === undefined) {
      return yield* new PersonNotAnEmployeeError({ identifier })
    }
    return employee
  })

const resolveEmployee = (
  client: HulyClient["Service"],
  locator: EmployeeLocator
): Effect.Effect<HulyEmployee, SetEmployeePositionError> =>
  Effect.gen(function* () {
    if (locator.id !== undefined) {
      const employee = yield* client.findOne<HulyEmployee>(
        contact.mixin.Employee,
        hulyQuery<HulyEmployee>({ _id: toRef<HulyEmployee>(locator.id) })
      )
      if (employee !== undefined) return employee

      const person = yield* client.findOne<HulyPerson>(
        contact.class.Person,
        hulyQuery<HulyPerson>({ _id: toRef<HulyPerson>(locator.id) })
      )
      return person === undefined
        ? yield* new PersonNotFoundError({ identifier: locator.id })
        : yield* new PersonNotAnEmployeeError({ identifier: locator.id })
    }

    if (locator.email !== undefined)
      return yield* resolveEmployeeByTextLocator(client, locator.email, findPersonByExactEmail)
    return yield* resolveEmployeeByTextLocator(client, locator.name, findPersonByExactName)
  })

const normalizePosition = (position: string | null): string | null => {
  if (position === null) return null
  const trimmed = position.trim()
  return trimmed === "" ? null : trimmed
}

export const setEmployeePosition = (
  params: SetEmployeePositionParams
): Effect.Effect<SetEmployeePositionResult, SetEmployeePositionError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const employee = yield* resolveEmployee(client, params.employee)
    const position = normalizePosition(params.position)
    const updated = (employee.position ?? null) !== position

    if (updated) {
      yield* client.updateMixin<HulyPerson, HulyEmployee>(
        toRef<HulyPerson>(employee._id),
        contact.class.Person,
        employee.space,
        contact.mixin.Employee,
        { position }
      )
    }

    return { id: PersonId.make(employee._id), updated, position }
  })
