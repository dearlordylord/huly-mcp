// Shared-memory resource core of attachment-owner.ts, not the wire/lease protocol.
module resident_attachment_owner {
  pure val OWNERS = Set(0, 1)
  pure val TICKETS = Set(0, 1)
  type Phase = Accepting | Closing | Blocked | Closed
  type Work = Idle | Running | Cleaning | Done | Defective
  type Owner = { phase: Phase, work: int -> Work, sessions: Set[int], adopted: Set[int] }
  var owners: int -> Owner
  var seen: Set[str]

  pure val initialOwner = {
    phase: Accepting,
    work: TICKETS.mapBy(_ => Idle),
    sessions: Set(),
    adopted: Set(),
  }
  action init = all {
    owners' = OWNERS.mapBy(_ => initialOwner),
    seen' = Set(),
  }
  pure def canReserve(owner: Owner, ticket: int): bool =
    owner.phase == Accepting and owner.work.get(ticket) == Idle
  action reserve(owner: int, ticket: int): bool = all {
    canReserve(owners.get(owner), ticket),
    owners' = owners.set(owner, {
      ...owners.get(owner), work: owners.get(owner).work.set(ticket, Running)
    }),
    seen' = seen.union(Set("reserve")),
  }
  pure def retained(work: Work): bool = work == Running or work == Cleaning
  pure def cancelled(owner: Owner): Owner = {
    ...owner, phase: Closing,
    work: TICKETS.mapBy(t => if (owner.work.get(t) == Running) Cleaning else owner.work.get(t)),
  }
  pure def canAdopt(owner: Owner, ticket: int): bool =
    retained(owner.work.get(ticket)) and not(owner.sessions.contains(ticket))
  action adopt(owner: int, ticket: int): bool = all {
    canAdopt(owners.get(owner), ticket),
    owners' = owners.set(owner, {
      ...owners.get(owner),
      sessions: owners.get(owner).sessions.union(Set(ticket)),
      adopted: owners.get(owner).adopted.union(Set(ticket)),
    }),
    seen' = seen.union(Set("adopt")),
  }
  action fence(owner: int): bool = all {
    owners.get(owner).phase == Accepting,
    owners' = owners.set(owner, cancelled(owners.get(owner))),
    seen' = seen.union(Set("fence")),
  }
  action finish(owner: int, ticket: int): bool = all {
    retained(owners.get(owner).work.get(ticket)),
    owners' = owners.set(owner, {
      ...owners.get(owner), work: owners.get(owner).work.set(ticket, Done),
    }),
    seen' = seen.union(Set("finish")),
  }
  action defect(owner: int, ticket: int): bool = all {
    retained(owners.get(owner).work.get(ticket)),
    owners' = owners.set(owner, {
      ...owners.get(owner), phase: Blocked,
      work: owners.get(owner).work.set(ticket, Defective),
    }),
    seen' = seen.union(Set("defect")),
  }
  pure def canRelease(owner: Owner): bool = all {
    owner.phase == Closing,
    TICKETS.forall(t => owner.work.get(t) == Idle or owner.work.get(t) == Done),
  }
  action release(owner: int): bool = all {
    canRelease(owners.get(owner)),
    owners' = owners.set(owner, { ...owners.get(owner), phase: Closed, sessions: Set() }),
    seen' = seen.union(Set("release")),
  }
  action step = {
    nondet owner = OWNERS.oneOf()
    nondet ticket = TICKETS.oneOf()
    any {
      reserve(owner, ticket), adopt(owner, ticket), fence(owner),
      finish(owner, ticket), defect(owner, ticket), release(owner),
    }
  }
  val sessions_retained_until_release = OWNERS.forall(o =>
    owners.get(o).phase != Closed implies owners.get(o).sessions == owners.get(o).adopted)
  val closed_has_no_owned_work = OWNERS.forall(o =>
    owners.get(o).phase == Closed implies all {
      owners.get(o).sessions == Set(),
      TICKETS.forall(t => owners.get(o).work.get(t) == Idle or owners.get(o).work.get(t) == Done),
    })
  val defective_is_fenced = OWNERS.forall(o =>
    TICKETS.exists(t => owners.get(o).work.get(t) == Defective) implies owners.get(o).phase == Blocked)
  val safety = sessions_retained_until_release and closed_has_no_owned_work and defective_is_fenced
  val reserved = seen.contains("reserve")
  val adopted = seen.contains("adopt")
  val fenced = seen.contains("fence")
  val finished = seen.contains("finish")
  val defected = seen.contains("defect")
  val released = seen.contains("release")
}
