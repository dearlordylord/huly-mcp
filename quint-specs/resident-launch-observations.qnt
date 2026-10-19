module resident_launch_observations {
  import resident_launch_types.* from "./resident-launch-types"
  import resident_launch_core.* from "./resident-launch-core"
  import resident_launch_requests.* from "./resident-launch-requests"
  import resident_launch_lifetime.* from "./resident-launch-lifetime"
  import resident_launch.* from "./resident-launch"
  type AdmissionObservationEvent = Begin | Finish | Fence | LateOwner | Closed
  pure def admissionAllowed(s: LaunchSnapshot, event: AdmissionObservationEvent): bool = match event {
    | Begin => canAttachCreator(s, 0, 0)
    | Finish => canFinishAttachment(s, 0)
    | Fence => canRequestDrain(s, 0)
    | LateOwner => canCloseAttachment(s, 0)
    | Closed => canFinishAttachmentCleanup(s, 0)
  }
  pure def observedAdmissionState(s: LaunchSnapshot, event: AdmissionObservationEvent): LaunchSnapshot =
    if (admissionAllowed(s, event)) match event {
      | Begin => beginAttachment(s, 0, 0)
      | Finish => finishAttachmentState(s, 0)
      | Fence => fenceBackend(s, 0)
      | LateOwner => closeAttachmentOwner(s, 0)
      | Closed => finishAttachmentCleanupState(s, 0)
    } else s
  pure def pendingAdmissions(s: LaunchSnapshot): int = CALLERS.filter(c =>
    if (s.resources.keys().contains(attachmentResource(c))) {
      val owner = s.resources.get(attachmentResource(c))
      not(owner.admitted) and owner.cleanup != CleanupConfirmed
    } else false).size()
  pure def ownedAttachments(s: LaunchSnapshot): int = CALLERS.filter(c =>
    if (s.resources.keys().contains(attachmentResource(c))) {
      val owner = s.resources.get(attachmentResource(c))
      owner.cleanup != CleanupConfirmed and (owner.admitted or owner.cleanup != Active)
    } else false).size()
  pure def admissionObservationMatches(s: LaunchSnapshot, event: AdmissionObservationEvent,
    allowed: bool, pending: int, members: int, accepting: bool): bool = {
    val updated = observedAdmissionState(s, event)
    all {
      admissionAllowed(s, event) == allowed,
      pendingAdmissions(updated) == pending,
      ownedAttachments(updated) == members,
      (updated.backends.get(0).phase == Accepting) == accepting,
    }
  }
  action observeAdmission(event: AdmissionObservationEvent, allowed: bool,
    pending: int, members: int, accepting: bool): bool = all {
    admissionObservationMatches(snapshot, event, allowed, pending, members, accepting),
    commit(observedAdmissionState(snapshot, event)),
  }
  action observedOwner = init
    .then(captureSelection(0, BASE_SELECTION)).then(acquireClaim(0))
    .then(prepareBackend(0, 0)).then(sendStart(0, 0)).then(deliverStart(0, 0))
    .then(applicationReady(0)).then(publishLocator(0)).then(observePublication(0))
}
