module resident_recovery_observations_test {
  import resident_launch_types.* from "./resident-launch-types"
  import resident_launch_core.* from "./resident-launch-core"
  import resident_launch_requests.* from "./resident-launch-requests"
  import resident_launch_lifetime.* from "./resident-launch-lifetime"
  import resident_launch_recovery.* from "./resident-launch-recovery"
  import resident_launch.* from "./resident-launch"
  import resident_recovery_observations.* from "./resident-recovery-observations"
  // RetiredCommitObservation: dispatch1, two reads0/1, distinct generations and confirmed owned exits.
  run retiredCommitCorrespondenceTest = observedRetirementAndFreshRead
    .then(observeOriginalEvidence(Uncertain(10), 1, RemotePending))
    .expect(backends.get(0).phase == BackendRetired and registry.keys() == Set(11) and safety)
    .then(commitRemote(OLD_WRITE))
    .then(queueRead({ adapter: 1, ordinal: 1 }, 1))
    .then(startRequest({ adapter: 1, ordinal: 1 }))
    .then(finishRead({ adapter: 1, ordinal: 1 })).then(finishCleanup({ adapter: 1, ordinal: 1 }))
    .then(observeOriginalEvidence(Uncertain(10), 1, RemoteCommitted))
    .expect(requests.keys().filter(inv => inv.adapter == 1).size() == 2 and not(canDispatchWrite(snapshot, OLD_WRITE)) and safety)
    .then(retireObservedOwner(1, 1)).expect(registry.keys() == Set() and safety)
  run retirementDoesNotEstablishFailureTest = observedRetirementAndFreshRead
    .expect(not(originalEvidenceMatches(snapshot, NotDispatched, 1, RemotePending)))
  run secondDispatchIsContradictoryTest = observedRetirementAndFreshRead
    .expect(not(originalEvidenceMatches(snapshot, Uncertain(10), 2, RemotePending)))
  // CrashedCommitObservation: SIGKILL, two refusing fresh adapters, retained ownership, delayed remote0->1.
  run crashRefusalCorrespondenceTest = observedPendingWrite.then(crashBackend(0))
    .then(killCaller(0))
    .then(captureSelection(1, BASE_SELECTION)).then(acquireClaim(1)).then(refuseUnavailable(1, 0))
    .then(captureSelection(2, BASE_SELECTION)).then(acquireClaim(2)).then(refuseUnavailable(2, 0))
    .then(observeOriginalEvidence(Uncertain(10), 1, RemotePending))
    .expect(backends.get(0).phase == BackendLost and retirement.get(10) == RetirementUnverified
      and registry.keys() == Set(10) and callers.get(1).phase == Refused and callers.get(2).phase == Refused and safety)
    .then(commitRemote(OLD_WRITE)).then(observeOriginalEvidence(Uncertain(10), 1, RemoteCommitted)).expect(safety)
  // VersionCoexistenceObservation: two implementation keys; old retirement preserves the survivor locator.
  run versionCoexistenceCorrespondenceTest = init.then(readyObservedOwner(0, 0, BASE_SELECTION))
    .then(readyObservedOwner(1, 1, { authority: 0, policy: 0, implementation: 1 }))
    .expect(uniqueCompatibleOwner(snapshot) and registry.keys() == Set(10, 11) and safety)
    .then(retireObservedOwner(0, 0))
    .expect(backends.get(1).phase == Accepting and publicCompatible(snapshot, 1, 1)
      and registry.get(11) == Current({ backend: 1, generation: 11, selection: { authority: 0, policy: 0, implementation: 1 } }) and safety)
    .then(retireObservedOwner(1, 1)).expect(registry.keys() == Set() and safety)
}
