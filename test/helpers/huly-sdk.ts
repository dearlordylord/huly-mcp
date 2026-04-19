import type { Contact, Person } from "@hcengineering/contact"
import type { Doc, FindResult, PersonId as CorePersonId, Ref, Space, Status } from "@hcengineering/core"

/* eslint-disable no-restricted-syntax -- test helpers centralize phantom/ref bridges used by mock fixtures */

export const corePersonId = (value: string): CorePersonId => value as CorePersonId

export const contactRef = (value: string): Ref<Contact> => value as Ref<Contact>

export const docRef = <T extends Doc>(value: string): Ref<T> => value as Ref<T>

export const findResult = <T extends Doc>(docs: ReadonlyArray<T>): FindResult<T> => {
  const result = [...docs] as FindResult<T>
  result.total = docs.length
  return result
}

export const personRef = (value: string): Ref<Person> => value as Ref<Person>

export const spaceRef = (value: string): Ref<Space> => value as Ref<Space>

export const statusRef = (value: string): Ref<Status> => value as Ref<Status>
