import { describe, it } from "@effect/vitest"
import type {
  ReccuringEvent as HulyRecurringEvent,
  ReccuringInstance as HulyRecurringInstance
} from "@hcengineering/calendar"
import { AccessLevel } from "@hcengineering/calendar"
import type { Person } from "@hcengineering/contact"
import { type Class, type Doc, type MarkupBlobRef, type Ref, toFindResult } from "@hcengineering/core"
import { Effect } from "effect"
import { expect } from "vitest"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { listEventInstances } from "../../../src/huly/operations/calendar.js"

import { calendar, contact } from "../../../src/huly/huly-plugins.js"

// --- Mock Data Builders ---

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- test mock: partial ReccuringEvent
const makeRecurringEvent = (overrides?: Partial<HulyRecurringEvent>): HulyRecurringEvent => ({
  _id: "recur-event-1" as Ref<HulyRecurringEvent>,
  _class: calendar.class.ReccuringEvent,
  space: calendar.space.Calendar,
  title: "Weekly Standup",
  description: "" as HulyRecurringEvent["description"],
  eventId: "recur-1",
  date: 1700000000000,
  dueDate: 1700003600000,
  allDay: false,
  participants: [],
  // eslint-disable-next-line no-restricted-syntax -- test mock: double assertion for branded type
  calendar: "cal-1" as Ref<Doc> as HulyRecurringEvent["calendar"],
  access: AccessLevel.Owner,
  user: "" as HulyRecurringEvent["user"],
  blockTime: false,
  attachedTo: "attached-1" as Ref<Doc>,
  attachedToClass: "class-1" as Ref<Class<Doc>>,
  collection: "events",
  rules: [{ freq: "WEEKLY" }],
  exdate: [],
  rdate: [],
  originalStartTime: 1700000000000,
  timeZone: "UTC",
  modifiedBy: "user-1" as Doc["modifiedBy"],
  modifiedOn: Date.now(),
  createdBy: "user-1" as Doc["createdBy"],
  createdOn: Date.now(),
  ...overrides
} as HulyRecurringEvent)

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- test mock: partial ReccuringInstance
const makeRecurringInstance = (overrides?: Partial<HulyRecurringInstance>): HulyRecurringInstance => ({
  ...makeRecurringEvent(),
  _class: calendar.class.ReccuringInstance,
  recurringEventId: "recur-1",
  originalStartTime: 1700000000000,
  isCancelled: false,
  virtual: false,
  ...overrides
} as HulyRecurringInstance)

// --- Test Helpers ---

interface MockConfig {
  recurringEvents?: Array<HulyRecurringEvent>
  recurringInstances?: Array<HulyRecurringInstance>
  persons?: Array<Person>
}

const createTestLayer = (config: MockConfig) => {
  const recurringEvents = config.recurringEvents ?? []
  const recurringInstances = config.recurringInstances ?? []
  const persons = config.persons ?? []

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown, _options: unknown) => {
    if (_class === calendar.class.ReccuringInstance) {
      return Effect.succeed(toFindResult(recurringInstances as Array<Doc>))
    }
    if (_class === contact.class.Person) {
      const q = query as Record<string, unknown>
      if (q._id && typeof q._id === "object" && "$in" in (q._id as Record<string, unknown>)) {
        const ids = (q._id as Record<string, Array<string>>).$in
        const matched = persons.filter(p => ids.includes(p._id))
        return Effect.succeed(toFindResult(matched as Array<Doc>))
      }
      return Effect.succeed(toFindResult(persons as Array<Doc>))
    }
    if (_class === contact.class.Channel) {
      return Effect.succeed(toFindResult([]))
    }
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]

  const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
    if (_class === calendar.class.ReccuringEvent) {
      const q = query as Record<string, unknown>
      const found = recurringEvents.find(e => e.eventId === q.eventId)
      return Effect.succeed(found as Doc | undefined)
    }
    return Effect.succeed(undefined)
  }) as HulyClientOperations["findOne"]

  const fetchMarkupImpl: HulyClientOperations["fetchMarkup"] = (
    () => Effect.succeed("")
  ) as HulyClientOperations["fetchMarkup"]

  const uploadMarkupImpl: HulyClientOperations["uploadMarkup"] = (
    () => Effect.succeed("markup-ref-123" as MarkupBlobRef)
  ) as HulyClientOperations["uploadMarkup"]

  const updateMarkupImpl: HulyClientOperations["updateMarkup"] = (
    () => Effect.succeed(undefined as void)
  ) as HulyClientOperations["updateMarkup"]

  return HulyClient.testLayer({
    findAll: findAllImpl,
    findOne: findOneImpl,
    fetchMarkup: fetchMarkupImpl,
    uploadMarkup: uploadMarkupImpl,
    updateMarkup: updateMarkupImpl
  })
}

// --- Branch coverage tests ---

describe("listEventInstances - from/to date filters (lines 573, 577)", () => {
  // test-revizorro: approved
  it.effect("passes from filter when provided", () =>
    Effect.gen(function*() {
      const recurringEvent = makeRecurringEvent({ eventId: "recur-1" })
      const instances = [
        makeRecurringInstance({ eventId: "inst-1", recurringEventId: "recur-1", date: 1700100000000 })
      ]
      const testLayer = createTestLayer({
        recurringEvents: [recurringEvent],
        recurringInstances: instances
      })

      const result = yield* listEventInstances({
        recurringEventId: "recur-1",
        from: 1700000000000
      }).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(1)
    }))

  // test-revizorro: approved
  it.effect("passes to filter when provided", () =>
    Effect.gen(function*() {
      const recurringEvent = makeRecurringEvent({ eventId: "recur-1" })
      const instances = [
        makeRecurringInstance({ eventId: "inst-1", recurringEventId: "recur-1", dueDate: 1700200000000 })
      ]
      const testLayer = createTestLayer({
        recurringEvents: [recurringEvent],
        recurringInstances: instances
      })

      const result = yield* listEventInstances({
        recurringEventId: "recur-1",
        to: 1700300000000
      }).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(1)
    }))

  // test-revizorro: approved
  it.effect("passes both from and to filters", () =>
    Effect.gen(function*() {
      const recurringEvent = makeRecurringEvent({ eventId: "recur-1" })
      const instances = [
        makeRecurringInstance({ eventId: "inst-1", recurringEventId: "recur-1" })
      ]
      const testLayer = createTestLayer({
        recurringEvents: [recurringEvent],
        recurringInstances: instances
      })

      const result = yield* listEventInstances({
        recurringEventId: "recur-1",
        from: 1699000000000,
        to: 1701000000000
      }).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(1)
    }))
})

describe("listEventInstances - externalParticipants branch (line 624)", () => {
  // test-revizorro: approved
  it.effect("maps externalParticipants when present", () =>
    Effect.gen(function*() {
      const recurringEvent = makeRecurringEvent({ eventId: "recur-1" })
      const instances = [
        makeRecurringInstance({
          eventId: "inst-1",
          recurringEventId: "recur-1",
          externalParticipants: ["external@example.com", "guest@test.org"]
        })
      ]
      const testLayer = createTestLayer({
        recurringEvents: [recurringEvent],
        recurringInstances: instances
      })

      const result = yield* listEventInstances({
        recurringEventId: "recur-1"
      }).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(1)
      expect(result[0].externalParticipants).toEqual(["external@example.com", "guest@test.org"])
    }))

  // test-revizorro: approved
  it.effect("returns undefined externalParticipants when not present", () =>
    Effect.gen(function*() {
      const recurringEvent = makeRecurringEvent({ eventId: "recur-1" })
      const instances = [
        makeRecurringInstance({
          eventId: "inst-1",
          recurringEventId: "recur-1",
          externalParticipants: undefined
        })
      ]
      const testLayer = createTestLayer({
        recurringEvents: [recurringEvent],
        recurringInstances: instances
      })

      const result = yield* listEventInstances({
        recurringEventId: "recur-1"
      }).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(1)
      expect(result[0].externalParticipants).toBeUndefined()
    }))
})
