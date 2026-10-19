module resident_launch {
  import resident_launch_types.* from "./resident-launch-types"
  import resident_launch_core.* from "./resident-launch-core"
  import resident_launch_requests.* from "./resident-launch-requests"
  import resident_launch_lifetime.* from "./resident-launch-lifetime"
  import resident_launch_recovery.* from "./resident-launch-recovery"
  var callers: CallerId -> Caller
  var backends: BackendId -> Backend
  // One protected namespace serializes selection across configuration identities.
  var claim: Claim
  var registry: GenerationId -> RegistryEntry
  var publication: GenerationId -> PublicationReceipt
  var retirement: GenerationId -> RetirementEvidence
  var resources: int -> OwnedResource
  var starts: Set[StartMessage]
  var attachments: int -> Attachment
  var requests: InvocationId -> Request
  // Specification/oracle history only; this map is not persisted by the application.
  var writes: InvocationId -> Write
  var round: int
  var seen: Set[str]

  val snapshot: LaunchSnapshot = {
    callers: callers,
    backends: backends,
    claim: claim,
    registry: registry,
    publication: publication,
    retirement: retirement,
    resources: resources,
    starts: starts,
    attachments: attachments,
    requests: requests,
    writes: writes,
    round: round,
    seen: seen,
  }
  action commit(updated: LaunchSnapshot): bool = all {
    callers' = updated.callers,
    backends' = updated.backends,
    claim' = updated.claim,
    registry' = updated.registry,
    publication' = updated.publication,
    retirement' = updated.retirement,
    resources' = updated.resources,
    starts' = updated.starts,
    attachments' = updated.attachments,
    requests' = updated.requests,
    writes' = updated.writes,
    round' = updated.round,
    seen' = updated.seen,
  }
  action init = commit(initial)
  action captureSelection(c: CallerId, key: SelectionKey): bool = all {
    canSelect(snapshot, c), commit(selectCaller(snapshot, c, key)),
  }
  action acquireClaim(c: CallerId): bool = all {
    canAcquire(snapshot, c), commit(acquire(snapshot, c)),
  }
  action prepareBackend(c: CallerId, b: BackendId): bool = all {
    canPrepare(snapshot, c, b), commit(prepare(snapshot, c, b)),
  }
  action sendStart(c: CallerId, b: BackendId): bool = all {
    canSendStart(snapshot, c, b), commit(sendStartMessage(snapshot, c, b)),
  }
  action deliverStart(c: CallerId, b: BackendId): bool = all {
    canDeliverStart(snapshot, c, b), commit(deliverStartMessage(snapshot, c, b)),
  }
  action applicationReady(b: BackendId): bool = all {
    canReady(snapshot, b), commit(readyBackend(snapshot, b)),
  }
  action publishLocator(b: BackendId): bool = all {
    canPublish(snapshot, b), commit(publishBackend(snapshot, b)),
  }
  action observePublication(b: BackendId): bool = all {
    canObservePublication(snapshot, b), commit(observeBackendPublication(snapshot, b)),
  }
  action beginCreatorAttachment(c: CallerId, b: BackendId): bool = all {
    canAttachCreator(snapshot, c, b), commit(beginAttachment(snapshot, c, b)),
  }
  action beginReuseAttachment(c: CallerId, b: BackendId): bool = all {
    canReuse(snapshot, c, b), commit(beginAttachment(snapshot, c, b)),
  }
  action queueRead(inv: InvocationId, b: BackendId): bool = all {
    canQueueRead(snapshot, inv, b), commit(admitRead(snapshot, inv, b)),
  }
  action queueWrite(inv: InvocationId, b: BackendId): bool = all {
    canQueueWrite(snapshot, inv, b), commit(admitWrite(snapshot, inv, b)),
  }
  action waitForModel(inv: InvocationId): bool = all {
    canWaitForModel(snapshot, inv), commit(waitModel(snapshot, inv)),
  }
  action finishModel(b: BackendId): bool = all {
    canFinishModel(snapshot, b), commit(completeModel(snapshot, b)),
  }
  action startRequest(inv: InvocationId): bool = all {
    canStartRequest(snapshot, inv), commit(runRequest(snapshot, inv)),
  }
  action finishRead(inv: InvocationId): bool = all {
    canFinishRead(snapshot, inv), commit(completeRead(snapshot, inv)),
  }
  action cancelRequest(inv: InvocationId): bool = all {
    canCancelRequest(snapshot, inv), commit(cancelRequestState(snapshot, inv)),
  }
  action finishCleanup(inv: InvocationId): bool = all {
    canFinishCleanup(snapshot, inv), commit(cleanupRequest(snapshot, inv)),
  }
  action failCleanup(inv: InvocationId): bool = all {
    canFailCleanup(snapshot, inv), commit(blockRequestCleanup(snapshot, inv)),
  }
  action dispatchWrite(inv: InvocationId): bool = all {
    canDispatchWrite(snapshot, inv), commit(submitWrite(snapshot, inv)),
  }
  action commitRemote(inv: InvocationId): bool = all {
    canCommitRemote(snapshot, inv), commit(commitRemoteEffect(snapshot, inv)),
  }
  action rejectRemote(inv: InvocationId): bool = all {
    canRejectRemote(snapshot, inv), commit(rejectRemoteEffect(snapshot, inv)),
  }
  action produceTerminal(inv: InvocationId): bool = all {
    canProduceTerminal(snapshot, inv), commit(produceWriteTerminal(snapshot, inv)),
  }
  action receiveTerminal(inv: InvocationId): bool = all {
    canReceiveTerminal(snapshot, inv), commit(receiveWriteTerminal(snapshot, inv)),
  }
  action queueTerminal(inv: InvocationId): bool = all {
    canQueueTerminal(snapshot, inv), commit(queueWriteTerminal(snapshot, inv)),
  }
  action observeTerminal(inv: InvocationId): bool = all {
    canObserveTerminal(snapshot, inv), commit(observeWriteTerminal(snapshot, inv)),
  }
  action reconcileWrite(inv: InvocationId): bool = all {
    canReconcileWrite(snapshot, inv), commit(reconcileOriginalWrite(snapshot, inv)),
  }
  action releaseCaller(c: CallerId): bool = all {
    canReleaseCaller(snapshot, c), commit(releaseCallerState(snapshot, c)),
  }
  action advanceRound: bool = all {
    canAdvanceRound(snapshot), commit(advanceModelRound(snapshot)),
  }
  action renewLease(c: CallerId): bool = all {
    canRenewLease(snapshot, c), commit(renewAttachment(snapshot, c)),
  }
  action expireLease(c: CallerId): bool = all {
    canExpireLease(snapshot, c), commit(expireAttachment(snapshot, c)),
  }
  action idleFence(b: BackendId): bool = all {
    canIdleFence(snapshot, b), commit(idleFenceBackend(snapshot, b)),
  }
  action requestDrain(b: BackendId): bool = all {
    canRequestDrain(snapshot, b), commit(fenceBackend(snapshot, b)),
  }
  action confirmRetirement(b: BackendId): bool = all {
    canConfirmRetirement(snapshot, b), commit(retireBackend(snapshot, b)),
  }
  action repeatRelease(c: CallerId): bool = all {
    canRepeatRelease(snapshot, c), commit(observeRepeatRelease(snapshot, c)),
  }
  action losePublicationReceipt(b: BackendId): bool = all {
    canLoseReceipt(snapshot, b), commit(loseBackendReceipt(snapshot, b)),
  }
  action crashBackend(b: BackendId): bool = all {
    canCrashBackend(snapshot, b), commit(loseBackend(snapshot, b)),
  }
  action disconnectParent(b: BackendId): bool = all {
    canDisconnectParent(snapshot, b), commit(loseParentChannel(snapshot, b)),
  }
  action retirePrepared(c: CallerId, b: BackendId): bool = all {
    canRetirePrepared(snapshot, c, b), commit(confirmPreparedClosure(snapshot, c, b)),
  }
  action verifyRetirement(b: BackendId): bool = all {
    canVerifyRetirement(snapshot, b), commit(operatorVerifiedRetirement(snapshot, b)),
  }
  action refuseBlocked(c: CallerId): bool = all {
    canRefuseBlocked(snapshot, c), commit(refuseUnresolvedCaller(snapshot, c)),
  }
  action refuseExplicitMismatch(c: CallerId, b: BackendId): bool = all {
    canRefuseMismatch(snapshot, c, b), commit(refuseMismatchedCaller(snapshot, c, b)),
  }
  action rejectStaleCleanup(b: BackendId, other: BackendId): bool = all {
    canRejectStaleCleanup(snapshot, b, other), commit(observeStaleCleanupRefusal(snapshot, b, other)),
  }
  action killCaller(c: CallerId): bool = all {
    canKillCaller(snapshot, c), commit(loseCallerProcess(snapshot, c)),
  }
  action refuseUnavailable(c: CallerId, b: BackendId): bool = all {
    canRefuseUnavailable(snapshot, c, b), commit(refuseUnavailableOwner(snapshot, c, b)),
  }
  action finishAttachment(c: CallerId): bool = all {
    canFinishAttachment(snapshot, c), commit(finishAttachmentState(snapshot, c)),
  }
  action closeAttachment(c: CallerId): bool = all {
    canCloseAttachment(snapshot, c), commit(closeAttachmentOwner(snapshot, c)),
  }
  action finishAttachmentCleanup(c: CallerId): bool = all {
    canFinishAttachmentCleanup(snapshot, c), commit(finishAttachmentCleanupState(snapshot, c)),
  }
  action step = {
    nondet b = BACKENDS.oneOf()
    nondet inv = INVOCATIONS.oneOf()
    nondet other = BACKENDS.oneOf()
    nondet c = CALLERS.oneOf()
    nondet key = SELECTIONS.oneOf()
    any {
      captureSelection(c, key),
      closeAttachment(c),
      finishAttachmentCleanup(c),
      finishAttachment(c),
      refuseUnavailable(c, b),
      killCaller(c),
      rejectStaleCleanup(b, other),
      refuseExplicitMismatch(c, b),
      refuseBlocked(c),
      verifyRetirement(b),
      retirePrepared(c, b),
      disconnectParent(b),
      crashBackend(b),
      losePublicationReceipt(b),
      repeatRelease(c),
      confirmRetirement(b),
      requestDrain(b),
      idleFence(b),
      expireLease(c),
      renewLease(c),
      advanceRound,
      releaseCaller(c),
      reconcileWrite(inv),
      observeTerminal(inv),
      queueTerminal(inv),
      receiveTerminal(inv),
      produceTerminal(inv),
      rejectRemote(inv),
      commitRemote(inv),
      dispatchWrite(inv),
      failCleanup(inv),
      finishCleanup(inv),
      cancelRequest(inv),
      finishRead(inv),
      startRequest(inv),
      finishModel(b),
      waitForModel(inv),
      queueWrite(inv, b),
      queueRead(inv, b),
      beginReuseAttachment(c, b),
      beginCreatorAttachment(c, b),
      observePublication(b),
      publishLocator(b),
      applicationReady(b),
      deliverStart(c, b),
      sendStart(c, b),
      prepareBackend(c, b),
      acquireClaim(c),
    }
  }
  val creator_attachment_started = seen.contains("creator_attachment_started")
  val reuse_started = seen.contains("reuse_started")
  val attachment_started = seen.contains("attachment_started")
  val attachment_finished = seen.contains("attachment_finished")
  val attachment_closing = seen.contains("attachment_closing")
  val attachment_cleaned = seen.contains("attachment_cleaned")
  val selected = seen.contains("selected")
  val claimed = seen.contains("claimed")
  val prepared = seen.contains("prepared")
  val start_attempted = seen.contains("start_attempted")
  val start_delivered = seen.contains("start_delivered")
  val application_ready = seen.contains("application_ready")
  val published = seen.contains("published")
  val publication_observed = seen.contains("publication_observed")
  val safety = uniqueCompatibleOwner(snapshot) and killAuthorityIsLocal(snapshot)
    and publicationFollowsReadiness(snapshot) and attachedIdentityIsCaptured(snapshot)
    and retiredResourcesAreClosed(snapshot) and attachmentOwnersMatch(snapshot)
    and acceptingHasPublication(snapshot) and requestResourcesMatch(snapshot) and writeHistoryIsSound(snapshot)
  val creator_attached = seen.contains("creator_attached")
  val reused = seen.contains("reused")
  val read_queued = seen.contains("read_queued")
  val write_queued = seen.contains("write_queued")
  val model_waiting = seen.contains("model_waiting")
  val model_ready = seen.contains("model_ready")
  val request_running = seen.contains("request_running")
  val read_terminal = seen.contains("read_terminal")
  val request_cancelled = seen.contains("request_cancelled")
  val cleanup_confirmed = seen.contains("cleanup_confirmed")
  val cleanup_blocked = seen.contains("cleanup_blocked")
  val write_dispatched = seen.contains("write_dispatched")
  val remote_committed = seen.contains("remote_committed")
  val remote_rejected = seen.contains("remote_rejected")
  val terminal_produced = seen.contains("terminal_produced")
  val terminal_received = seen.contains("terminal_received")
  val terminal_queued = seen.contains("terminal_queued")
  val host_observed = seen.contains("host_observed")
  val write_reconciled = seen.contains("write_reconciled")
  val caller_released = seen.contains("caller_released")
  val time_advanced = seen.contains("time_advanced")
  val lease_renewed = seen.contains("lease_renewed")
  val lease_expired = seen.contains("lease_expired")
  val idle_fenced = seen.contains("idle_fenced")
  val drain_started = seen.contains("drain_started")
  val retirement_confirmed = seen.contains("retirement_confirmed")
  val release_repeated = seen.contains("release_repeated")
  val receipt_lost = seen.contains("receipt_lost")
  val backend_lost = seen.contains("backend_lost")
  val parent_disconnected = seen.contains("parent_disconnected")
  val prepared_retired = seen.contains("prepared_retired")
  val operator_retired = seen.contains("operator_retired")
  val blocked_refusal = seen.contains("blocked_refusal")
  val identity_refused = seen.contains("identity_refused")
  val stale_cleanup_refused = seen.contains("stale_cleanup_refused")
  val caller_killed = seen.contains("caller_killed")
  val unavailable_refused = seen.contains("unavailable_refused")
}
