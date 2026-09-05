import { AvatarType, type Employee } from "@hcengineering/contact"
import {
  type Class,
  type Data,
  type Doc,
  type DocumentQuery,
  type DocumentUpdate,
  type FindOptions,
  type Ref,
  type Space,
  toFindResult
} from "@hcengineering/core"
import type { Department, PublicHoliday, Request as HulyRequest, RequestType, Staff } from "@hcengineering/hr"
import { getEmbeddedLabel } from "@hcengineering/platform"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import { DepartmentIdentifier, HrCalendarDate, NonEmptyString, PublicHolidayId } from "../../../src/domain/schemas.js"
import {
  DepartmentHierarchyError,
  DepartmentNotFoundError,
  HulyDataInvalidError,
  PublicHolidayConflictError,
  PublicHolidayNotFoundError
} from "../../../src/huly/errors.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { contact, core, hr } from "../../../src/huly/huly-plugins.js"
import {
  createPublicHoliday,
  deletePublicHoliday,
  getPublicHoliday,
  listPublicHolidays,
  loadAllPublicHolidaySummaries,
  updatePublicHoliday
} from "../../../src/huly/operations/hr-holidays.js"
import { HrPageSize } from "../../../src/huly/operations/hr-pagination.js"
import { getHrSchedule, getHrSummaryReport, getHrTable } from "../../../src/huly/operations/hr-reports.js"
import { corePersonId, docRef } from "../../helpers/huly-sdk.js"

interface Calls {
  readonly creates: Array<{ readonly data: unknown }>
  readonly updates: Array<{ readonly id: string; readonly operations: unknown }>
  readonly removals: Array<string>
  readonly pageExclusions: Array<ReadonlyArray<unknown>>
}

interface Fixture {
  readonly departments: ReadonlyArray<Department>
  readonly holidays: ReadonlyArray<PublicHoliday>
  readonly employees: ReadonlyArray<Employee>
  readonly staff: ReadonlyArray<Staff | Omit<Staff, "department">>
  readonly requestTypes: ReadonlyArray<RequestType>
  readonly requests: ReadonlyArray<HulyRequest>
  readonly staffDepartmentQueryReturnsEmpty: boolean
  readonly calls: Calls
}

const makeDepartment = (id: string, name: string, parent = hr.ids.Head): Department => ({
  _id: docRef<Department>(id),
  _class: hr.class.Department,
  space: core.space.Workspace,
  name,
  description: "",
  parent,
  teamLead: null,
  managers: [],
  members: [],
  modifiedBy: corePersonId("actor"),
  modifiedOn: 1
})

const makeHoliday = (
  id: string,
  title: string,
  department: Ref<Department>,
  year: number,
  month: number,
  day: number,
  offset = 0
): PublicHoliday => ({
  _id: docRef<PublicHoliday>(id),
  _class: hr.class.PublicHoliday,
  space: core.space.Workspace,
  title,
  description: `${title} description`,
  date: { year, month, day, offset },
  department,
  modifiedBy: corePersonId("actor"),
  modifiedOn: day
})

const makeEmployee = (id: string, name: string): Employee => ({
  _id: docRef<Employee>(id),
  _class: contact.mixin.Employee,
  space: contact.space.Contacts,
  name,
  avatarType: AvatarType.COLOR,
  active: true,
  modifiedBy: corePersonId("actor"),
  modifiedOn: 1
})

const makeStaff = (employee: Employee, department: Ref<Department>): Staff => ({
  ...employee,
  _id: docRef<Staff>(employee._id),
  department
})

const makeRequestType = (id: string, label: string, value: number): RequestType => ({
  _id: docRef<RequestType>(id),
  _class: hr.class.RequestType,
  space: core.space.Model,
  label: getEmbeddedLabel(label),
  icon: hr.icon.PTO,
  value,
  color: 2,
  modifiedBy: corePersonId("actor"),
  modifiedOn: 1
})

const makeRequest = (
  id: string,
  employee: Staff,
  department: Ref<Department>,
  type: Ref<RequestType>,
  startDay: number,
  endDay: number
): HulyRequest => ({
  _id: docRef<HulyRequest>(id),
  _class: hr.class.Request,
  space: core.space.Workspace,
  attachedTo: employee._id,
  attachedToClass: contact.mixin.Employee,
  collection: "requests",
  department,
  type,
  description: "",
  tzDate: { year: 2026, month: 8, day: startDay, offset: -240 },
  tzDueDate: { year: 2026, month: 8, day: endDay, offset: 330 },
  modifiedBy: corePersonId("actor"),
  modifiedOn: endDay
})

const fixture = (): Fixture => {
  const head = makeDepartment(String(hr.ids.Head), "Head")
  const product = makeDepartment("department-product", "Product")
  const design = makeDepartment("department-design", "Design", product._id)
  const sales = makeDepartment("department-sales", "Sales")
  const alice = makeEmployee("employee-alice", "Alice,Agent")
  const bob = makeEmployee("employee-bob", "Bob,Builder")
  const cara = makeEmployee("employee-cara", "Cara,Closer")
  const aliceStaff = makeStaff(alice, design._id)
  const bobStaff = makeStaff(bob, product._id)
  const caraStaff = makeStaff(cara, sales._id)
  const leave = makeRequestType("type-leave", "Leave", -1)
  const allowance = makeRequestType("type-allowance", "Allowance", 2)
  const neutral = makeRequestType("type-neutral", "Neutral", 0)
  return {
    departments: [head, product, design, sales],
    holidays: [
      makeHoliday("holiday-parent", "Parent Friday", product._id, 2026, 8, 4, -240),
      makeHoliday("holiday-child", "Child Monday", design._id, 2026, 8, 7, 330),
      makeHoliday("holiday-sales", "Sales Tuesday", sales._id, 2026, 8, 8)
    ],
    employees: [alice, bob, cara],
    staff: [aliceStaff, bobStaff, caraStaff],
    requestTypes: [leave, allowance, neutral],
    requests: [
      makeRequest("request-alice-leave-1", aliceStaff, design._id, leave._id, 4, 7),
      makeRequest("request-alice-leave-2", aliceStaff, design._id, leave._id, 7, 7),
      makeRequest("request-bob-allowance", bobStaff, product._id, allowance._id, 5, 7),
      makeRequest("request-bob-neutral", bobStaff, product._id, neutral._id, 4, 4),
      makeRequest("request-sales", caraStaff, sales._id, leave._id, 4, 4),
      makeRequest("request-outside", aliceStaff, design._id, leave._id, 9, 9)
    ],
    staffDepartmentQueryReturnsEmpty: false,
    calls: { creates: [], updates: [], removals: [], pageExclusions: [] }
  }
}

const queryValue = (query: unknown, key: string): unknown =>
  typeof query === "object" && query !== null ? Reflect.get(query, key) : undefined

const matchesSelector = (actual: unknown, expected: unknown): boolean => {
  if (typeof expected !== "object" || expected === null) return actual === expected
  const included = queryValue(expected, "$in")
  if (Array.isArray(included)) return included.some((value) => value === actual)
  const excluded = queryValue(expected, "$nin")
  return !Array.isArray(excluded) || !excluded.some((value) => value === actual)
}

const matchesQuery = (document: Doc, query: unknown): boolean =>
  ["_id", "department", "attachedTo", "type"].every((key) => {
    const expected = queryValue(query, key)
    return expected === undefined || matchesSelector(Reflect.get(document, key), expected)
  })

const layerFor = (state: Fixture) => {
  const fixtureMatchesClass = <T extends Doc>(classRef: Ref<Class<T>>, document: Doc): document is T => {
    const className = String(classRef)
    if (className === String(hr.class.Department)) return state.departments.some((item) => item === document)
    if (className === String(hr.class.PublicHoliday)) return state.holidays.some((item) => item === document)
    if (className === String(hr.class.Request)) return state.requests.some((item) => item === document)
    if (className === String(hr.class.RequestType)) return state.requestTypes.some((item) => item === document)
    if (className === String(contact.mixin.Employee)) return state.employees.some((item) => item === document)
    return className === String(hr.mixin.Staff) && state.staff.some((item) => item === document)
  }
  const documentsFor = <T extends Doc>(classRef: Ref<Class<T>>): Array<T> => {
    const documents: ReadonlyArray<Doc> = [
      ...state.departments,
      ...state.holidays,
      ...state.requests,
      ...state.requestTypes,
      ...state.employees,
      ...state.staff
    ]
    return documents.filter((document) => fixtureMatchesClass(classRef, document))
  }
  const findAll: HulyClientOperations["findAll"] = <T extends Doc>(
    classRef: Ref<Class<T>>,
    query: DocumentQuery<T>,
    options?: FindOptions<T>
  ) => {
    const excluded = queryValue(queryValue(query, "_id"), "$nin")
    if (Array.isArray(excluded)) state.calls.pageExclusions.push(excluded)
    const staffDepartmentQueryUnsupported =
      state.staffDepartmentQueryReturnsEmpty &&
      String(classRef) === String(hr.mixin.Staff) &&
      queryValue(query, "department") !== undefined
    const matches = staffDepartmentQueryUnsupported
      ? []
      : documentsFor(classRef).filter((document) => matchesQuery(document, query))
    const rows = options?.limit === undefined ? matches : matches.slice(0, options.limit)
    return Effect.succeed(toFindResult(rows, matches.length))
  }
  const findOne: HulyClientOperations["findOne"] = <T extends Doc>(
    classRef: Ref<Class<T>>,
    query: DocumentQuery<T>,
    options?: FindOptions<T>
  ) => Effect.map(findAll(classRef, query, options), (rows) => rows[0])
  const findAllInModel: HulyClientOperations["findAllInModel"] = <T extends Doc>(classRef: Ref<Class<T>>) => {
    const rows = documentsFor(classRef)
    return Effect.succeed(toFindResult(rows, rows.length))
  }
  const createDoc: HulyClientOperations["createDoc"] = <T extends Doc>(
    _classRef: Ref<Class<T>>,
    _space: Ref<Space>,
    data: Data<T>
  ) => {
    state.calls.creates.push({ data })
    return Effect.succeed(docRef<T>("holiday-created"))
  }
  const updateDoc: HulyClientOperations["updateDoc"] = <T extends Doc>(
    _classRef: Ref<Class<T>>,
    _space: Ref<Space>,
    id: Ref<T>,
    operations: DocumentUpdate<T>
  ) => {
    state.calls.updates.push({ id: String(id), operations })
    return Effect.succeed({})
  }
  const removeDoc: HulyClientOperations["removeDoc"] = <T extends Doc>(
    _classRef: Ref<Class<T>>,
    _space: Ref<Space>,
    id: Ref<T>
  ) => {
    state.calls.removals.push(String(id))
    return Effect.succeed({})
  }
  return HulyClient.testLayer({ findAll, findOne, findAllInModel, createDoc, updateDoc, removeDoc })
}

const run = <A, E>(effect: Effect.Effect<A, E, HulyClient>, state: Fixture): A =>
  Effect.runSync(effect.pipe(Effect.provide(layerFor(state))))

const fail = <A, E>(effect: Effect.Effect<A, E, HulyClient>, state: Fixture): E =>
  Effect.runSync(Effect.flip(effect.pipe(Effect.provide(layerFor(state)))))

describe("public holiday operations", () => {
  it("lists exact and inherited holiday pages with inclusive date filters", () => {
    const state = fixture()
    const inherited = run(
      listPublicHolidays({
        department: DepartmentIdentifier.make("Product/Design"),
        includeInherited: true,
        startDate: HrCalendarDate.make("2026-09-04"),
        endDate: HrCalendarDate.make("2026-09-07"),
        limit: 1
      }),
      state
    )
    expect(inherited).toMatchObject({ total: 2, returned: 1, truncated: true, nextOffset: 1 })
    expect(inherited.holidays[0]).toMatchObject({ id: "holiday-parent", department: { path: "Product" } })
    expect(
      run(
        listPublicHolidays({
          department: DepartmentIdentifier.make("department-design"),
          includeInherited: false,
          offset: 1
        }),
        state
      )
    ).toMatchObject({ total: 1, returned: 0, truncated: false })
    expect(
      run(listPublicHolidays({ department: DepartmentIdentifier.make("department-design") }), state).holidays
    ).toHaveLength(1)
    expect(run(listPublicHolidays({ startDate: HrCalendarDate.make("2026-09-08") }), state).holidays).toHaveLength(1)
    expect(run(getPublicHoliday({ holiday: PublicHolidayId.make("holiday-child") }), state)).toMatchObject({
      date: "2026-09-07",
      modifiedOn: 7
    })
  })

  it("loads every SDK page and rejects malformed or dangling holiday records", () => {
    const state = fixture()
    expect(run(loadAllPublicHolidaySummaries(HrPageSize.make(1)), state)).toHaveLength(3)
    expect(state.calls.pageExclusions).toEqual([
      ["holiday-parent"],
      ["holiday-parent", "holiday-child"],
      ["holiday-parent", "holiday-child", "holiday-sales"]
    ])
    expect(fail(getPublicHoliday({ holiday: PublicHolidayId.make("missing") }), state)).toBeInstanceOf(
      PublicHolidayNotFoundError
    )
    const firstHoliday = state.holidays[0]
    if (firstHoliday === undefined) throw new Error("fixture holiday missing")
    const malformed: Fixture = { ...state, holidays: [{ ...firstHoliday, title: "" }] }
    expect(fail(listPublicHolidays({}), malformed)).toBeInstanceOf(HulyDataInvalidError)
    const dangling = {
      ...state,
      holidays: [makeHoliday("holiday-dangling", "Dangling", docRef<Department>("missing"), 2026, 8, 4)]
    }
    expect(fail(listPublicHolidays({}), dangling)).toBeInstanceOf(DepartmentHierarchyError)
  })

  it("creates without read-after-write and detects offset-independent calendar conflicts", () => {
    const state = fixture()
    const created = run(
      createPublicHoliday({
        title: NonEmptyString.make("New holiday"),
        date: HrCalendarDate.make("2026-09-09"),
        department: DepartmentIdentifier.make("Product")
      }),
      state
    )
    expect(created).toMatchObject({ created: true, holiday: { id: "holiday-created", description: "" } })
    expect(state.calls.creates).toEqual([
      {
        data: {
          title: "New holiday",
          description: "",
          date: { year: 2026, month: 8, day: 9, offset: 0 },
          department: "department-product"
        }
      }
    ])
    expect(
      run(
        createPublicHoliday({
          title: NonEmptyString.make("Head holiday"),
          date: HrCalendarDate.make("2026-09-10"),
          department: DepartmentIdentifier.make(String(hr.ids.Head))
        }),
        state
      ).holiday.department
    ).toEqual({ id: String(hr.ids.Head), path: "Head" })
    expect(
      fail(
        createPublicHoliday({
          title: NonEmptyString.make("Duplicate"),
          date: HrCalendarDate.make("2026-09-04"),
          department: DepartmentIdentifier.make("department-product")
        }),
        state
      )
    ).toBeInstanceOf(PublicHolidayConflictError)
    const missingHead = { ...state, departments: state.departments.filter((item) => item._id !== hr.ids.Head) }
    expect(
      fail(
        createPublicHoliday({
          title: NonEmptyString.make("Head holiday"),
          date: HrCalendarDate.make("2026-09-10"),
          department: DepartmentIdentifier.make(String(hr.ids.Head))
        }),
        missingHead
      )
    ).toBeInstanceOf(DepartmentNotFoundError)
  })

  it("updates all mutable fields, keeps omitted fields, and deletes by exact ID", () => {
    const state = fixture()
    const updated = run(
      updatePublicHoliday({
        holiday: PublicHolidayId.make("holiday-child"),
        title: NonEmptyString.make("Moved holiday"),
        description: "Moved description",
        date: HrCalendarDate.make("2026-09-09"),
        department: DepartmentIdentifier.make("Product")
      }),
      state
    )
    expect(updated).toMatchObject({
      updated: true,
      holiday: { title: "Moved holiday", date: "2026-09-09", department: { path: "Product" } }
    })
    expect(state.calls.updates[0]).toMatchObject({
      id: "holiday-child",
      operations: { title: "Moved holiday", description: "Moved description", department: "department-product" }
    })
    expect(
      run(
        updatePublicHoliday({
          holiday: PublicHolidayId.make("holiday-child"),
          title: NonEmptyString.make("Renamed only")
        }),
        state
      ).holiday
    ).toMatchObject({ title: "Renamed only", date: "2026-09-07", department: { path: "Product/Design" } })
    expect(
      run(
        updatePublicHoliday({ holiday: PublicHolidayId.make("holiday-child"), description: "Description only" }),
        state
      ).holiday.description
    ).toBe("Description only")
    expect(run(deletePublicHoliday({ holiday: PublicHolidayId.make("holiday-child") }), state)).toEqual({
      id: "holiday-child",
      deleted: true
    })
    expect(state.calls.removals).toEqual(["holiday-child"])
  })

  it("rejects conflicting moves and updates whose stored department disappeared", () => {
    const state = fixture()
    expect(
      fail(
        updatePublicHoliday({
          holiday: PublicHolidayId.make("holiday-child"),
          date: HrCalendarDate.make("2026-09-04"),
          department: DepartmentIdentifier.make("Product")
        }),
        state
      )
    ).toBeInstanceOf(PublicHolidayConflictError)
    const missingOwner = {
      ...state,
      departments: state.departments.filter((item) => item._id !== docRef<Department>("department-design"))
    }
    expect(
      fail(
        updatePublicHoliday({
          holiday: PublicHolidayId.make("holiday-child"),
          title: NonEmptyString.make("Unavailable")
        }),
        missingOwner
      )
    ).toBeInstanceOf(DepartmentHierarchyError)
  })
})

describe("HR report operations", () => {
  const range = { startDate: HrCalendarDate.make("2026-09-04"), endDate: HrCalendarDate.make("2026-09-07") }

  it("composes complete paginated schedules with scoped inherited holidays", () => {
    const state = fixture()
    const schedule = run(
      getHrSchedule(
        { ...range, department: DepartmentIdentifier.make("Product"), includeSubdepartments: true },
        HrPageSize.make(1)
      ),
      state
    )
    expect(schedule).toMatchObject({ complete: true, requests: expect.any(Array), holidays: expect.any(Array) })
    expect(schedule.requests.map((request) => request.id)).toEqual([
      "request-alice-leave-1",
      "request-alice-leave-2",
      "request-bob-allowance",
      "request-bob-neutral"
    ])
    expect(schedule.holidays.map((holiday) => holiday.id)).toEqual(["holiday-parent", "holiday-child"])
    expect(schedule.days).toEqual([
      {
        date: "2026-09-04",
        weekend: false,
        requestIds: ["request-alice-leave-1", "request-bob-neutral"],
        holidayIds: ["holiday-parent"]
      },
      {
        date: "2026-09-05",
        weekend: true,
        requestIds: ["request-alice-leave-1", "request-bob-allowance"],
        holidayIds: []
      },
      {
        date: "2026-09-06",
        weekend: true,
        requestIds: ["request-alice-leave-1", "request-bob-allowance"],
        holidayIds: []
      },
      {
        date: "2026-09-07",
        weekend: false,
        requestIds: ["request-alice-leave-1", "request-alice-leave-2", "request-bob-allowance"],
        holidayIds: ["holiday-child"]
      }
    ])
    expect(state.calls.pageExclusions.length).toBeGreaterThan(3)
  })

  it("filters raw requests before resolving report summaries", () => {
    const state = fixture()
    const firstStaff = state.staff[0]
    const firstType = state.requestTypes[0]
    if (firstStaff === undefined || !("department" in firstStaff) || firstType === undefined) {
      throw new Error("fixture request dependencies missing")
    }
    const dangling = makeRequest("request-dangling", firstStaff, docRef<Department>("missing"), firstType._id, 4, 4)
    const contaminated = { ...state, requests: [...state.requests, dangling] }
    const scoped = run(getHrSchedule({ ...range, department: DepartmentIdentifier.make("Product") }), contaminated)
    expect(scoped.requests).toHaveLength(4)
    expect(fail(getHrSchedule(range), contaminated)).toBeInstanceOf(DepartmentHierarchyError)
  })

  it("preparses date windows before fully parsing report requests", () => {
    const state = fixture()
    const firstStaff = state.staff[0]
    const firstType = state.requestTypes[0]
    if (firstStaff === undefined || !("department" in firstStaff) || firstType === undefined) {
      throw new Error("fixture request dependencies missing")
    }
    const outsideRange = {
      ...state,
      requests: [
        {
          ...makeRequest("request-dangling-later", firstStaff, docRef<Department>("missing"), firstType._id, 9, 9),
          comments: -1
        }
      ]
    }
    expect(run(getHrSchedule(range), outsideRange).requests).toHaveLength(0)

    const malformedInRange = {
      ...state,
      requests: [
        {
          ...makeRequest(
            "request-malformed",
            firstStaff,
            docRef<Department>("department-product"),
            firstType._id,
            4,
            4
          ),
          comments: -1
        }
      ]
    }
    expect(fail(getHrSchedule(range), malformedInRange)).toBeInstanceOf(HulyDataInvalidError)
  })

  it("calculates employee tables across inherited, direct, and unscoped branches", () => {
    const state = fixture()
    const inherited = run(
      getHrTable({ ...range, department: DepartmentIdentifier.make("Product") }, HrPageSize.make(1)),
      state
    )
    expect(inherited.rows).toEqual([
      expect.objectContaining({
        employee: { id: "employee-alice", name: "Alice,Agent" },
        department: { id: "department-design", path: "Product/Design" },
        weekdays: 2,
        publicHolidayWorkdays: 2,
        baseWorkdays: 0,
        requestUnits: 0,
        netWorkdays: 0
      }),
      expect.objectContaining({
        employee: { id: "employee-bob", name: "Bob,Builder" },
        publicHolidayWorkdays: 1,
        baseWorkdays: 1,
        requestUnits: 6,
        netWorkdays: 7
      })
    ])
    expect(inherited.rows[0]?.requestTypes).toMatchObject([{ requestCount: 2, calendarDays: 5, workdays: 0 }])
    const direct = run(
      getHrTable({
        ...range,
        department: DepartmentIdentifier.make("Product"),
        includeSubdepartments: false,
        includeInheritedHolidays: false
      }),
      fixture()
    )
    expect(direct).toMatchObject({ totalEmployees: 1, rows: [{ publicHolidayWorkdays: 1 }] })
    expect(run(getHrTable(range), fixture()).totalEmployees).toBe(3)
  })

  it("aggregates summaries by collision-free department and request-type keys", () => {
    const summary = run(
      getHrSummaryReport({ ...range, department: DepartmentIdentifier.make("Product") }, HrPageSize.make(1)),
      fixture()
    )
    expect(summary).toMatchObject({
      complete: true,
      totalRequests: 4,
      totalCalendarDays: 9,
      totalWorkdays: 1,
      totalRequestUnits: 6,
      publicHolidayDocuments: 2
    })
    expect(summary.groups).toEqual([
      expect.objectContaining({
        department: { id: "department-design", path: "Product/Design" },
        requestType: { id: "type-leave", label: "Leave" },
        requestCount: 2,
        units: 0
      }),
      expect.objectContaining({
        department: { id: "department-product", path: "Product" },
        requestType: { id: "type-allowance", label: "Allowance" },
        requestCount: 1,
        units: 6
      }),
      expect.objectContaining({
        department: { id: "department-product", path: "Product" },
        requestType: { id: "type-neutral", label: "Neutral" },
        requestCount: 1,
        units: 0
      })
    ])
  })

  it("reports typed hierarchy and Staff boundary failures", () => {
    const state = fixture()
    expect(fail(getHrSchedule({ ...range, department: DepartmentIdentifier.make("missing") }), state)).toBeInstanceOf(
      DepartmentNotFoundError
    )
    const firstEmployee = state.employees[0]
    if (firstEmployee === undefined) throw new Error("fixture employee missing")
    const missingDepartment = { ...state, staff: [makeStaff(firstEmployee, docRef<Department>("missing"))] }
    expect(fail(getHrTable(range), missingDepartment)).toBeInstanceOf(DepartmentHierarchyError)
    const firstStaff = state.staff[0]
    if (firstStaff === undefined || !("department" in firstStaff)) throw new Error("fixture Staff missing")
    const malformedStaff: Fixture = { ...state, staff: [{ ...firstStaff, name: "" }] }
    expect(
      fail(getHrTable({ ...range, department: DepartmentIdentifier.make("Product") }), malformedStaff)
    ).toBeInstanceOf(HulyDataInvalidError)
    const headEmployee = makeEmployee("employee-head", "Harold,Head")
    const headState: Fixture = {
      ...state,
      employees: [...state.employees, headEmployee],
      staff: [...state.staff, makeStaff(headEmployee, hr.ids.Head)]
    }
    expect(run(getHrTable(range), headState).rows).toEqual(
      expect.arrayContaining([expect.objectContaining({ department: { id: String(hr.ids.Head), path: "Head" } })])
    )
  })

  it("excludes missing and out-of-scope Staff projections before full parsing", () => {
    const state = fixture()
    const unrelated = makeStaff(makeEmployee("employee-unrelated", "Unrelated,User"), docRef<Department>("missing"))
    const { department: _department, ...missingDepartmentProjection } = unrelated
    expect(
      run(getHrTable(range), { ...state, staff: [...state.staff, { ...missingDepartmentProjection, name: "" }] })
        .totalEmployees
    ).toBe(3)
    const contaminated: Fixture = {
      ...state,
      staff: [...state.staff, { ...unrelated, name: "" }, { ...missingDepartmentProjection, name: "" }]
    }
    expect(
      run(getHrTable({ ...range, department: DepartmentIdentifier.make("Product") }), contaminated).totalEmployees
    ).toBe(2)
  })

  it("scopes Staff locally when Huly returns no rows for a mixin department query", () => {
    const state = { ...fixture(), staffDepartmentQueryReturnsEmpty: true }
    expect(run(getHrTable({ ...range, department: DepartmentIdentifier.make("Product") }), state).totalEmployees).toBe(
      2
    )
  })
})
