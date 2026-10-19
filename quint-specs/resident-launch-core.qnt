module resident_launch_core {
  import resident_launch_types.* from "./resident-launch-types"
  pure val CALLERS = Set(0, 1, 2)
  pure val BACKENDS = Set(0, 1, 2)
  pure val GENERATION_OF = Map(0 -> 10, 1 -> 11, 2 -> 12)
  pure val BASE_SELECTION = { authority: 0, policy: 0, implementation: 0 }
  pure val SELECTIONS = Set(BASE_SELECTION,
    { authority: 1, policy: 0, implementation: 0 },
    { authority: 0, policy: 1, implementation: 0 },
    { authority: 0, policy: 0, implementation: 1 })
  pure val initial: LaunchSnapshot = {
    callers: CALLERS.mapBy(_ => { selection: BASE_SELECTION, phase: Selecting, killAuthority: Set() }),
    backends: BACKENDS.mapBy(b => { launcher: 0, generation: GENERATION_OF.get(b),
      selection: BASE_SELECTION, phase: BackendRetired, model: Cold, parentConnected: false }),
    claim: Free, registry: Map(), publication: Map(), retirement: Map(),
    resources: Map(), starts: Set(), attachments: Map(), requests: Map(), writes: Map(), round: 0, seen: Set(),
  }
  pure def canSelect(s: LaunchSnapshot, c: CallerId): bool = s.callers.get(c).phase == Selecting
  pure def selectCaller(s: LaunchSnapshot, c: CallerId, key: SelectionKey): LaunchSnapshot = {
    ...s, callers: s.callers.set(c, { ...s.callers.get(c), selection: key, phase: LocalDiscovery }),
    seen: s.seen.union(Set("selected")),
  }
  pure def canAcquire(s: LaunchSnapshot, c: CallerId): bool = s.claim == Free and s.callers.get(c).phase == LocalDiscovery
  pure def acquire(s: LaunchSnapshot, c: CallerId): LaunchSnapshot = { ...s, claim: Held({ owner: LauncherOwner(c), capability: c }), seen: s.seen.union(Set("claimed")) }
  pure def launcherOwns(s: LaunchSnapshot, c: CallerId): bool = match s.claim { | Held(h) => match h.owner { | LauncherOwner(owner) => owner == c | _ => false } | _ => false }
  pure def backendOwns(s: LaunchSnapshot, b: BackendId): bool = match s.claim { | Held(h) => match h.owner { | BackendOwner(owner) => owner == b | _ => false } | _ => false }
  pure def canPrepare(s: LaunchSnapshot, c: CallerId, b: BackendId): bool = all { launcherOwns(s, c), s.callers.get(c).phase == LocalDiscovery, not(s.publication.keys().contains(GENERATION_OF.get(b))), BACKENDS.forall(other => s.backends.get(other).phase == BackendRetired or s.backends.get(other).selection != s.callers.get(c).selection) }
  pure def prepare(s: LaunchSnapshot, c: CallerId, b: BackendId): LaunchSnapshot = {
    ...s, callers: s.callers.set(c, { ...s.callers.get(c), phase: Prepared(b), killAuthority: Set(b) }),
    backends: s.backends.set(b, { launcher: c, generation: GENERATION_OF.get(b), selection: s.callers.get(c).selection, phase: BackendPrepared, model: Cold, parentConnected: true }),
    publication: s.publication.put(GENERATION_OF.get(b), ReceiptAbsent), retirement: s.retirement.put(GENERATION_OF.get(b), RetirementUnverified),
    registry: s.registry.put(GENERATION_OF.get(b), PendingOwner({ backend: b, selection: s.callers.get(c).selection })), seen: s.seen.union(Set("prepared")),
  }
  pure def canSendStart(s: LaunchSnapshot, c: CallerId, b: BackendId): bool = all { launcherOwns(s, c), s.callers.get(c).phase == Prepared(b), s.backends.get(b).phase == BackendPrepared, s.backends.get(b).parentConnected }
  pure def sendStartMessage(s: LaunchSnapshot, c: CallerId, b: BackendId): LaunchSnapshot = { ...s, claim: Held({ owner: TransferOwner({ parent: c, backend: b }), capability: c }), callers: s.callers.set(c, { ...s.callers.get(c), phase: StartAttempted(b), killAuthority: Set() }), backends: s.backends.set(b, { ...s.backends.get(b), phase: Authorized }), starts: s.starts.union(Set({ parent: c, backend: b, authenticated: true, claim: c })), seen: s.seen.union(Set("start_attempted")) }
  pure def canDeliverStart(s: LaunchSnapshot, c: CallerId, b: BackendId): bool = all { s.starts.contains({ parent: c, backend: b, authenticated: true, claim: c }), s.claim == Held({ owner: TransferOwner({ parent: c, backend: b }), capability: c }), s.backends.get(b).phase == Authorized, s.backends.get(b).parentConnected }
  pure def deliverStartMessage(s: LaunchSnapshot, c: CallerId, b: BackendId): LaunchSnapshot = { ...s, claim: Held({ owner: BackendOwner(b), capability: c }), backends: s.backends.set(b, { ...s.backends.get(b), phase: Listening }), starts: s.starts.exclude(Set({ parent: c, backend: b, authenticated: true, claim: c })), seen: s.seen.union(Set("start_delivered")) }
  pure def canReady(s: LaunchSnapshot, b: BackendId): bool = backendOwns(s, b) and s.backends.get(b).phase == Listening
  pure def readyBackend(s: LaunchSnapshot, b: BackendId): LaunchSnapshot = { ...s, backends: s.backends.set(b, { ...s.backends.get(b), phase: ApplicationReady }), seen: s.seen.union(Set("application_ready")) }
  pure def canPublish(s: LaunchSnapshot, b: BackendId): bool = backendOwns(s, b) and s.backends.get(b).phase == ApplicationReady
  pure def publishBackend(s: LaunchSnapshot, b: BackendId): LaunchSnapshot = { ...s, registry: s.registry.set(s.backends.get(b).generation, Current({ backend: b, generation: s.backends.get(b).generation, selection: s.backends.get(b).selection })), backends: s.backends.set(b, { ...s.backends.get(b), phase: Accepting }), seen: s.seen.union(Set("published")) }
  pure def canObservePublication(s: LaunchSnapshot, b: BackendId): bool = all { backendOwns(s, b), Set(Accepting, Draining).contains(s.backends.get(b).phase), s.publication.get(s.backends.get(b).generation) == ReceiptAbsent }
  pure def observeBackendPublication(s: LaunchSnapshot, b: BackendId): LaunchSnapshot = { ...s, claim: Free, publication: s.publication.set(s.backends.get(b).generation, ReceiptOwned({ backend: b, capability: s.backends.get(b).launcher })), seen: s.seen.union(Set("publication_observed")) }

  pure def unresolved(s: LaunchSnapshot, b: BackendId): bool =
    if (s.retirement.keys().contains(s.backends.get(b).generation))
      s.retirement.get(s.backends.get(b).generation) == RetirementUnverified else false
  pure def uniqueCompatibleOwner(s: LaunchSnapshot): bool = BACKENDS.forall(b => BACKENDS.forall(other =>
    (unresolved(s, b) and unresolved(s, other) and s.backends.get(b).selection == s.backends.get(other).selection) implies b == other))
  pure def killAuthorityIsLocal(s: LaunchSnapshot): bool = CALLERS.forall(c => s.callers.get(c).killAuthority.forall(b => all {
    s.callers.get(c).phase == Prepared(b), s.backends.get(b).launcher == c,
    s.backends.get(b).phase == BackendPrepared,
  }))
  pure def publicationFollowsReadiness(s: LaunchSnapshot): bool = s.registry.keys().forall(g => match s.registry.get(g) {
    | Current(locator) => all { locator.generation == g, s.backends.get(locator.backend).generation == g,
      s.backends.get(locator.backend).selection == locator.selection,
      Set(Accepting, Draining, BackendBlocked, BackendLost).contains(s.backends.get(locator.backend).phase) }
    | _ => true
  })
  pure def attachedIdentityIsCaptured(s: LaunchSnapshot): bool = CALLERS.forall(c => match s.callers.get(c).phase {
    | Attached(g) => BACKENDS.exists(b => s.backends.get(b).generation == g and s.backends.get(b).selection == s.callers.get(c).selection)
    | _ => true
  })
  pure def publicCompatible(s: LaunchSnapshot, c: CallerId, b: BackendId): bool = {
    val g = s.backends.get(b).generation
    if (s.registry.keys().contains(g) and s.publication.keys().contains(g)) match s.registry.get(g) {
      | Current(locator) => all { locator.backend == b, locator.selection == s.callers.get(c).selection,
        s.backends.get(b).phase == Accepting, s.publication.get(g) == ReceiptOwned({ backend: b, capability: s.backends.get(b).launcher }) }
      | _ => false
    } else false
  }
  // IDs 100..102 identify admission acquisition, disjoint from request owners 0..5.
  pure def attachmentResource(c: CallerId): int = 100 + c
  pure def canAttachCreator(s: LaunchSnapshot, c: CallerId, b: BackendId): bool = s.callers.get(c).phase == StartAttempted(b) and not(s.attachments.keys().contains(c)) and publicCompatible(s, c, b)
  pure def beginAttachment(s: LaunchSnapshot, c: CallerId, b: BackendId): LaunchSnapshot = { ...s,
    attachments: s.attachments.put(c, { caller: c, generation: s.backends.get(b).generation, phase: LeaseLive, expires: s.round + 2 }),
    resources: s.resources.put(attachmentResource(c), { caller: c, backend: b, generation: s.backends.get(b).generation, cleanup: Active, admitted: false }),
    seen: s.seen.union(Set("attachment_started", if (s.callers.get(c).phase == StartAttempted(b)) "creator_attachment_started" else "reuse_started")),
  }
  pure def canReuse(s: LaunchSnapshot, c: CallerId, b: BackendId): bool = launcherOwns(s, c) and s.callers.get(c).phase == LocalDiscovery and not(s.attachments.keys().contains(c)) and publicCompatible(s, c, b)
  pure def pendingAttachment(s: LaunchSnapshot, c: CallerId): bool = if (s.resources.keys().contains(attachmentResource(c))) {
    val owner = s.resources.get(attachmentResource(c))
    not(owner.admitted) and owner.cleanup == Active
  } else false
  pure def canFinishAttachment(s: LaunchSnapshot, c: CallerId): bool = if (pendingAttachment(s, c)) {
    val owner = s.resources.get(attachmentResource(c))
    s.backends.get(owner.backend).phase == Accepting and s.round < s.attachments.get(c).expires and s.attachments.get(c).phase == LeaseLive
  } else false
  pure def finishAttachmentState(s: LaunchSnapshot, c: CallerId): LaunchSnapshot = {
    val owner = s.resources.get(attachmentResource(c))
    val creator = s.callers.get(c).phase == StartAttempted(owner.backend)
    { ...s, claim: if (launcherOwns(s, c)) Free else s.claim,
      callers: s.callers.set(c, { ...s.callers.get(c), phase: Attached(owner.generation) }),
      resources: s.resources.set(attachmentResource(c), { ...owner, admitted: true, cleanup: Active }),
      seen: s.seen.union(Set(if (creator) "creator_attached" else "reused", "attachment_finished")),
    }
  }
  pure def acceptingHasPublication(s: LaunchSnapshot): bool = BACKENDS.forall(b =>
    if (s.backends.get(b).phase == Accepting) {
      val g = s.backends.get(b).generation
      if (s.registry.keys().contains(g)) s.registry.get(g) == Current({ backend: b, generation: g, selection: s.backends.get(b).selection }) else false
    } else true)
}
