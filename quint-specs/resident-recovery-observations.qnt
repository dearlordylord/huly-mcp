module resident_recovery_observations {
  import resident_launch_types.* from "./resident-launch-types"
  import resident_launch_core.* from "./resident-launch-core"
  import resident_launch_requests.* from "./resident-launch-requests"
  import resident_launch_lifetime.* from "./resident-launch-lifetime"
  import resident_launch_recovery.* from "./resident-launch-recovery"
  import resident_launch.* from "./resident-launch"
  pure val OLD_WRITE: InvocationId = { adapter: 0, ordinal: 0 }
  pure def originalEvidenceMatches(s: LaunchSnapshot, outcome: WriteOutcome,
    dispatches: int, remote: RemoteEffect): bool =
    if (s.writes.keys().contains(OLD_WRITE)) all {
      s.writes.get(OLD_WRITE).outcome == outcome,
      s.writes.get(OLD_WRITE).dispatches == dispatches,
      s.writes.get(OLD_WRITE).remote == remote,
    } else false
  action observeOriginalEvidence(outcome: WriteOutcome, dispatches: int, remote: RemoteEffect): bool = all {
    originalEvidenceMatches(snapshot, outcome, dispatches, remote),
    commit(snapshot),
  }
  // Opaque native generations are normalized to fresh model slots, never parsed as process authority.
  action readyObservedOwner(c: CallerId, b: BackendId, key: SelectionKey): bool =
    captureSelection(c, key).then(acquireClaim(c)).then(prepareBackend(c, b))
      .then(sendStart(c, b)).then(deliverStart(c, b)).then(applicationReady(b))
      .then(publishLocator(b)).then(observePublication(b))
      .then(beginCreatorAttachment(c, b)).then(finishAttachment(c))
  action observedPendingWrite = init.then(readyObservedOwner(0, 0, BASE_SELECTION))
    .then(queueWrite(OLD_WRITE, 0)).then(waitForModel(OLD_WRITE)).then(finishModel(0))
    .then(startRequest(OLD_WRITE)).then(dispatchWrite(OLD_WRITE))
  action retireObservedOwner(c: CallerId, b: BackendId): bool =
    releaseCaller(c).then(closeAttachment(c)).then(finishAttachmentCleanup(c))
      .then(idleFence(b)).then(confirmRetirement(b))
  action observedFreshRead(ordinal: int): bool = {
    val inv = { adapter: 1, ordinal: ordinal }
    queueRead(inv, 1).then(waitForModel(inv)).then(finishModel(1))
      .then(startRequest(inv)).then(finishRead(inv)).then(finishCleanup(inv))
  }
  action observedRetirementAndFreshRead = observedPendingWrite
    .then(requestDrain(0)).then(cancelRequest(OLD_WRITE)).then(finishCleanup(OLD_WRITE))
    .then(closeAttachment(0)).then(finishAttachmentCleanup(0)).then(confirmRetirement(0))
    .then(releaseCaller(0)).then(readyObservedOwner(1, 1, BASE_SELECTION))
    .then(observedFreshRead(0))
}
