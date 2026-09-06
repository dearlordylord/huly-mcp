/**
 * Shared helpers for calendar operations.
 *
 * Used by both calendar-events (one-time) and calendar-recurring modules.
 *
 * @module
 */
import {
  AccessLevel,
  type Calendar as HulyCalendar,
  type ExternalCalendar as HulyExternalCalendar,
  type Event as HulyEvent,
  type PrimaryCalendar as HulyPrimaryCalendar,
  type Visibility as HulyVisibility
} from "@hcengineering/calendar"
import type { Contact, Person } from "@hcengineering/contact"
import type { Class, Doc, MarkupBlobRef, PersonId as HulyPersonId, Ref } from "@hcengineering/core"
import { Array as Arr, Effect } from "effect"

import type {
  CalendarAccess,
  EventParticipantLocator,
  Participant,
  Visibility,
  WritableCalendarAccess
} from "../../domain/schemas/calendar.js"
import { DEFAULT_EVENT_DURATION_MS } from "../../domain/schemas/calendar.js"
import { CalendarId, PersonId, PersonName } from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import type { PersonIdentifierAmbiguousError, PersonNotFoundError } from "../errors.js"
import { CalendarNotAccessibleError, PersonNotFoundError as PersonMissing } from "../errors.js"
import { calendar, contact } from "../huly-plugins.js"
import { findPersonByExactEmailOrName } from "./contacts-shared.js"
import { renderMarkdownPreservingNativeReferences } from "./native-reference-markup.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

// --- SDK Type Bridges ---

const isExternalCalendar = (row: HulyCalendar): row is HulyExternalCalendar =>
  row._class === calendar.class.ExternalCalendar

// SDK: HulyEvent["description"] is Markup | MarkupBlobRef | null; fetchMarkup expects MarkupBlobRef.
// Brands are erased at runtime; non-empty stored event descriptions are markup blob refs, both represented as string.
// eslint-disable-next-line no-restricted-syntax -- see above
export const descriptionAsMarkupRef = (desc: HulyEvent["description"]): MarkupBlobRef => desc as MarkupBlobRef

// SDK: MarkupBlobRef (Ref<Blob>) is assignable to Markup (string); null maps to empty string.
export const markupRefAsDescription = (ref: MarkupBlobRef | null): HulyEvent["description"] => ref ?? ""

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
  (typeof CALENDAR_ACCESS_TO_WRITABLE)[keyof typeof CALENDAR_ACCESS_TO_WRITABLE],
  undefined
>
type ExactWritableCalendarAccessMapping = [WritableCalendarAccess] extends [MappedWritableCalendarAccess]
  ? [MappedWritableCalendarAccess] extends [WritableCalendarAccess]
    ? true
    : never
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

export const ONE_HOUR_MS = DEFAULT_EVENT_DURATION_MS

// --- Helpers ---

const findWritablePersonalCalendars = (
  client: HulyClient["Service"]
): Effect.Effect<Array<HulyCalendar>, HulyClientError> =>
  client.findAll<HulyCalendar>(
    calendar.class.Calendar,
    hulyQuery<HulyCalendar>({
      user: callerCalendarUserQuery(client),
      hidden: false,
      access: { $in: [AccessLevel.Owner, AccessLevel.Writer] }
    })
  )

const callerSocialIds = (client: HulyClient["Service"]): Array<HulyPersonId> => {
  const primarySocialId = client.getPrimarySocialId()
  const socialIds = client.getSocialIds?.() ?? []
  return [...new Set([primarySocialId, ...socialIds])]
}

const callerCalendarUserQuery = (
  client: HulyClient["Service"]
): HulyPersonId | { readonly $in: Array<HulyPersonId> } => {
  const socialIds = callerSocialIds(client)
  const [firstSocialId] = socialIds
  return socialIds.length === 1 && firstSocialId !== undefined ? firstSocialId : { $in: socialIds }
}

/**
 * Find every Calendar row owned by one of the caller's social identities.
 * Hidden and read-only rows are intentional: settings administration needs to
 * display them even though event target discovery remains writable-only.
 */
export const findCallerCalendars = (
  client: HulyClient["Service"]
): Effect.Effect<Array<HulyCalendar>, HulyClientError> =>
  client.findAll<HulyCalendar>(
    calendar.class.Calendar,
    hulyQuery<HulyCalendar>({ user: callerCalendarUserQuery(client) })
  )

export const findWritableCalendars = (
  client: HulyClient["Service"]
): Effect.Effect<Array<HulyCalendar>, HulyClientError> =>
  client.findAll<HulyCalendar>(calendar.class.Calendar, {
    hidden: false,
    access: { $in: [AccessLevel.Owner, AccessLevel.Writer] }
  })

export const getDefaultCalendarRef = (
  client: HulyClient["Service"]
): Effect.Effect<Ref<HulyCalendar>, HulyClientError> =>
  Effect.gen(function* () {
    const calendars = yield* findWritablePersonalCalendars(client)
    const preference = yield* client.findOne<HulyPrimaryCalendar>(
      calendar.class.PrimaryCalendar,
      hulyQuery<HulyPrimaryCalendar>({})
    )

    return toRef<HulyCalendar>(
      selectPrimaryCalendar(
        calendars.map(toPrimaryCalendarCandidate),
        toPrimaryCalendarPreference(preference),
        client.getAccountUuid()
      )
    )
  })

type InternalPrimaryCalendarCandidate = {
  readonly _id: CalendarId
  readonly _class: typeof calendar.class.Calendar
  readonly hidden: boolean
  readonly access: CalendarAccess
  readonly default: false
}

type ExternalPrimaryCalendarCandidate = {
  readonly _id: CalendarId
  readonly _class: typeof calendar.class.ExternalCalendar
  readonly hidden: boolean
  readonly access: CalendarAccess
  readonly default: boolean
}

export type PrimaryCalendarCandidate = InternalPrimaryCalendarCandidate | ExternalPrimaryCalendarCandidate

export type PrimaryCalendarPreference = { readonly attachedTo: CalendarId }

const toPrimaryCalendarCandidate = (row: HulyCalendar): PrimaryCalendarCandidate =>
  isExternalCalendar(row)
    ? {
        _id: CalendarId.make(row._id),
        _class: calendar.class.ExternalCalendar,
        hidden: row.hidden,
        access: accessToString(row.access),
        default: row.default
      }
    : {
        _id: CalendarId.make(row._id),
        _class: calendar.class.Calendar,
        hidden: row.hidden,
        access: accessToString(row.access),
        default: false
      }

const toPrimaryCalendarPreference = (
  preference: HulyPrimaryCalendar | undefined
): PrimaryCalendarPreference | undefined =>
  preference === undefined ? undefined : { attachedTo: CalendarId.make(preference.attachedTo) }

/**
 * Apply the Calendar primary preference and fallback rules to caller-owned
 * writable rows. A stale, hidden, or read-only preference target is ignored;
 * provider defaults are considered only after that filtering.
 */
export const selectPrimaryCalendar = (
  calendars: ReadonlyArray<PrimaryCalendarCandidate>,
  preference: PrimaryCalendarPreference | undefined,
  accountUuid: ReturnType<HulyClient["Service"]["getAccountUuid"]>
): CalendarId => {
  const eligibleCalendars = calendars.filter(
    (calendarRow) =>
      !calendarRow.hidden && (calendarRow.access === AccessLevel.Owner || calendarRow.access === AccessLevel.Writer)
  )
  const preferred =
    preference === undefined
      ? undefined
      : eligibleCalendars.find((calendarRow) => calendarRow._id === preference.attachedTo)
  if (preferred !== undefined) return preferred._id
  const providerDefault = eligibleCalendars.find(
    (calendarRow) => calendarRow._class === calendar.class.ExternalCalendar && calendarRow.default
  )
  return providerDefault?._id ?? CalendarId.make(`${accountUuid}_calendar`)
}

export const resolveCalendarRef = (
  client: HulyClient["Service"],
  calendarId?: CalendarId,
  calendarName?: string
): Effect.Effect<Ref<HulyCalendar>, HulyClientError | CalendarNotAccessibleError> =>
  Effect.gen(function* () {
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

const participantSearchIdentifier = (
  locator: Exclude<EventParticipantLocator, string>
): Parameters<typeof findPersonByExactEmailOrName>[1] | undefined => {
  if (locator.email !== undefined) return locator.email
  return locator.name === undefined ? undefined : PersonName.make(locator.name)
}

const resolveParticipantLocator = (
  client: HulyClient["Service"],
  locator: EventParticipantLocator
): Effect.Effect<Ref<Contact>, HulyClientError | PersonIdentifierAmbiguousError | PersonNotFoundError> =>
  Effect.gen(function* () {
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

    const identifier = participantSearchIdentifier(locator)
    if (identifier === undefined) return yield* new PersonMissing({ identifier: "empty participant locator" })
    const person = yield* findPersonByExactEmailOrName(client, identifier)
    if (person === undefined) return yield* new PersonMissing({ identifier })
    return person._id
  })

export const resolveParticipantLocators = (
  client: HulyClient["Service"],
  locators: ReadonlyArray<EventParticipantLocator> | undefined
): Effect.Effect<Array<Ref<Contact>>, HulyClientError | PersonIdentifierAmbiguousError | PersonNotFoundError> =>
  Effect.gen(function* () {
    if (locators === undefined || locators.length === 0) return []
    const resolved = yield* Effect.all(locators.map((locator) => resolveParticipantLocator(client, locator)))
    return [...new Set(resolved)]
  })

export const buildParticipants = (
  client: HulyClient["Service"],
  participantRefs: ReadonlyArray<Ref<Contact>>
): Effect.Effect<Array<Participant>, HulyClientError> =>
  Effect.gen(function* () {
    if (participantRefs.length === 0) return []

    const persons = yield* client.findAll<Person>(
      contact.class.Person,
      hulyQuery<Person>({ _id: { $in: participantRefs.map(toRef<Person>) } })
    )

    return persons.map((p) => ({ id: PersonId.make(p._id), name: PersonName.make(p.name) }))
  })

export interface ResolvedEventReferences {
  calendarRef: Ref<HulyCalendar>
  participantRefs: Array<Ref<Contact>>
}

interface ResolvedEventInputs extends ResolvedEventReferences {
  descriptionRef: MarkupBlobRef | null
}

export const resolveEventReferences = Effect.fn("Calendar.resolveEventReferences")(function* (
  client: HulyClient["Service"],
  params: {
    readonly participants?: ReadonlyArray<EventParticipantLocator> | undefined
    readonly calendarId?: CalendarId | undefined
    readonly calendarName?: string | undefined
  }
): Effect.fn.Return<
  ResolvedEventReferences,
  HulyClientError | CalendarNotAccessibleError | PersonIdentifierAmbiguousError | PersonNotFoundError
> {
  const calendarRef = yield* resolveCalendarRef(client, params.calendarId, params.calendarName)
  const participantRefs = Arr.isReadonlyArrayNonEmpty(params.participants ?? [])
    ? yield* resolveParticipantLocators(client, params.participants)
    : []
  return { calendarRef, participantRefs }
})

export const resolveEventInputs = (
  client: HulyClient["Service"],
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
  Effect.gen(function* () {
    const { calendarRef, participantRefs } = yield* resolveEventReferences(client, params)

    const description = params.description
    const descriptionRef: MarkupBlobRef | null =
      description !== undefined && description.trim() !== ""
        ? yield* Effect.gen(function* () {
            const rendered = renderMarkdownPreservingNativeReferences(description, client.markupUrlConfig)
            return yield* client.uploadMarkup(
              eventClass,
              toRef<Doc>(eventId),
              "description",
              rendered.markup,
              rendered.format
            )
          })
        : null

    return { calendarRef, participantRefs, descriptionRef }
  })
