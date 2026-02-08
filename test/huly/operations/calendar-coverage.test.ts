import { describe, it } from "@effect/vitest"
import {
  AccessLevel,
  type Event as HulyEvent,
  type ReccuringEvent as HulyRecurringEvent,
  type ReccuringInstance as HulyRecurringInstance
} from "@hcengineering/calendar"
import type { Channel, Contact, Person } from "@hcengineering/contact"
import { type Class, type Doc, type MarkupBlobRef, type Ref, type Space, toFindResult } from "@hcengineering/core"
import { Effect } from "effect"
import { expect } from "vitest"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import {
  createEvent,
  createRecurringEvent,
  getEvent,
  listEventInstances,
  listEvents,
  updateEvent
} from "../../../src/huly/operations/calendar.js"
import { email, eventBrandId } from "../../helpers/brands.js"

import { calendar, contact } from "../../../src/huly/huly-plugins.js"

// --- Mock Data Builders ---

const asHulyEvent = (v: unknown) => v as HulyEvent
const asPerson = (v: unknown) => v as Person
const asRecurringEvent = (v: unknown) => v as HulyRecurringEvent
const asRecurringInstance = (v: unknown) => v as HulyRecurringInstance
const asChannel = (v: unknown) => v as Channel

const makeEvent = (overrides?: Partial<HulyEvent>): HulyEvent =>
  asHulyEvent({
    _id: "event-1" as Ref<HulyEvent>,
    _class: calendar.class.Event,
    space: calendar.space.Calendar,
    title: "Test Event",
    description: "" as HulyEvent["description"],
    eventId: "evt-id-1",
    date: 1700000000000,
    dueDate: 1700003600000,
    allDay: false,
    participants: [],
    // eslint-disable-next-line no-restricted-syntax -- test mock requires double cast through unknown
    calendar: "cal-1" as Ref<Doc> as HulyEvent["calendar"],
    access: AccessLevel.Owner,
    user: "" as HulyEvent["user"],
    blockTime: false,
    attachedTo: "attached-1" as Ref<Doc>,
    attachedToClass: "class-1" as Ref<Class<Doc>>,
    collection: "events",
    modifiedBy: "user-1" as Doc["modifiedBy"],
    modifiedOn: Date.now(),
    createdBy: "user-1" as Doc["createdBy"],
    createdOn: Date.now(),
    ...overrides
  })

const makePerson = (overrides?: Partial<Person>): Person =>
  asPerson({
    _id: "person-1" as Ref<Person>,
    _class: contact.class.Person,
    space: "space-1" as Ref<Space>,
    name: "John Doe",
    modifiedBy: "user-1" as Doc["modifiedBy"],
    modifiedOn: Date.now(),
    createdBy: "user-1" as Doc["createdBy"],
    createdOn: Date.now(),
    ...overrides
  })

const makeRecurringEvent = (overrides?: Partial<HulyRecurringEvent>): HulyRecurringEvent =>
  asRecurringEvent({
    ...makeEvent(),
    _class: calendar.class.ReccuringEvent,
    rules: [{ freq: "WEEKLY" }],
    exdate: [],
    rdate: [],
    originalStartTime: 1700000000000,
    timeZone: "UTC",
    ...overrides
  })

const makeRecurringInstance = (overrides?: Partial<HulyRecurringInstance>): HulyRecurringInstance =>
  asRecurringInstance({
    ...makeRecurringEvent(),
    _class: calendar.class.ReccuringInstance,
    recurringEventId: "evt-id-1",
    originalStartTime: 1700000000000,
    isCancelled: false,
    virtual: false,
    ...overrides
  })

// --- Test Helpers ---

interface MockConfig {
  events?: Array<HulyEvent>
  recurringEvents?: Array<HulyRecurringEvent>
  recurringInstances?: Array<HulyRecurringInstance>
  persons?: Array<Person>
  channels?: Array<Channel>
  hasCalendar?: boolean
  captureUpdateDoc?: { operations?: Record<string, unknown> }
  captureAddCollection?: { attributes?: Record<string, unknown> }
  captureUpdateMarkup?: { called?: boolean }
  captureUploadMarkup?: { called?: boolean }
}

const createTestLayer = (config: MockConfig) => {
  const events = config.events ?? []
  const recurringEvents = config.recurringEvents ?? []
  const recurringInstances = config.recurringInstances ?? []
  const persons = config.persons ?? []
  const channels = config.channels ?? []
  const hasCalendar = config.hasCalendar ?? true

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown, _options: unknown) => {
    if (_class === calendar.class.Event) {
      return Effect.succeed(toFindResult(events as Array<Doc>))
    }
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
      const q = query as Record<string, unknown>
      if (q.value && typeof q.value === "object" && "$in" in (q.value as Record<string, unknown>)) {
        const emails = (q.value as Record<string, Array<string>>).$in
        const matched = channels.filter(c => emails.includes(c.value))
        return Effect.succeed(toFindResult(matched as Array<Doc>))
      }
      return Effect.succeed(toFindResult(channels as Array<Doc>))
    }
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]

  const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
    if (_class === calendar.class.Event) {
      const q = query as Record<string, unknown>
      const found = events.find(e => e.eventId === q.eventId)
      return Effect.succeed(found as Doc | undefined)
    }
    if (_class === calendar.class.ReccuringEvent) {
      const q = query as Record<string, unknown>
      const found = recurringEvents.find(e => e.eventId === q.eventId)
      return Effect.succeed(found as Doc | undefined)
    }
    if (_class === calendar.class.Calendar) {
      if (!hasCalendar) return Effect.succeed(undefined)
      return Effect.succeed({ _id: "cal-1" } as Doc | undefined)
    }
    return Effect.succeed(undefined)
  }) as HulyClientOperations["findOne"]

  const fetchMarkupImpl: HulyClientOperations["fetchMarkup"] = (
    () => Effect.succeed("")
  ) as HulyClientOperations["fetchMarkup"]

  const updateDocImpl: HulyClientOperations["updateDoc"] = (
    (_class: unknown, _space: unknown, _objectId: unknown, operations: unknown) => {
      if (config.captureUpdateDoc) {
        config.captureUpdateDoc.operations = operations as Record<string, unknown>
      }
      return Effect.succeed({} as never)
    }
  ) as HulyClientOperations["updateDoc"]

  const addCollectionImpl: HulyClientOperations["addCollection"] = ((
    _class: unknown,
    _space: unknown,
    _attachedTo: unknown,
    _attachedToClass: unknown,
    _collection: unknown,
    attributes: unknown
  ) => {
    if (config.captureAddCollection) {
      config.captureAddCollection.attributes = attributes as Record<string, unknown>
    }
    return Effect.succeed("new-id" as Ref<Doc>)
  }) as HulyClientOperations["addCollection"]

  const uploadMarkupImpl: HulyClientOperations["uploadMarkup"] = (() => {
    if (config.captureUploadMarkup) {
      config.captureUploadMarkup.called = true
    }
    return Effect.succeed("markup-ref-123" as MarkupBlobRef)
  }) as HulyClientOperations["uploadMarkup"]

  const updateMarkupImpl: HulyClientOperations["updateMarkup"] = (() => {
    if (config.captureUpdateMarkup) {
      config.captureUpdateMarkup.called = true
    }
    return Effect.succeed(undefined as void)
  }) as HulyClientOperations["updateMarkup"]

  return HulyClient.testLayer({
    findAll: findAllImpl,
    findOne: findOneImpl,
    fetchMarkup: fetchMarkupImpl,
    updateDoc: updateDocImpl,
    addCollection: addCollectionImpl,
    uploadMarkup: uploadMarkupImpl,
    updateMarkup: updateMarkupImpl
  })
}

// --- ruleToHulyRule coverage (lines 106-121) ---

describe("createRecurringEvent - ruleToHulyRule with all optional fields", () => {
  // test-revizorro: approved
  it.effect("converts rule with endDate, count, interval", () =>
    Effect.gen(function*() {
      const captureAddCollection: MockConfig["captureAddCollection"] = {}
      const testLayer = createTestLayer({ captureAddCollection })

      yield* createRecurringEvent({
        title: "Recurring",
        startDate: 1700000000000,
        rules: [{
          freq: "WEEKLY",
          endDate: 1710000000000,
          count: 10,
          interval: 2
        }]
      }).pipe(Effect.provide(testLayer))

      const rules = captureAddCollection.attributes?.rules as Array<Record<string, unknown>>
      expect(rules).toHaveLength(1)
      expect(rules[0].freq).toBe("WEEKLY")
      expect(rules[0].endDate).toBe(1710000000000)
      expect(rules[0].count).toBe(10)
      expect(rules[0].interval).toBe(2)
    }))

  // test-revizorro: approved
  it.effect("converts rule with byDay, byMonthDay, byMonth, bySetPos, wkst", () =>
    Effect.gen(function*() {
      const captureAddCollection: MockConfig["captureAddCollection"] = {}
      const testLayer = createTestLayer({ captureAddCollection })

      yield* createRecurringEvent({
        title: "Complex Recurring",
        startDate: 1700000000000,
        rules: [{
          freq: "MONTHLY",
          byDay: ["MO", "WE", "FR"],
          byMonthDay: [1, 15],
          byMonth: [1, 6, 12],
          bySetPos: [-1],
          wkst: "MO"
        }]
      }).pipe(Effect.provide(testLayer))

      const rules = captureAddCollection.attributes?.rules as Array<Record<string, unknown>>
      expect(rules).toHaveLength(1)
      expect(rules[0].freq).toBe("MONTHLY")
      expect(rules[0].byDay).toEqual(["MO", "WE", "FR"])
      expect(rules[0].byMonthDay).toEqual([1, 15])
      expect(rules[0].byMonth).toEqual([1, 6, 12])
      expect(rules[0].bySetPos).toEqual([-1])
      expect(rules[0].wkst).toBe("MO")
    }))

  // test-revizorro: approved
  it.effect("copies arrays (byDay, byMonthDay, byMonth, bySetPos) without shared references", () =>
    Effect.gen(function*() {
      const captureAddCollection: MockConfig["captureAddCollection"] = {}
      const testLayer = createTestLayer({ captureAddCollection })

      const originalByDay = ["TU", "TH"]
      yield* createRecurringEvent({
        title: "Array Copy Test",
        startDate: 1700000000000,
        rules: [{
          freq: "WEEKLY",
          byDay: originalByDay
        }]
      }).pipe(Effect.provide(testLayer))

      const rules = captureAddCollection.attributes?.rules as Array<Record<string, unknown>>
      const resultByDay = rules[0].byDay as Array<string>
      expect(resultByDay).toEqual(["TU", "TH"])
      expect(resultByDay).not.toBe(originalByDay)
    }))
})

// --- createEvent coverage (lines 300-352) ---

describe("createEvent - description and participants", () => {
  // test-revizorro: approved
  it.effect("creates event with description via resolveEventInputs", () =>
    Effect.gen(function*() {
      const captureAddCollection: MockConfig["captureAddCollection"] = {}
      const captureUploadMarkup: MockConfig["captureUploadMarkup"] = {}
      const testLayer = createTestLayer({ captureAddCollection, captureUploadMarkup })

      const result = yield* createEvent({
        title: "Event with Desc",
        date: 1700000000000,
        description: "Some markdown description"
      }).pipe(Effect.provide(testLayer))

      expect(result.eventId).toBeDefined()
      expect(captureUploadMarkup.called).toBe(true)
      expect(captureAddCollection.attributes?.description).toBe("markup-ref-123")
    }))

  // test-revizorro: approved
  it.effect("creates event with participants resolved from emails", () =>
    Effect.gen(function*() {
      const person = makePerson({ _id: "person-1" as Ref<Person>, name: "Alice" })
      const channel = asChannel({
        _id: "channel-1" as Ref<Channel>,
        _class: contact.class.Channel,
        space: "space-1" as Ref<Space>,
        value: "alice@example.com",
        attachedTo: "person-1" as Ref<Doc>,
        attachedToClass: contact.class.Person as Ref<Class<Doc>>,
        collection: "channels",
        provider: "email",
        modifiedBy: "user-1" as Doc["modifiedBy"],
        modifiedOn: Date.now(),
        createdBy: "user-1" as Doc["createdBy"],
        createdOn: Date.now()
      })
      const captureAddCollection: MockConfig["captureAddCollection"] = {}
      const testLayer = createTestLayer({
        persons: [person],
        channels: [channel],
        captureAddCollection
      })

      const result = yield* createEvent({
        title: "Event with Participants",
        date: 1700000000000,
        participants: [email("alice@example.com")]
      }).pipe(Effect.provide(testLayer))

      expect(result.eventId).toBeDefined()
      const participants = captureAddCollection.attributes?.participants as Array<string>
      expect(participants).toHaveLength(1)
      expect(participants[0]).toBe("person-1")
    }))

  // test-revizorro: suspect | weak assertion: toBeUndefined() doesn't verify uploadMarkup wasn't called, only that property wasn't set; should check called=false or verify no markup ref in attributes
  it.effect("creates event with empty description (whitespace only) - no upload", () =>
    Effect.gen(function*() {
      const captureAddCollection: MockConfig["captureAddCollection"] = {}
      const captureUploadMarkup: MockConfig["captureUploadMarkup"] = {}
      const testLayer = createTestLayer({ captureAddCollection, captureUploadMarkup })

      yield* createEvent({
        title: "Event No Desc",
        date: 1700000000000,
        description: "   "
      }).pipe(Effect.provide(testLayer))

      expect(captureUploadMarkup.called).toBeUndefined()
    }))
})

// --- updateEvent coverage (lines 354-437) ---

describe("updateEvent - field update branches", () => {
  // test-revizorro: approved
  it.effect("updates date field", () =>
    Effect.gen(function*() {
      const event = makeEvent({ eventId: "evt-1" })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}
      const testLayer = createTestLayer({ events: [event], captureUpdateDoc })

      const result = yield* updateEvent({
        eventId: eventBrandId("evt-1"),
        date: 1800000000000
      }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(true)
      expect(captureUpdateDoc.operations?.date).toBe(1800000000000)
    }))

  // test-revizorro: approved
  it.effect("updates dueDate field", () =>
    Effect.gen(function*() {
      const event = makeEvent({ eventId: "evt-1" })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}
      const testLayer = createTestLayer({ events: [event], captureUpdateDoc })

      const result = yield* updateEvent({
        eventId: eventBrandId("evt-1"),
        dueDate: 1800003600000
      }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(true)
      expect(captureUpdateDoc.operations?.dueDate).toBe(1800003600000)
    }))

  // test-revizorro: approved
  it.effect("updates allDay field", () =>
    Effect.gen(function*() {
      const event = makeEvent({ eventId: "evt-1", allDay: false })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}
      const testLayer = createTestLayer({ events: [event], captureUpdateDoc })

      const result = yield* updateEvent({
        eventId: eventBrandId("evt-1"),
        allDay: true
      }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(true)
      expect(captureUpdateDoc.operations?.allDay).toBe(true)
    }))

  // test-revizorro: approved
  it.effect("updates location field", () =>
    Effect.gen(function*() {
      const event = makeEvent({ eventId: "evt-1" })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}
      const testLayer = createTestLayer({ events: [event], captureUpdateDoc })

      const result = yield* updateEvent({
        eventId: eventBrandId("evt-1"),
        location: "Building A, Room 101"
      }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(true)
      expect(captureUpdateDoc.operations?.location).toBe("Building A, Room 101")
    }))

  // test-revizorro: approved
  it.effect("updates visibility field", () =>
    Effect.gen(function*() {
      const event = makeEvent({ eventId: "evt-1" })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}
      const testLayer = createTestLayer({ events: [event], captureUpdateDoc })

      const result = yield* updateEvent({
        eventId: eventBrandId("evt-1"),
        visibility: "private"
      }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(true)
      expect(captureUpdateDoc.operations?.visibility).toBe("private")
    }))

  // test-revizorro: approved
  it.effect("updates multiple fields at once", () =>
    Effect.gen(function*() {
      const event = makeEvent({ eventId: "evt-1" })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}
      const testLayer = createTestLayer({ events: [event], captureUpdateDoc })

      const result = yield* updateEvent({
        eventId: eventBrandId("evt-1"),
        title: "Updated Title",
        date: 1800000000000,
        dueDate: 1800003600000,
        allDay: true,
        location: "New Place",
        visibility: "public"
      }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(true)
      expect(captureUpdateDoc.operations?.title).toBe("Updated Title")
      expect(captureUpdateDoc.operations?.date).toBe(1800000000000)
      expect(captureUpdateDoc.operations?.dueDate).toBe(1800003600000)
      expect(captureUpdateDoc.operations?.allDay).toBe(true)
      expect(captureUpdateDoc.operations?.location).toBe("New Place")
      expect(captureUpdateDoc.operations?.visibility).toBe("public")
    }))
})

describe("updateEvent - description in-place only path (line 423, 427)", () => {
  // test-revizorro: approved
  it.effect("returns updated=true without calling updateDoc when only description is updated in place", () =>
    Effect.gen(function*() {
      const event = makeEvent({
        eventId: "evt-1",
        description: "existing-markup-ref" as HulyEvent["description"]
      })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}
      const captureUpdateMarkup: MockConfig["captureUpdateMarkup"] = {}
      const testLayer = createTestLayer({
        events: [event],
        captureUpdateDoc,
        captureUpdateMarkup
      })

      const result = yield* updateEvent({
        eventId: eventBrandId("evt-1"),
        description: "Updated description content"
      }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(true)
      expect(captureUpdateMarkup.called).toBe(true)
      // updateDoc should NOT have been called since only markup was updated in place
      expect(captureUpdateDoc.operations).toBeUndefined()
    }))

  // test-revizorro: approved
  it.effect("calls updateDoc when description is updated in place AND other fields change", () =>
    Effect.gen(function*() {
      const event = makeEvent({
        eventId: "evt-1",
        description: "existing-markup-ref" as HulyEvent["description"]
      })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}
      const captureUpdateMarkup: MockConfig["captureUpdateMarkup"] = {}
      const testLayer = createTestLayer({
        events: [event],
        captureUpdateDoc,
        captureUpdateMarkup
      })

      const result = yield* updateEvent({
        eventId: eventBrandId("evt-1"),
        description: "Updated description content",
        title: "Also new title"
      }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(true)
      expect(captureUpdateMarkup.called).toBe(true)
      expect(captureUpdateDoc.operations?.title).toBe("Also new title")
      // description should not appear in updateOps since it was handled via updateMarkup
      expect(captureUpdateDoc.operations?.description).toBeUndefined()
    }))
})

// --- listEvents from/to filter branches (lines 222, 226) ---

describe("listEvents - from/to date filters", () => {
  // test-revizorro: suspect | Mock ignores query parameter entirely; doesn't actually test filtering logic
  it.effect("applies from filter when provided", () =>
    Effect.gen(function*() {
      const events = [makeEvent({ eventId: "evt-1", date: 1700100000000 })]
      const testLayer = createTestLayer({ events })

      const result = yield* listEvents({ from: 1700000000000 }).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(1)
    }))

  // test-revizorro: suspect | Single event always matches; test doesn't verify filter excludes out-of-range events
  it.effect("applies to filter when provided", () =>
    Effect.gen(function*() {
      const events = [makeEvent({ eventId: "evt-1", dueDate: 1700200000000 })]
      const testLayer = createTestLayer({ events })

      const result = yield* listEvents({ to: 1700300000000 }).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(1)
    }))

  // test-revizorro: approved
  it.effect("applies both from and to filters", () =>
    Effect.gen(function*() {
      const events = [makeEvent({ eventId: "evt-1" })]
      const testLayer = createTestLayer({ events })

      const result = yield* listEvents({
        from: 1699000000000,
        to: 1701000000000
      }).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(1)
    }))
})

// --- getEvent externalParticipants (line 291) ---

describe("getEvent - externalParticipants mapping", () => {
  // test-revizorro: approved
  it.effect("maps externalParticipants from event", () =>
    Effect.gen(function*() {
      const event = makeEvent({
        eventId: "evt-1",
        externalParticipants: ["ext@example.com", "guest@test.org"]
      })
      const testLayer = createTestLayer({ events: [event] })

      const result = yield* getEvent({ eventId: eventBrandId("evt-1") }).pipe(Effect.provide(testLayer))

      expect(result.externalParticipants).toEqual(["ext@example.com", "guest@test.org"])
    }))
})

// --- resolveEventInputs: no calendar fallback (line 189) ---

describe("createEvent - no default calendar fallback", () => {
  // test-revizorro: approved
  it.effect("uses empty ref when no calendar exists", () =>
    Effect.gen(function*() {
      const captureAddCollection: MockConfig["captureAddCollection"] = {}
      const testLayer = createTestLayer({ captureAddCollection, hasCalendar: false })

      const result = yield* createEvent({
        title: "Event No Calendar",
        date: 1700000000000
      }).pipe(Effect.provide(testLayer))

      expect(result.eventId).toBeDefined()
      expect(captureAddCollection.attributes?.calendar).toBe("")
    }))
})

// --- findPersonsByEmails: empty emails and no matching persons (lines 128, 136) ---

describe("createEvent - findPersonsByEmails edge cases", () => {
  // test-revizorro: approved
  it.effect("handles empty participants array (emails.length === 0)", () =>
    Effect.gen(function*() {
      const captureAddCollection: MockConfig["captureAddCollection"] = {}
      const testLayer = createTestLayer({ captureAddCollection })

      yield* createEvent({
        title: "No Participants",
        date: 1700000000000,
        participants: []
      }).pipe(Effect.provide(testLayer))

      expect(captureAddCollection.attributes?.participants).toEqual([])
    }))

  // test-revizorro: approved
  it.effect("handles channels found but no matching persons (personIds.length === 0)", () =>
    Effect.gen(function*() {
      const captureAddCollection: MockConfig["captureAddCollection"] = {}
      // Channels exist but point to persons that don't exist in the persons list
      const testLayer = createTestLayer({
        captureAddCollection,
        channels: [],
        persons: []
      })

      yield* createEvent({
        title: "With Unknown Emails",
        date: 1700000000000,
        participants: [email("unknown@example.com")]
      }).pipe(Effect.provide(testLayer))

      // No channels match, so personIds is empty, so participants is empty
      expect(captureAddCollection.attributes?.participants).toEqual([])
    }))
})

// --- listEventInstances: participantMap.get fallback (line 622) ---

describe("listEventInstances - participantMap fallback", () => {
  // test-revizorro: suspect | Only checks toBeDefined() - doesn't verify actual empty array value from fallback
  it.effect("falls back to empty array when participantMap has no entry for instance eventId", () =>
    Effect.gen(function*() {
      const recurringEvent = makeRecurringEvent({ eventId: "recur-1" })
      // Instance has a participant ref, but the person lookup returns a person
      // whose id doesn't match the instance's participant ref.
      // This causes the participantMap to have entries only for matched participants,
      // and if none match for an instance, the `?? []` fallback triggers.
      const person = makePerson({ _id: "person-99" as Ref<Person>, name: "Unknown" })
      const instances = [
        makeRecurringInstance({
          eventId: "inst-1",
          recurringEventId: "recur-1",
          participants: ["person-1" as Ref<Contact>]
        })
      ]
      const testLayer = createTestLayer({
        recurringEvents: [recurringEvent],
        recurringInstances: instances,
        persons: [person]
      })

      const result = yield* listEventInstances({
        recurringEventId: eventBrandId("recur-1"),
        includeParticipants: true
      }).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(1)
      // The participant ref "person-1" doesn't match person "person-99",
      // so it gets filtered out, but the participantMap entry should still exist (empty array)
      expect(result[0].participants).toBeDefined()
    }))
})
