import type { Channel, Employee as HulyEmployee, Person as HulyPerson } from "@hcengineering/contact"
import { AvatarType } from "@hcengineering/contact"
import type {
  Class,
  Data,
  Doc,
  DocumentQuery,
  FindOptions,
  Mixin,
  MixinData,
  MixinUpdate,
  Ref,
  Space,
  TxResult
} from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import type { Department as HulyDepartment, Staff as HulyStaff } from "@hcengineering/hr"
import { Effect, Schema } from "effect"
import { describe, expect, it } from "vitest"

import {
  Count,
  DepartmentIdentifier,
  DepartmentName,
  DepartmentPath,
  PersonLocator,
  UpdateDepartmentParamsSchema
} from "../../../src/domain/schemas.js"
import {
  DepartmentConflictError,
  DepartmentHierarchyError,
  DepartmentIdentifierAmbiguousError,
  DepartmentImpactMismatchError,
  DepartmentNotFoundError,
  EmployeeNotFoundError,
  PersonIdentifierAmbiguousError
} from "../../../src/huly/errors.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { contact, hr } from "../../../src/huly/huly-plugins.js"
import {
  descendantsOf,
  type DepartmentCatalog,
  ensureNameAvailable,
  loadDepartmentCatalog,
  resolveDepartment,
  resolveDepartmentFromCatalog,
  resolveEmployee,
  resolveEmployees,
  resolvePeople,
  toDepartmentSummary
} from "../../../src/huly/operations/hr-departments-shared.js"
import { getDepartment, listDepartments, listStaff } from "../../../src/huly/operations/hr-departments-read.js"
import {
  assignStaffDepartment,
  createDepartment,
  deleteDepartment,
  updateDepartment
} from "../../../src/huly/operations/hr-departments-write.js"
import { corePersonId, docRef, spaceRef } from "../../helpers/huly-sdk.js"

interface Calls {
  createDoc?: { readonly classRef: string; readonly data: unknown; readonly id: string | undefined }
  updateDoc?: { readonly id: string; readonly operations: unknown }
  removeDoc?: { readonly id: string }
  createMixin?: { readonly id: string; readonly attributes: unknown }
  updateMixin?: { readonly id: string; readonly attributes: unknown }
}

interface FixtureData {
  readonly departments: ReadonlyArray<HulyDepartment>
  readonly staff: ReadonlyArray<HulyStaff>
  readonly persons: ReadonlyArray<HulyPerson>
  readonly employees: ReadonlyArray<HulyEmployee>
  readonly channels: ReadonlyArray<Channel>
  readonly calls: Calls
}

const queryValue = (query: unknown, key: string): unknown =>
  typeof query === "object" && query !== null ? Reflect.get(query, key) : undefined

const matchesSelector = (actual: unknown, expected: unknown): boolean => {
  if (typeof expected === "object" && expected !== null) {
    const inValues = queryValue(expected, "$in")
    if (Array.isArray(inValues)) return inValues.some((value) => value === actual)
    const like = queryValue(expected, "$like")
    if (typeof like === "string" && typeof actual === "string") {
      const escaped = like
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replaceAll("%", ".*")
        .replaceAll("_", ".")
      return new RegExp(`^${escaped}$`, "i").test(actual)
    }
  }
  return actual === expected
}

const matchesQuery = (doc: Doc, query: unknown): boolean =>
  ["_id", "name", "department", "active", "attachedTo", "provider", "value", "type"].every((key) => {
    const expected = queryValue(query, key)
    return expected === undefined || matchesSelector(Reflect.get(doc, key), expected)
  })

const makePerson = (id: string, name: string): HulyPerson => ({
  _id: docRef<HulyPerson>(id),
  _class: contact.class.Person,
  space: contact.space.Contacts,
  name,
  avatarType: AvatarType.COLOR,
  modifiedBy: corePersonId("actor"),
  modifiedOn: 1
})

const makeEmployee = (id: string, name: string, position?: string | null, active = true): HulyEmployee => ({
  _id: docRef<HulyEmployee>(id),
  _class: contact.mixin.Employee,
  space: contact.space.Contacts,
  name,
  avatarType: AvatarType.COLOR,
  active,
  ...(position === undefined ? {} : { position }),
  modifiedBy: corePersonId("actor"),
  modifiedOn: 1
})

const makeStaff = (
  id: string,
  name: string,
  department: Ref<HulyDepartment>,
  position?: string | null,
  active = true
): HulyStaff => ({
  _id: docRef<HulyStaff>(id),
  _class: contact.mixin.Employee,
  space: contact.space.Contacts,
  name,
  avatarType: AvatarType.COLOR,
  active,
  department,
  ...(position === undefined ? {} : { position }),
  modifiedBy: corePersonId("actor"),
  modifiedOn: 1
})

const makeDepartment = (
  id: string,
  name: string,
  parent: Ref<HulyDepartment> = hr.ids.Head,
  overrides: Partial<HulyDepartment> = {}
): HulyDepartment => ({
  _id: docRef<HulyDepartment>(id),
  _class: hr.class.Department,
  space: spaceRef("core:space:Workspace"),
  name,
  description: "",
  parent,
  teamLead: null,
  managers: [],
  members: [],
  modifiedBy: corePersonId("actor"),
  modifiedOn: 1,
  ...overrides
})

const makeChannel = (id: string, personId: string, email: string): Channel => ({
  _id: docRef<Channel>(id),
  _class: contact.class.Channel,
  space: contact.space.Contacts,
  attachedTo: docRef<HulyPerson>(personId),
  attachedToClass: contact.class.Person,
  collection: "channels",
  provider: contact.channelProvider.Email,
  value: email,
  modifiedBy: corePersonId("actor"),
  modifiedOn: 1
})

const baseFixture = (): FixtureData => {
  const alice = makeEmployee("person-alice", "Alice,Anderson", "Director")
  const bob = makeEmployee("person-bob", "Bob,Baker", null)
  const guest = makePerson("person-guest", "Guest,Gray")
  const head = makeDepartment(String(hr.ids.Head), "Head")
  const product = makeDepartment("department-product", "Product", hr.ids.Head, {
    description: "Product organization",
    teamLead: alice._id,
    managers: [alice._id],
    subscribers: [bob._id],
    members: [alice._id],
    avatar: "avatar-ref",
    attachments: 2,
    comments: 3,
    channels: 4,
    createdOn: 2,
    modifiedOn: 3
  })
  const design = makeDepartment("department-design", "Design", product._id)
  const research = makeDepartment("department-research", "Research", design._id)
  const sales = makeDepartment("department-sales", "Sales", hr.ids.Head)
  return {
    departments: [head, product, design, research, sales],
    staff: [
      makeStaff("person-alice", "Alice,Anderson", product._id, "Director"),
      makeStaff("person-bob", "Bob,Baker", design._id, null, false),
      makeStaff("person-head", "Head,Harold", hr.ids.Head)
    ],
    persons: [alice, bob, guest],
    employees: [alice, bob],
    channels: [makeChannel("channel-alice", "person-alice", "alice@example.com")],
    calls: {}
  }
}

const testLayer = (fixture: FixtureData) => {
  const findAll: HulyClientOperations["findAll"] = <T extends Doc>(
    classRef: Ref<Class<T>>,
    query: DocumentQuery<T>,
    options?: FindOptions<T>
  ) => {
    const className = String(classRef)
    let docs: ReadonlyArray<Doc>
    if (className === String(hr.class.Department)) docs = fixture.departments
    else if (className === String(hr.mixin.Staff)) docs = fixture.staff
    else if (className === String(contact.class.Person)) docs = fixture.persons
    else if (className === String(contact.mixin.Employee)) docs = fixture.employees
    else if (className === String(contact.class.Channel)) docs = fixture.channels
    else docs = []

    let filtered = docs.filter((doc) => matchesQuery(doc, query))
    if (options?.sort !== undefined && Reflect.get(options.sort, "name") !== undefined) {
      filtered = [...filtered].sort((left, right) =>
        String(Reflect.get(left, "name")).localeCompare(String(Reflect.get(right, "name")))
      )
    }
    // The class reference selects the fixture collection at runtime; the SDK's generic
    // operation cannot express that relationship to this intentionally class-aware test port.
    return Effect.succeed(toFindResult(filtered as Array<T>, filtered.length))
  }

  const findOne: HulyClientOperations["findOne"] = <T extends Doc>(classRef: Ref<Class<T>>, query: DocumentQuery<T>) =>
    Effect.map(findAll(classRef, query), (docs) => docs[0])

  const createDoc = <T extends Doc>(
    classRef: Ref<Class<T>>,
    _space: Ref<Space>,
    data: Data<T>,
    id?: Ref<T>
  ): Effect.Effect<Ref<T>, never> => {
    fixture.calls.createDoc = { classRef: String(classRef), data, id: id === undefined ? undefined : String(id) }
    return Effect.succeed(id ?? docRef<T>("created-document"))
  }

  const updateDoc = <T extends Doc>(
    _classRef: Ref<Class<T>>,
    _space: Ref<Space>,
    id: Ref<T>,
    operations: object
  ): Effect.Effect<TxResult, never> => {
    fixture.calls.updateDoc = { id: String(id), operations }
    return Effect.succeed({})
  }

  const removeDoc = <T extends Doc>(
    _classRef: Ref<Class<T>>,
    _space: Ref<Space>,
    id: Ref<T>
  ): Effect.Effect<TxResult, never> => {
    fixture.calls.removeDoc = { id: String(id) }
    return Effect.succeed({})
  }

  const createMixin = <D extends Doc, M extends D>(
    id: Ref<D>,
    _classRef: Ref<Class<D>>,
    _space: Ref<Space>,
    _mixin: Ref<Mixin<M>>,
    attributes: MixinData<D, M>
  ): Effect.Effect<TxResult, never> => {
    fixture.calls.createMixin = { id: String(id), attributes }
    return Effect.succeed({})
  }

  const updateMixin = <D extends Doc, M extends D>(
    id: Ref<D>,
    _classRef: Ref<Class<D>>,
    _space: Ref<Space>,
    _mixin: Ref<Mixin<M>>,
    attributes: MixinUpdate<D, M>
  ): Effect.Effect<TxResult, never> => {
    fixture.calls.updateMixin = { id: String(id), attributes }
    return Effect.succeed({})
  }

  return HulyClient.testLayer({ findAll, findOne, createDoc, updateDoc, removeDoc, createMixin, updateMixin })
}

const runWithFixture = <A, E>(effect: Effect.Effect<A, E, HulyClient>, fixture: FixtureData): A =>
  Effect.runSync(effect.pipe(Effect.provide(testLayer(fixture))))

const failWithFixture = <A, E>(effect: Effect.Effect<A, E, HulyClient>, fixture: FixtureData): E =>
  Effect.runSync(Effect.flip(effect.pipe(Effect.provide(testLayer(fixture)))))

const id = (value: string): DepartmentIdentifier => DepartmentIdentifier.make(value)
const name = (value: string): DepartmentName => DepartmentName.make(value)
const person = (value: string): PersonLocator => PersonLocator.make(value)

describe("HR department public operations", () => {
  it("loads and projects complete department summaries", () => {
    const fixture = baseFixture()
    const result = runWithFixture(listDepartments({ limit: 4 }), fixture)
    const product = result.departments.find((department) => department.id === "department-product")

    expect(result.total).toBe(4)
    expect(result.departments).toHaveLength(4)
    expect(product).toMatchObject({
      id: "department-product",
      path: "Product",
      description: "Product organization",
      avatar: "avatar-ref",
      directStaff: 1,
      derivedMembers: 1,
      subdepartments: 2,
      attachments: 2,
      comments: 3,
      channels: 4,
      createdOn: 2,
      modifiedOn: 3,
      teamLead: { id: "person-alice", name: "Alice,Anderson" },
      managers: [{ id: "person-alice", name: "Alice,Anderson" }],
      subscribers: [{ id: "person-bob", name: "Bob,Baker" }]
    })
  })

  it("lists direct children, recursively lists descendants, and resolves a path", () => {
    const fixture = baseFixture()
    const direct = runWithFixture(listDepartments({ parent: id("department-product") }), fixture)
    const recursive = runWithFixture(listDepartments({ parent: id("Product"), recursive: true }), fixture)
    const spacedPath = Schema.decodeUnknownSync(DepartmentIdentifier)(" Product / Design ")
    const department = runWithFixture(getDepartment({ department: spacedPath }), fixture)

    expect(direct.departments.map((item) => item.id)).toEqual(["department-design"])
    expect(direct.total).toBe(1)
    expect(recursive.departments.map((item) => item.id)).toEqual(["department-design", "department-research"])
    expect(department.parent).toEqual({ id: "department-product", path: "Product" })
  })

  it("projects staff filters, department references, and nullable positions", () => {
    const fixture = baseFixture()
    const result = runWithFixture(
      listStaff({ department: id("department-product"), includeDescendants: true, active: true, limit: 10 }),
      fixture
    )
    const all = runWithFixture(listStaff({ limit: 10 }), fixture)

    expect(result.total).toBe(1)
    expect(result.staff[0]).toMatchObject({
      id: "person-alice",
      name: "Alice,Anderson",
      active: true,
      department: { id: "department-product", path: "Product" },
      position: "Director"
    })
    const bob = all.staff.find((staff) => staff.id === "person-bob")
    const head = all.staff.find((staff) => staff.id === "person-head")
    expect(bob).toBeDefined()
    expect(Object.hasOwn(bob ?? {}, "position")).toBe(false)
    expect(head).toBeDefined()
    expect(Object.hasOwn(head ?? {}, "department")).toBe(false)
  })

  it("lists only direct department staff and rejects a missing Staff department", () => {
    const fixture = baseFixture()
    const direct = runWithFixture(listStaff({ department: id("department-product"), limit: 10 }), fixture)
    expect(direct.staff.map((staff) => staff.id)).toEqual(["person-alice"])

    const broken = {
      ...fixture,
      staff: [makeStaff("person-broken", "Broken,Staff", docRef<HulyDepartment>("missing-department"))]
    }
    const error = failWithFixture(listStaff({ limit: 10 }), broken)
    expect(error).toBeInstanceOf(DepartmentHierarchyError)
    expect(error.message).toContain("references missing department")
  })

  it("reports malformed department hierarchies through typed errors", () => {
    const missingParent = { ...baseFixture(), departments: [makeDepartment("broken", "Broken", docRef("missing"))] }
    const missingError = failWithFixture(listDepartments({}), missingParent)
    expect(missingError).toBeInstanceOf(DepartmentHierarchyError)
    expect(missingError.message).toContain("references missing parent")

    const cycleA = makeDepartment("cycle-a", "Cycle A", docRef("cycle-b"))
    const cycleB = makeDepartment("cycle-b", "Cycle B", cycleA._id)
    const cycleError = failWithFixture(listDepartments({}), { ...baseFixture(), departments: [cycleA, cycleB] })
    expect(cycleError).toBeInstanceOf(DepartmentHierarchyError)
    expect(cycleError.message).toContain("parent cycle")
  })

  it("fails a summary when a relationship person cannot be projected", () => {
    const department = makeDepartment("unresolved", "Unresolved", hr.ids.Head, {
      managers: [docRef<HulyEmployee>("missing-person")]
    })
    const fixture = { ...baseFixture(), departments: [makeDepartment(String(hr.ids.Head), "Head"), department] }
    const error = failWithFixture(getDepartment({ department: id("unresolved") }), fixture)

    expect(error).toBeInstanceOf(DepartmentHierarchyError)
    expect(error.message).toContain("unresolved manager")
  })

  it("rejects unresolved team-lead, subscriber, and parent projections", () => {
    const fixture = baseFixture()
    for (const [relationship, department] of [
      [
        "team lead",
        makeDepartment("unresolved-lead", "Unresolved Lead", hr.ids.Head, {
          teamLead: docRef<HulyEmployee>("missing-lead")
        })
      ],
      [
        "subscriber",
        makeDepartment("unresolved-subscriber", "Unresolved Subscriber", hr.ids.Head, {
          subscribers: [docRef<HulyPerson>("missing-subscriber")]
        })
      ]
    ] as const) {
      const catalog: DepartmentCatalog = {
        departments: [department],
        byId: new Map([[department._id, department]]),
        pathById: new Map([[department._id, DepartmentPath.make(department.name)]])
      }
      const error = Effect.runSync(Effect.flip(toDepartmentSummary(fixtureClient(fixture), catalog, department)))
      expect(error.message).toContain(`unresolved ${relationship}`)
    }

    const child = makeDepartment("orphan-projection", "Orphan Projection", docRef("missing-parent"))
    const catalog: DepartmentCatalog = {
      departments: [child],
      byId: new Map([[child._id, child]]),
      pathById: new Map([[child._id, DepartmentPath.make("Orphan Projection")]])
    }
    const error = Effect.runSync(Effect.flip(toDepartmentSummary(fixtureClient(fixture), catalog, child)))
    expect(error.message).toContain("unresolved parent projection")
  })

  it("rejects a summary whose catalog projection has no path", () => {
    const fixture = baseFixture()
    const department = fixture.departments[1]
    if (department === undefined) throw new Error("fixture department missing")
    const catalog = {
      departments: fixture.departments,
      byId: new Map(fixture.departments.map((item) => [item._id, item])),
      pathById: new Map<Ref<HulyDepartment>, DepartmentPath>()
    }
    const error = Effect.runSync(Effect.flip(toDepartmentSummary(fixtureClient(fixture), catalog, department)))
    expect(error.message).toContain("no resolved hierarchy path")
  })

  it("resolves people and employees by ID, exact name, and exact email", () => {
    const fixture = baseFixture()
    const client = fixtureClient(fixture)
    const byId = Effect.runSync(resolveEmployee(client, person("person-alice")))
    const byName = Effect.runSync(resolveEmployee(client, person("Alice,Anderson")))
    const byEmail = Effect.runSync(resolveEmployee(client, person("alice@example.com")))
    const people = Effect.runSync(resolvePeople(client, [person("person-guest")]))
    const employees = Effect.runSync(resolveEmployees(client, [person("person-bob")]))

    expect(byId._id).toBe("person-alice")
    expect(byName._id).toBe("person-alice")
    expect(byEmail._id).toBe("person-alice")
    expect(people.map((item) => item._id)).toEqual(["person-guest"])
    expect(employees.map((item) => item._id)).toEqual(["person-bob"])
  })

  it("rejects duplicate names, duplicate emails, and non-employee people", () => {
    const duplicateName = makePerson("person-alice-copy", "Alice,Anderson")
    const nameFixture = { ...baseFixture(), persons: [...baseFixture().persons, duplicateName] }
    const nameError = Effect.runSync(Effect.flip(resolveEmployee(fixtureClient(nameFixture), person("Alice,Anderson"))))
    expect(nameError).toBeInstanceOf(PersonIdentifierAmbiguousError)

    const duplicateEmail = makeChannel("channel-alice-copy", "person-guest", "alice@example.com")
    const emailFixture = { ...baseFixture(), channels: [...baseFixture().channels, duplicateEmail] }
    const emailError = Effect.runSync(
      Effect.flip(resolveEmployee(fixtureClient(emailFixture), person("alice@example.com")))
    )
    expect(emailError).toBeInstanceOf(PersonIdentifierAmbiguousError)

    const missingFixture = baseFixture()
    const missingEmployee = Effect.runSync(
      Effect.flip(resolveEmployee(fixtureClient(missingFixture), person("person-guest")))
    )
    expect(missingEmployee).toBeInstanceOf(EmployeeNotFoundError)
  })

  it("returns typed not-found errors for absent departments, employees, and people", () => {
    const fixture = baseFixture()
    const client = fixtureClient(fixture)
    const departmentError = Effect.runSync(
      Effect.flip(resolveDepartmentFromCatalog(Effect.runSync(loadDepartmentCatalog(client)), id("absent")))
    )
    const employeeError = Effect.runSync(Effect.flip(resolveEmployee(client, person("absent-person"))))
    const peopleError = Effect.runSync(Effect.flip(resolvePeople(client, [person("absent-person")])))

    expect(departmentError).toBeInstanceOf(DepartmentNotFoundError)
    expect(employeeError).toBeInstanceOf(EmployeeNotFoundError)
    expect(peopleError).toBeInstanceOf(EmployeeNotFoundError)
  })

  it("creates top-level and nested departments with resolved relationships", () => {
    const topFixture = baseFixture()
    const top = runWithFixture(createDepartment({ name: name("Operations") }), topFixture)
    expect(top.path).toBe("Operations")
    expect(topFixture.calls.createDoc?.data).toMatchObject({
      name: "Operations",
      description: "",
      parent: hr.ids.Head,
      teamLead: null,
      managers: [],
      subscribers: [],
      members: []
    })

    const nestedFixture = baseFixture()
    const nested = runWithFixture(
      createDepartment({
        name: name("Platform"),
        parent: id("department-product"),
        description: "Platform team",
        teamLead: person("person-alice"),
        managers: [person("person-bob")],
        subscribers: [person("person-guest")]
      }),
      nestedFixture
    )
    expect(nested.path).toBe("Product/Platform")
    expect(nestedFixture.calls.createDoc?.data).toMatchObject({
      description: "Platform team",
      teamLead: "person-alice",
      managers: ["person-bob"],
      subscribers: ["person-guest"]
    })

    const nullLeadFixture = baseFixture()
    runWithFixture(createDepartment({ name: name("Support"), teamLead: null }), nullLeadFixture)
    expect(nullLeadFixture.calls.createDoc?.data).toMatchObject({ teamLead: null })
  })

  it("protects create and update from conflicts, missing fields, and populated moves", () => {
    const conflict = failWithFixture(createDepartment({ name: name("Product") }), baseFixture())
    expect(conflict).toBeInstanceOf(DepartmentConflictError)

    const noFields = failWithFixture(updateDepartment({ department: id("department-product") }), baseFixture())
    expect(noFields._tag).toBe("NoUpdateFieldsError")

    const populatedMove = failWithFixture(
      updateDepartment({ department: id("department-product"), newParent: id("department-sales") }),
      baseFixture()
    )
    expect(populatedMove).toBeInstanceOf(DepartmentHierarchyError)
    expect(populatedMove.message).toContain("server-derived members")

    const metadataFixture = baseFixture()
    const metadataUpdate = runWithFixture(
      updateDepartment({ department: id("department-product"), description: "Updated metadata" }),
      metadataFixture
    )
    expect(metadataUpdate.path).toBe("Product")
    expect(metadataFixture.calls.updateDoc?.operations).toEqual({ description: "Updated metadata" })
  })

  it("updates scalar and relationship fields with explicit null and empty arrays", () => {
    const fixture = baseFixture()
    const result = runWithFixture(
      updateDepartment({
        department: id("department-design"),
        name: name("Experience"),
        description: "Updated",
        newParent: null,
        teamLead: null,
        managers: [],
        subscribers: []
      }),
      fixture
    )

    expect(result.path).toBe("Experience")
    expect(fixture.calls.updateDoc?.operations).toEqual({
      name: "Experience",
      description: "Updated",
      parent: hr.ids.Head,
      teamLead: null,
      managers: [],
      subscribers: []
    })
  })

  it("updates one scalar without moving and assigns a resolved team lead", () => {
    const scalarFixture = baseFixture()
    const scalar = runWithFixture(
      updateDepartment({ department: id("department-design"), description: "Design systems" }),
      scalarFixture
    )
    expect(scalar.path).toBe("Product/Design")
    expect(scalarFixture.calls.updateDoc?.operations).toEqual({ description: "Design systems" })

    const relationshipFixture = baseFixture()
    runWithFixture(
      updateDepartment({ department: id("department-design"), teamLead: person("person-alice") }),
      relationshipFixture
    )
    expect(relationshipFixture.calls.updateDoc?.operations).toEqual({ teamLead: "person-alice" })

    const base = makeDepartment("parentless", "Parentless")
    const { parent: _parent, ...parentless } = base
    const parentlessFixture = {
      ...baseFixture(),
      departments: [makeDepartment(String(hr.ids.Head), "Head"), parentless]
    }
    const parsed = Schema.decodeUnknownSync(UpdateDepartmentParamsSchema)({
      department: "parentless",
      description: "Still top-level"
    })
    const parentlessResult = runWithFixture(updateDepartment(parsed), parentlessFixture)
    expect(parentlessResult.path).toBe("Parentless")
  })

  it("previews, rejects stale impact, and executes department deletion", () => {
    const previewFixture = baseFixture()
    const preview = runWithFixture(deleteDepartment({ department: id("department-product") }), previewFixture)
    expect(preview).toMatchObject({ path: "Product", impact: { subdepartments: 2, assignedStaff: 2 }, deleted: false })
    expect(previewFixture.calls.removeDoc).toBeUndefined()

    const stale = failWithFixture(
      deleteDepartment({
        department: id("department-product"),
        execute: true,
        expectedSubdepartments: Count.make(0),
        expectedAssignedStaff: Count.make(0)
      }),
      baseFixture()
    )
    expect(stale).toBeInstanceOf(DepartmentImpactMismatchError)

    const executeFixture = baseFixture()
    const executed = runWithFixture(
      deleteDepartment({
        department: id("department-product"),
        execute: true,
        expectedSubdepartments: Count.make(2),
        expectedAssignedStaff: Count.make(2)
      }),
      executeFixture
    )
    expect(executed.deleted).toBe(true)
    expect(executeFixture.calls.removeDoc?.id).toBe("department-product")
  })

  it("assigns, updates, clears, and skips an already-correct Staff mixin", () => {
    const createFixture = { ...baseFixture(), staff: [] }
    const created = runWithFixture(
      assignStaffDepartment({ employee: person("person-alice"), department: id("department-product") }),
      createFixture
    )
    expect(created.updated).toBe(true)
    expect(createFixture.calls.createMixin?.attributes).toEqual({ department: "department-product" })

    const updateFixture = baseFixture()
    const updated = runWithFixture(
      assignStaffDepartment({ employee: person("person-alice"), department: id("department-sales") }),
      updateFixture
    )
    expect(updated.department?.path).toBe("Sales")
    expect(updateFixture.calls.updateMixin?.attributes).toEqual({ department: "department-sales" })

    const clearFixture = baseFixture()
    const cleared = runWithFixture(
      assignStaffDepartment({ employee: person("person-alice"), department: null }),
      clearFixture
    )
    expect(cleared).toMatchObject({ employeeId: "person-alice", updated: true, propagation: "server-derived" })
    expect(cleared.department).toBeUndefined()
    expect(clearFixture.calls.updateMixin?.attributes).toEqual({ department: hr.ids.Head })

    const idempotentFixture = baseFixture()
    const idempotent = runWithFixture(
      assignStaffDepartment({ employee: person("person-alice"), department: id("department-product") }),
      idempotentFixture
    )
    expect(idempotent.updated).toBe(false)
    expect(idempotentFixture.calls.updateMixin).toBeUndefined()
  })
})

describe("HR department errors and schema contracts", () => {
  it("keeps typed error messages useful at the MCP boundary", () => {
    const errors = [
      new DepartmentNotFoundError({ identifier: id("missing") }),
      new DepartmentIdentifierAmbiguousError({ identifier: id("Product"), matches: Count.make(2) }),
      new DepartmentHierarchyError({ message: "cycle" }),
      new DepartmentConflictError({ message: "duplicate" }),
      new DepartmentImpactMismatchError({
        expectedSubdepartments: Count.make(1),
        actualSubdepartments: Count.make(2),
        expectedAssignedStaff: Count.make(3),
        actualAssignedStaff: Count.make(4)
      }),
      new EmployeeNotFoundError({ identifier: person("missing") })
    ]

    expect(errors.map((error) => error.message)).toEqual([
      "Department 'missing' not found; use an exact full path or department ID",
      "Department 'Product' matched 2 departments; use the full path or department ID",
      "cycle",
      "duplicate",
      "Department impact changed: expected 1 subdepartments and 3 assigned staff, found 2 and 4; preview again",
      "Employee 'missing' not found"
    ])
  })

  it("resolves exact departments and permits an available sibling name", () => {
    const fixture = baseFixture()
    const catalog = Effect.runSync(loadDepartmentCatalog(fixtureClient(fixture)))
    expect(Effect.runSync(resolveDepartmentFromCatalog(catalog, id("department-product"))).name).toBe("Product")
    expect(Effect.runSync(resolveDepartment(fixtureClient(fixture), id("department-sales"))).department.name).toBe(
      "Sales"
    )
    const sales = catalog.departments.find((department) => department._id === "department-sales")
    if (sales === undefined) throw new Error("sales fixture missing")
    expect(descendantsOf(catalog, sales)).toEqual([])
    expect(Effect.runSync(ensureNameAvailable(catalog, hr.ids.Head, name("New")))).toBeUndefined()
  })
})

const fixtureClient = (fixture: FixtureData): HulyClient["Service"] =>
  Effect.runSync(Effect.service(HulyClient).pipe(Effect.provide(testLayer(fixture))))
