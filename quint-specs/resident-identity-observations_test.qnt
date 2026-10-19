module resident_identity_observations_test {
  import resident_launch_types.* from "./resident-launch-types"
  import resident_launch_core.* from "./resident-launch-core"
  import resident_launch_requests.* from "./resident-launch-requests"
  import resident_launch_lifetime.* from "./resident-launch-lifetime"
  import resident_launch_recovery.* from "./resident-launch-recovery"
  import resident_launch.* from "./resident-launch"
  import resident_recovery_observations.* from "./resident-recovery-observations"
  import resident_identity_observations.* from "./resident-identity-observations"
  // Native profile rotation, URL/workspace changes and another profile normalize to a new authority.
  run changedAuthorityRefusalTest = observedCapturedRead
    .then(observeExplicitSelectionRefusal({ authority: 1, policy: 0, implementation: 0 }))
    .expect(callers.get(1).phase == Refused and capturedReadPreserved(snapshot) and safety)
    .then(finishRead(CAPTURED_READ)).then(finishCleanup(CAPTURED_READ))
    .then(observeReplyIdentity(CAPTURED_READ, 0, 1))
  run changedPolicyRefusalTest = observedCapturedRead
    .then(observeExplicitSelectionRefusal({ authority: 0, policy: 1, implementation: 0 }))
    .expect(callers.get(1).phase == Refused and capturedReadPreserved(snapshot) and safety)
  // Logout/deletion/missing profile do not produce a captured replacement authority.
  run unavailableSelectionRefusalTest = observedCapturedRead.then(observeSelectionUnavailable(1))
    .expect(callers.get(1).phase == Refused and capturedReadPreserved(snapshot) and safety)
    .then(finishRead(CAPTURED_READ)).then(finishCleanup(CAPTURED_READ))
    .then(observeReplyIdentity(CAPTURED_READ, 0, 1))
  // Restoring the exact snapshot admits a fresh caller without changing the old request owner.
  run restoredSelectionReuseTest = observedCapturedRead.then(observeSelectionUnavailable(1))
    .then(captureSelection(2, BASE_SELECTION)).then(acquireClaim(2))
    .then(beginReuseAttachment(2, 0)).then(finishAttachment(2))
    .expect(capturedReadPreserved(snapshot) and callers.get(2).phase == Attached(10) and safety)
  run collidingReadIdentityTest = observedCapturedRead
    .then(readyObservedOwner(1, 1, { authority: 1, policy: 0, implementation: 0 }))
    .then(observedFreshRead(0))
    .then(finishRead(CAPTURED_READ)).then(finishCleanup(CAPTURED_READ))
    .then(observeReplyIdentity(CAPTURED_READ, 0, 1))
    .then(observeReplyIdentity({ adapter: 1, ordinal: 0 }, 1, 1))
    .expect(not(replyIdentityMatches(snapshot, CAPTURED_READ, 1, 1))
      and not(replyIdentityMatches(snapshot, { adapter: 1, ordinal: 0 }, 0, 1)) and safety)
}
