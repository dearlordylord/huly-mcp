import { Effect, Schema } from "effect"

import type { EmployeeLifecycleState } from "../../domain/schemas/employee-lifecycle.js"
import { EmployeeLifecycleStateSchema } from "../../domain/schemas/employee-lifecycle.js"
import { AccountRoleSchema } from "../../domain/schemas/workspace.js"
import { Email, PersonId, PersonName, PersonUuid, SpaceId } from "../../domain/schemas/shared.js"
import { HulyDataInvalidError } from "../errors.js"

const EmployeeLifecycleDocumentFields = {
  _id: PersonId,
  space: SpaceId,
  name: PersonName,
  personUuid: Schema.optionalKey(PersonUuid)
}
const EmployeeRole = Schema.Literals(["USER", "GUEST"])
const EMPLOYEE_MIXIN_KEY = "contact:mixin:Employee"
export const EmployeeLifecycleDocumentSchema = Schema.Struct({
  ...EmployeeLifecycleDocumentFields,
  active: Schema.Boolean,
  role: Schema.optionalKey(EmployeeRole)
})
export type EmployeeLifecycleDocument = Schema.Schema.Type<typeof EmployeeLifecycleDocumentSchema>

const NestedEmployeeLifecycleDocumentSchema = Schema.Struct({
  ...EmployeeLifecycleDocumentFields,
  [EMPLOYEE_MIXIN_KEY]: Schema.Struct({ active: Schema.Boolean, role: Schema.optionalKey(EmployeeRole) })
})
const RawEmployeeLifecycleDocumentSchema = Schema.Union([
  EmployeeLifecycleDocumentSchema,
  NestedEmployeeLifecycleDocumentSchema
])

export const EmployeeLifecyclePersonSchema = Schema.Struct({ _id: PersonId, name: PersonName })
export type EmployeeLifecyclePerson = Schema.Schema.Type<typeof EmployeeLifecyclePersonSchema>

export const EmployeeLifecycleMemberSchema = Schema.Struct({ person: PersonUuid, role: AccountRoleSchema })
export type EmployeeLifecycleMember = Schema.Schema.Type<typeof EmployeeLifecycleMemberSchema>

const invalid =
  (operation: string, entity: string) =>
  (cause: unknown): HulyDataInvalidError =>
    new HulyDataInvalidError({ operation, entity, cause })

export const decodeEmployeeLifecycleDocument = (
  input: unknown,
  operation: string
): Effect.Effect<EmployeeLifecycleDocument, HulyDataInvalidError> =>
  Schema.decodeUnknownEffect(RawEmployeeLifecycleDocumentSchema)(input).pipe(
    Effect.map((document) =>
      "active" in document
        ? document
        : {
            _id: document._id,
            space: document.space,
            name: document.name,
            ...(document.personUuid === undefined ? {} : { personUuid: document.personUuid }),
            ...document[EMPLOYEE_MIXIN_KEY]
          }
    ),
    Effect.mapError(invalid(operation, "Employee mixin"))
  )

export const decodeEmployeeLifecycleDocuments = (
  input: unknown,
  operation: string
): Effect.Effect<ReadonlyArray<EmployeeLifecycleDocument>, HulyDataInvalidError> =>
  Schema.decodeUnknownEffect(Schema.Array(RawEmployeeLifecycleDocumentSchema))(input).pipe(
    Effect.map((documents) =>
      documents.map((document) =>
        "active" in document
          ? document
          : {
              _id: document._id,
              space: document.space,
              name: document.name,
              ...(document.personUuid === undefined ? {} : { personUuid: document.personUuid }),
              ...document[EMPLOYEE_MIXIN_KEY]
            }
      )
    ),
    Effect.mapError(invalid(operation, "Employee mixins"))
  )

export const decodeEmployeeLifecyclePerson = (
  input: unknown,
  operation: string
): Effect.Effect<EmployeeLifecyclePerson, HulyDataInvalidError> =>
  Schema.decodeUnknownEffect(EmployeeLifecyclePersonSchema)(input).pipe(Effect.mapError(invalid(operation, "Person")))

export const decodeEmployeeLifecycleMembers = (
  input: unknown,
  operation: string
): Effect.Effect<ReadonlyArray<EmployeeLifecycleMember>, HulyDataInvalidError> =>
  Schema.decodeUnknownEffect(Schema.Array(EmployeeLifecycleMemberSchema))(input).pipe(
    Effect.mapError(invalid(operation, "workspace members"))
  )

export const decodeEmployeeLifecycleState = (
  input: unknown,
  operation: string
): Effect.Effect<EmployeeLifecycleState, HulyDataInvalidError> =>
  Schema.decodeUnknownEffect(EmployeeLifecycleStateSchema)(input).pipe(
    Effect.mapError(invalid(operation, "employee lifecycle projection"))
  )

export const decodeOptionalEmployeeEmail = (
  input: unknown,
  operation: string
): Effect.Effect<Email | undefined, HulyDataInvalidError> =>
  Schema.decodeUnknownEffect(Schema.UndefinedOr(Email))(input).pipe(
    Effect.mapError(invalid(operation, "employee email"))
  )
