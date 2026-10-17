// Response-core abstraction for #323. Four request-local callbacks use the same
// wire id. Their response phases are separate, matching the Effect-owned Ref in
// forward() and the pure advanceBackendResponse/finishBackendResponse decisions.
// This is not the daemon/lease/acquisition model required by the later slices.
module resident_response_ownership {
  pure val CONTEXTS = 0.to(3)
  type Phase = Awaiting | Answered | Failed | Closed
  type Event = Started | Progress | OwnReply | ForeignReply | End
  type Response = {
    phase: Phase,
    accepted: int,
    progress: int,
    lastEvent: Event,
  }
  var responses: int -> Response

  pure val initialResponse = {
    phase: Awaiting,
    accepted: 0,
    progress: 0,
    lastEvent: Started,
  }

  action init = responses' = CONTEXTS.mapBy(_ => initialResponse)

  pure def canObserve(s: Response, event: Event): bool = all {
    s.phase == Awaiting or s.phase == Answered,
    event != Started,
    event != Progress or s.progress < 2,
  }

  pure def applyResponse(s: Response, event: Event): Response = match event {
    | OwnReply => if (s.phase == Awaiting)
        { ...s, phase: Answered, accepted: s.accepted + 1, lastEvent: event }
      else { ...s, phase: Failed, lastEvent: event }
    | ForeignReply => { ...s, phase: Failed, lastEvent: event }
    | End => { ...s, phase: if (s.phase == Answered) Closed else Failed, lastEvent: event }
    | Progress => { ...s, progress: s.progress + 1, lastEvent: event }
    | Started => s
  }

  pure def acceptsResponse(s: Response, event: Event): bool = match event {
    | OwnReply => s.phase == Awaiting
    | ForeignReply => false
    | End => s.phase == Answered
    | Progress => true
    | Started => false
  }

  action observe(context: int, event: Event): bool = all {
    canObserve(responses.get(context), event),
    responses' = responses.set(context, applyResponse(responses.get(context), event)),
  }

  action observeResult(context: int, event: Event, accepted: bool): bool = all {
    acceptsResponse(responses.get(context), event) == accepted,
    observe(context, event),
  }

  action step = {
    nondet context = CONTEXTS.oneOf()
    nondet event = Set(Progress, OwnReply, ForeignReply, End).oneOf()
    observe(context, event)
  }

  val at_most_one_reply = CONTEXTS.forall(c => responses.get(c).accepted <= 1)
  val foreign_reply_rejected = CONTEXTS.forall(c =>
    responses.get(c).lastEvent == ForeignReply implies responses.get(c).phase == Failed)
  val missing_reply_rejected = CONTEXTS.forall(c =>
    responses.get(c).lastEvent == End and responses.get(c).accepted == 0
      implies responses.get(c).phase == Failed)
  val closed_means_answered = CONTEXTS.forall(c =>
    responses.get(c).phase == Closed implies responses.get(c).accepted == 1)
  val safety = at_most_one_reply and foreign_reply_rejected and missing_reply_rejected and closed_means_answered

  val progress_seen = CONTEXTS.exists(c => responses.get(c).progress > 0)
  val reply_seen = CONTEXTS.exists(c => responses.get(c).accepted == 1)
  val foreign_seen = CONTEXTS.exists(c => responses.get(c).lastEvent == ForeignReply)
  val end_seen = CONTEXTS.exists(c => responses.get(c).lastEvent == End)
  val independent_replies = CONTEXTS.filter(c => responses.get(c).accepted == 1).size() >= 2
}
