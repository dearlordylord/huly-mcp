module resident_launch_observations_test {
  import resident_launch_observations.* from "./resident-launch-observations"
  import resident_launch.* from "./resident-launch"
  run lateOwnerObservationTest = observedOwner
    .then(observeAdmission(Begin, true, 1, 0, true))
    .then(observeAdmission(Fence, true, 1, 0, false))
    .then(observeAdmission(LateOwner, true, 1, 1, false))
    .then(observeAdmission(Closed, true, 0, 0, false))
    .expect(safety)
  run ordinaryOwnerObservationTest = observedOwner
    .then(observeAdmission(Begin, true, 1, 0, true))
    .then(observeAdmission(Finish, true, 0, 1, true))
    .then(observeAdmission(Fence, true, 0, 1, false))
    .then(observeAdmission(LateOwner, true, 0, 1, false))
    .then(observeAdmission(Closed, true, 0, 0, false))
    .expect(safety)
}
