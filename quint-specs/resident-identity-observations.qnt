module resident_identity_observations {
  import resident_launch_types.* from "./resident-launch-types"
  import resident_launch_core.* from "./resident-launch-core"
  import resident_launch_requests.* from "./resident-launch-requests"
  import resident_launch_lifetime.* from "./resident-launch-lifetime"
  import resident_launch_recovery.* from "./resident-launch-recovery"
  import resident_launch.* from "./resident-launch"
  import resident_recovery_observations.* from "./resident-recovery-observations"
  pure val CAPTURED_READ: InvocationId = { adapter: 0, ordinal: 0 }
  // Profile edits affect fresh selection, not the authority captured by an admitted request.
  action observedCapturedRead = init.then(readyObservedOwner(0, 0, BASE_SELECTION))
    .then(queueRead(CAPTURED_READ, 0)).then(waitForModel(CAPTURED_READ))
    .then(finishModel(0)).then(startRequest(CAPTURED_READ))
  pure def capturedReadPreserved(s: LaunchSnapshot): bool = all {
    s.callers.get(0).selection == BASE_SELECTION,
    s.callers.get(0).phase == Attached(10),
    s.backends.get(0).selection == BASE_SELECTION,
    s.backends.get(0).phase == Accepting,
    s.requests.get(CAPTURED_READ).phase == Running,
    s.resources.get(resourceId(CAPTURED_READ)).backend == 0,
  }
  action observeExplicitSelectionRefusal(key: SelectionKey): bool =
    captureSelection(1, key).then(refuseExplicitMismatch(1, 0))
  // Missing/deleted profiles and absent credentials fail before a selection is captured.
  // This observes boundary refusal; it does not model the file parser or secret store.
  action observeSelectionUnavailable(c: CallerId): bool = all {
    callers.get(c).phase == Selecting,
    commit({ ...snapshot, callers: callers.set(c, { ...callers.get(c), phase: Refused }),
      seen: seen.union(Set("selection_unavailable")) }),
  }
  pure def replyIdentityMatches(s: LaunchSnapshot, inv: InvocationId,
    observedAuthority: int, observedWireId: WireRequestId): bool =
    if (s.requests.keys().contains(inv)) all {
      s.requests.get(inv).phase == Terminal,
      s.requests.get(inv).wireId == observedWireId,
      s.backends.get(requestBackend(s, inv)).selection.authority == observedAuthority,
      s.callers.get(inv.adapter).selection.authority == observedAuthority,
    } else false
  action observeReplyIdentity(inv: InvocationId, authority: int, wireId: WireRequestId): bool = all {
    replyIdentityMatches(snapshot, inv, authority, wireId), commit(snapshot),
  }
}
