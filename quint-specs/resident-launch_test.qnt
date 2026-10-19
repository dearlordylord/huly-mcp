module resident_launch_test {
  import resident_launch_types.* from "./resident-launch-types"
  import resident_launch_core.* from "./resident-launch-core"
  import resident_launch_lifetime.* from "./resident-launch-lifetime"
  import resident_launch_recovery.* from "./resident-launch-recovery"
  import resident_launch_requests.* from "./resident-launch-requests"
  import resident_launch.* from "./resident-launch"
  action readyOwner(c: CallerId, b: BackendId): bool =
    captureSelection(c, BASE_SELECTION)
      .then(acquireClaim(c))
      .then(prepareBackend(c, b))
      .then(sendStart(c, b))
      .then(deliverStart(c, b))
      .then(applicationReady(b))
      .then(publishLocator(b))
      .then(observePublication(b))
  action publishedOwner = init.then(readyOwner(0, 0))
  action replacementOwner = publishedOwner.then(requestDrain(0)).then(confirmRetirement(0)).then(readyOwner(1, 1))
  action attachedOwner = publishedOwner.then(beginCreatorAttachment(0, 0)).then(finishAttachment(0))
  action waitingOwner = attachedOwner.then(queueRead({ adapter: 0, ordinal: 0 }, 0)).then(waitForModel({ adapter: 0, ordinal: 0 }))
  action runningWriteOwner = attachedOwner.then(queueWrite({ adapter: 0, ordinal: 0 }, 0))
    .then(waitForModel({ adapter: 0, ordinal: 0 })).then(finishModel(0)).then(startRequest({ adapter: 0, ordinal: 0 }))
  action dispatchedWriteOwner = runningWriteOwner.then(dispatchWrite({ adapter: 0, ordinal: 0 }))
  action uncertainOwner = dispatchedWriteOwner.then(releaseCaller(0))
  // Guided healthy service excludes external fault injection; the default step retains every fault.
  action serviceStep = {
    nondet c = CALLERS.oneOf()
    nondet b = BACKENDS.oneOf()
    nondet inv = INVOCATIONS.oneOf()
    nondet key = SELECTIONS.oneOf()
    any {
      captureSelection(c, key), acquireClaim(c), prepareBackend(c, b), sendStart(c, b), deliverStart(c, b),
      applicationReady(b), publishLocator(b), observePublication(b), beginCreatorAttachment(c, b),
      beginReuseAttachment(c, b), finishAttachment(c), queueRead(inv, b), queueWrite(inv, b),
      waitForModel(inv), finishModel(b), startRequest(inv), finishRead(inv), dispatchWrite(inv),
      commitRemote(inv), rejectRemote(inv), produceTerminal(inv), receiveTerminal(inv), queueTerminal(inv),
      observeTerminal(inv), finishCleanup(inv),
    }
  }
  run staleCleanupTest = replacementOwner
    .then(rejectStaleCleanup(0, 1))
    .expect(backends.get(1).phase == Accepting and registry.get(11) == Current({ backend: 1, generation: 11, selection: BASE_SELECTION }) and safety)
  run explicitMismatchTest = init
    .then(readyOwner(0, 0))
    .then(captureSelection(1, { authority: 1, policy: 0, implementation: 0 }))
    .then(refuseExplicitMismatch(1, 0))
    .expect(callers.get(1).phase == Refused and backends.get(0).phase == Accepting and safety)
  run unknownWriteSurvivesCleanupTest = {
    val inv = { adapter: 0, ordinal: 0 }
    init.then(readyOwner(0, 0))
      .then(beginCreatorAttachment(0, 0)).then(finishAttachment(0))
      .then(queueWrite(inv, 0))
      .then(waitForModel(inv))
      .then(finishModel(0))
      .then(startRequest(inv))
      .then(dispatchWrite(inv))
      .then(commitRemote(inv))
      .then(cancelRequest(inv))
      .then(finishCleanup(inv))
      .expect(writes.get(inv).outcome == Uncertain(10) and writes.get(inv).remote == RemoteCommitted and safety)
      .expect(not(canDispatchWrite(snapshot, inv)))
      .then(releaseCaller(0)).then(closeAttachment(0)).then(finishAttachmentCleanup(0))
      .then(requestDrain(0))
      .then(confirmRetirement(0))
      .expect(writes.get(inv).outcome == Uncertain(10) and safety)
      .expect(not(canDispatchWrite(snapshot, inv)))
  }
  run pendingAdmissionBlocksIdleTest = publishedOwner
    .then(beginCreatorAttachment(0, 0))
    .expect(not(canIdleFence(snapshot, 0)) and not(canConfirmRetirement(snapshot, 0)))
    .then(requestDrain(0))
    .expect(not(canFinishAttachment(snapshot, 0)))
    .then(closeAttachment(0))
    .expect(resources.get(100).cleanup == CleanupPending and not(canConfirmRetirement(snapshot, 0)))
    .then(finishAttachmentCleanup(0))
    .then(confirmRetirement(0))
    .expect(backends.get(0).phase == BackendRetired and callers.get(0).phase == Refused and safety)
  run expiredAdmissionCannotBecomeEligibleTest = publishedOwner
    .then(beginCreatorAttachment(0, 0))
    .then(advanceRound).then(advanceRound).then(expireLease(0))
    .expect(not(canFinishAttachment(snapshot, 0)) and not(canIdleFence(snapshot, 0)))
    .then(closeAttachment(0)).then(finishAttachmentCleanup(0))
    .then(idleFence(0)).then(confirmRetirement(0))
    .expect(safety)
  run cancelledWaiterRetainsAcquisitionTest = {
    val inv = { adapter: 0, ordinal: 0 }
    publishedOwner.then(beginCreatorAttachment(0, 0)).then(finishAttachment(0))
      .then(queueRead(inv, 0)).then(waitForModel(inv))
      .then(cancelRequest(inv)).then(finishCleanup(inv))
      .then(releaseCaller(0)).then(closeAttachment(0)).then(finishAttachmentCleanup(0))
      .then(idleFence(0))
      .expect(not(canConfirmRetirement(snapshot, 0)) and not(canStartRequest(snapshot, inv)))
      .then(finishModel(0)).then(confirmRetirement(0))
      .expect(safety)
  }
  run foreignCallerSurvivesReleaseTest = {
    val own = { adapter: 0, ordinal: 0 }
    val foreign = { adapter: 1, ordinal: 0 }
    publishedOwner.then(beginCreatorAttachment(0, 0)).then(finishAttachment(0))
      .then(captureSelection(1, BASE_SELECTION)).then(acquireClaim(1))
      .then(beginReuseAttachment(1, 0)).then(finishAttachment(1))
      .then(queueRead(own, 0)).then(queueRead(foreign, 0))
      .then(waitForModel(own)).then(waitForModel(foreign))
      .then(releaseCaller(0)).then(finishCleanup(own))
      .then(closeAttachment(0)).then(finishAttachmentCleanup(0))
      .expect(requests.get(foreign).phase == WaitingForModel and attachments.get(1).phase == LeaseLive and safety)
      .then(finishModel(0)).then(startRequest(foreign)).then(finishRead(foreign))
      .expect(requests.get(own).wireId == requests.get(foreign).wireId and requests.get(foreign).phase == Terminal and safety)
  }
  run remoteCommitAfterReplacementTest = {
    val inv = { adapter: 0, ordinal: 0 }
    publishedOwner.then(beginCreatorAttachment(0, 0)).then(finishAttachment(0))
      .then(queueWrite(inv, 0)).then(waitForModel(inv)).then(finishModel(0))
      .then(startRequest(inv)).then(dispatchWrite(inv))
      .then(crashBackend(0))
      .expect(writes.get(inv).outcome == Uncertain(10) and not(canPrepare(snapshot, 1, 1)))
      .then(verifyRetirement(0)).then(readyOwner(1, 1))
      .then(beginCreatorAttachment(1, 1)).then(finishAttachment(1))
      .then(commitRemote(inv))
      .expect(writes.get(inv).outcome == Uncertain(10) and writes.get(inv).remote == RemoteCommitted and not(canDispatchWrite(snapshot, inv)) and safety)
  }
  run lostReceiptBlocksReplacementTest = init
    .then(captureSelection(0, BASE_SELECTION)).then(acquireClaim(0))
    .then(prepareBackend(0, 0)).then(sendStart(0, 0)).then(deliverStart(0, 0))
    .then(applicationReady(0)).then(publishLocator(0)).then(losePublicationReceipt(0))
    .then(captureSelection(1, BASE_SELECTION))
    .expect(not(canAcquire(snapshot, 1)) and not(canPrepare(snapshot, 1, 1)) and callers.get(0).killAuthority == Set() and safety)
    .then(refuseBlocked(1)).then(verifyRetirement(0))
    .then(readyOwner(2, 1)).expect(safety)
  run parentLossAfterStartDeliveryTest = init
    .then(captureSelection(0, BASE_SELECTION)).then(acquireClaim(0))
    .then(prepareBackend(0, 0)).then(sendStart(0, 0)).then(deliverStart(0, 0))
    .then(disconnectParent(0)).then(applicationReady(0)).then(publishLocator(0)).then(observePublication(0))
    .expect(backends.get(0).phase == Accepting and claim == Free and safety)
  run unauthenticatedStartTest = init
    .then(captureSelection(0, BASE_SELECTION)).then(acquireClaim(0))
    .then(prepareBackend(0, 0)).then(sendStart(0, 0))
    .then(commit({ ...snapshot, starts: Set({ parent: 0, backend: 0, authenticated: false, claim: 0 }) }))
    .expect(not(canDeliverStart(snapshot, 0, 0)) and callers.get(0).killAuthority == Set() and backends.get(0).phase == Authorized and safety)
  run attachmentClosePreservesRequestCleanupTest = attachedOwner
    .then(queueWrite({ adapter: 0, ordinal: 0 }, 0))
    .then(waitForModel({ adapter: 0, ordinal: 0 })).then(finishModel(0))
    .then(advanceRound).then(advanceRound).then(closeAttachment(0))
    .expect(requests.get({ adapter: 0, ordinal: 0 }).cleanup == CleanupPending and resources.get(0).cleanup == CleanupPending and safety)
}
