import { Either, Schema } from "effect"
import { describe, expect, it } from "vitest"

import {
  CreateEventParamsSchema,
  CreateRecurringEventParamsSchema,
  EventSchema,
  EventSummarySchema,
  GetEventParamsSchema,
  ListEventInstancesParamsSchema,
  ListEventsParamsSchema,
  RecurringRuleSchema,
  UpdateEventParamsSchema,
  VisibilitySchema
} from "./calendar.js"

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
        byMonthDay: [1, 15],
        byMonth: [1, 6, 12],
        bySetPos: [-1],
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
        byMonth: [0, 13]
      })
      expect(Either.isLeft(result)).toBe(true)
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
        participants: ["alice@example.com", "bob@example.com"],
        visibility: "private"
      })
      expect(Either.isRight(result)).toBe(true)
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

  describe("UpdateEventParamsSchema", () => {
    it("accepts only eventId (no changes)", () => {
      const result = Schema.decodeUnknownEither(UpdateEventParamsSchema)({
        eventId: "evt-123"
      })
      expect(Either.isRight(result)).toBe(true)
    })

    it("accepts partial updates", () => {
      const result = Schema.decodeUnknownEither(UpdateEventParamsSchema)({
        eventId: "evt-123",
        title: "Updated Title",
        location: "New Location"
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
          { freq: "YEARLY", byMonth: [6], byMonthDay: [15] }
        ]
      })
      expect(Either.isRight(result)).toBe(true)
    })

    it("accepts timeZone", () => {
      const result = Schema.decodeUnknownEither(CreateRecurringEventParamsSchema)({
        title: "Meeting",
        startDate: 1704067200000,
        rules: [{ freq: "DAILY" }],
        timeZone: "America/New_York"
      })
      expect(Either.isRight(result)).toBe(true)
    })

    it("accepts empty rules array", () => {
      const result = Schema.decodeUnknownEither(CreateRecurringEventParamsSchema)({
        title: "Meeting",
        startDate: 1704067200000,
        rules: []
      })
      expect(Either.isRight(result)).toBe(true)
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

    it("rejects empty recurringEventId", () => {
      const result = Schema.decodeUnknownEither(ListEventInstancesParamsSchema)({
        recurringEventId: ""
      })
      expect(Either.isLeft(result)).toBe(true)
    })
  })

  describe("EventSummarySchema", () => {
    it("accepts valid summary", () => {
      const result = Schema.decodeUnknownEither(EventSummarySchema)({
        eventId: "evt-123",
        title: "Meeting",
        date: 1704067200000,
        dueDate: 1704070800000,
        allDay: false
      })
      expect(Either.isRight(result)).toBe(true)
    })

    it("accepts with optional fields", () => {
      const result = Schema.decodeUnknownEither(EventSummarySchema)({
        eventId: "evt-123",
        title: "Meeting",
        date: 1704067200000,
        dueDate: 1704070800000,
        allDay: false,
        location: "Room 101",
        modifiedOn: 1704000000000
      })
      expect(Either.isRight(result)).toBe(true)
    })
  })

  describe("EventSchema", () => {
    it("accepts full event", () => {
      const result = Schema.decodeUnknownEither(EventSchema)({
        eventId: "evt-123",
        title: "Team Meeting",
        description: "Quarterly review",
        date: 1704067200000,
        dueDate: 1704074400000,
        allDay: false,
        location: "Main Conference Room",
        visibility: "public",
        participants: [{ id: "person-1", name: "Alice" }],
        externalParticipants: ["external@example.com"],
        calendarId: "cal-1",
        modifiedOn: 1704000000000,
        createdOn: 1703900000000
      })
      expect(Either.isRight(result)).toBe(true)
    })

    it("rejects invalid participant structure", () => {
      const result = Schema.decodeUnknownEither(EventSchema)({
        eventId: "evt-123",
        title: "Meeting",
        date: 1704067200000,
        dueDate: 1704070800000,
        allDay: false,
        participants: [{ name: "Alice" }]
      })
      expect(Either.isLeft(result)).toBe(true)
    })
  })
})
