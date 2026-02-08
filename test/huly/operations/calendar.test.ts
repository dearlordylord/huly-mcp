import { describe, it } from "@effect/vitest"
import {
  AccessLevel,
  type Event as HulyEvent,
  type ReccuringEvent as HulyRecurringEvent,
  type ReccuringInstance as HulyRecurringInstance
} from "@hcengineering/calendar"
import type { Contact, Person } from "@hcengineering/contact"
import { type Class, type Doc, type MarkupBlobRef, type Ref, type Space, toFindResult } from "@hcengineering/core"
import { Effect } from "effect"
import { expect } from "vitest"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import type { EventNotFoundError, RecurringEventNotFoundError } from "../../../src/huly/errors.js"
import {
  createEvent,
  createRecurringEvent,
  deleteEvent,
  getEvent,
  listEventInstances,
  listEvents,
  listRecurringEvents,
  updateEvent
} from "../../../src/huly/operations/calendar.js"

import { calendar, contact } from "../../../src/huly/huly-plugins.js"

// --- Mock Data Builders ---

const makeEvent = (overrides?: Partial<HulyEvent>): HulyEvent => ({
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

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- mock builder
const makeRecurringEvent = (overrides?: Partial<HulyRecurringEvent>): HulyRecurringEvent => ({
  ...makeEvent(),
  _class: calendar.class.ReccuringEvent,
  rules: [{ freq: "WEEKLY" }],
  exdate: [],
  rdate: [],
  originalStartTime: 1700000000000,
  timeZone: "UTC",
  ...overrides
} as HulyRecurringEvent)

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- mock builder
const makeRecurringInstance = (overrides?: Partial<HulyRecurringInstance>): HulyRecurringInstance => ({
  ...makeRecurringEvent(),
  _class: calendar.class.ReccuringInstance,
  recurringEventId: "evt-id-1",
  originalStartTime: 1700000000000,
  isCancelled: false,
  virtual: false,
  ...overrides
} as HulyRecurringInstance)

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- mock builder
const makePerson = (overrides?: Partial<Person>): Person => ({
  _id: "person-1" as Ref<Person>,
  _class: contact.class.Person,
  space: "space-1" as Ref<Space>,
  name: "John Doe",
  modifiedBy: "user-1" as Doc["modifiedBy"],
  modifiedOn: Date.now(),
  createdBy: "user-1" as Doc["createdBy"],
  createdOn: Date.now(),
  ...overrides
} as Person)

// --- Test Helpers ---

interface MockConfig {
  events?: Array<HulyEvent>
  recurringEvents?: Array<HulyRecurringEvent>
  recurringInstances?: Array<HulyRecurringInstance>
  persons?: Array<Person>
  markupContent?: Record<string, string>
  captureUpdateDoc?: { operations?: Record<string, unknown> }
  captureRemoveDoc?: { id?: string }
  captureAddCollection?: { attributes?: Record<string, unknown> }
}

const createTestLayer = (config: MockConfig) => {
  const events = config.events ?? []
  const recurringEvents = config.recurringEvents ?? []
  const recurringInstances = config.recurringInstances ?? []
  const persons = config.persons ?? []

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown, _options: unknown) => {
    if (_class === calendar.class.Event) {
      return Effect.succeed(toFindResult(events as Array<Doc>))
    }
    if (_class === calendar.class.ReccuringEvent) {
      return Effect.succeed(toFindResult(recurringEvents as Array<Doc>))
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
      return Effect.succeed(toFindResult([]))
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
      return Effect.succeed({ _id: "cal-1" } as Doc | undefined)
    }
    return Effect.succeed(undefined)
  }) as HulyClientOperations["findOne"]

  const markupContent = config.markupContent ?? {}
  const fetchMarkupImpl: HulyClientOperations["fetchMarkup"] = (
    (_objectClass: unknown, _objectId: unknown, _objectAttr: unknown, id: unknown) => {
      const content = markupContent[id as string] ?? ""
      return Effect.succeed(content)
    }
  ) as HulyClientOperations["fetchMarkup"]

  const updateDocImpl: HulyClientOperations["updateDoc"] = (
    (_class: unknown, _space: unknown, _objectId: unknown, operations: unknown) => {
      if (config.captureUpdateDoc) {
        config.captureUpdateDoc.operations = operations as Record<string, unknown>
      }
      return Effect.succeed({} as never)
    }
  ) as HulyClientOperations["updateDoc"]

  const removeDocImpl: HulyClientOperations["removeDoc"] = ((
    _class: unknown,
    _space: unknown,
    objectId: unknown
  ) => {
    if (config.captureRemoveDoc) {
      config.captureRemoveDoc.id = objectId as string
    }
    return Effect.succeed({})
  }) as HulyClientOperations["removeDoc"]

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

  const uploadMarkupImpl: HulyClientOperations["uploadMarkup"] =
    (() => Effect.succeed("markup-ref-123" as MarkupBlobRef)) as HulyClientOperations["uploadMarkup"]

  const updateMarkupImpl: HulyClientOperations["updateMarkup"] =
    (() => Effect.succeed(undefined as void)) as HulyClientOperations["updateMarkup"]

  return HulyClient.testLayer({
    findAll: findAllImpl,
    findOne: findOneImpl,
    fetchMarkup: fetchMarkupImpl,
    updateDoc: updateDocImpl,
    removeDoc: removeDocImpl,
    addCollection: addCollectionImpl,
    uploadMarkup: uploadMarkupImpl,
    updateMarkup: updateMarkupImpl
  })
}

// --- Tests ---

describe("listEvents", () => {
  // test-revizorro: approved
  it.effect("returns event summaries", () =>
    Effect.gen(function*() {
      const events = [
        makeEvent({ eventId: "evt-1", title: "Meeting", date: 1000, dueDate: 2000 }),
        makeEvent({ eventId: "evt-2", title: "Lunch", date: 3000, dueDate: 4000 })
      ]
      const testLayer = createTestLayer({ events })

      const result = yield* listEvents({}).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(2)
      expect(result[0].title).toBe("Meeting")
      expect(result[1].title).toBe("Lunch")
    }))

  // test-revizorro: approved
  it.effect("returns empty array when no events", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayer({})

      const result = yield* listEvents({}).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(0)
    }))
})

describe("getEvent", () => {
  // test-revizorro: approved
  it.effect("returns full event with participants", () =>
    Effect.gen(function*() {
      const person = makePerson({ _id: "person-1" as Ref<Person>, name: "Alice" })
      const event = makeEvent({
        eventId: "evt-1",
        title: "Team Sync",
        participants: ["person-1" as Ref<Contact>],
        description: "desc-ref" as HulyEvent["description"]
      })
      const testLayer = createTestLayer({
        events: [event],
        persons: [person],
        markupContent: { "desc-ref": "# Meeting notes" }
      })

      const result = yield* getEvent({ eventId: "evt-1" }).pipe(Effect.provide(testLayer))

      expect(result.eventId).toBe("evt-1")
      expect(result.title).toBe("Team Sync")
      expect(result.description).toBe("# Meeting notes")
      expect(result.participants).toHaveLength(1)
      expect(result.participants?.[0].name).toBe("Alice")
    }))

  // test-revizorro: approved
  it.effect("returns event without description when not set", () =>
    Effect.gen(function*() {
      const event = makeEvent({ eventId: "evt-1", description: "" as HulyEvent["description"] })
      const testLayer = createTestLayer({ events: [event] })

      const result = yield* getEvent({ eventId: "evt-1" }).pipe(Effect.provide(testLayer))

      expect(result.description).toBeUndefined()
    }))

  // test-revizorro: approved
  it.effect("fails with EventNotFoundError when event does not exist", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayer({})

      const error = yield* Effect.flip(
        getEvent({ eventId: "nonexistent" }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("EventNotFoundError")
      expect((error as EventNotFoundError).eventId).toBe("nonexistent")
    }))
})

describe("createEvent", () => {
  // test-revizorro: suspect | Missing dueDate assertion - should verify default calculation (date + 1 hour)
  it.effect("creates event with minimal params", () =>
    Effect.gen(function*() {
      const captureAddCollection: MockConfig["captureAddCollection"] = {}
      const testLayer = createTestLayer({ captureAddCollection })

      const result = yield* createEvent({
        title: "New Event",
        date: 1700000000000
      }).pipe(Effect.provide(testLayer))

      expect(result.eventId).toBeDefined()
      expect(captureAddCollection.attributes?.title).toBe("New Event")
      expect(captureAddCollection.attributes?.allDay).toBe(false)
    }))

  // test-revizorro: approved
  it.effect("creates event with all optional params", () =>
    Effect.gen(function*() {
      const captureAddCollection: MockConfig["captureAddCollection"] = {}
      const testLayer = createTestLayer({ captureAddCollection })

      const result = yield* createEvent({
        title: "Full Event",
        date: 1700000000000,
        dueDate: 1700010000000,
        allDay: true,
        location: "Room 42",
        visibility: "private"
      }).pipe(Effect.provide(testLayer))

      expect(result.eventId).toBeDefined()
      expect(captureAddCollection.attributes?.allDay).toBe(true)
      expect(captureAddCollection.attributes?.location).toBe("Room 42")
      expect(captureAddCollection.attributes?.visibility).toBe("private")
    }))

  // test-revizorro: approved
  it.effect("defaults dueDate to date + 1 hour when not provided", () =>
    Effect.gen(function*() {
      const captureAddCollection: MockConfig["captureAddCollection"] = {}
      const testLayer = createTestLayer({ captureAddCollection })
      const startDate = 1700000000000
      const ONE_HOUR_MS = 3600000

      yield* createEvent({ title: "Quick Event", date: startDate }).pipe(Effect.provide(testLayer))

      expect(captureAddCollection.attributes?.dueDate).toBe(startDate + ONE_HOUR_MS)
    }))
})

describe("updateEvent", () => {
  // test-revizorro: approved
  it.effect("updates event title", () =>
    Effect.gen(function*() {
      const event = makeEvent({ eventId: "evt-1", title: "Old Title" })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}
      const testLayer = createTestLayer({ events: [event], captureUpdateDoc })

      const result = yield* updateEvent({
        eventId: "evt-1",
        title: "New Title"
      }).pipe(Effect.provide(testLayer))

      expect(result.eventId).toBe("evt-1")
      expect(result.updated).toBe(true)
      expect(captureUpdateDoc.operations?.title).toBe("New Title")
    }))

  // test-revizorro: approved
  it.effect("returns updated=false when no fields provided", () =>
    Effect.gen(function*() {
      const event = makeEvent({ eventId: "evt-1" })
      const testLayer = createTestLayer({ events: [event] })

      const result = yield* updateEvent({ eventId: "evt-1" }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(false)
    }))

  // test-revizorro: approved
  it.effect("clears description with empty string", () =>
    Effect.gen(function*() {
      const event = makeEvent({ eventId: "evt-1", description: "old-desc" as HulyEvent["description"] })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}
      const testLayer = createTestLayer({ events: [event], captureUpdateDoc })

      const result = yield* updateEvent({
        eventId: "evt-1",
        description: "   "
      }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(true)
      expect(captureUpdateDoc.operations?.description).toBe("")
    }))

  // test-revizorro: suspect | doesn't verify updateMarkup was called; only checks updated=true which would pass for wrong code paths
  it.effect("updates description in place when event already has one", () =>
    Effect.gen(function*() {
      const event = makeEvent({ eventId: "evt-1", description: "existing-markup-ref" as HulyEvent["description"] })
      const testLayer = createTestLayer({ events: [event] })

      const result = yield* updateEvent({
        eventId: "evt-1",
        description: "Updated description"
      }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(true)
    }))

  // test-revizorro: suspect | Mock uploadMarkup hardcoded; doesn't verify uploadMarkup vs updateMarkup path taken
  it.effect("uploads new description when event has none", () =>
    Effect.gen(function*() {
      const event = makeEvent({ eventId: "evt-1", description: "" as HulyEvent["description"] })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}
      const testLayer = createTestLayer({ events: [event], captureUpdateDoc })

      const result = yield* updateEvent({
        eventId: "evt-1",
        description: "Brand new description"
      }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(true)
      expect(captureUpdateDoc.operations?.description).toBe("markup-ref-123")
    }))

  // test-revizorro: suspect | Only verifies error type, not error content (eventId missing from assertion)
  it.effect("fails with EventNotFoundError when event does not exist", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayer({})

      const error = yield* Effect.flip(
        updateEvent({ eventId: "nonexistent", title: "X" }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("EventNotFoundError")
    }))
})

describe("deleteEvent", () => {
  // test-revizorro: scheduled
  it.effect("deletes event", () =>
    Effect.gen(function*() {
      const event = makeEvent({ eventId: "evt-1" })
      const captureRemoveDoc: MockConfig["captureRemoveDoc"] = {}
      const testLayer = createTestLayer({ events: [event], captureRemoveDoc })

      const result = yield* deleteEvent({ eventId: "evt-1" }).pipe(Effect.provide(testLayer))

      expect(result.eventId).toBe("evt-1")
      expect(result.deleted).toBe(true)
      expect(captureRemoveDoc.id).toBe("event-1")
    }))

  // test-revizorro: approved
  it.effect("fails with EventNotFoundError when event does not exist", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayer({})

      const error = yield* Effect.flip(
        deleteEvent({ eventId: "nonexistent" }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("EventNotFoundError")
      expect((error as EventNotFoundError).eventId).toBe("nonexistent")
    }))
})

describe("listRecurringEvents", () => {
  // test-revizorro: approved
  it.effect("returns recurring event summaries", () =>
    Effect.gen(function*() {
      const recurringEvents = [
        makeRecurringEvent({ eventId: "recur-1", title: "Weekly Standup", rules: [{ freq: "WEEKLY" }] }),
        makeRecurringEvent({ eventId: "recur-2", title: "Monthly Review", rules: [{ freq: "MONTHLY" }] })
      ]
      const testLayer = createTestLayer({ recurringEvents })

      const result = yield* listRecurringEvents({}).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(2)
      expect(result[0].title).toBe("Weekly Standup")
      expect(result[0].rules[0].freq).toBe("WEEKLY")
    }))

  // test-revizorro: approved
  it.effect("returns empty array when no recurring events", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayer({})

      const result = yield* listRecurringEvents({}).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(0)
    }))
})

describe("createRecurringEvent", () => {
  // test-revizorro: approved
  it.effect("creates recurring event with rules", () =>
    Effect.gen(function*() {
      const captureAddCollection: MockConfig["captureAddCollection"] = {}
      const testLayer = createTestLayer({ captureAddCollection })

      const result = yield* createRecurringEvent({
        title: "Daily Standup",
        startDate: 1700000000000,
        rules: [{ freq: "DAILY" }]
      }).pipe(Effect.provide(testLayer))

      expect(result.eventId).toBeDefined()
      expect(captureAddCollection.attributes?.title).toBe("Daily Standup")
      expect(captureAddCollection.attributes?.rules).toEqual([{ freq: "DAILY" }])
    }))

  // test-revizorro: scheduled
  it.effect("creates recurring event with all optional fields", () =>
    Effect.gen(function*() {
      const captureAddCollection: MockConfig["captureAddCollection"] = {}
      const testLayer = createTestLayer({ captureAddCollection })

      yield* createRecurringEvent({
        title: "Monthly Review",
        startDate: 1700000000000,
        dueDate: 1700003600000,
        rules: [{ freq: "MONTHLY", count: 12, interval: 1 }],
        allDay: true,
        location: "Conference Room",
        timeZone: "America/New_York",
        visibility: "public"
      }).pipe(Effect.provide(testLayer))

      expect(captureAddCollection.attributes?.allDay).toBe(true)
      expect(captureAddCollection.attributes?.location).toBe("Conference Room")
      expect(captureAddCollection.attributes?.timeZone).toBe("America/New_York")
      expect(captureAddCollection.attributes?.visibility).toBe("public")
    }))
})

describe("listEventInstances", () => {
  // test-revizorro: approved
  it.effect("returns instances of recurring event", () =>
    Effect.gen(function*() {
      const recurringEvent = makeRecurringEvent({ eventId: "recur-1" })
      const instances = [
        makeRecurringInstance({ eventId: "inst-1", recurringEventId: "recur-1", title: "Instance 1" }),
        makeRecurringInstance({ eventId: "inst-2", recurringEventId: "recur-1", title: "Instance 2" })
      ]
      const testLayer = createTestLayer({ recurringEvents: [recurringEvent], recurringInstances: instances })

      const result = yield* listEventInstances({
        recurringEventId: "recur-1"
      }).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(2)
      expect(result[0].recurringEventId).toBe("recur-1")
    }))

  // test-revizorro: approved
  it.effect("returns instances with participants when requested", () =>
    Effect.gen(function*() {
      const person = makePerson({ _id: "person-1" as Ref<Person>, name: "Bob" })
      const recurringEvent = makeRecurringEvent({ eventId: "recur-1" })
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
        recurringEventId: "recur-1",
        includeParticipants: true
      }).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(1)
      expect(result[0].participants).toHaveLength(1)
      expect(result[0].participants?.[0].name).toBe("Bob")
    }))

  // test-revizorro: approved
  it.effect("returns empty participants when no participants exist", () =>
    Effect.gen(function*() {
      const recurringEvent = makeRecurringEvent({ eventId: "recur-1" })
      const instances = [
        makeRecurringInstance({ eventId: "inst-1", recurringEventId: "recur-1", participants: [] })
      ]
      const testLayer = createTestLayer({
        recurringEvents: [recurringEvent],
        recurringInstances: instances
      })

      const result = yield* listEventInstances({
        recurringEventId: "recur-1",
        includeParticipants: true
      }).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(1)
      expect(result[0].participants).toEqual([])
    }))

  // test-revizorro: approved
  it.effect("fails with RecurringEventNotFoundError when recurring event does not exist", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayer({})

      const error = yield* Effect.flip(
        listEventInstances({ recurringEventId: "nonexistent" }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("RecurringEventNotFoundError")
      expect((error as RecurringEventNotFoundError).eventId).toBe("nonexistent")
    }))
})
