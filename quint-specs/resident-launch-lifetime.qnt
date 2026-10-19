module resident_launch_lifetime {
  import resident_launch_types.* from "./resident-launch-types"
  import resident_launch_core.* from "./resident-launch-core"
  import resident_launch_requests.* from "./resident-launch-requests"
  pure def protectedResources(s: LaunchSnapshot, b: BackendId): bool = s.resources.keys().exists(id => s.resources.get(id).generation == s.backends.get(b).generation and s.resources.get(id).cleanup != CleanupConfirmed)
  pure def liveMembers(s: LaunchSnapshot, b: BackendId): bool = s.attachments.keys().exists(c => s.attachments.get(c).generation == s.backends.get(b).generation and s.attachments.get(c).phase == LeaseLive)
  pure def interruptCaller(s: LaunchSnapshot, c: CallerId): LaunchSnapshot = s.requests.keys().filter(inv => inv.adapter == c).fold(s, (acc, inv) => {
    val cancelled = if (canCancelRequest(acc, inv)) cancelRequestState(acc, inv) else acc
    { ...cancelled, writes: if (cancelled.writes.keys().contains(inv)) cancelled.writes.set(inv, uncertainWrite(cancelled.writes.get(inv))) else cancelled.writes }
  })
  pure def removeRegistry(s: LaunchSnapshot, g: GenerationId): GenerationId -> RegistryEntry = s.registry.keys().exclude(Set(g)).mapBy(key => s.registry.get(key))
  pure def canReleaseCaller(s: LaunchSnapshot, c: CallerId): bool = match s.callers.get(c).phase { | Attached(_) => true | _ => false }
  pure def releaseCallerState(s: LaunchSnapshot, c: CallerId): LaunchSnapshot = { ...interruptCaller(s, c),
    callers: s.callers.set(c, { ...s.callers.get(c), phase: CallerClosed, killAuthority: Set() }),
    attachments: s.attachments.set(c, { ...s.attachments.get(c), phase: LeaseReleased }), seen: s.seen.union(Set("caller_released")),
  }
  pure def canAdvanceRound(s: LaunchSnapshot): bool = s.round < 8 and s.attachments.keys().exists(c => s.attachments.get(c).phase == LeaseLive and s.round < s.attachments.get(c).expires)
  pure def advanceModelRound(s: LaunchSnapshot): LaunchSnapshot = { ...s, round: s.round + 1, seen: s.seen.union(Set("time_advanced")) }
  pure def canRenewLease(s: LaunchSnapshot, c: CallerId): bool = if (eligibleAttachment(s, c)) all {
    s.round + 2 > s.attachments.get(c).expires,
    BACKENDS.exists(b => s.backends.get(b).generation == s.attachments.get(c).generation and s.backends.get(b).phase == Accepting),
  } else false
  pure def renewAttachment(s: LaunchSnapshot, c: CallerId): LaunchSnapshot = { ...s,
    attachments: s.attachments.set(c, { ...s.attachments.get(c), expires: s.round + 2 }), seen: s.seen.union(Set("lease_renewed")),
  }
  pure def canExpireLease(s: LaunchSnapshot, c: CallerId): bool = if (s.attachments.keys().contains(c)) s.attachments.get(c).phase == LeaseLive and s.round >= s.attachments.get(c).expires else false
  pure def expireAttachment(s: LaunchSnapshot, c: CallerId): LaunchSnapshot = { ...interruptCaller(s, c),
    attachments: s.attachments.set(c, { ...s.attachments.get(c), phase: LeaseExpired }), seen: s.seen.union(Set("lease_expired")),
  }
  pure def canIdleFence(s: LaunchSnapshot, b: BackendId): bool = s.backends.get(b).phase == Accepting and not(liveMembers(s, b)) and not(protectedResources(s, b))
  pure def idleFenceBackend(s: LaunchSnapshot, b: BackendId): LaunchSnapshot = { ...s,
    backends: s.backends.set(b, { ...s.backends.get(b), phase: Draining }), seen: s.seen.union(Set("idle_fenced")),
  }
  pure def canRequestDrain(s: LaunchSnapshot, b: BackendId): bool = s.backends.get(b).phase == Accepting
  pure def fenceBackend(s: LaunchSnapshot, b: BackendId): LaunchSnapshot = { ...s,
    backends: s.backends.set(b, { ...s.backends.get(b), phase: Draining }), seen: s.seen.union(Set("drain_started")),
  }
  pure def canConfirmRetirement(s: LaunchSnapshot, b: BackendId): bool = if (s.publication.keys().contains(s.backends.get(b).generation)) all {
    s.backends.get(b).phase == Draining, not(protectedResources(s, b)), s.backends.get(b).model != Loading,
    s.publication.get(s.backends.get(b).generation) == ReceiptOwned({ backend: b, capability: s.backends.get(b).launcher }),
  } else false
  pure def retireBackend(s: LaunchSnapshot, b: BackendId): LaunchSnapshot = { ...s,
    backends: s.backends.set(b, { ...s.backends.get(b), phase: BackendRetired, model: Cold, parentConnected: false }),
    retirement: s.retirement.set(s.backends.get(b).generation, OwnedClosureConfirmed), registry: removeRegistry(s, s.backends.get(b).generation),
    attachments: s.attachments.keys().mapBy(c => if (s.attachments.get(c).generation == s.backends.get(b).generation) { ...s.attachments.get(c), phase: LeaseReleased } else s.attachments.get(c)),
    seen: s.seen.union(Set("retirement_confirmed")),
  }
  pure def canRepeatRelease(s: LaunchSnapshot, c: CallerId): bool = s.callers.get(c).phase == CallerClosed and not(s.seen.contains("release_repeated"))
  pure def observeRepeatRelease(s: LaunchSnapshot, c: CallerId): LaunchSnapshot = { ...s, seen: s.seen.union(Set("release_repeated")) }
  pure def canCloseAttachment(s: LaunchSnapshot, c: CallerId): bool = if (s.resources.keys().contains(attachmentResource(c))) {
    val owner = s.resources.get(attachmentResource(c))
    owner.cleanup == Active and any {
      s.backends.get(owner.backend).phase == Draining,
      s.callers.get(c).phase == CallerClosed,
      s.attachments.get(c).phase != LeaseLive,
      s.round >= s.attachments.get(c).expires,
    }
  } else false
  pure def closeAttachmentOwner(s: LaunchSnapshot, c: CallerId): LaunchSnapshot = {
    val owner = s.resources.get(attachmentResource(c))
    val interrupted = interruptCaller(s, c)
    { ...interrupted,
      claim: if (launcherOwns(s, c)) Free else s.claim,
      callers: if (owner.admitted) s.callers else s.callers.set(c, { ...s.callers.get(c), phase: Refused }),
      attachments: s.attachments.set(c, { ...s.attachments.get(c), phase: LeaseReleased }),
      resources: interrupted.resources.set(attachmentResource(c), { ...owner, cleanup: CleanupPending }),
      seen: s.seen.union(Set("attachment_closing")),
    }
  }
  pure def canFinishAttachmentCleanup(s: LaunchSnapshot, c: CallerId): bool = if (s.resources.keys().contains(attachmentResource(c))) all {
    s.resources.get(attachmentResource(c)).cleanup == CleanupPending,
    s.requests.keys().filter(inv => inv.adapter == c).forall(inv => s.requests.get(inv).cleanup == CleanupConfirmed),
  } else false
  pure def finishAttachmentCleanupState(s: LaunchSnapshot, c: CallerId): LaunchSnapshot = { ...s,
    resources: s.resources.set(attachmentResource(c), { ...s.resources.get(attachmentResource(c)), cleanup: CleanupConfirmed }),
    seen: s.seen.union(Set("attachment_cleaned")),
  }
  pure def retiredResourcesAreClosed(s: LaunchSnapshot): bool = BACKENDS.forall(b =>
    if (s.retirement.keys().contains(s.backends.get(b).generation) and s.backends.get(b).phase == BackendRetired) all {
      s.retirement.get(s.backends.get(b).generation) != RetirementUnverified,
      not(protectedResources(s, b)), s.backends.get(b).model == Cold,
      not(s.registry.keys().contains(s.backends.get(b).generation)),
    } else true)
  pure def attachmentOwnersMatch(s: LaunchSnapshot): bool = s.attachments.keys().forall(c =>
    if (s.resources.keys().contains(attachmentResource(c))) all {
      s.resources.get(attachmentResource(c)).caller == c,
      s.resources.get(attachmentResource(c)).generation == s.attachments.get(c).generation,
      s.backends.get(s.resources.get(attachmentResource(c)).backend).generation == s.attachments.get(c).generation,
    } else false)
}
