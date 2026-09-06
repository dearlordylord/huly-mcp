import type { Schedule as HulySchedule } from "@hcengineering/calendar"
import type { DocumentUpdate, Ref } from "@hcengineering/core"
import type { MeetingSchedule as HulyMeetingSchedule, Room } from "@hcengineering/love"
import { Effect, Exit } from "effect"

import type {
  MeetingCompositionFailedStep,
  MeetingCompositionResidual
} from "../../domain/schemas/calendar-meeting-rooms.js"
import { DocId, RoomId } from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import type { MeetingCompositionMutationError } from "../errors.js"
import { calendar, love } from "../huly-plugins.js"
import type { ScheduleMeetingRoomUpdatePlan } from "./calendar-meeting-resolution.js"
import {
  captureCompensation,
  captureCompensationProgram,
  failMeetingComposition,
  finishMeetingCompensation,
  type MeetingCompositionCompensationIssue
} from "./calendar-meeting-saga-failure.js"

export type ScheduleMeetingMutationError = MeetingCompositionMutationError

export interface ScheduleMeetingMutation {
  readonly plan: ScheduleMeetingRoomUpdatePlan
  readonly update: DocumentUpdate<HulySchedule>
  readonly inverse: DocumentUpdate<HulySchedule>
}

type UpdateScheduleFailedStep = Extract<MeetingCompositionFailedStep, { readonly operation: "update_schedule" }>

interface ScheduleMutationExecution {
  failedStep: UpdateScheduleFailedStep
  baseWasAttempted: boolean
}

const updateRoom = (
  client: HulyClient["Service"],
  plan: ScheduleMeetingRoomUpdatePlan,
  room: Ref<Room>
): Effect.Effect<unknown, HulyClientError> =>
  client.updateMixin<HulySchedule, HulyMeetingSchedule>(
    plan.schedule._id,
    plan.schedule._class,
    plan.schedule.space,
    love.mixin.MeetingSchedule,
    { room }
  )

const restoreSchedule = Effect.fn("CalendarMeeting.ScheduleSaga.restore")(function* (
  client: HulyClient["Service"],
  mutation: ScheduleMeetingMutation,
  restoreBase: boolean
): Effect.fn.Return<Array<MeetingCompositionCompensationIssue>> {
  const failures: Array<MeetingCompositionCompensationIssue> = []
  if (restoreBase) {
    failures.push(
      ...(yield* captureCompensation(
        () =>
          client.updateDoc(
            calendar.class.Schedule,
            mutation.plan.schedule.space,
            mutation.plan.schedule._id,
            mutation.inverse
          ),
        [scheduleBaseResidual(mutation)]
      ))
    )
  }
  failures.push(
    ...(yield* captureCompensation(
      () => updateRoom(client, mutation.plan, mutation.plan.previousRoom),
      [scheduleRoomResidual(mutation)]
    ))
  )
  return failures
})

const executeForward = Effect.fn("CalendarMeeting.ScheduleSaga.forward")(function* (
  client: HulyClient["Service"],
  mutation: ScheduleMeetingMutation,
  execution: ScheduleMutationExecution
) {
  execution.failedStep = { _tag: "UpdateScheduleRoom", operation: "update_schedule" }
  yield* updateRoom(client, mutation.plan, mutation.plan.room._id)
  if (Reflect.ownKeys(mutation.update).length === 0) return
  execution.failedStep = { _tag: "UpdateScheduleBase", operation: "update_schedule" }
  execution.baseWasAttempted = true
  yield* client.updateDoc(
    calendar.class.Schedule,
    mutation.plan.schedule.space,
    mutation.plan.schedule._id,
    mutation.update
  )
})

const scheduleBaseResidual = (mutation: ScheduleMeetingMutation): MeetingCompositionResidual => ({
  _tag: "BaseFields",
  target: "schedule",
  documentId: DocId.make(mutation.plan.schedule._id)
})

const scheduleRoomResidual = (mutation: ScheduleMeetingMutation): MeetingCompositionResidual => ({
  _tag: "RoomAssignment",
  target: "schedule",
  documentId: DocId.make(mutation.plan.schedule._id),
  expectedRoomId: RoomId.make(mutation.plan.previousRoom)
})

const recoveryFailureResiduals = (
  mutation: ScheduleMeetingMutation,
  execution: ScheduleMutationExecution
): readonly [MeetingCompositionResidual, ...Array<MeetingCompositionResidual>] =>
  execution.baseWasAttempted
    ? [scheduleBaseResidual(mutation), scheduleRoomResidual(mutation)]
    : [scheduleRoomResidual(mutation)]

export const executeScheduleMeetingMutation = Effect.fn("CalendarMeeting.ScheduleSaga.execute")(function* (
  client: HulyClient["Service"],
  mutation: ScheduleMeetingMutation
): Effect.fn.Return<void, ScheduleMeetingMutationError> {
  return yield* Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* () {
      const execution: ScheduleMutationExecution = {
        failedStep: { _tag: "UpdateScheduleRoom", operation: "update_schedule" },
        baseWasAttempted: false
      }
      const outcome = yield* Effect.exit(restore(executeForward(client, mutation, execution)))
      if (Exit.isSuccess(outcome)) return
      const issues = yield* captureCompensationProgram(
        () => restoreSchedule(client, mutation, execution.baseWasAttempted),
        recoveryFailureResiduals(mutation, execution)
      )
      const finished = finishMeetingCompensation(outcome.cause, issues)
      return yield* failMeetingComposition(execution.failedStep, finished.cause, finished.residuals)
    })
  )
})

export const applyScheduleMeetingRoomUpdate = Effect.fn("CalendarMeeting.ScheduleSaga.applyRoomOnly")(function* (
  client: HulyClient["Service"],
  plan: ScheduleMeetingRoomUpdatePlan
): Effect.fn.Return<void, ScheduleMeetingMutationError> {
  yield* executeScheduleMeetingMutation(client, { plan, update: {}, inverse: {} })
})
