/**
 * Shared helpers for calendar operations.
 *
 * Used by both calendar-events (one-time) and calendar-recurring modules.
 *
 * @module
 */
import type {
  Calendar as HulyCalendar,
  Event as HulyEvent,
  PrimaryCalendar as HulyPrimaryCalendar,
  Visibility as HulyVisibility
} from "@hcengineering/calendar"
import { AccessLevel, getPrimaryCalendar } from "@hcengineering/calendar"
import type { Contact, Person } from "@hcengineering/contact"
import type { Class, Doc, MarkupBlobRef, Ref } from "@hcengineering/core"
import { Array as Arr, Effect } from "effect"

import type {
  CalendarAccess,
  EventParticipantLocator,
  Participant,
  Visibility,
  WritableCalendarAccess
} from "../../domain/schemas/calendar.js"
import type { CalendarId } from "../../domain/schemas/shared.js"
import { PersonId, PersonName } from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import type { PersonIdentifierAmbiguousError, PersonNotFoundError } from "../errors.js"
import { CalendarNotAccessibleError, PersonNotFoundError as PersonMissing } from "../errors.js"
import { calendar, contact } from "../huly-plugins.js"
import { findPersonByExactEmailOrName } from "./contacts-shared.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

// --- SDK Type Bridges ---

// SDK: HulyEvent["description"] is Markup | MarkupBlobRef | null; fetchMarkup expects MarkupBlobRef.
// Brands are erased at runtime; non-empty stored event descriptions are markup blob refs, both represented as string.
// eslint-disable-next-line no-restricted-syntax -- see above
export const descriptionAsMarkupRef = (desc: HulyEvent["description"]): MarkupBlobRef => desc as MarkupBlobRef

// SDK: MarkupBlobRef (Ref<Blob>) is assignable to Markup (string); null maps to empty string.
export const markupRefAsDescription = (
  ref: MarkupBlobRef | null
): HulyEvent["description"] => ref ?? ""

export const emptyEventDescription: HulyEvent["description"] = ""

// SDK: Data<Event> requires 'user' (PersonId, branded string) but server populates from auth context.
// Brands are erased at runtime and no SDK factory exists; Huly overwrites this empty string server-side.
// eslint-disable-next-line no-restricted-syntax -- see above
export const serverPopulatedUser: HulyEvent["user"] = "" as HulyEvent["user"]

// SDK: Visibility and HulyVisibility are identical string literal unions.
export const visibilityToString = (v: HulyVisibility | undefined): Visibility | undefined => v

const CALENDAR_ACCESS_TO_WRITABLE = {
  [AccessLevel.FreeBusyReader]: undefined,
  [AccessLevel.Reader]: undefined,
  [AccessLevel.Writer]: "writer",
  [AccessLevel.Owner]: "owner"
} satisfies Record<HulyCalendar["access"], WritableCalendarAccess | undefined>

type MappedWritableCalendarAccess = Exclude<
  typeof CALENDAR_ACCESS_TO_WRITABLE[keyof typeof CALENDAR_ACCESS_TO_WRITABLE],
  undefined
>
type ExactWritableCalendarAccessMapping = [WritableCalendarAccess] extends [MappedWritableCalendarAccess]
  ? [MappedWritableCalendarAccess] extends [WritableCalendarAccess] ? true : never
  : never

const exactWritableCalendarAccessMapping = <T extends true>(value: T): T => value
exactWritableCalendarAccessMapping<ExactWritableCalendarAccessMapping>(true)

export const toWritableCalendarAccess = (access: HulyCalendar["access"]): WritableCalendarAccess | undefined =>
  CALENDAR_ACCESS_TO_WRITABLE[access]

const ACCESS_TO_STRING = {
  [AccessLevel.FreeBusyReader]: "freeBusyReader",
  [AccessLevel.Reader]: "reader",
  [AccessLevel.Writer]: "writer",
  [AccessLevel.Owner]: "owner"
} as const satisfies Record<AccessLevel, CalendarAccess>

const STRING_TO_ACCESS = {
  freeBusyReader: AccessLevel.FreeBusyReader,
  reader: AccessLevel.Reader,
  writer: AccessLevel.Writer,
  owner: AccessLevel.Owner
} as const satisfies Record<CalendarAccess, AccessLevel>

export const accessToString = (access: AccessLevel): CalendarAccess => ACCESS_TO_STRING[access]
export const stringToAccess = (access: CalendarAccess): AccessLevel => STRING_TO_ACCESS[access]

// --- Constants ---

const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60
const MS_PER_SECOND = 1000
export const ONE_HOUR_MS = SECONDS_PER_MINUTE * MINUTES_PER_HOUR * MS_PER_SECOND

// --- Helpers ---

const findWritablePersonalCalendars = (
  client: HulyClient["Type"]
): Effect.Effect<Array<HulyCalendar>, HulyClientError> =>
  client.findAll<HulyCalendar>(
    calendar.class.Calendar,
    {
      user: client.getPrimarySocialId(),
      hidden: false,
      access: { $in: [AccessLevel.Owner, AccessLevel.Writer] }
    }
  )

export const findWritableCalendars = (
  client: HulyClient["Type"]
): Effect.Effect<Array<HulyCalendar>, HulyClientError> =>
  client.findAll<HulyCalendar>(
    calendar.class.Calendar,
    {
      hidden: false,
      access: { $in: [AccessLevel.Owner, AccessLevel.Writer] }
    }
  )

export const getDefaultCalendarRef = (
  client: HulyClient["Type"]
): Effect.Effect<Ref<HulyCalendar>, HulyClientError> =>
  Effect.gen(function*() {
    const calendars = yield* findWritablePersonalCalendars(client)
    const preference = yield* client.findOne<HulyPrimaryCalendar>(
      calendar.class.PrimaryCalendar,
      {}
    )

    return getPrimaryCalendar(calendars, preference, client.getAccountUuid())
  })

export const resolveCalendarRef = (
  client: HulyClient["Type"],
  calendarId?: CalendarId,
  calendarName?: string
): Effect.Effect<Ref<HulyCalendar>, HulyClientError | CalendarNotAccessibleError> =>
  Effect.gen(function*() {
    if (calendarId === undefined && calendarName === undefined) {
      return yield* getDefaultCalendarRef(client)
    }

    if (calendarId !== undefined) {
      const cal = yield* client.findOne<HulyCalendar>(
        calendar.class.Calendar,
        hulyQuery<HulyCalendar>({
          _id: toRef<HulyCalendar>(calendarId),
          hidden: false,
          access: { $in: [AccessLevel.Owner, AccessLevel.Writer] }
        })
      )

      if (cal === undefined) {
        return yield* new CalendarNotAccessibleError({ calendarId })
      }

      return cal._id
    }

    /* v8 ignore start -- guarded by the default-calendar branch above; retained for TypeScript narrowing. */
    if (calendarName === undefined) {
      return yield* new CalendarNotAccessibleError({ calendarId: "missing-calendar-target" })
    }
    /* v8 ignore stop */
    const requestedCalendarName = calendarName
    const cal = yield* client.findOne<HulyCalendar>(
      calendar.class.Calendar,
      hulyQuery<HulyCalendar>({
        name: requestedCalendarName,
        hidden: false,
        access: { $in: [AccessLevel.Owner, AccessLevel.Writer] }
      })
    )

    if (cal === undefined) {
      return yield* new CalendarNotAccessibleError({ calendarId: requestedCalendarName })
    }
    return cal._id
  })

const resolveParticipantLocator = (
  client: HulyClient["Type"],
  locator: EventParticipantLocator
): Effect.Effect<Ref<Contact>, HulyClientError | PersonIdentifierAmbiguousError | PersonNotFoundError> =>
  Effect.gen(function*() {
    if (typeof locator === "string") {
      const person = yield* findPersonByExactEmailOrName(client, locator)
      if (person === undefined) return yield* new PersonMissing({ identifier: locator })
      return person._id
    }

    if (locator.personId !== undefined) {
      const person = yield* client.findOne<Person>(
        contact.class.Person,
        hulyQuery<Person>({ _id: toRef<Person>(locator.personId) })
      )
      if (person === undefined) return yield* new PersonMissing({ identifier: locator.personId })
      return person._id
    }

    const identifier = locator.email !== undefined
      ? locator.email
      : locator.name === undefined
      ? undefined
      : PersonName.make(locator.name)
    if (identifier === undefined) return yield* new PersonMissing({ identifier: "empty participant locator" })
    const person = yield* findPersonByExactEmailOrName(client, identifier)
    if (person === undefined) return yield* new PersonMissing({ identifier })
    return person._id
  })

export const resolveParticipantLocators = (
  client: HulyClient["Type"],
  locators: ReadonlyArray<EventParticipantLocator> | undefined
): Effect.Effect<Array<Ref<Contact>>, HulyClientError | PersonIdentifierAmbiguousError | PersonNotFoundError> =>
  Effect.gen(function*() {
    if (locators === undefined || locators.length === 0) return []
    const resolved = yield* Effect.all(locators.map((locator) => resolveParticipantLocator(client, locator)))
    return [...new Set(resolved)]
  })

export const buildParticipants = (
  client: HulyClient["Type"],
  participantRefs: ReadonlyArray<Ref<Contact>>
): Effect.Effect<Array<Participant>, HulyClientError> =>
  Effect.gen(function*() {
    if (participantRefs.length === 0) return []

    const persons = yield* client.findAll<Person>(
      contact.class.Person,
      hulyQuery<Person>({ _id: { $in: participantRefs.map(toRef<Person>) } })
    )

    return persons.map(p => ({
      id: PersonId.make(p._id),
      name: PersonName.make(p.name)
    }))
  })

interface ResolvedEventInputs {
  calendarRef: Ref<HulyCalendar>
  participantRefs: Array<Ref<Contact>>
  descriptionRef: MarkupBlobRef | null
}

export const resolveEventInputs = (
  client: HulyClient["Type"],
  params: {
    readonly participants?: ReadonlyArray<EventParticipantLocator> | undefined
    readonly description?: string | undefined
    readonly calendarId?: CalendarId | undefined
    readonly calendarName?: string | undefined
  },
  eventClass: Ref<Class<Doc>>,
  eventId: string
): Effect.Effect<
  ResolvedEventInputs,
  HulyClientError | CalendarNotAccessibleError | PersonIdentifierAmbiguousError | PersonNotFoundError
> =>
  Effect.gen(function*() {
    const calendarRef = yield* resolveCalendarRef(client, params.calendarId, params.calendarName)

    const participantRefs = Arr.isNonEmptyReadonlyArray(params.participants ?? [])
      ? yield* resolveParticipantLocators(client, params.participants)
      : []

    const descriptionRef: MarkupBlobRef | null = params.description && params.description.trim() !== ""
      ? yield* client.uploadMarkup(
        eventClass,
        toRef<Doc>(eventId),
        "description",
        params.description,
        "markdown"
      )
      : null

    return { calendarRef, participantRefs, descriptionRef }
  })
