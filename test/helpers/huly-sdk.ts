import type { Contact, Person } from "@hcengineering/contact"
import type { AnyAttribute, Doc, FindResult, PersonId as CorePersonId, Ref, Space, Status } from "@hcengineering/core"

/* eslint-disable no-restricted-syntax -- test helpers centralize phantom/ref bridges used by mock fixtures */

/**
 * Single adapter for Huly SDK test fixtures. The SDK's brands are erased at
 * runtime, and its polymorphic client methods cannot be implemented by a
 * class-dispatching in-memory fixture without restoring the caller's generic
 * type. Keep that unchecked bridge here rather than scattering assertions
 * through behavior tests.
 */
export const sdkFixture = <T>(value: unknown): T => value as T

export const corePersonId = (value: string): CorePersonId => value as CorePersonId

export const contactRef = (value: string): Ref<Contact> => value as Ref<Contact>

export const docRef = <T extends Doc>(value: string): Ref<T> => value as Ref<T>

export const findResult = <T extends Doc>(docs: ReadonlyArray<T>): FindResult<T> => {
  const result = [...docs] as FindResult<T>
  result.total = docs.length
  return result
}

/**
 * Custom attributes expose a dynamic JSON type descriptor, while the SDK's
 * `AnyAttribute` requires a fully materialized `Type<any>` document. This is
 * the single test adapter for that intentionally looser SDK fixture shape.
 */
export interface CustomFieldAttributeFixture {
  readonly _id: string
  readonly _class: string
  readonly space: string
  readonly name: string
  readonly label: unknown
  readonly attributeOf: string
  readonly type: unknown
  readonly isCustom: true
  readonly modifiedBy: string
  readonly modifiedOn: number
  readonly createdBy: string
  readonly createdOn: number
}

export const customFieldAttribute = (fixture: CustomFieldAttributeFixture): AnyAttribute => fixture as AnyAttribute

/** Dynamic custom-field values are open SDK document properties, so tests keep them typed until this adapter. */
export interface CustomFieldDocumentFixture {
  readonly _id: string
  readonly _class: string
  readonly space: string
  readonly modifiedBy: string
  readonly modifiedOn: number
  readonly createdBy: string
  readonly createdOn: number
  readonly [key: string]: unknown
}

// The SDK brands document ids/classes and models dynamic custom-field keys as an open object;
// this is the single adapter from the typed fixture representation to that runtime DTO.
// eslint-disable-next-line hulymcp/no-double-type-assertion -- documented dynamic SDK fixture boundary
export const customFieldDocument = (fixture: CustomFieldDocumentFixture): Doc => fixture as unknown as Doc

/** The test client dispatches by runtime class, so its generic SDK result needs one typed adapter. */
export const findResultForTestClass = <T extends Doc>(docs: ReadonlyArray<Doc>): FindResult<T> =>
  findResult(docs) as FindResult<T>

/** The test client dispatches by runtime class, so its generic SDK document needs one typed adapter. */
export const documentForTestClass = <T extends Doc>(doc: Doc | undefined): T | undefined => doc as T | undefined

export const personRef = (value: string): Ref<Person> => value as Ref<Person>

export const spaceRef = (value: string): Ref<Space> => value as Ref<Space>

export const statusRef = (value: string): Ref<Status> => value as Ref<Status>
