import { describe, it } from "@effect/vitest"
import { AvatarType, type Channel, type Employee, type Person, type SocialIdentity } from "@hcengineering/contact"
import {
  AccountRole,
  type AttachedData,
  type AttachedDoc,
  type Class,
  type Data,
  type Doc,
  type DocumentUpdate,
  type FindOptions,
  type Mixin,
  type MixinData,
  type MixinUpdate,
  type Ref,
  SocialIdType,
  type Space
} from "@hcengineering/core"
import { Effect, Layer } from "effect"
import { expect } from "vitest"

import { SocialIdentityId } from "../../../src/domain/schemas/person-administration.js"
import { Email, PersonId, PersonName, PersonUuid } from "../../../src/domain/schemas/shared.js"
import type { InviteEmployeeParams } from "../../../src/domain/schemas/employee-lifecycle.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import type { EmployeePreparationPlan } from "../../../src/huly/employee-preparation.js"
import {
  EmployeeDeactivationPartialFailureError,
  EmployeeInvitationPartialFailureError,
  EmployeeLifecycleImpactMismatchError,
  EmployeeLifecycleStateError,
  EmployeePreparationConflictError,
  HulyDataInvalidError,
  makeOperationConnectionError,
  PersonNotAnEmployeeError,
  PersonNotFoundError
} from "../../../src/huly/errors.js"
import { contact } from "../../../src/huly/huly-plugins.js"
import {
  deactivateEmployee,
  inviteEmployee,
  listInactiveEmployees
} from "../../../src/huly/operations/employee-lifecycle.js"
import { decodeEmployeeLifecycleDocument } from "../../../src/huly/operations/employee-lifecycle-boundaries.js"
import { toAccountUuid, toRef, toSocialIdentityRef } from "../../../src/huly/operations/sdk-boundary.js"
import { WorkspaceClient } from "../../../src/huly/workspace-client.js"
import { corePersonId, findResult } from "../../helpers/huly-sdk.js"

const DOMAIN_PERSON_UUID = PersonUuid.make("00000000-0000-4000-8000-000000000251")
const PERSON_UUID = toAccountUuid(DOMAIN_PERSON_UUID)
const ACTOR_UUID = toAccountUuid("00000000-0000-4000-8000-000000000001")

const person = (id: string, name: string): Person => ({
  _id: toRef<Person>(id),
  _class: contact.class.Person,
  space: contact.space.Contacts,
  name,
  avatarType: AvatarType.COLOR,
  modifiedBy: corePersonId("actor"),
  modifiedOn: 1
})

interface EmployeeOverrides {
  readonly id?: string
  readonly name?: string
  readonly personUuid?: ReturnType<typeof toAccountUuid>
  readonly role?: "USER" | "GUEST"
}

const employee = (active: boolean, overrides?: EmployeeOverrides): Employee => ({
  ...person("person-1", "Lovelace,Ada"),
  _id: toRef<Employee>(overrides?.id ?? "person-1"),
  _class: toRef<Class<Employee>>(contact.class.Person),
  name: overrides?.name ?? "Lovelace,Ada",
  active,
  role: overrides?.role ?? "USER",
  personUuid: overrides?.personUuid ?? PERSON_UUID
})

const employeeWithoutRole = (): Employee => {
  const { role: _role, ...withoutRole } = employee(false)
  return withoutRole
}

const unlinkedEmployee = (active = false): Employee => {
  const { personUuid: _personUuid, ...unlinked } = employee(active)
  return unlinked
}

const emailChannel = (): Channel => ({
  _id: toRef<Channel>("channel-1"),
  _class: contact.class.Channel,
  space: contact.space.Contacts,
  attachedTo: toRef<Person>("person-1"),
  attachedToClass: contact.class.Person,
  collection: "channels",
  provider: contact.channelProvider.Email,
  value: "ada@example.test",
  modifiedBy: corePersonId("actor"),
  modifiedOn: 1
})

const emailIdentity = (id = "identity-1", isDeleted = false): SocialIdentity => ({
  _id: toSocialIdentityRef(SocialIdentityId.make(id)),
  _class: contact.class.SocialIdentity,
  space: contact.space.Contacts,
  attachedTo: toRef<Person>("person-1"),
  attachedToClass: contact.class.Person,
  collection: "socialIds",
  type: SocialIdType.EMAIL,
  value: "ada@example.test",
  key: "email:ada@example.test",
  isDeleted,
  modifiedBy: corePersonId("actor"),
  modifiedOn: 1
})

interface Fixture {
  readonly people?: ReadonlyArray<Person>
  readonly employees?: ReadonlyArray<Employee>
  readonly channels?: ReadonlyArray<Channel>
  readonly identities?: ReadonlyArray<SocialIdentity>
  readonly updated?: Array<unknown>
  readonly events?: Array<string>
  readonly preparations?: Array<EmployeePreparationPlan>
  readonly commitResults?: Array<"applied" | "condition-not-met">
  readonly failCommit?: boolean
}

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined

const matches = (actual: unknown, expected: unknown): boolean => {
  if (expected === undefined) return true
  if (typeof expected === "object" && expected !== null) {
    const included = field(expected, "$in")
    return Array.isArray(included) && included.includes(actual)
  }
  return actual === expected
}

const filterDocs = <T extends Doc>(docs: ReadonlyArray<T>, query: unknown): Array<T> =>
  docs.filter(
    (doc) =>
      matches(doc._id, field(query, "_id")) &&
      matches(field(doc, "name"), field(query, "name")) &&
      matches(field(doc, "active"), field(query, "active")) &&
      matches(field(doc, "provider"), field(query, "provider")) &&
      matches(field(doc, "type"), field(query, "type")) &&
      matches(field(doc, "value"), field(query, "value")) &&
      matches(field(doc, "isDeleted"), field(query, "isDeleted")) &&
      matches(field(doc, "attachedTo"), field(query, "attachedTo"))
  )

const docsForClass = <T extends Doc>(_class: Ref<Class<T>>, fixture: Fixture): Array<T> => {
  const docs: ReadonlyArray<Doc> =
    String(_class) === String(contact.mixin.Employee)
      ? [...(fixture.employees ?? [])]
      : String(_class) === String(contact.class.Person)
        ? [...(fixture.people ?? [])]
        : String(_class) === String(contact.class.Channel)
          ? [...(fixture.channels ?? [])]
          : String(_class) === String(contact.class.SocialIdentity)
            ? [...(fixture.identities ?? [])]
            : []
  return docs.filter((doc): doc is T => doc !== undefined)
}

const clientLayer = (fixture: Fixture, accountUuid = ACTOR_UUID): Layer.Layer<HulyClient> => {
  const findAll: HulyClientOperations["findAll"] = <T extends Doc>(
    _class: Ref<Class<T>>,
    query: unknown,
    _options?: FindOptions<T>
  ) => Effect.succeed(findResult(filterDocs(docsForClass(_class, fixture), query)))
  const findOne: HulyClientOperations["findOne"] = <T extends Doc>(
    _class: Ref<Class<T>>,
    query: unknown,
    _options?: FindOptions<T>
  ) => Effect.succeed(filterDocs(docsForClass(_class, fixture), query)[0])
  return HulyClient.testLayer({
    getAccountUuid: () => accountUuid,
    findAll,
    findOne,
    createDoc: <T extends Doc>(_class: Ref<Class<T>>, _space: Ref<Space>, _data: Data<T>, id?: Ref<T>) =>
      Effect.sync(() => {
        fixture.events?.push("person-created")
        return id ?? toRef<T>("created-person")
      }),
    updateDoc: <T extends Doc>(
      _class: Ref<Class<T>>,
      _space: Ref<Space>,
      _id: Ref<T>,
      _operations: DocumentUpdate<T>
    ) => Effect.succeed({}),
    addCollection: <T extends Doc, P extends AttachedDoc>(
      _class: Ref<Class<P>>,
      _space: Ref<Space>,
      _attachedTo: Ref<T>,
      _attachedToClass: Ref<Class<T>>,
      _collection: string,
      _attributes: AttachedData<P>,
      id?: Ref<P>
    ) =>
      Effect.sync(() => {
        fixture.events?.push("email-identity-created")
        return id ?? toRef<P>("created-social-identity")
      }),
    createMixin: <D extends Doc, M extends D>(
      _objectId: Ref<D>,
      _objectClass: Ref<Class<D>>,
      _objectSpace: Ref<Space>,
      _mixin: Ref<Mixin<M>>,
      _attributes: MixinData<D, M>
    ) =>
      Effect.sync(() => {
        fixture.events?.push("employee-created")
        return {}
      }),
    commitEmployeePreparation: (preparation) =>
      fixture.failCommit === true
        ? Effect.fail(makeOperationConnectionError("commitEmployeePreparation", new Error("commit unavailable")))
        : Effect.sync(() => {
            fixture.preparations?.push(preparation)
            const result = fixture.commitResults?.shift() ?? "applied"
            if (result === "applied") {
              if (preparation.kind === "create-person") {
                fixture.events?.push("person-created", "email-identity-created", "employee-created")
              } else {
                if (preparation.kind === "prepare-existing" && preparation.identity.state === "create") {
                  fixture.events?.push("email-identity-created")
                }
                if (preparation.employee.state === "create") fixture.events?.push("employee-created")
                else {
                  fixture.updated?.push({
                    active: preparation.kind === "prepare-existing",
                    role: preparation.targetRole
                  })
                  fixture.events?.push("employee-updated")
                }
              }
            }
            return result
          }),
    updateMixin: <D extends Doc, M extends D>(
      _objectId: Ref<D>,
      _objectClass: Ref<Class<D>>,
      _objectSpace: Ref<Space>,
      _mixin: Ref<Mixin<M>>,
      attributes: MixinUpdate<D, M>
    ) => {
      fixture.updated?.push(attributes)
      return Effect.succeed({})
    }
  })
}

interface WorkspaceFixture {
  readonly sent?: Array<string>
  readonly resent?: Array<string>
  readonly left?: Array<string>
  readonly member?: boolean
  readonly events?: Array<string>
  readonly failSend?: boolean
  readonly failResend?: boolean
  readonly failLeave?: boolean
}

const workspaceLayer = (fixture: WorkspaceFixture): Layer.Layer<WorkspaceClient> =>
  WorkspaceClient.testLayer({
    getWorkspaceMembers: () =>
      Effect.succeed(fixture.member === false ? [] : [{ person: PERSON_UUID, role: AccountRole.User }]),
    sendInvite: (email) =>
      fixture.failSend === true
        ? Effect.fail(makeOperationConnectionError("sendInvite", new Error("unavailable")))
        : Effect.sync(() => {
            fixture.sent?.push(email)
            fixture.events?.push("invitation-sent")
          }),
    resendInvite: (email) =>
      fixture.failResend === true
        ? Effect.fail(makeOperationConnectionError("resendInvite", new Error("unavailable")))
        : Effect.sync(() => fixture.resent?.push(email)).pipe(Effect.asVoid),
    leaveWorkspace: (account) =>
      fixture.failLeave === true
        ? Effect.fail(makeOperationConnectionError("leaveWorkspace", new Error("unavailable")))
        : Effect.sync(() => fixture.left?.push(account)).pipe(Effect.asVoid)
  })

const layer = (huly: Fixture, workspace: WorkspaceFixture, accountUuid = ACTOR_UUID) =>
  Layer.merge(clientLayer(huly, accountUuid), workspaceLayer(workspace))

describe("employee lifecycle operations", () => {
  it.effect("projects the native nested Employee mixin returned for newly promoted People", () =>
    Effect.gen(function* () {
      const projected = yield* decodeEmployeeLifecycleDocument(
        {
          _id: "person-nested",
          space: "contact:space:Contacts",
          name: "Nested,Employee",
          "contact:mixin:Employee": { active: true, role: "USER" }
        },
        "prepareEmployee"
      )
      expect(projected).toMatchObject({ _id: "person-nested", active: true, role: "USER" })
    })
  )

  it.effect("creates Person, email SocialIdentity, and active Employee before sending an invitation", () => {
    const sent: Array<string> = []
    const events: Array<string> = []
    const preparations: Array<EmployeePreparationPlan> = []
    return Effect.gen(function* () {
      expect(
        yield* inviteEmployee({
          mode: "create-or-promote",
          name: PersonName.make("Person,New"),
          email: Email.make("new@example.test")
        })
      ).toMatchObject({
        outcome: "employee-prepared-and-invited",
        email: "new@example.test",
        role: "USER",
        changes: { kind: "person-created" }
      })
      expect(sent).toEqual(["new@example.test"])
      expect(events).toEqual(["person-created", "email-identity-created", "employee-created", "invitation-sent"])
      expect(preparations).toMatchObject([{ kind: "create-person", targetRole: "USER" }])
    }).pipe(Effect.provide(layer({ events, preparations }, { sent, events, member: false })))
  })

  it.effect("persists the explicit GUEST Employee role", () => {
    const preparations: Array<EmployeePreparationPlan> = []
    return Effect.gen(function* () {
      const result = yield* inviteEmployee({
        mode: "create-or-promote",
        name: PersonName.make("Guest,New"),
        email: Email.make("guest@example.test"),
        role: "GUEST"
      })
      expect(result.role).toBe("GUEST")
      expect(preparations[0]).toMatchObject({ kind: "create-person", targetRole: "GUEST" })
    }).pipe(Effect.provide(layer({ preparations }, { member: false })))
  })

  it.effect("does not invite when the checked preparation commit is rejected or fails", () => {
    const sent: Array<string> = []
    return Effect.gen(function* () {
      const rejected = yield* Effect.flip(
        inviteEmployee({
          mode: "create-or-promote",
          name: PersonName.make("Person,Conflict"),
          email: Email.make("conflict@example.test")
        }).pipe(Effect.provide(layer({ commitResults: ["condition-not-met"] }, { sent, member: false })))
      )
      expect(rejected).toBeInstanceOf(EmployeePreparationConflictError)

      const failed = yield* Effect.flip(
        inviteEmployee({
          mode: "create-or-promote",
          name: PersonName.make("Person,Unavailable"),
          email: Email.make("unavailable@example.test")
        }).pipe(Effect.provide(layer({ failCommit: true }, { sent, member: false })))
      )
      expect(failed._tag).toBe("HulyConnectionError")
      expect(sent).toEqual([])
    })
  })

  it.effect("rejects conflicting exact name/email targets before invitation", () => {
    const sent: Array<string> = []
    return Effect.gen(function* () {
      const conflict = yield* Effect.flip(
        inviteEmployee({
          mode: "create-or-promote",
          name: PersonName.make("Hopper,Grace"),
          email: Email.make("ada@example.test")
        }).pipe(
          Effect.provide(
            layer(
              {
                people: [person("person-1", "Lovelace,Ada"), person("person-2", "Hopper,Grace")],
                channels: [emailChannel()]
              },
              { sent }
            )
          )
        )
      )
      expect(conflict).toBeInstanceOf(EmployeeLifecycleStateError)
      expect(conflict.message).toContain("resolve to different People")
      expect(sent).toEqual([])
    })
  })

  it.effect("reports every completed existing-person preparation change when invite fails", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        inviteEmployee({
          mode: "create-or-promote",
          name: PersonName.make("Lovelace,Augusta"),
          email: Email.make("ada@example.test")
        })
      )
      expect(error).toBeInstanceOf(EmployeeInvitationPartialFailureError)
      expect(error).toMatchObject({
        operation: "sendInvite",
        completedChanges: ["nameUpdated", "emailIdentityCreated", "employeeCreated"]
      })
    }).pipe(
      Effect.provide(
        layer({ people: [person("person-1", "Lovelace,Ada")], channels: [emailChannel()] }, { failSend: true })
      )
    )
  )

  it.effect("rejects an immediate retry safely when the session still has stale pre-commit visibility", () => {
    const commitResults: Array<"applied" | "condition-not-met"> = ["applied", "condition-not-met"]
    const preparations: Array<EmployeePreparationPlan> = []
    const provided = layer({ commitResults, preparations }, { failSend: true, member: false })
    const request: InviteEmployeeParams = {
      mode: "create-or-promote",
      name: PersonName.make("Person,Retry"),
      email: Email.make("retry@example.test")
    }
    return Effect.gen(function* () {
      const first = yield* Effect.flip(inviteEmployee(request))
      expect(first).toBeInstanceOf(EmployeeInvitationPartialFailureError)
      expect(first).toMatchObject({
        operation: "sendInvite",
        completedChanges: ["personCreated", "emailIdentityCreated", "employeeCreated"]
      })
      const retry = yield* Effect.flip(inviteEmployee(request))
      expect(retry).toBeInstanceOf(EmployeePreparationConflictError)
      expect(preparations).toHaveLength(2)
      expect(preparations[0]?.scope).toBe(preparations[1]?.scope)
    }).pipe(Effect.provide(provided))
  })

  it.effect("resends for an inactive exact employee and returns all lifecycle states", () => {
    const resent: Array<string> = []
    const preparations: Array<EmployeePreparationPlan> = []
    return Effect.gen(function* () {
      const result = yield* inviteEmployee({
        mode: "invite-existing",
        employee: { name: PersonName.make("Lovelace,Ada") },
        role: "GUEST"
      })
      expect(result).toMatchObject({
        outcome: "invitation-resent",
        email: "ada@example.test",
        role: "GUEST",
        employee: {
          account: { state: "linked", personUuid: DOMAIN_PERSON_UUID },
          workspaceMembership: { state: "member", role: "USER" },
          employee: { state: "inactive", role: "GUEST" }
        }
      })
      expect(resent).toEqual(["ada@example.test"])
      expect(preparations).toMatchObject([
        { kind: "reconcile-role", employee: { state: "update" }, targetRole: "GUEST" }
      ])
    }).pipe(
      Effect.provide(
        layer(
          {
            people: [person("person-1", "Lovelace,Ada")],
            employees: [employee(false)],
            channels: [emailChannel()],
            preparations
          },
          { resent }
        )
      )
    )
  })

  it.effect("derives an omitted resend role from Employee without rewriting it", () => {
    const resent: Array<string> = []
    const preparations: Array<EmployeePreparationPlan> = []
    return Effect.gen(function* () {
      const result = yield* inviteEmployee({
        mode: "invite-existing",
        employee: { email: Email.make("ada@example.test") }
      })
      expect(result).toMatchObject({ outcome: "invitation-resent", role: "USER" })
      expect(preparations).toEqual([])
      expect(resent).toEqual(["ada@example.test"])
    }).pipe(
      Effect.provide(
        layer(
          {
            people: [person("person-1", "Lovelace,Ada")],
            employees: [employee(false)],
            channels: [emailChannel()],
            preparations
          },
          { resent }
        )
      )
    )
  })

  it.effect("reconciles an exact-email resend when another Person has the same display name", () => {
    const resent: Array<string> = []
    const preparations: Array<EmployeePreparationPlan> = []
    return Effect.gen(function* () {
      const result = yield* inviteEmployee({
        mode: "invite-existing",
        employee: { email: Email.make("ada@example.test") },
        role: "GUEST"
      })
      expect(result).toMatchObject({ outcome: "invitation-resent", role: "GUEST" })
      expect(preparations).toMatchObject([{ kind: "reconcile-role", previousName: "Lovelace,Ada" }])
      expect(resent).toEqual(["ada@example.test"])
    }).pipe(
      Effect.provide(
        layer(
          {
            people: [person("person-1", "Lovelace,Ada"), person("person-2", "Lovelace,Ada")],
            employees: [employee(false)],
            channels: [emailChannel()],
            preparations
          },
          { resent }
        )
      )
    )
  })

  it.effect("reports explicit resend role persistence when resend then fails", () => {
    const updated: Array<unknown> = []
    return Effect.gen(function* () {
      const error = yield* Effect.flip(
        inviteEmployee({ mode: "invite-existing", employee: { email: Email.make("ada@example.test") }, role: "GUEST" })
      )
      expect(error).toBeInstanceOf(EmployeeInvitationPartialFailureError)
      expect(error).toMatchObject({ operation: "resendInvite", completedChanges: ["employeeRoleUpdated"] })
      expect(updated).toEqual([{ active: false, role: "GUEST" }])
    }).pipe(
      Effect.provide(
        layer(
          {
            people: [person("person-1", "Lovelace,Ada")],
            employees: [employee(false)],
            channels: [emailChannel()],
            updated
          },
          { failResend: true }
        )
      )
    )
  })

  it.effect("promotes an exact Person and reactivates an inactive Employee through the create mode", () => {
    const promotedEvents: Array<string> = []
    const updated: Array<unknown> = []
    return Effect.gen(function* () {
      const promoted = yield* inviteEmployee({
        mode: "create-or-promote",
        name: PersonName.make("Lovelace,Ada"),
        email: Email.make("ada@example.test")
      }).pipe(
        Effect.provide(
          layer(
            {
              people: [person("person-1", "Lovelace,Ada")],
              channels: [emailChannel()],
              identities: [emailIdentity()],
              events: promotedEvents
            },
            { events: promotedEvents }
          )
        )
      )
      expect(promoted).toMatchObject({ changes: { kind: "existing-person", employeeTransition: "created" } })
      expect(promotedEvents).toEqual(["employee-created", "invitation-sent"])

      const reactivated = yield* inviteEmployee({
        mode: "create-or-promote",
        name: PersonName.make("Lovelace,Ada"),
        email: Email.make("ada@example.test")
      }).pipe(
        Effect.provide(
          layer(
            {
              people: [person("person-1", "Lovelace,Ada")],
              employees: [employee(false)],
              channels: [emailChannel()],
              identities: [emailIdentity()],
              updated
            },
            {}
          )
        )
      )
      expect(reactivated).toMatchObject({ changes: { kind: "existing-person", employeeTransition: "reactivated" } })
      expect(updated).toEqual([{ active: true, role: "USER" }])
    })
  })

  it.effect("reports each existing Employee transition without contradictory change flags", () =>
    Effect.gen(function* () {
      const roleUpdated = yield* inviteEmployee({
        mode: "create-or-promote",
        name: PersonName.make("Lovelace,Ada"),
        email: Email.make("ada@example.test"),
        role: "GUEST"
      }).pipe(
        Effect.provide(
          layer(
            {
              people: [person("person-1", "Lovelace,Ada")],
              employees: [employee(true)],
              identities: [emailIdentity()]
            },
            {}
          )
        )
      )
      expect(roleUpdated).toMatchObject({ changes: { employeeTransition: "role-updated" } })

      const reactivatedAndUpdated = yield* inviteEmployee({
        mode: "create-or-promote",
        name: PersonName.make("Lovelace,Ada"),
        email: Email.make("ada@example.test"),
        role: "GUEST"
      }).pipe(
        Effect.provide(
          layer(
            {
              people: [person("person-1", "Lovelace,Ada")],
              employees: [employee(false)],
              identities: [emailIdentity()]
            },
            {}
          )
        )
      )
      expect(reactivatedAndUpdated).toMatchObject({ changes: { employeeTransition: "reactivated-and-role-updated" } })

      const unchanged = yield* inviteEmployee({
        mode: "create-or-promote",
        name: PersonName.make("Lovelace,Ada"),
        email: Email.make("ada@example.test")
      }).pipe(
        Effect.provide(
          layer(
            {
              people: [person("person-1", "Lovelace,Ada")],
              employees: [employee(true)],
              identities: [emailIdentity()]
            },
            {}
          )
        )
      )
      expect(unchanged).toMatchObject({ changes: { employeeTransition: "unchanged" } })
    })
  )

  it.effect("rejects active, non-employee, missing-name, and email-less reinvite states", () => {
    const activeLayer = layer(
      { people: [person("person-1", "Lovelace,Ada")], employees: [employee(true)], channels: [emailChannel()] },
      {}
    )
    const nonEmployeeLayer = layer({ people: [person("person-1", "Lovelace,Ada")] }, {})
    const emailLessLayer = layer(
      { people: [person("person-1", "Lovelace,Ada")], employees: [employee(false)] },
      { member: false }
    )
    const roleLessLayer = layer(
      { people: [person("person-1", "Lovelace,Ada")], employees: [employeeWithoutRole()], channels: [emailChannel()] },
      { member: false }
    )
    return Effect.gen(function* () {
      expect(
        yield* Effect.flip(
          inviteEmployee({ mode: "invite-existing", employee: { name: PersonName.make("Lovelace,Ada") } }).pipe(
            Effect.provide(activeLayer)
          )
        )
      ).toBeInstanceOf(EmployeeLifecycleStateError)
      expect(
        yield* Effect.flip(
          inviteEmployee({ mode: "invite-existing", employee: { name: PersonName.make("Lovelace,Ada") } }).pipe(
            Effect.provide(nonEmployeeLayer)
          )
        )
      ).toBeInstanceOf(PersonNotAnEmployeeError)
      expect(
        yield* Effect.flip(
          inviteEmployee({ mode: "invite-existing", employee: { name: PersonName.make("Missing,Person") } }).pipe(
            Effect.provide(layer({}, {}))
          )
        )
      ).toBeInstanceOf(PersonNotFoundError)
      expect(
        yield* Effect.flip(
          inviteEmployee({ mode: "invite-existing", employee: { name: PersonName.make("Lovelace,Ada") } }).pipe(
            Effect.provide(emailLessLayer)
          )
        )
      ).toBeInstanceOf(EmployeeLifecycleStateError)
      expect(
        yield* Effect.flip(
          inviteEmployee({ mode: "invite-existing", employee: { name: PersonName.make("Lovelace,Ada") } }).pipe(
            Effect.provide(roleLessLayer)
          )
        )
      ).toBeInstanceOf(EmployeeLifecycleStateError)
    })
  })

  it.effect("rejects deleted or duplicate exact email SocialIdentities before preparation", () =>
    Effect.gen(function* () {
      const deleted = yield* Effect.flip(
        inviteEmployee({
          mode: "create-or-promote",
          name: PersonName.make("Lovelace,Ada"),
          email: Email.make("ada@example.test")
        }).pipe(
          Effect.provide(
            layer({ people: [person("person-1", "Lovelace,Ada")], identities: [emailIdentity("deleted", true)] }, {})
          )
        )
      )
      expect(deleted).toBeInstanceOf(EmployeeLifecycleStateError)

      const duplicate = yield* Effect.flip(
        inviteEmployee({
          mode: "create-or-promote",
          name: PersonName.make("Lovelace,Ada"),
          email: Email.make("ada@example.test")
        }).pipe(
          Effect.provide(
            layer(
              {
                people: [person("person-1", "Lovelace,Ada")],
                identities: [emailIdentity("identity-1"), emailIdentity("identity-2")]
              },
              {}
            )
          )
        )
      )
      expect(duplicate).toBeInstanceOf(EmployeeLifecycleStateError)
    })
  )

  it.effect("lists inactive employees with complete totals before pagination", () => {
    const secondUuid = toAccountUuid("00000000-0000-4000-8000-000000000252")
    const second = employee(false, { id: "person-2", name: "Lovelace,Ada", personUuid: secondUuid })
    const thirdUuid = toAccountUuid("00000000-0000-4000-8000-000000000253")
    const third = employee(false, { id: "person-3", name: "Turing,Alan", personUuid: thirdUuid })
    return Effect.gen(function* () {
      const result = yield* listInactiveEmployees({ limit: 1, offset: 0 })
      expect(result).toMatchObject({ total: 3, offset: 0, truncated: true, nextOffset: 1 })
      expect(result.employees).toHaveLength(1)
      expect(result.employees[0]?.personId).toBe("person-1")
      expect(result.employees[0]?.workspaceMembership).toEqual({ state: "member", role: "USER" })
    }).pipe(Effect.provide(layer({ employees: [employee(false), second, third] }, { member: true })))
  })

  it.effect("projects an unlinked Employee only with absent workspace membership", () =>
    Effect.gen(function* () {
      const result = yield* listInactiveEmployees({})
      expect(result.employees[0]).toMatchObject({
        relationship: "unlinked",
        account: { state: "unlinked" },
        workspaceMembership: { state: "absent" }
      })
    }).pipe(Effect.provide(layer({ employees: [unlinkedEmployee()] }, { member: false })))
  )

  it.effect("executes against the exact unlinked expected-state variant", () => {
    const updated: Array<unknown> = []
    return Effect.gen(function* () {
      const result = yield* deactivateEmployee({
        employee: { name: PersonName.make("Lovelace,Ada") },
        action: "deactivate",
        execute: true,
        expected: { relationship: "unlinked", personId: PersonId.make("person-1"), employeeActive: true }
      })
      expect(result).toMatchObject({ outcome: "deactivated", changes: { employeeDeactivated: true } })
      expect(updated).toEqual([{ active: false }])
    }).pipe(
      Effect.provide(
        layer(
          { people: [person("person-1", "Lovelace,Ada")], employees: [unlinkedEmployee(true)], updated },
          { member: false }
        )
      )
    )
  })

  it.effect("previews, guards, deactivates, and resumes a kick without read-after-write", () => {
    const updated: Array<unknown> = []
    const left: Array<string> = []
    const fixture = { people: [person("person-1", "Lovelace,Ada")], employees: [employee(true)], updated }
    const provided = layer(fixture, { left })
    return Effect.gen(function* () {
      const preview = yield* deactivateEmployee({ employee: { name: PersonName.make("Lovelace,Ada") }, action: "kick" })
      expect(preview).toMatchObject({ executed: false, impact: { employee: { state: "active" } } })
      const result = yield* deactivateEmployee({
        employee: { name: PersonName.make("Lovelace,Ada") },
        action: "kick",
        execute: true,
        expected: {
          relationship: "workspace-member",
          personId: PersonId.make("person-1"),
          personUuid: DOMAIN_PERSON_UUID,
          employeeActive: true,
          workspaceRole: "USER"
        }
      })
      expect(result).toMatchObject({
        executed: true,
        changes: { employeeDeactivated: true, workspaceMemberRemoved: true }
      })
      expect(updated).toEqual([{ active: false }])
      expect(left).toEqual([PERSON_UUID])
    }).pipe(Effect.provide(provided))
  })

  it.effect("returns a typed partial failure when kick deactivates before workspace removal fails", () => {
    const updated: Array<unknown> = []
    const left: Array<string> = []
    const provided = layer(
      { people: [person("person-1", "Lovelace,Ada")], employees: [employee(true)], updated },
      { failLeave: true }
    )
    return Effect.gen(function* () {
      const error = yield* Effect.flip(
        deactivateEmployee({
          employee: { name: PersonName.make("Lovelace,Ada") },
          action: "kick",
          execute: true,
          expected: {
            relationship: "workspace-member",
            personId: PersonId.make("person-1"),
            personUuid: DOMAIN_PERSON_UUID,
            employeeActive: true,
            workspaceRole: "USER"
          }
        })
      )
      expect(error).toBeInstanceOf(EmployeeDeactivationPartialFailureError)
      expect(error).toMatchObject({
        personId: "person-1",
        personUuid: DOMAIN_PERSON_UUID,
        action: "kick",
        failedOperation: "leaveWorkspace",
        completedChanges: ["employeeDeactivated"]
      })
      expect(error.message).toContain("Preview and execute kick again")
      expect(updated).toEqual([{ active: false }])

      const noProgress = yield* Effect.flip(
        deactivateEmployee({
          employee: { name: PersonName.make("Lovelace,Ada") },
          action: "kick",
          execute: true,
          expected: {
            relationship: "workspace-member",
            personId: PersonId.make("person-1"),
            personUuid: DOMAIN_PERSON_UUID,
            employeeActive: false,
            workspaceRole: "USER"
          }
        }).pipe(
          Effect.provide(
            layer({ people: [person("person-1", "Lovelace,Ada")], employees: [employee(false)] }, { failLeave: true })
          )
        )
      )
      expect(noProgress).toMatchObject({ completedChanges: [] })

      const retry = yield* deactivateEmployee({
        employee: { name: PersonName.make("Lovelace,Ada") },
        action: "kick",
        execute: true,
        expected: {
          relationship: "workspace-member",
          personId: PersonId.make("person-1"),
          personUuid: DOMAIN_PERSON_UUID,
          employeeActive: false,
          workspaceRole: "USER"
        }
      }).pipe(
        Effect.provide(
          layer({ people: [person("person-1", "Lovelace,Ada")], employees: [employee(false)], updated }, { left })
        )
      )
      expect(retry).toMatchObject({
        outcome: "kicked",
        changes: { employeeDeactivated: false, workspaceMemberRemoved: true }
      })
      expect(updated).toEqual([{ active: false }])
      expect(left).toEqual([PERSON_UUID])
    }).pipe(Effect.provide(provided))
  })

  it.effect("supports deactivate-only no-op and rejects changed preview state", () => {
    const updated: Array<unknown> = []
    const provided = layer(
      { people: [person("person-1", "Lovelace,Ada")], employees: [employee(false)], updated },
      { member: false }
    )
    return Effect.gen(function* () {
      const mismatch = yield* Effect.flip(
        deactivateEmployee({
          employee: { name: PersonName.make("Lovelace,Ada") },
          action: "deactivate",
          execute: true,
          expected: {
            relationship: "workspace-member",
            personId: PersonId.make("other"),
            personUuid: PersonUuid.make("00000000-0000-4000-8000-000000000999"),
            employeeActive: true,
            workspaceRole: "USER"
          }
        })
      )
      expect(mismatch).toBeInstanceOf(EmployeeLifecycleImpactMismatchError)
      const result = yield* deactivateEmployee({
        employee: { name: PersonName.make("Lovelace,Ada") },
        action: "deactivate",
        execute: true,
        expected: {
          relationship: "linked-without-membership",
          personId: PersonId.make("person-1"),
          personUuid: DOMAIN_PERSON_UUID,
          employeeActive: false
        }
      })
      expect(result).toMatchObject({ outcome: "deactivated", changes: { employeeDeactivated: false } })
      const preview = yield* deactivateEmployee({
        employee: { email: Email.make("ada@example.test") },
        action: "deactivate"
      }).pipe(
        Effect.provide(
          layer(
            {
              people: [person("person-1", "Lovelace,Ada")],
              employees: [employee(false)],
              identities: [emailIdentity()]
            },
            { member: false }
          )
        )
      )
      expect(preview).toMatchObject({ outcome: "preview", executed: false })
      expect(updated).toEqual([])
    }).pipe(Effect.provide(provided))
  })

  it.effect("rejects self-targeting and malformed Employee rows before mutation", () => {
    const selfLayer = layer(
      { people: [person("person-1", "Lovelace,Ada")], employees: [employee(true)] },
      {},
      PERSON_UUID
    )
    const malformed = employee(false, { name: "" })
    return Effect.gen(function* () {
      expect(
        yield* Effect.flip(
          deactivateEmployee({ employee: { name: PersonName.make("Lovelace,Ada") }, action: "deactivate" }).pipe(
            Effect.provide(selfLayer)
          )
        )
      ).toBeInstanceOf(EmployeeLifecycleStateError)
      const error = yield* Effect.flip(
        listInactiveEmployees({}).pipe(Effect.provide(layer({ employees: [malformed] }, {})))
      )
      expect(error).toBeInstanceOf(HulyDataInvalidError)
    })
  })

  it.effect("rejects missing and non-Employee deactivation targets", () =>
    Effect.gen(function* () {
      const missing = yield* Effect.flip(
        deactivateEmployee({ employee: { name: PersonName.make("Missing,Person") }, action: "deactivate" })
      )
      expect(missing).toBeInstanceOf(PersonNotFoundError)

      const nonEmployee = yield* Effect.flip(
        deactivateEmployee({ employee: { name: PersonName.make("Lovelace,Ada") }, action: "deactivate" }).pipe(
          Effect.provide(layer({ people: [person("person-1", "Lovelace,Ada")] }, {}))
        )
      )
      expect(nonEmployee).toBeInstanceOf(PersonNotAnEmployeeError)
    }).pipe(Effect.provide(layer({}, {})))
  )
})
