import { describe, it } from "@effect/vitest"
import type { Channel, Employee, Person } from "@hcengineering/contact"
import { AvatarType } from "@hcengineering/contact"
import type { Class, Doc, FindOptions, Mixin, MixinUpdate, Ref, Space } from "@hcengineering/core"
import { AccountRole } from "@hcengineering/core"
import { Effect, Layer } from "effect"
import { expect } from "vitest"

import { Email, PersonId, PersonName, PersonUuid } from "../../../src/domain/schemas/shared.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import {
  EmployeeLifecycleImpactMismatchError,
  EmployeeLifecycleStateError,
  HulyDataInvalidError,
  PersonNotAnEmployeeError,
  PersonNotFoundError
} from "../../../src/huly/errors.js"
import { contact } from "../../../src/huly/huly-plugins.js"
import {
  deactivateEmployee,
  inviteEmployee,
  listInactiveEmployees
} from "../../../src/huly/operations/employee-lifecycle.js"
import { toAccountUuid, toRef } from "../../../src/huly/operations/sdk-boundary.js"
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
}

const employee = (active: boolean, overrides?: EmployeeOverrides): Employee => ({
  ...person("person-1", "Lovelace,Ada"),
  _id: toRef<Employee>(overrides?.id ?? "person-1"),
  _class: toRef<Class<Employee>>(contact.class.Person),
  name: overrides?.name ?? "Lovelace,Ada",
  active,
  personUuid: overrides?.personUuid ?? PERSON_UUID
})

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

interface Fixture {
  readonly people?: ReadonlyArray<Person>
  readonly employees?: ReadonlyArray<Employee>
  readonly channels?: ReadonlyArray<Channel>
  readonly updated?: Array<unknown>
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
      matches(field(doc, "value"), field(query, "value")) &&
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
}

const workspaceLayer = (fixture: WorkspaceFixture): Layer.Layer<WorkspaceClient> =>
  WorkspaceClient.testLayer({
    getWorkspaceMembers: () =>
      Effect.succeed(fixture.member === false ? [] : [{ person: PERSON_UUID, role: AccountRole.User }]),
    sendInvite: (email) => Effect.sync(() => fixture.sent?.push(email)).pipe(Effect.asVoid),
    resendInvite: (email) => Effect.sync(() => fixture.resent?.push(email)).pipe(Effect.asVoid),
    leaveWorkspace: (account) => Effect.sync(() => fixture.left?.push(account)).pipe(Effect.asVoid)
  })

const layer = (huly: Fixture, workspace: WorkspaceFixture, accountUuid = ACTOR_UUID) =>
  Layer.merge(clientLayer(huly, accountUuid), workspaceLayer(workspace))

describe("employee lifecycle operations", () => {
  it.effect("sends a new invitation only when exact email has no Person", () => {
    const sent: Array<string> = []
    return Effect.gen(function* () {
      expect(yield* inviteEmployee({ employee: { email: Email.make("new@example.test") } })).toEqual({
        outcome: "invitation-sent",
        email: "new@example.test",
        role: "USER"
      })
      expect(sent).toEqual(["new@example.test"])
    }).pipe(Effect.provide(layer({}, { sent, member: false })))
  })

  it.effect("resends for an inactive exact employee and returns all lifecycle states", () => {
    const resent: Array<string> = []
    return Effect.gen(function* () {
      const result = yield* inviteEmployee({ employee: { name: PersonName.make("Lovelace,Ada") }, role: "MAINTAINER" })
      expect(result).toMatchObject({
        outcome: "invitation-resent",
        email: "ada@example.test",
        role: "MAINTAINER",
        employee: {
          account: { state: "linked", personUuid: DOMAIN_PERSON_UUID },
          workspaceMembership: { state: "member", role: "USER" },
          employee: { state: "inactive" }
        }
      })
      expect(resent).toEqual(["ada@example.test"])
    }).pipe(
      Effect.provide(
        layer(
          { people: [person("person-1", "Lovelace,Ada")], employees: [employee(false)], channels: [emailChannel()] },
          { resent }
        )
      )
    )
  })

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
    return Effect.gen(function* () {
      expect(
        yield* Effect.flip(
          inviteEmployee({ employee: { name: PersonName.make("Lovelace,Ada") } }).pipe(Effect.provide(activeLayer))
        )
      ).toBeInstanceOf(EmployeeLifecycleStateError)
      expect(
        yield* Effect.flip(
          inviteEmployee({ employee: { name: PersonName.make("Lovelace,Ada") } }).pipe(Effect.provide(nonEmployeeLayer))
        )
      ).toBeInstanceOf(PersonNotAnEmployeeError)
      expect(
        yield* Effect.flip(
          inviteEmployee({ employee: { name: PersonName.make("Missing,Person") } }).pipe(Effect.provide(layer({}, {})))
        )
      ).toBeInstanceOf(PersonNotFoundError)
      expect(
        yield* Effect.flip(
          inviteEmployee({ employee: { name: PersonName.make("Lovelace,Ada") } }).pipe(Effect.provide(emailLessLayer))
        )
      ).toBeInstanceOf(EmployeeLifecycleStateError)
    })
  })

  it.effect("lists inactive employees with complete totals before pagination", () => {
    const secondUuid = toAccountUuid("00000000-0000-4000-8000-000000000252")
    const second = employee(false, { id: "person-2", name: "Hopper,Grace", personUuid: secondUuid })
    return Effect.gen(function* () {
      const result = yield* listInactiveEmployees({ limit: 1, offset: 0 })
      expect(result).toMatchObject({ total: 2, offset: 0, truncated: true, nextOffset: 1 })
      expect(result.employees).toHaveLength(1)
      expect(result.employees[0]?.personId).toBe("person-2")
      expect(result.employees[0]?.workspaceMembership).toEqual({ state: "absent" })
    }).pipe(Effect.provide(layer({ employees: [employee(false), second] }, { member: true })))
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
        expectedPersonId: PersonId.make("person-1"),
        expectedPersonUuid: DOMAIN_PERSON_UUID,
        expectedEmployeeActive: true,
        expectedWorkspaceRole: "USER"
      })
      expect(result).toMatchObject({
        executed: true,
        changes: { employeeDeactivated: true, workspaceMemberRemoved: true }
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
          expectedPersonId: PersonId.make("other"),
          expectedPersonUuid: null,
          expectedEmployeeActive: true,
          expectedWorkspaceRole: "USER"
        })
      )
      expect(mismatch).toBeInstanceOf(EmployeeLifecycleImpactMismatchError)
      const result = yield* deactivateEmployee({
        employee: { name: PersonName.make("Lovelace,Ada") },
        action: "deactivate",
        execute: true,
        expectedPersonId: PersonId.make("person-1"),
        expectedPersonUuid: DOMAIN_PERSON_UUID,
        expectedEmployeeActive: false,
        expectedWorkspaceRole: null
      })
      expect(result).toMatchObject({ changes: { employeeDeactivated: false, workspaceMemberRemoved: false } })
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
})
