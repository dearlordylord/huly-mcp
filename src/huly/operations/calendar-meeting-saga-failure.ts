import { Cause, Effect, Exit, Predicate } from "effect"

import type {
  MeetingCompositionFailedStep,
  MeetingCompositionResidual
} from "../../domain/schemas/calendar-meeting-rooms.js"
import { NonEmptyString } from "../../domain/schemas/shared.js"
import { assertFirst } from "../../utils/assertions.js"
import {
  HulyConnectionError,
  MeetingCompositionMutationError,
  type MeetingCompositionOriginDiagnostic
} from "../errors.js"

type NonEmptyResiduals = readonly [MeetingCompositionResidual, ...Array<MeetingCompositionResidual>]

export type MeetingCompositionCompensationIssue =
  | { readonly _tag: "Unconfirmed"; readonly residuals: NonEmptyResiduals }
  | { readonly _tag: "Failed"; readonly cause: Cause.Cause<unknown>; readonly residuals: NonEmptyResiduals }

export const unconfirmedCompensation = (residuals: NonEmptyResiduals): MeetingCompositionCompensationIssue => ({
  _tag: "Unconfirmed",
  residuals
})

export const compensationFailure = <A, E>(
  exit: Exit.Exit<A, E>,
  residuals: NonEmptyResiduals
): Array<MeetingCompositionCompensationIssue> =>
  Exit.isSuccess(exit) ? [] : [{ _tag: "Failed", cause: exit.cause, residuals }]

export const captureCompensation = <A, E, R>(
  effect: () => Effect.Effect<A, E, R>,
  residuals: NonEmptyResiduals
): Effect.Effect<Array<MeetingCompositionCompensationIssue>, never, R> =>
  Effect.exit(Effect.suspend(effect)).pipe(Effect.map((exit) => compensationFailure(exit, residuals)))

export const captureCompensationProgram = <E, R>(
  program: () => Effect.Effect<Array<MeetingCompositionCompensationIssue>, E, R>,
  residuals: NonEmptyResiduals
): Effect.Effect<Array<MeetingCompositionCompensationIssue>, never, R> =>
  Effect.exit(Effect.suspend(program)).pipe(
    Effect.map((exit) => (Exit.isSuccess(exit) ? exit.value : compensationFailure(exit, residuals)))
  )

export const finishMeetingCompensation = (
  originalCause: Cause.Cause<unknown>,
  issues: ReadonlyArray<MeetingCompositionCompensationIssue>
): { readonly cause: Cause.Cause<unknown>; readonly residuals: Array<MeetingCompositionResidual> } => ({
  cause: issues.reduce(
    (combined, issue) => (issue._tag === "Failed" ? Cause.combine(combined, issue.cause) : combined),
    originalCause
  ),
  residuals: issues.flatMap((issue) => issue.residuals)
})

const failureTag = (failure: unknown): NonEmptyString => {
  if (Predicate.hasProperty(failure, "_tag") && Predicate.isString(failure._tag) && failure._tag.trim().length > 0) {
    return NonEmptyString.make(failure._tag)
  }
  return NonEmptyString.make("ExpectedFailure")
}

const diagnosticForFailure = (failure: unknown): MeetingCompositionOriginDiagnostic =>
  failure instanceof HulyConnectionError && failure.diagnostic !== undefined
    ? { _tag: "HulyConnection", diagnostic: failure.diagnostic }
    : { _tag: "TypedFailure", errorTag: failureTag(failure) }

const diagnosticsFromCause = (cause: Cause.Cause<unknown>): ReadonlyArray<MeetingCompositionOriginDiagnostic> => {
  const diagnostics: Array<MeetingCompositionOriginDiagnostic> = []
  for (const reason of cause.reasons) {
    if (Cause.isFailReason(reason)) diagnostics.push(diagnosticForFailure(reason.error))
    if (Cause.isDieReason(reason)) diagnostics.push({ _tag: "Defect" })
    if (Cause.isInterruptReason(reason)) diagnostics.push({ _tag: "Interruption" })
  }
  return diagnostics.length === 0 ? [{ _tag: "UnknownFailure" }] : diagnostics
}

const mutationError = (
  failedStep: MeetingCompositionFailedStep,
  cause: Cause.Cause<unknown>,
  residuals: ReadonlyArray<MeetingCompositionResidual>
): MeetingCompositionMutationError => {
  const diagnostics = diagnosticsFromCause(cause)
  return new MeetingCompositionMutationError({
    failedStep,
    diagnostics: [assertFirst(diagnostics), ...diagnostics.slice(1)],
    recovery:
      residuals.length === 0
        ? { _tag: "Recovered" }
        : { _tag: "Unconfirmed", residuals: [assertFirst(residuals), ...residuals.slice(1)] }
  })
}

export const failMeetingComposition = Effect.fn("CalendarMeeting.failComposition")(function* (
  failedStep: MeetingCompositionFailedStep,
  cause: Cause.Cause<unknown>,
  residuals: ReadonlyArray<MeetingCompositionResidual>
): Effect.fn.Return<never, MeetingCompositionMutationError> {
  const error = mutationError(failedStep, cause, residuals)
  const fatalReasons: Array<Cause.Reason<MeetingCompositionMutationError>> = []
  for (const reason of cause.reasons) {
    if (Cause.isDieReason(reason) || Cause.isInterruptReason(reason)) fatalReasons.push(reason)
  }
  if (fatalReasons.length === 0) return yield* error
  return yield* Effect.failCause(Cause.fromReasons([...fatalReasons, Cause.makeFailReason(error)]))
})
