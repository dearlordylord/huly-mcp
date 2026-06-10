import { describe, it } from "@effect/vitest"
import {
  AccessLevel,
  type Calendar as HulyCalendar,
  type Event as HulyEvent,
  type ReccuringEvent as HulyRecurringEvent,
  type ReccuringInstance as HulyRecurringInstance
} from "@hcengineering/calendar"
import type { Contact, Person } from "@hcengineering/contact"
import { type Class, type Doc, type MarkupBlobRef, type Ref, type Space, toFindResult } from "@hcengineering/core"
import type { Meeting as HulyMeeting, Room as HulyRoom } from "@hcengineering/love"
import { Effect } from "effect"
import { expect } from "vitest"
import { CalendarEventTitle, CalendarName } from "../../../src/domain/schemas/calendar.js"
import { RecurrenceCount, RecurrenceInterval } from "../../../src/domain/schemas/recurrence-primitives.js"
import { CalendarId, Email, PersonId, PersonName, Timestamp, TimeZoneId } from "../../../src/domain/schemas/shared.js"
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
import { eventBrandId } from "../../helpers/brands.js"

import { calendar, contact, love } from "../../../src/huly/huly-plugins.js"

// --- Mock Data Builders ---

const asHulyEvent = (v: unknown) => v as HulyEvent
const asCalendar = (v: unknown) => v as HulyCalendar
const asRecurringEvent = (v: unknown) => v as HulyRecurringEvent
const asRecurringInstance = (v: unknown) => v as HulyRecurringInstance
const asPerson = (v: unknown) => v as Person
const asMeeting = (v: unknown) => v as HulyMeeting
const asRoom = (v: unknown) => v as HulyRoom
const calendarEventTitle = CalendarEventTitle.make

const makeEvent = (overrides?: Partial<HulyEvent>): HulyEvent =>
  asHulyEvent({
    _id: "event-1" as Ref<HulyEvent>,
    _class: calendar.class.Event,
    space: calendar.space.Calendar,
    title: "Test Event",
    description: "" as HulyEvent["description"],
    eventId: "evt-id-1",
    date: Timestamp.make(1700000000000),
    dueDate: Timestamp.make(1700003600000),
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
    modifiedOn: 0,
    createdBy: "user-1" as Doc["createdBy"],
    createdOn: 0,
    ...overrides
  })

const makeRecurringEvent = (overrides?: Partial<HulyRecurringEvent>): HulyRecurringEvent =>
  asRecurringEvent({
    ...makeEvent(),
    _class: calendar.class.ReccuringEvent,
    rules: [{ freq: "WEEKLY" }],
    exdate: [],
    rdate: [],
    originalStartTime: Timestamp.make(1700000000000),
    timeZone: "UTC",
    ...overrides
  })

const makeRecurringInstance = (overrides?: Partial<HulyRecurringInstance>): HulyRecurringInstance =>
  asRecurringInstance({
    ...makeRecurringEvent(),
    _class: calendar.class.ReccuringInstance,
    recurringEventId: "evt-id-1",
    originalStartTime: Timestamp.make(1700000000000),
    isCancelled: false,
    virtual: false,
    ...overrides
  })

const makeEventWithoutMetadata = (): HulyEvent => {
  const { createdOn: _createdOn, modifiedOn: _modifiedOn, timeZone: _timeZone, ...event } = makeEvent()
  return asHulyEvent(event)
}

const makeRecurringEventWithoutTimeZone = (): HulyRecurringEvent => {
  const { timeZone: _timeZone, ...event } = makeRecurringEvent()
  return asRecurringEvent(event)
}

const makePerson = (overrides?: Partial<Person>): Person =>
  asPerson({
    _id: "person-1" as Ref<Person>,
    _class: contact.class.Person,
    space: "space-1" as Ref<Space>,
    name: "John Doe",
    modifiedBy: "user-1" as Doc["modifiedBy"],
    modifiedOn: 0,
    createdBy: "user-1" as Doc["createdBy"],
    createdOn: 0,
    ...overrides
  })

const makeCalendar = (overrides?: Partial<HulyCalendar>): HulyCalendar =>
  asCalendar({
    _id: "cal-1" as Ref<HulyCalendar>,
    _class: calendar.class.Calendar,
    space: calendar.space.Calendar,
    name: "Primary",
    hidden: false,
    visibility: "private",
    user: "test-primary-social-id" as HulyCalendar["user"],
    access: AccessLevel.Owner,
    modifiedBy: "user-1" as Doc["modifiedBy"],
    modifiedOn: 0,
    createdBy: "user-1" as Doc["createdBy"],
    createdOn: 0,
    ...overrides
  })

const makeRoom = (overrides?: Partial<HulyRoom>): HulyRoom =>
  asRoom({
    _id: "room-1" as Ref<HulyRoom>,
    _class: love.class.Room,
    space: "love:space:Office" as Ref<Space>,
    name: "Focus Room",
    modifiedBy: "user-1" as Doc["modifiedBy"],
    modifiedOn: 0,
    createdBy: "user-1" as Doc["createdBy"],
    createdOn: 0,
    ...overrides
  })

const makeMeeting = (overrides?: Partial<HulyMeeting>): HulyMeeting =>
  asMeeting({
    ...makeEvent(),
    _class: love.mixin.Meeting,
    room: "room-1" as Ref<HulyRoom>,
    ...overrides
  })

// --- Test Helpers ---

interface MockConfig {
  events?: Array<HulyEvent>
  recurringEvents?: Array<HulyRecurringEvent>
  recurringInstances?: Array<HulyRecurringInstance>
  meetings?: Array<HulyMeeting>
  rooms?: Array<HulyRoom>
  calendars?: Array<HulyCalendar>
  persons?: Array<Person>
  markupContent?: Record<string, string>
  captureUpdateDoc?: { operations?: Record<string, unknown> }
  captureRemoveDoc?: { id?: string }
  captureAddCollection?: { attributes?: Record<string, unknown> }
  captureUpdateMarkup?: { called?: boolean }
  captureUploadMarkup?: { called?: boolean }
}

const createTestLayer = (config: MockConfig) => {
  const events = config.events ?? []
  const recurringEvents = config.recurringEvents ?? []
  const recurringInstances = config.recurringInstances ?? []
  const meetings = config.meetings ?? []
  const rooms = config.rooms ?? []
  const calendars = config.calendars ?? [makeCalendar()]
  const persons = config.persons ?? []

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown, _options: unknown) => {
    if (_class === calendar.class.Event) {
      return Effect.succeed(toFindResult(events))
    }
    if (_class === calendar.class.ReccuringEvent) {
      return Effect.succeed(toFindResult(recurringEvents))
    }
    if (_class === calendar.class.ReccuringInstance) {
      return Effect.succeed(toFindResult(recurringInstances))
    }
    if (_class === calendar.class.Calendar) {
      return Effect.succeed(toFindResult(calendars))
    }
    if (_class === love.mixin.Meeting) {
      return Effect.succeed(toFindResult(meetings))
    }
    if (_class === love.class.Room) {
      return Effect.succeed(toFindResult(rooms))
    }
    if (_class === contact.class.Person) {
      const q = query as Record<string, unknown>
      if (q._id && typeof q._id === "object" && "$in" in (q._id as Record<string, unknown>)) {
        const ids = (q._id as Record<string, Array<string>>).$in
        const matched = persons.filter(p => ids.includes(p._id))
        return Effect.succeed(toFindResult(matched))
      }
      return Effect.succeed(toFindResult(persons))
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
      return Effect.succeed(found)
    }
    if (_class === calendar.class.ReccuringEvent) {
      const q = query as Record<string, unknown>
      const found = recurringEvents.find(e => e.eventId === q.eventId)
      return Effect.succeed(found)
    }
    if (_class === calendar.class.Calendar) {
      const q = query as Record<string, unknown>
      if (q._id !== undefined) {
        return Effect.succeed(calendars.find(c => c._id === q._id))
      }
      if (q.name !== undefined) {
        return Effect.succeed(calendars.find(c => c.name === q.name))
      }
      return Effect.succeed(calendars[0])
    }
    if (_class === calendar.class.PrimaryCalendar) {
      return Effect.succeed(undefined)
    }
    if (_class === contact.class.Person) {
      const q = query as Record<string, unknown>
      return Effect.succeed(persons.find(p => p._id === q._id))
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
    return Effect.succeed(undefined)
  }) as HulyClientOperations["updateMarkup"]

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
  it.effect("returns event summaries", () =>
    Effect.gen(function*() {
      const events = [
        makeEvent({ eventId: "evt-1", title: "Meeting", date: Timestamp.make(1000), dueDate: Timestamp.make(2000) }),
        makeEvent({ eventId: "evt-2", title: "Lunch", date: Timestamp.make(3000), dueDate: Timestamp.make(4000) })
      ]
      const testLayer = createTestLayer({ events })

      const result = yield* listEvents({}).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(2)
      expect(result[0].title).toBe("Meeting")
      expect(result[1].title).toBe("Lunch")
    }))

  it.effect("returns empty array when no events", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayer({})

      const result = yield* listEvents({}).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(0)
    }))

  it.effect("summarizes legacy events without eventId or calendar", () =>
    Effect.gen(function*() {
      const eventWithoutCalendar = makeEvent({
        eventId: "" as HulyEvent["eventId"],
        _id: "legacy-event-doc" as Ref<HulyEvent>,
        calendar: "" as HulyEvent["calendar"]
      })
      const testLayer = createTestLayer({ events: [eventWithoutCalendar] })

      const result = yield* listEvents({}).pipe(Effect.provide(testLayer))

      expect(result[0].eventId).toBe("legacy-event-doc")
      expect(result[0].calendarId).toBeUndefined()
    }))

  it.effect("summarizes meeting rooms from love meeting mixins", () =>
    Effect.gen(function*() {
      const event = makeEvent({ _id: "event-1" as Ref<HulyEvent>, eventId: "evt-1" })
      const result = yield* listEvents({}).pipe(
        Effect.provide(createTestLayer({
          events: [event],
          meetings: [makeMeeting({ _id: "event-1" as Ref<HulyMeeting> })],
          rooms: [makeRoom()]
        }))
      )

      expect(result[0].meetingRoom).toEqual({ roomId: "room-1", name: "Focus Room" })
    }))

  it.effect("skips legacy events without any usable id", () =>
    Effect.gen(function*() {
      const event = makeEvent({
        eventId: "" as HulyEvent["eventId"],
        _id: "" as Ref<HulyEvent>
      })
      const testLayer = createTestLayer({ events: [event] })

      const result = yield* listEvents({}).pipe(Effect.provide(testLayer))

      expect(result).toEqual([])
    }))
})

describe("getEvent", () => {
  it.effect("returns full event with participants", () =>
    Effect.gen(function*() {
      const person = makePerson({ _id: "person-1" as Ref<Person>, name: "Alice" })
      const event = makeEvent({
        eventId: "evt-1",
        title: "Team Sync",
        participants: ["person-1" as Ref<Contact>],
        timeZone: "UTC",
        description: "desc-ref" as HulyEvent["description"]
      })
      const testLayer = createTestLayer({
        events: [event],
        persons: [person],
        markupContent: { "desc-ref": "# Meeting notes" }
      })

      const result = yield* getEvent({ eventId: eventBrandId("evt-1") }).pipe(Effect.provide(testLayer))

      expect(result.eventId).toBe("evt-1")
      expect(result.title).toBe("Team Sync")
      expect(result.description).toBe("# Meeting notes")
      expect(result.timeZone).toBe("UTC")
      expect(result.participants).toHaveLength(1)
      expect(result.participants?.[0].name).toBe("Alice")
    }))

  it.effect("returns event without description when not set", () =>
    Effect.gen(function*() {
      const event = makeEvent({ eventId: "evt-1", description: "" as HulyEvent["description"] })
      const testLayer = createTestLayer({ events: [event] })

      const result = yield* getEvent({ eventId: eventBrandId("evt-1") }).pipe(Effect.provide(testLayer))

      expect(result.description).toBeUndefined()
    }))

  it.effect("maps event reminders when present", () =>
    Effect.gen(function*() {
      const event = makeEvent({ eventId: "evt-1", reminders: [1700000300000] })
      const result = yield* getEvent({ eventId: eventBrandId("evt-1") }).pipe(
        Effect.provide(createTestLayer({ events: [event] }))
      )

      expect(result.reminders).toEqual([1700000300000])
    }))

  it.effect("maps event meeting room from love meeting mixin", () =>
    Effect.gen(function*() {
      const event = makeEvent({ _id: "event-1" as Ref<HulyEvent>, eventId: "evt-1" })
      const result = yield* getEvent({ eventId: eventBrandId("evt-1") }).pipe(
        Effect.provide(createTestLayer({
          events: [event],
          meetings: [makeMeeting({ _id: "event-1" as Ref<HulyMeeting> })],
          rooms: []
        }))
      )

      expect(result.meetingRoom).toEqual({ roomId: "room-1", name: undefined })
    }))

  it.effect("omits optional event metadata when Huly leaves it unset", () =>
    Effect.gen(function*() {
      const event = makeEventWithoutMetadata()
      const result = yield* getEvent({ eventId: eventBrandId(event.eventId) }).pipe(
        Effect.provide(createTestLayer({ events: [event] }))
      )

      expect(result.modifiedOn).toBeUndefined()
      expect(result.createdOn).toBeUndefined()
      expect(result.timeZone).toBeUndefined()
    }))

  it.effect("fails with EventNotFoundError when event does not exist", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayer({})

      const error = yield* Effect.flip(
        getEvent({ eventId: eventBrandId("nonexistent") }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("EventNotFoundError")
      expect((error as EventNotFoundError).eventId).toBe("nonexistent")
    }))
})

describe("createEvent", () => {
  it.effect("creates event with minimal params", () =>
    Effect.gen(function*() {
      const captureAddCollection: MockConfig["captureAddCollection"] = {}
      const testLayer = createTestLayer({ captureAddCollection })
      const startDate = Timestamp.make(1700000000000)
      const ONE_HOUR_MS = 3600000

      const result = yield* createEvent({
        title: calendarEventTitle("New Event"),
        date: startDate
      }).pipe(Effect.provide(testLayer))

      expect(result.eventId).toBeDefined()
      expect(captureAddCollection.attributes?.title).toBe("New Event")
      expect(captureAddCollection.attributes?.allDay).toBe(false)
      expect(captureAddCollection.attributes?.dueDate).toBe(startDate + ONE_HOUR_MS)
    }))

  it.effect("creates event with all optional params", () =>
    Effect.gen(function*() {
      const captureAddCollection: MockConfig["captureAddCollection"] = {}
      const testLayer = createTestLayer({ captureAddCollection })

      const result = yield* createEvent({
        title: calendarEventTitle("Full Event"),
        date: Timestamp.make(1700000000000),
        dueDate: Timestamp.make(1700010000000),
        allDay: true,
        location: "Room 42",
        visibility: "private"
      }).pipe(Effect.provide(testLayer))

      expect(result.eventId).toBeDefined()
      expect(captureAddCollection.attributes?.allDay).toBe(true)
      expect(captureAddCollection.attributes?.location).toBe("Room 42")
      expect(captureAddCollection.attributes?.visibility).toBe("private")
    }))

  it.effect("creates event with stable calendar fields", () =>
    Effect.gen(function*() {
      const captureAddCollection: MockConfig["captureAddCollection"] = {}
      const testLayer = createTestLayer({ captureAddCollection })

      yield* createEvent({
        title: calendarEventTitle("Stable fields"),
        date: Timestamp.make(1700000000000),
        externalParticipants: [Email.make("guest@example.com")],
        reminders: [Timestamp.make(1700000300000)],
        access: "reader",
        timeZone: TimeZoneId.make("UTC"),
        blockTime: true,
        calendarName: CalendarName.make("Primary")
      }).pipe(Effect.provide(testLayer))

      expect(captureAddCollection.attributes?.externalParticipants).toEqual(["guest@example.com"])
      expect(captureAddCollection.attributes?.reminders).toEqual([1700000300000])
      expect(captureAddCollection.attributes?.access).toBe(AccessLevel.Reader)
      expect(captureAddCollection.attributes?.timeZone).toBe("UTC")
      expect(captureAddCollection.attributes?.blockTime).toBe(true)
    }))

  it.effect("ignores malformed create visibility defensively", () =>
    Effect.gen(function*() {
      const captureAddCollection: MockConfig["captureAddCollection"] = {}

      yield* createEvent({
        title: calendarEventTitle("Malformed visibility"),
        date: Timestamp.make(1700000000000),
        visibility: "workspace" as never
      }).pipe(Effect.provide(createTestLayer({ captureAddCollection })))

      expect(captureAddCollection.attributes?.visibility).toBe("workspace")
    }))

  it.effect("defaults dueDate to date + 1 hour when not provided", () =>
    Effect.gen(function*() {
      const captureAddCollection: MockConfig["captureAddCollection"] = {}
      const testLayer = createTestLayer({ captureAddCollection })
      const startDate = Timestamp.make(1700000000000)
      const ONE_HOUR_MS = 3600000

      yield* createEvent({ title: calendarEventTitle("Quick Event"), date: startDate }).pipe(Effect.provide(testLayer))

      expect(captureAddCollection.attributes?.dueDate).toBe(startDate + ONE_HOUR_MS)
    }))
})

describe("updateEvent", () => {
  it.effect("updates event title", () =>
    Effect.gen(function*() {
      const event = makeEvent({ eventId: "evt-1", title: "Old Title" })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}
      const testLayer = createTestLayer({ events: [event], captureUpdateDoc })

      const result = yield* updateEvent({
        eventId: eventBrandId("evt-1"),
        title: calendarEventTitle("New Title")
      }).pipe(Effect.provide(testLayer))

      expect(result.eventId).toBe("evt-1")
      expect(result.updated).toBe(true)
      expect(captureUpdateDoc.operations?.title).toBe("New Title")
    }))

  it.effect("fails when no fields provided", () =>
    Effect.gen(function*() {
      const event = makeEvent({ eventId: "evt-1" })
      const testLayer = createTestLayer({ events: [event] })

      const error = yield* Effect.flip(
        updateEvent({ eventId: eventBrandId("evt-1") }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("NoUpdateFieldsError")
    }))

  it.effect("clears description with empty string", () =>
    Effect.gen(function*() {
      const event = makeEvent({ eventId: "evt-1", description: "old-desc" as HulyEvent["description"] })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}
      const testLayer = createTestLayer({ events: [event], captureUpdateDoc })

      const result = yield* updateEvent({
        eventId: eventBrandId("evt-1"),
        description: "   "
      }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(true)
      expect(captureUpdateDoc.operations?.description).toBe("")
    }))

  it.effect("clears description with null", () =>
    Effect.gen(function*() {
      const event = makeEvent({ eventId: "evt-1", description: "old-desc" as HulyEvent["description"] })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

      const result = yield* updateEvent({
        eventId: eventBrandId("evt-1"),
        description: null
      }).pipe(Effect.provide(createTestLayer({ events: [event], captureUpdateDoc })))

      expect(result.updated).toBe(true)
      expect(captureUpdateDoc.operations?.description).toBe("")
    }))

  it.effect("clears optional location with unset when set to null", () =>
    Effect.gen(function*() {
      const event = makeEvent({ eventId: "evt-1", location: "Old room" })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

      yield* updateEvent({
        eventId: eventBrandId("evt-1"),
        location: null
      }).pipe(Effect.provide(createTestLayer({ events: [event], captureUpdateDoc })))

      expect(captureUpdateDoc.operations).toEqual({ $unset: { location: "" } })
    }))

  it.effect("updates description in place when event already has one", () =>
    Effect.gen(function*() {
      const event = makeEvent({ eventId: "evt-1", description: "existing-markup-ref" as HulyEvent["description"] })
      const captureUpdateMarkup: MockConfig["captureUpdateMarkup"] = {}
      const captureUploadMarkup: MockConfig["captureUploadMarkup"] = {}
      const testLayer = createTestLayer({ events: [event], captureUpdateMarkup, captureUploadMarkup })

      const result = yield* updateEvent({
        eventId: eventBrandId("evt-1"),
        description: "Updated description"
      }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(true)
      expect(captureUpdateMarkup.called).toBe(true)
      expect(captureUploadMarkup.called).toBeUndefined()
    }))

  it.effect("uploads new description when event has none", () =>
    Effect.gen(function*() {
      const event = makeEvent({ eventId: "evt-1", description: "" as HulyEvent["description"] })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}
      const captureUploadMarkup: MockConfig["captureUploadMarkup"] = {}
      const captureUpdateMarkup: MockConfig["captureUpdateMarkup"] = {}
      const testLayer = createTestLayer({ events: [event], captureUpdateDoc, captureUploadMarkup, captureUpdateMarkup })

      const result = yield* updateEvent({
        eventId: eventBrandId("evt-1"),
        description: "Brand new description"
      }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(true)
      expect(captureUploadMarkup.called).toBe(true)
      expect(captureUpdateMarkup.called).toBeUndefined()
      expect(captureUpdateDoc.operations?.description).toBe("markup-ref-123")
    }))

  it.effect("updates stable event fields and participant collections", () =>
    Effect.gen(function*() {
      const person1 = makePerson({ _id: "person-1" as Ref<Person>, name: "Alice" })
      const person2 = makePerson({ _id: "person-2" as Ref<Person>, name: "Bob" })
      const targetCalendar = makeCalendar({ _id: "cal-2" as Ref<HulyCalendar>, name: "Team" })
      const event = makeEvent({
        eventId: "evt-1",
        participants: ["person-1" as Ref<Contact>],
        externalParticipants: ["old@example.com", "drop@example.com"]
      })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}
      const testLayer = createTestLayer({
        events: [event],
        persons: [person1, person2],
        calendars: [makeCalendar(), targetCalendar],
        captureUpdateDoc
      })

      yield* updateEvent({
        eventId: eventBrandId("evt-1"),
        participants: [{ personId: PersonId.make("person-2") }],
        addParticipants: [{ personId: PersonId.make("person-1") }],
        removeParticipants: [{ personId: PersonId.make("person-1") }],
        externalParticipants: [Email.make("replace@example.com")],
        addExternalParticipants: [Email.make("old@example.com"), Email.make("new@example.com")],
        removeExternalParticipants: [Email.make("drop@example.com")],
        reminders: [Timestamp.make(1700000300000)],
        access: "writer",
        timeZone: TimeZoneId.make("Europe/London"),
        blockTime: true,
        calendarId: CalendarId.make("cal-2")
      }).pipe(Effect.provide(testLayer))

      expect(captureUpdateDoc.operations?.participants).toEqual([])
      expect(captureUpdateDoc.operations?.externalParticipants).toEqual(["old@example.com"])
      expect(captureUpdateDoc.operations?.reminders).toEqual([1700000300000])
      expect(captureUpdateDoc.operations?.access).toBe(AccessLevel.Writer)
      expect(captureUpdateDoc.operations?.timeZone).toBe("Europe/London")
      expect(captureUpdateDoc.operations?.blockTime).toBe(true)
      expect(captureUpdateDoc.operations?.calendar).toBe("cal-2")
    }))

  it.effect("moves an event by calendar name", () =>
    Effect.gen(function*() {
      const targetCalendar = makeCalendar({ _id: "cal-2" as Ref<HulyCalendar>, name: "Team" })
      const event = makeEvent({ eventId: "evt-1" })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

      yield* updateEvent({
        eventId: eventBrandId("evt-1"),
        calendarName: CalendarName.make("Team")
      }).pipe(
        Effect.provide(createTestLayer({
          events: [event],
          calendars: [makeCalendar(), targetCalendar],
          captureUpdateDoc
        }))
      )

      expect(captureUpdateDoc.operations?.calendar).toBe("cal-2")
    }))

  it.effect("updates participants by name locator and handles empty participant replacement", () =>
    Effect.gen(function*() {
      const person = makePerson({ _id: "person-1" as Ref<Person>, name: "Alice" })
      const event = makeEvent({ eventId: "evt-1", participants: ["person-1" as Ref<Contact>] })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

      yield* updateEvent({
        eventId: eventBrandId("evt-1"),
        participants: [{ name: PersonName.make("Alice") }]
      }).pipe(Effect.provide(createTestLayer({ events: [event], persons: [person], captureUpdateDoc })))

      expect(captureUpdateDoc.operations?.participants).toEqual(["person-1"])

      yield* updateEvent({
        eventId: eventBrandId("evt-1"),
        participants: []
      }).pipe(Effect.provide(createTestLayer({ events: [event], persons: [person], captureUpdateDoc })))

      expect(captureUpdateDoc.operations?.participants).toEqual([])
    }))

  it.effect("updates external participant collections when the event has none", () =>
    Effect.gen(function*() {
      const event = makeEvent({ eventId: "evt-1" })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

      yield* updateEvent({
        eventId: eventBrandId("evt-1"),
        addExternalParticipants: [Email.make("new@example.com")]
      }).pipe(Effect.provide(createTestLayer({ events: [event], captureUpdateDoc })))

      expect(captureUpdateDoc.operations?.externalParticipants).toEqual(["new@example.com"])

      yield* updateEvent({
        eventId: eventBrandId("evt-1"),
        removeExternalParticipants: [Email.make("new@example.com")]
      }).pipe(Effect.provide(createTestLayer({ events: [event], captureUpdateDoc })))

      expect(captureUpdateDoc.operations?.externalParticipants).toEqual([])
    }))

  it.effect("ignores malformed update visibility defensively", () =>
    Effect.gen(function*() {
      const event = makeEvent({ eventId: "evt-1" })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

      yield* updateEvent({
        eventId: eventBrandId("evt-1"),
        visibility: "workspace" as never
      }).pipe(Effect.provide(createTestLayer({ events: [event], captureUpdateDoc })))

      expect(captureUpdateDoc.operations).toEqual({ visibility: "workspace" })
    }))

  it.effect("fails when participant personId cannot be resolved", () =>
    Effect.gen(function*() {
      const event = makeEvent({ eventId: "evt-1" })
      const error = yield* Effect.flip(
        updateEvent({
          eventId: eventBrandId("evt-1"),
          participants: [{ personId: PersonId.make("missing-person") }]
        }).pipe(Effect.provide(createTestLayer({ events: [event], persons: [] })))
      )

      expect(error._tag).toBe("PersonNotFoundError")
    }))

  it.effect("fails defensively for an empty participant locator object", () =>
    Effect.gen(function*() {
      const event = makeEvent({ eventId: "evt-1" })
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- direct-operation defensive test bypasses schema validation intentionally
      const emptyLocator = {} as never
      const error = yield* Effect.flip(
        updateEvent({
          eventId: eventBrandId("evt-1"),
          participants: [emptyLocator]
        }).pipe(Effect.provide(createTestLayer({ events: [event], persons: [] })))
      )

      expect(error._tag).toBe("PersonNotFoundError")
    }))

  it.effect("fails when participant name cannot be resolved", () =>
    Effect.gen(function*() {
      const event = makeEvent({ eventId: "evt-1" })
      const error = yield* Effect.flip(
        updateEvent({
          eventId: eventBrandId("evt-1"),
          participants: [{ name: PersonName.make("Nobody") }]
        }).pipe(Effect.provide(createTestLayer({ events: [event], persons: [] })))
      )

      expect(error._tag).toBe("PersonNotFoundError")
    }))

  it.effect("fails with EventNotFoundError when event does not exist", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayer({})

      const error = yield* Effect.flip(
        updateEvent({ eventId: eventBrandId("nonexistent"), title: calendarEventTitle("X") }).pipe(
          Effect.provide(testLayer)
        )
      )

      expect(error._tag).toBe("EventNotFoundError")
      expect((error as EventNotFoundError).eventId).toBe("nonexistent")
    }))
})

describe("deleteEvent", () => {
  it.effect("deletes event", () =>
    Effect.gen(function*() {
      const event = makeEvent({ eventId: "evt-1" })
      const captureRemoveDoc: MockConfig["captureRemoveDoc"] = {}
      const testLayer = createTestLayer({ events: [event], captureRemoveDoc })

      const result = yield* deleteEvent({ eventId: eventBrandId("evt-1") }).pipe(Effect.provide(testLayer))

      expect(result.eventId).toBe("evt-1")
      expect(result.deleted).toBe(true)
      expect(captureRemoveDoc.id).toBe("event-1")
    }))

  it.effect("fails with EventNotFoundError when event does not exist", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayer({})

      const error = yield* Effect.flip(
        deleteEvent({ eventId: eventBrandId("nonexistent") }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("EventNotFoundError")
      expect((error as EventNotFoundError).eventId).toBe("nonexistent")
    }))
})

describe("listRecurringEvents", () => {
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

  it.effect("returns empty array when no recurring events", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayer({})

      const result = yield* listRecurringEvents({}).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(0)
    }))

  it.effect("returns recurring events without timezone when Huly omits it", () =>
    Effect.gen(function*() {
      const result = yield* listRecurringEvents({}).pipe(
        Effect.provide(createTestLayer({
          recurringEvents: [makeRecurringEventWithoutTimeZone()]
        }))
      )

      expect(result[0].timeZone).toBeUndefined()
    }))

  it.effect("returns recurring events without modified timestamp when Huly omits it", () =>
    Effect.gen(function*() {
      const { modifiedOn: _modifiedOn, ...recurringEventWithoutModifiedOn } = makeRecurringEvent()
      const result = yield* listRecurringEvents({}).pipe(
        Effect.provide(createTestLayer({
          recurringEvents: [asRecurringEvent(recurringEventWithoutModifiedOn)]
        }))
      )

      expect(result[0].modifiedOn).toBeUndefined()
    }))

  it.effect("brands full SDK recurring rule numeric fields", () =>
    Effect.gen(function*() {
      const result = yield* listRecurringEvents({}).pipe(
        Effect.provide(createTestLayer({
          recurringEvents: [
            makeRecurringEvent({
              rules: [{
                freq: "YEARLY",
                count: 4,
                interval: 2,
                byMonthDay: [1, 31],
                byMonth: [0, 11],
                bySetPos: [-1, 1]
              }]
            })
          ]
        }))
      )

      expect(result[0].rules[0]).toMatchObject({
        count: 4,
        interval: 2,
        byMonthDay: [1, 31],
        byMonth: [0, 11],
        bySetPos: [-1, 1]
      })
    }))

  it.effect("rejects invalid Huly recurring rule fields on read", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        listRecurringEvents({}).pipe(
          Effect.provide(createTestLayer({
            recurringEvents: [
              makeRecurringEvent({
                rules: [{
                  freq: "MONTHLY",
                  byMonthDay: [-1]
                }]
              })
            ]
          }))
        )
      )

      expect(error._tag).toBe("HulyConnectionError")
    }))
})

describe("createRecurringEvent", () => {
  it.effect("creates recurring event with rules", () =>
    Effect.gen(function*() {
      const captureAddCollection: MockConfig["captureAddCollection"] = {}
      const testLayer = createTestLayer({ captureAddCollection })

      const result = yield* createRecurringEvent({
        title: calendarEventTitle("Daily Standup"),
        startDate: Timestamp.make(1700000000000),
        rules: [{ freq: "DAILY" }]
      }).pipe(Effect.provide(testLayer))

      expect(result.eventId).toBeDefined()
      expect(captureAddCollection.attributes?.title).toBe("Daily Standup")
      expect(captureAddCollection.attributes?.rules).toEqual([{ freq: "DAILY" }])
    }))

  it.effect("creates recurring event with all optional fields", () =>
    Effect.gen(function*() {
      const captureAddCollection: MockConfig["captureAddCollection"] = {}
      const person = makePerson({ _id: "person-1" as Ref<Person>, name: "Alice" })
      const testLayer = createTestLayer({ captureAddCollection, persons: [person] })

      yield* createRecurringEvent({
        title: calendarEventTitle("Monthly Review"),
        startDate: Timestamp.make(1700000000000),
        dueDate: Timestamp.make(1700003600000),
        rules: [{ freq: "MONTHLY", count: RecurrenceCount.make(12), interval: RecurrenceInterval.make(1) }],
        allDay: true,
        location: "Conference Room",
        timeZone: TimeZoneId.make("America/New_York"),
        visibility: "public",
        participants: [{ personId: PersonId.make("person-1") }],
        externalParticipants: [Email.make("guest@example.com")],
        reminders: [Timestamp.make(1700000300000)],
        access: "reader",
        blockTime: true
      }).pipe(Effect.provide(testLayer))

      expect(captureAddCollection.attributes?.allDay).toBe(true)
      expect(captureAddCollection.attributes?.location).toBe("Conference Room")
      expect(captureAddCollection.attributes?.timeZone).toBe("America/New_York")
      expect(captureAddCollection.attributes?.visibility).toBe("public")
      expect(captureAddCollection.attributes?.externalParticipants).toEqual(["guest@example.com"])
      expect(captureAddCollection.attributes?.reminders).toEqual([1700000300000])
      expect(captureAddCollection.attributes?.access).toBe(AccessLevel.Reader)
      expect(captureAddCollection.attributes?.blockTime).toBe(true)
    }))
})

describe("listEventInstances", () => {
  it.effect("returns instances of recurring event", () =>
    Effect.gen(function*() {
      const recurringEvent = makeRecurringEvent({ eventId: "recur-1" })
      const instances = [
        makeRecurringInstance({ eventId: "inst-1", recurringEventId: "recur-1", title: "Instance 1" }),
        makeRecurringInstance({ eventId: "inst-2", recurringEventId: "recur-1", title: "Instance 2" })
      ]
      const testLayer = createTestLayer({ recurringEvents: [recurringEvent], recurringInstances: instances })

      const result = yield* listEventInstances({
        recurringEventId: eventBrandId("recur-1")
      }).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(2)
      expect(result[0].recurringEventId).toBe("recur-1")
    }))

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
        recurringEventId: eventBrandId("recur-1"),
        includeParticipants: true
      }).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(1)
      expect(result[0].participants).toHaveLength(1)
      expect(result[0].participants?.[0].name).toBe("Bob")
    }))

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
        recurringEventId: eventBrandId("recur-1"),
        includeParticipants: true
      }).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(1)
      expect(result[0].participants).toEqual([])
    }))

  it.effect("fails with RecurringEventNotFoundError when recurring event does not exist", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayer({})

      const error = yield* Effect.flip(
        listEventInstances({ recurringEventId: eventBrandId("nonexistent") }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("RecurringEventNotFoundError")
      expect((error as RecurringEventNotFoundError).eventId).toBe("nonexistent")
    }))
})
