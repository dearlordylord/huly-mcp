import { Either, Schema } from "effect"
import { describe, expect, it } from "vitest"

import {
  CreateRecurringEventParamsSchema,
  ListEventInstancesParamsSchema,
  RecurringRuleSchema
} from "./calendar-recurring.js"
import {
  CreateScheduleParamsSchema,
  GetScheduleParamsSchema,
  ListSchedulesParamsSchema,
  updateScheduleParamsJsonSchema,
  UpdateScheduleParamsSchema
} from "./calendar-schedules.js"
import {
  createEventParamsJsonSchema,
  CreateEventParamsSchema,
  EventParticipantLocatorSchema,
  GetEventParamsSchema,
  ListCalendarsParamsSchema,
  ListEventsParamsSchema,
  updateEventParamsJsonSchema,
  UpdateEventParamsSchema,
  VisibilitySchema
} from "./calendar.js"

type JsonSchemaObject = {
  readonly anyOf?: ReadonlyArray<{ readonly required?: ReadonlyArray<string> }>
  readonly not?: { readonly required?: ReadonlyArray<string> }
}

const expectJsonSchemaObject = (schema: unknown): JsonSchemaObject => {
  if (typeof schema === "object" && schema !== null) return schema
  throw new Error("Expected JSON schema object")
}

describe("Calendar Schemas", () => {
  describe("VisibilitySchema", () => {
    it("accepts valid visibility values", () => {
      const values = ["public", "freeBusy", "private"]
      for (const value of values) {
        const result = Schema.decodeUnknownEither(VisibilitySchema)(value)
        expect(Either.isRight(result)).toBe(true)
      }
    })

    it("rejects invalid visibility", () => {
      const result = Schema.decodeUnknownEither(VisibilitySchema)("hidden")
      expect(Either.isLeft(result)).toBe(true)
    })
  })

  describe("RecurringRuleSchema", () => {
    it("accepts minimal rule with only freq", () => {
      const result = Schema.decodeUnknownEither(RecurringRuleSchema)({ freq: "DAILY" })
      expect(Either.isRight(result)).toBe(true)
    })

    it("accepts full rule with all options", () => {
      const rule = {
        freq: "WEEKLY",
        endDate: 1704067200000,
        count: 10,
        interval: 2,
        byDay: ["MO", "WE", "FR"],
        byMonthDay: [1, 15, 31],
        byMonth: [0, 5, 11],
        bySetPos: [-1, 1],
        wkst: "MO"
      }
      const result = Schema.decodeUnknownEither(RecurringRuleSchema)(rule)
      expect(Either.isRight(result)).toBe(true)
    })

    it("rejects invalid frequency", () => {
      const result = Schema.decodeUnknownEither(RecurringRuleSchema)({ freq: "CONSTANTLY" })
      expect(Either.isLeft(result)).toBe(true)
    })

    it("rejects invalid weekday in wkst", () => {
      const result = Schema.decodeUnknownEither(RecurringRuleSchema)({
        freq: "WEEKLY",
        wkst: "MONDAY"
      })
      expect(Either.isLeft(result)).toBe(true)

      const jsonSchema = expectJsonSchemaObject(createEventParamsJsonSchema)
      expect(jsonSchema.not).toEqual({ required: ["calendarId", "calendarName"] })
    })

    it("rejects unsupported byDay values", () => {
      for (const byDay of [["XX"], ["1MO"], ["-1FR"]]) {
        const result = Schema.decodeUnknownEither(RecurringRuleSchema)({
          freq: "WEEKLY",
          byDay
        })
        expect(Either.isLeft(result)).toBe(true)
      }
    })

    it("rejects negative count", () => {
      const result = Schema.decodeUnknownEither(RecurringRuleSchema)({
        freq: "DAILY",
        count: -5
      })
      expect(Either.isLeft(result)).toBe(true)
    })

    it("rejects invalid month values", () => {
      const result = Schema.decodeUnknownEither(RecurringRuleSchema)({
        freq: "YEARLY",
        byMonth: [-1, 12]
      })
      expect(Either.isLeft(result)).toBe(true)
    })

    it("rejects invalid month day ordinals", () => {
      for (const byMonthDay of [[0], [-1], [32]]) {
        const result = Schema.decodeUnknownEither(RecurringRuleSchema)({
          freq: "MONTHLY",
          byMonthDay
        })
        expect(Either.isLeft(result)).toBe(true)
      }
    })

    it("rejects invalid set-position ordinals", () => {
      for (const bySetPos of [[0], [367], [-367]]) {
        const result = Schema.decodeUnknownEither(RecurringRuleSchema)({
          freq: "MONTHLY",
          bySetPos
        })
        expect(Either.isLeft(result)).toBe(true)
      }
    })

    it("accepts Huly zero-based month indexes", () => {
      const result = Schema.decodeUnknownEither(RecurringRuleSchema)({
        freq: "YEARLY",
        byMonth: [0, 11]
      })
      expect(Either.isRight(result)).toBe(true)
    })
  })

  describe("ListEventsParamsSchema", () => {
    it("accepts empty params", () => {
      const result = Schema.decodeUnknownEither(ListEventsParamsSchema)({})
      expect(Either.isRight(result)).toBe(true)
    })

    it("accepts from/to timestamps", () => {
      const result = Schema.decodeUnknownEither(ListEventsParamsSchema)({
        from: 1704067200000,
        to: 1704153600000
      })
      expect(Either.isRight(result)).toBe(true)
    })

    it("accepts limit within bounds", () => {
      const result = Schema.decodeUnknownEither(ListEventsParamsSchema)({ limit: 100 })
      expect(Either.isRight(result)).toBe(true)
    })

    it("rejects limit exceeding 200", () => {
      const result = Schema.decodeUnknownEither(ListEventsParamsSchema)({ limit: 300 })
      expect(Either.isLeft(result)).toBe(true)
    })

    it("rejects zero limit", () => {
      const result = Schema.decodeUnknownEither(ListEventsParamsSchema)({ limit: 0 })
      expect(Either.isLeft(result)).toBe(true)
    })

    it("rejects negative timestamp", () => {
      const result = Schema.decodeUnknownEither(ListEventsParamsSchema)({ from: -1000 })
      expect(Either.isLeft(result)).toBe(true)
    })
  })

  describe("GetEventParamsSchema", () => {
    it("accepts valid eventId", () => {
      const result = Schema.decodeUnknownEither(GetEventParamsSchema)({
        eventId: "evt-123456"
      })
      expect(Either.isRight(result)).toBe(true)
    })

    it("rejects empty eventId", () => {
      const result = Schema.decodeUnknownEither(GetEventParamsSchema)({
        eventId: ""
      })
      expect(Either.isLeft(result)).toBe(true)
    })

    it("rejects whitespace-only eventId", () => {
      const result = Schema.decodeUnknownEither(GetEventParamsSchema)({
        eventId: "   "
      })
      expect(Either.isLeft(result)).toBe(true)
    })

    it("trims eventId whitespace", () => {
      const result = Schema.decodeUnknownEither(GetEventParamsSchema)({
        eventId: "  evt-123  "
      })
      expect(Either.isRight(result)).toBe(true)
      if (Either.isRight(result)) {
        expect(result.right.eventId).toBe("evt-123")
      }
    })
  })

  describe("CreateEventParamsSchema", () => {
    it("accepts minimal valid event", () => {
      const result = Schema.decodeUnknownEither(CreateEventParamsSchema)({
        title: "Meeting",
        date: 1704067200000
      })
      expect(Either.isRight(result)).toBe(true)
    })

    it("accepts full event params", () => {
      const result = Schema.decodeUnknownEither(CreateEventParamsSchema)({
        title: "Team Standup",
        description: "Daily sync meeting",
        date: 1704067200000,
        dueDate: 1704070800000,
        allDay: false,
        location: "Conference Room A",
        participants: ["alice@example.com", { name: "Bob Smith" }, { personId: "person-1" }],
        externalParticipants: ["guest@example.com"],
        reminders: [1704063600000],
        access: "owner",
        timeZone: "America/New_York",
        blockTime: true,
        visibility: "private",
        calendarId: "personal-calendar"
      })
      expect(Either.isRight(result)).toBe(true)
    })

    it("rejects ambiguous calendar targets and advertises the conflict in JSON Schema", () => {
      const result = Schema.decodeUnknownEither(CreateEventParamsSchema)({
        title: "Team Standup",
        date: 1704067200000,
        calendarId: "personal-calendar",
        calendarName: "Personal"
      })
      expect(Either.isLeft(result)).toBe(true)
    })

    it("rejects empty title", () => {
      const result = Schema.decodeUnknownEither(CreateEventParamsSchema)({
        title: "",
        date: 1704067200000
      })
      expect(Either.isLeft(result)).toBe(true)
    })

    it("rejects missing date", () => {
      const result = Schema.decodeUnknownEither(CreateEventParamsSchema)({
        title: "Meeting"
      })
      expect(Either.isLeft(result)).toBe(true)
    })

    it("rejects invalid visibility", () => {
      const result = Schema.decodeUnknownEither(CreateEventParamsSchema)({
        title: "Meeting",
        date: 1704067200000,
        visibility: "secret"
      })
      expect(Either.isLeft(result)).toBe(true)
    })
  })

  describe("ListCalendarsParamsSchema", () => {
    it("accepts empty params", () => {
      const result = Schema.decodeUnknownEither(ListCalendarsParamsSchema)({})
      expect(Either.isRight(result)).toBe(true)
    })
  })

  describe("UpdateEventParamsSchema", () => {
    it("rejects only eventId and advertises update-field requirement in JSON Schema", () => {
      const result = Schema.decodeUnknownEither(UpdateEventParamsSchema)({
        eventId: "evt-123"
      })
      expect(Either.isLeft(result)).toBe(true)

      const jsonSchema = expectJsonSchemaObject(updateEventParamsJsonSchema)
      expect(jsonSchema.anyOf).toEqual(
        expect.arrayContaining([{ required: ["title"] }, { required: ["description"] }, { required: ["visibility"] }])
      )
      expect(jsonSchema.not).toEqual({ required: ["calendarId", "calendarName"] })
    })

    it("rejects ambiguous update calendar targets", () => {
      const result = Schema.decodeUnknownEither(UpdateEventParamsSchema)({
        eventId: "evt-123",
        calendarId: "cal-1",
        calendarName: "Personal"
      })
      expect(Either.isLeft(result)).toBe(true)
    })

    it("accepts partial updates", () => {
      const result = Schema.decodeUnknownEither(UpdateEventParamsSchema)({
        eventId: "evt-123",
        title: "Updated Title",
        location: "New Location",
        addParticipants: [{ email: "alice@example.com" }],
        removeParticipants: [{ name: "Bob Smith" }],
        addExternalParticipants: ["guest@example.com"],
        reminders: [1704063600000],
        access: "writer",
        timeZone: "UTC",
        blockTime: false,
        calendarName: "Team"
      })
      expect(Either.isRight(result)).toBe(true)
    })

    it("rejects empty eventId", () => {
      const result = Schema.decodeUnknownEither(UpdateEventParamsSchema)({
        eventId: "",
        title: "New Title"
      })
      expect(Either.isLeft(result)).toBe(true)
    })
  })

  describe("EventParticipantLocatorSchema", () => {
    it("rejects empty participant locator objects", () => {
      const result = Schema.decodeUnknownEither(EventParticipantLocatorSchema)({})
      expect(Either.isLeft(result)).toBe(true)
    })

    it("rejects participant locator objects with multiple identifiers", () => {
      const result = Schema.decodeUnknownEither(EventParticipantLocatorSchema)({
        email: "alice@example.com",
        name: "Alice"
      })
      expect(Either.isLeft(result)).toBe(true)
    })
  })

  describe("CreateRecurringEventParamsSchema", () => {
    it("accepts valid recurring event", () => {
      const result = Schema.decodeUnknownEither(CreateRecurringEventParamsSchema)({
        title: "Weekly Standup",
        startDate: 1704067200000,
        rules: [{ freq: "WEEKLY", byDay: ["MO"] }]
      })
      expect(Either.isRight(result)).toBe(true)
    })

    it("accepts multiple rules", () => {
      const result = Schema.decodeUnknownEither(CreateRecurringEventParamsSchema)({
        title: "Complex Event",
        startDate: 1704067200000,
        rules: [
          { freq: "MONTHLY", byMonthDay: [1] },
          { freq: "YEARLY", byMonth: [5], byMonthDay: [15] }
        ]
      })
      expect(Either.isRight(result)).toBe(true)
    })

    it("accepts timeZone", () => {
      const result = Schema.decodeUnknownEither(CreateRecurringEventParamsSchema)({
        title: "Meeting",
        startDate: 1704067200000,
        rules: [{ freq: "DAILY" }],
        timeZone: "America/New_York",
        calendarId: "personal-calendar"
      })
      expect(Either.isRight(result)).toBe(true)
    })

    it("rejects ambiguous calendar targets", () => {
      const result = Schema.decodeUnknownEither(CreateRecurringEventParamsSchema)({
        title: "Meeting",
        startDate: 1704067200000,
        rules: [{ freq: "DAILY" }],
        calendarId: "personal-calendar",
        calendarName: "Personal"
      })
      expect(Either.isLeft(result)).toBe(true)
    })

    it("rejects empty rules array", () => {
      const result = Schema.decodeUnknownEither(CreateRecurringEventParamsSchema)({
        title: "Meeting",
        startDate: 1704067200000,
        rules: []
      })
      expect(Either.isLeft(result)).toBe(true)
    })

    it("rejects missing rules", () => {
      const result = Schema.decodeUnknownEither(CreateRecurringEventParamsSchema)({
        title: "Meeting",
        startDate: 1704067200000
      })
      expect(Either.isLeft(result)).toBe(true)
    })
  })

  describe("ListEventInstancesParamsSchema", () => {
    it("accepts valid params", () => {
      const result = Schema.decodeUnknownEither(ListEventInstancesParamsSchema)({
        recurringEventId: "rec-evt-123"
      })
      expect(Either.isRight(result)).toBe(true)
    })

    it("accepts date range", () => {
      const result = Schema.decodeUnknownEither(ListEventInstancesParamsSchema)({
        recurringEventId: "rec-evt-123",
        from: 1704067200000,
        to: 1706745600000,
        limit: 20
      })
      expect(Either.isRight(result)).toBe(true)
    })

    it("accepts includeParticipants flag", () => {
      const result = Schema.decodeUnknownEither(ListEventInstancesParamsSchema)({
        recurringEventId: "rec-evt-123",
        includeParticipants: true
      })
      expect(Either.isRight(result)).toBe(true)
      if (Either.isRight(result)) {
        expect(result.right.includeParticipants).toBe(true)
      }
    })

    it("defaults includeParticipants to undefined when not provided", () => {
      const result = Schema.decodeUnknownEither(ListEventInstancesParamsSchema)({
        recurringEventId: "rec-evt-123"
      })
      expect(Either.isRight(result)).toBe(true)
      if (Either.isRight(result)) {
        expect(result.right.includeParticipants).toBeUndefined()
      }
    })

    it("rejects empty recurringEventId", () => {
      const result = Schema.decodeUnknownEither(ListEventInstancesParamsSchema)({
        recurringEventId: ""
      })
      expect(Either.isLeft(result)).toBe(true)
    })
  })

  describe("Schedule schemas", () => {
    it("accepts schedule list and get params", () => {
      expect(Either.isRight(Schema.decodeUnknownEither(ListSchedulesParamsSchema)({ owner: "alice@example.com" })))
        .toBe(true)
      expect(Either.isRight(Schema.decodeUnknownEither(GetScheduleParamsSchema)({ scheduleId: "schedule-1" }))).toBe(
        true
      )
    })

    it("accepts create schedule params", () => {
      const result = Schema.decodeUnknownEither(CreateScheduleParamsSchema)({
        title: "Office hours",
        meetingDuration: 30,
        meetingInterval: 15,
        availability: { monday: [{ start: 540, end: 1020 }] },
        timeZone: "America/New_York",
        owner: "Alice",
        calendarName: "Personal"
      })
      expect(Either.isRight(result)).toBe(true)
    })

    it("rejects schedule availability outside weekday keys", () => {
      const result = Schema.decodeUnknownEither(CreateScheduleParamsSchema)({
        title: "Office hours",
        meetingDuration: 30,
        meetingInterval: 15,
        availability: { "7": [{ start: 540, end: 1020 }] },
        timeZone: "America/New_York"
      })
      expect(Either.isLeft(result)).toBe(true)
    })

    it("rejects schedule availability slots that do not end after they start", () => {
      const result = Schema.decodeUnknownEither(CreateScheduleParamsSchema)({
        title: "Office hours",
        meetingDuration: 30,
        meetingInterval: 15,
        availability: { monday: [{ start: 540, end: 540 }] },
        timeZone: "America/New_York"
      })
      expect(Either.isLeft(result)).toBe(true)
    })

    it("rejects ambiguous create schedule calendar targets", () => {
      const result = Schema.decodeUnknownEither(CreateScheduleParamsSchema)({
        title: "Office hours",
        meetingDuration: 30,
        meetingInterval: 15,
        availability: { monday: [{ start: 540, end: 1020 }] },
        timeZone: "America/New_York",
        calendarId: "cal-1",
        calendarName: "Personal"
      })
      expect(Either.isLeft(result)).toBe(true)
    })

    it("accepts update schedule fields", () => {
      const result = Schema.decodeUnknownEither(UpdateScheduleParamsSchema)({
        scheduleId: "schedule-1",
        title: "Updated",
        calendarId: "cal-1"
      })
      expect(Either.isRight(result)).toBe(true)
    })

    it("rejects ambiguous update schedule calendar targets", () => {
      const result = Schema.decodeUnknownEither(UpdateScheduleParamsSchema)({
        scheduleId: "schedule-1",
        calendarId: "cal-1",
        calendarName: "Personal"
      })
      expect(Either.isLeft(result)).toBe(true)
    })

    it("rejects update schedule without update fields and advertises fields", () => {
      const result = Schema.decodeUnknownEither(UpdateScheduleParamsSchema)({ scheduleId: "schedule-1" })
      expect(Either.isLeft(result)).toBe(true)

      const jsonSchema = expectJsonSchemaObject(updateScheduleParamsJsonSchema)
      expect(jsonSchema.anyOf).toEqual(
        expect.arrayContaining([{ required: ["title"] }, { required: ["availability"] }, {
          required: ["calendarName"]
        }])
      )
    })
  })
})
