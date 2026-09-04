import { Effect, Schema } from "effect"

import {
  EmployeeInvitationRoleSchema,
  type InactiveEmployeeLifecycleState,
  InactiveEmployeeLifecycleStateSchema,
  type EmployeeLifecycleState,
  EmployeeLifecycleStateSchema
} from "../../domain/schemas/employee-lifecycle.js"
import { SocialIdentityId } from "../../domain/schemas/person-administration.js"
import { AccountRoleSchema } from "../../domain/schemas/workspace.js"
import { Email, PersonId, PersonName, PersonUuid, SpaceId } from "../../domain/schemas/shared.js"
import { HulyDataInvalidError } from "../errors.js"

const EmployeeLifecycleBoundaryOperationSchema = Schema.Literals([
  "resolveEmployeeLifecycleTarget",
  "prepareEmployee",
  "inviteEmployee",
  "inviteEmployee.roleReconciliation",
  "listInactiveEmployees",
  "deactivateEmployee"
])
export type EmployeeLifecycleBoundaryOperation = Schema.Schema.Type<typeof EmployeeLifecycleBoundaryOperationSchema>
type EmployeeLifecycleBoundaryEntity =
  | "Employee mixin"
  | "Employee mixins"
  | "Person"
  | "workspace members"
  | "email SocialIdentities"
  | "employee lifecycle projection"
  | "inactive employee lifecycle projection"
  | "employee email"

const EmployeeLifecycleDocumentFields = {
  _id: PersonId,
  space: SpaceId,
  name: PersonName,
  personUuid: Schema.optionalKey(PersonUuid)
}
const EMPLOYEE_MIXIN_KEY = "contact:mixin:Employee"
export const EmployeeLifecycleDocumentSchema = Schema.Struct({
  ...EmployeeLifecycleDocumentFields,
  active: Schema.Boolean,
  role: Schema.optionalKey(EmployeeInvitationRoleSchema)
})
export type EmployeeLifecycleDocument = Schema.Schema.Type<typeof EmployeeLifecycleDocumentSchema>

const NestedEmployeeLifecycleDocumentSchema = Schema.Struct({
  ...EmployeeLifecycleDocumentFields,
  [EMPLOYEE_MIXIN_KEY]: Schema.Struct({
    active: Schema.Boolean,
    role: Schema.optionalKey(EmployeeInvitationRoleSchema)
  })
})
const RawEmployeeLifecycleDocumentSchema = Schema.Union([
  EmployeeLifecycleDocumentSchema,
  NestedEmployeeLifecycleDocumentSchema
])

export const EmployeeLifecyclePersonSchema = Schema.Struct({ _id: PersonId, name: PersonName })
export type EmployeeLifecyclePerson = Schema.Schema.Type<typeof EmployeeLifecyclePersonSchema>

export const EmployeeLifecycleMemberSchema = Schema.Struct({ person: PersonUuid, role: AccountRoleSchema })
export type EmployeeLifecycleMember = Schema.Schema.Type<typeof EmployeeLifecycleMemberSchema>

export const EmployeeLifecycleIdentitySchema = Schema.Struct({
  _id: SocialIdentityId,
  attachedTo: PersonId,
  value: Email,
  isDeleted: Schema.Boolean
})
export type EmployeeLifecycleIdentity = Schema.Schema.Type<typeof EmployeeLifecycleIdentitySchema>

const invalid =
  (operation: EmployeeLifecycleBoundaryOperation, entity: EmployeeLifecycleBoundaryEntity) =>
  (cause: unknown): HulyDataInvalidError =>
    new HulyDataInvalidError({ operation, entity, cause })

export const decodeEmployeeLifecycleDocument = (
  input: unknown,
  operation: EmployeeLifecycleBoundaryOperation
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
  operation: EmployeeLifecycleBoundaryOperation
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
  operation: EmployeeLifecycleBoundaryOperation
): Effect.Effect<EmployeeLifecyclePerson, HulyDataInvalidError> =>
  Schema.decodeUnknownEffect(EmployeeLifecyclePersonSchema)(input).pipe(Effect.mapError(invalid(operation, "Person")))

export const decodeEmployeeLifecycleMembers = (
  input: unknown,
  operation: EmployeeLifecycleBoundaryOperation
): Effect.Effect<ReadonlyArray<EmployeeLifecycleMember>, HulyDataInvalidError> =>
  Schema.decodeUnknownEffect(Schema.Array(EmployeeLifecycleMemberSchema))(input).pipe(
    Effect.mapError(invalid(operation, "workspace members"))
  )

export const decodeEmployeeLifecycleIdentities = (
  input: unknown,
  operation: EmployeeLifecycleBoundaryOperation
): Effect.Effect<ReadonlyArray<EmployeeLifecycleIdentity>, HulyDataInvalidError> =>
  Schema.decodeUnknownEffect(Schema.Array(EmployeeLifecycleIdentitySchema))(input).pipe(
    Effect.mapError(invalid(operation, "email SocialIdentities"))
  )

export const decodeEmployeeLifecycleState = (
  input: unknown,
  operation: EmployeeLifecycleBoundaryOperation
): Effect.Effect<EmployeeLifecycleState, HulyDataInvalidError> =>
  Schema.decodeUnknownEffect(EmployeeLifecycleStateSchema)(input).pipe(
    Effect.mapError(invalid(operation, "employee lifecycle projection"))
  )

export const decodeInactiveEmployeeLifecycleState = (
  input: unknown,
  operation: EmployeeLifecycleBoundaryOperation
): Effect.Effect<InactiveEmployeeLifecycleState, HulyDataInvalidError> =>
  Schema.decodeUnknownEffect(InactiveEmployeeLifecycleStateSchema)(input).pipe(
    Effect.mapError(invalid(operation, "inactive employee lifecycle projection"))
  )

export const decodeOptionalEmployeeEmail = (
  input: unknown,
  operation: EmployeeLifecycleBoundaryOperation
): Effect.Effect<Email | undefined, HulyDataInvalidError> =>
  Schema.decodeUnknownEffect(Schema.UndefinedOr(Email))(input).pipe(
    Effect.mapError(invalid(operation, "employee email"))
  )
