import type { Event as HulyEvent, Schedule as HulySchedule } from "@hcengineering/calendar"
import type { DocumentUpdate } from "@hcengineering/core"

type MeetingDocument = HulyEvent | HulySchedule

const operatorTouchesField = (operator: object | undefined, field: PropertyKey): boolean =>
  operator !== undefined && Object.hasOwn(operator, field)

const updateOperators = <T extends MeetingDocument>(update: DocumentUpdate<T>): ReadonlyArray<object | undefined> => [
  update.$unset,
  update.$push,
  update.$pull,
  update.$update,
  update.$inc
]

const updateTouchesField = <T extends MeetingDocument>(update: DocumentUpdate<T>, field: keyof T): boolean =>
  Object.hasOwn(update, field) || updateOperators(update).some((operator) => operatorTouchesField(operator, field))

const snapshotField = <T extends MeetingDocument>(
  update: DocumentUpdate<T>,
  field: keyof T,
  snapshot: DocumentUpdate<T>
): DocumentUpdate<T> => (updateTouchesField(update, field) ? snapshot : {})

const snapshotAbsentField = <T extends MeetingDocument, U extends object>(
  update: DocumentUpdate<T>,
  field: keyof T,
  absent: boolean,
  snapshot: U
): U | object => (absent ? (updateTouchesField(update, field) ? snapshot : {}) : {})

const snapshotExternalParticipants = (
  event: HulyEvent,
  update: DocumentUpdate<HulyEvent>
): DocumentUpdate<HulyEvent> =>
  event.externalParticipants === undefined
    ? {}
    : snapshotField(update, "externalParticipants", { externalParticipants: [...event.externalParticipants] })

const snapshotReminders = (event: HulyEvent, update: DocumentUpdate<HulyEvent>): DocumentUpdate<HulyEvent> =>
  event.reminders === undefined ? {} : snapshotField(update, "reminders", { reminders: [...event.reminders] })

const snapshotLocation = (event: HulyEvent, update: DocumentUpdate<HulyEvent>): DocumentUpdate<HulyEvent> =>
  event.location === undefined ? {} : snapshotField(update, "location", { location: event.location })

const snapshotVisibility = (event: HulyEvent, update: DocumentUpdate<HulyEvent>): DocumentUpdate<HulyEvent> =>
  event.visibility === undefined ? {} : snapshotField(update, "visibility", { visibility: event.visibility })

const snapshotTimeZone = (event: HulyEvent, update: DocumentUpdate<HulyEvent>): DocumentUpdate<HulyEvent> =>
  event.timeZone === undefined ? {} : snapshotField(update, "timeZone", { timeZone: event.timeZone })

const eventOptionalValues = (event: HulyEvent, update: DocumentUpdate<HulyEvent>): DocumentUpdate<HulyEvent> => ({
  ...snapshotExternalParticipants(event, update),
  ...snapshotReminders(event, update),
  ...snapshotLocation(event, update),
  ...snapshotVisibility(event, update),
  ...snapshotTimeZone(event, update)
})

const eventOptionalUnset = (event: HulyEvent, update: DocumentUpdate<HulyEvent>) => ({
  ...snapshotAbsentField(update, "externalParticipants", event.externalParticipants === undefined, {
    externalParticipants: ""
  }),
  ...snapshotAbsentField(update, "reminders", event.reminders === undefined, { reminders: "" }),
  ...snapshotAbsentField(update, "location", event.location === undefined, { location: "" }),
  ...snapshotAbsentField(update, "visibility", event.visibility === undefined, { visibility: "" }),
  ...snapshotAbsentField(update, "timeZone", event.timeZone === undefined, { timeZone: "" })
})

export const snapshotEventUpdate = (event: HulyEvent, update: DocumentUpdate<HulyEvent>): DocumentUpdate<HulyEvent> => {
  const unset = eventOptionalUnset(event, update)
  return {
    ...snapshotField(update, "eventId", { eventId: event.eventId }),
    ...snapshotField(update, "title", { title: event.title }),
    ...snapshotField(update, "description", { description: event.description }),
    ...snapshotField(update, "calendar", { calendar: event.calendar }),
    ...snapshotField(update, "allDay", { allDay: event.allDay }),
    ...snapshotField(update, "date", { date: event.date }),
    ...snapshotField(update, "dueDate", { dueDate: event.dueDate }),
    ...snapshotField(update, "participants", { participants: [...event.participants] }),
    ...snapshotField(update, "access", { access: event.access }),
    ...snapshotField(update, "user", { user: event.user }),
    ...snapshotField(update, "blockTime", { blockTime: event.blockTime }),
    ...eventOptionalValues(event, update),
    ...(Object.keys(unset).length === 0 ? {} : { $unset: unset })
  }
}

const snapshotScheduleDescription = (
  schedule: HulySchedule,
  update: DocumentUpdate<HulySchedule>
): DocumentUpdate<HulySchedule> =>
  schedule.description === undefined ? {} : snapshotField(update, "description", { description: schedule.description })

const snapshotScheduleCalendar = (
  schedule: HulySchedule,
  update: DocumentUpdate<HulySchedule>
): DocumentUpdate<HulySchedule> =>
  schedule.calendar === undefined ? {} : snapshotField(update, "calendar", { calendar: schedule.calendar })

const scheduleOptionalUnset = (schedule: HulySchedule, update: DocumentUpdate<HulySchedule>) => ({
  ...snapshotAbsentField(update, "description", schedule.description === undefined, { description: "" }),
  ...snapshotAbsentField(update, "calendar", schedule.calendar === undefined, { calendar: "" })
})

export const snapshotScheduleUpdate = (
  schedule: HulySchedule,
  update: DocumentUpdate<HulySchedule>
): DocumentUpdate<HulySchedule> => {
  const unset = scheduleOptionalUnset(schedule, update)
  return {
    ...snapshotField(update, "owner", { owner: schedule.owner }),
    ...snapshotField(update, "title", { title: schedule.title }),
    ...snapshotField(update, "meetingDuration", { meetingDuration: schedule.meetingDuration }),
    ...snapshotField(update, "meetingInterval", { meetingInterval: schedule.meetingInterval }),
    ...snapshotField(update, "availability", { availability: schedule.availability }),
    ...snapshotField(update, "timeZone", { timeZone: schedule.timeZone }),
    ...snapshotScheduleDescription(schedule, update),
    ...snapshotScheduleCalendar(schedule, update),
    ...(Object.keys(unset).length === 0 ? {} : { $unset: unset })
  }
}
