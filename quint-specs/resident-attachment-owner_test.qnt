module resident_attachment_owner_test {
  import resident_attachment_owner.* from "./resident-attachment-owner"

  run cleanupBarrierTest = init
    .then(reserve(0, 0))
    .then(adopt(0, 0))
    .then(fence(0))
    .expect(not(canRelease(owners.get(0))))
    .expect(owners.get(0).sessions.contains(0) and safety)
    .then(reserve(1, 0))
    .then(adopt(1, 0))
    .then(finish(0, 0))
    .then(release(0))
    .expect(owners.get(1).sessions.contains(0) and owners.get(1).work.get(0) == Running and safety)

  run adoptionDuringCloseTest = init
    .then(reserve(0, 0))
    .then(fence(0))
    .then(adopt(0, 0))
    .then(finish(0, 0))
    .expect(not(canAdopt(owners.get(0), 1)))
    .then(release(0))
    .expect(safety)

  run defectiveCleanupTest = init
    .then(reserve(0, 0))
    .then(adopt(0, 0))
    .then(defect(0, 0))
    .expect(not(canReserve(owners.get(0), 1, round)) and not(canRelease(owners.get(0))))
    .expect(owners.get(0).sessions.contains(0) and safety)
  run expiryRetainsProtectedWorkTest = init
    .then(reserve(0, 0))
    .then(adopt(0, 0))
    .then(tick)
    .then(renew(1))
    .then(tick)
    .expect(not(canReserve(owners.get(0), 1, round)) and not(eligible(owners.get(0), round)))
    .then(expire(0))
    .expect(not(canRelease(owners.get(0))) and owners.get(0).sessions.contains(0))
    .then(reserve(1, 0))
    .then(finish(0, 0))
    .then(release(0))
    .expect(owners.get(1).work.get(0) == Running and safety)
}
