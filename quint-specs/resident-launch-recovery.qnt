module resident_launch_recovery {
  import resident_launch_types.* from "./resident-launch-types"
  import resident_launch_core.* from "./resident-launch-core"
  import resident_launch_requests.* from "./resident-launch-requests"
  import resident_launch_lifetime.* from "./resident-launch-lifetime"
  pure def claimNamesBackend(s: LaunchSnapshot, b: BackendId): bool = match s.claim {
    | Held(h) => match h.owner {
      | BackendOwner(owner) => owner == b
      | TransferOwner(pair) => pair.backend == b
      | LauncherOwner(c) => s.callers.get(c).phase == Prepared(b)
    }
    | _ => false
  }
  pure def interruptBackend(s: LaunchSnapshot, b: BackendId): LaunchSnapshot = s.requests.keys().filter(inv => s.requests.get(inv).generation == s.backends.get(b).generation).fold(s, (acc, inv) => {
    val cancelled = if (canCancelRequest(acc, inv)) cancelRequestState(acc, inv) else acc
    { ...cancelled, writes: if (cancelled.writes.keys().contains(inv)) cancelled.writes.set(inv, uncertainWrite(cancelled.writes.get(inv))) else cancelled.writes }
  })
  pure def canLoseReceipt(s: LaunchSnapshot, b: BackendId): bool = backendOwns(s, b) and s.backends.get(b).phase == Accepting
  pure def loseBackendReceipt(s: LaunchSnapshot, b: BackendId): LaunchSnapshot = { ...s,
    claim: Unresolved, publication: s.publication.set(s.backends.get(b).generation, ReceiptLost),
    backends: s.backends.set(b, { ...s.backends.get(b), phase: BackendBlocked }), seen: s.seen.union(Set("receipt_lost")),
  }
  pure def canCrashBackend(s: LaunchSnapshot, b: BackendId): bool = Set(Authorized, Listening, ApplicationReady, Accepting, Draining, BackendBlocked).contains(s.backends.get(b).phase)
  pure def loseBackend(s: LaunchSnapshot, b: BackendId): LaunchSnapshot = { ...interruptBackend(s, b),
    claim: if (claimNamesBackend(s, b)) Unresolved else s.claim,
    backends: s.backends.set(b, { ...s.backends.get(b), phase: BackendLost, parentConnected: false }), seen: s.seen.union(Set("backend_lost")),
  }
  pure def canDisconnectParent(s: LaunchSnapshot, b: BackendId): bool = s.backends.get(b).parentConnected
  pure def loseParentChannel(s: LaunchSnapshot, b: BackendId): LaunchSnapshot = {
    val early = Set(BackendPrepared, Authorized).contains(s.backends.get(b).phase)
    val lost = if (early) loseBackend(s, b) else s
    val c = s.backends.get(b).launcher
    { ...lost, callers: if (early) s.callers.set(c, { ...s.callers.get(c), phase: CallerClosed, killAuthority: Set() }) else s.callers,
      backends: lost.backends.set(b, { ...lost.backends.get(b), parentConnected: false }), seen: s.seen.union(Set("parent_disconnected")) }
  }
  pure def canRetirePrepared(s: LaunchSnapshot, c: CallerId, b: BackendId): bool = launcherOwns(s, c) and s.callers.get(c).phase == Prepared(b) and s.callers.get(c).killAuthority.contains(b) and s.backends.get(b).phase == BackendPrepared
  pure def confirmPreparedClosure(s: LaunchSnapshot, c: CallerId, b: BackendId): LaunchSnapshot = { ...s,
    claim: Free, callers: s.callers.set(c, { ...s.callers.get(c), phase: Refused, killAuthority: Set() }),
    backends: s.backends.set(b, { ...s.backends.get(b), phase: BackendRetired, parentConnected: false }),
    retirement: s.retirement.set(s.backends.get(b).generation, OwnedClosureConfirmed), registry: removeRegistry(s, s.backends.get(b).generation), seen: s.seen.union(Set("prepared_retired")),
  }
  pure def canVerifyRetirement(s: LaunchSnapshot, b: BackendId): bool = Set(BackendLost, BackendBlocked).contains(s.backends.get(b).phase) and unresolved(s, b)
  pure def operatorVerifiedRetirement(s: LaunchSnapshot, b: BackendId): LaunchSnapshot = {
    val g = s.backends.get(b).generation
    val interrupted = interruptBackend(s, b)
    val otherUnresolved = BACKENDS.exists(other => other != b and Set(BackendLost, BackendBlocked).contains(s.backends.get(other).phase) and unresolved(s, other))
    { ...interrupted, claim: if (s.claim == Unresolved and not(otherUnresolved)) Free else s.claim,
      backends: s.backends.set(b, { ...s.backends.get(b), phase: BackendRetired, model: Cold, parentConnected: false }),
      retirement: s.retirement.set(g, OperatorRetirementVerified), registry: removeRegistry(s, g),
      resources: interrupted.resources.keys().mapBy(id => if (interrupted.resources.get(id).generation == g) { ...interrupted.resources.get(id), cleanup: CleanupConfirmed } else interrupted.resources.get(id)),
      requests: interrupted.requests.keys().mapBy(inv => if (interrupted.requests.get(inv).generation == g) { ...interrupted.requests.get(inv), cleanup: CleanupConfirmed } else interrupted.requests.get(inv)),
      attachments: s.attachments.keys().mapBy(c => if (s.attachments.get(c).generation == g) { ...s.attachments.get(c), phase: LeaseReleased } else s.attachments.get(c)),
      seen: s.seen.union(Set("operator_retired")),
    }
  }
  pure def canRefuseBlocked(s: LaunchSnapshot, c: CallerId): bool = s.callers.get(c).phase == LocalDiscovery and s.claim == Unresolved
  pure def refuseUnresolvedCaller(s: LaunchSnapshot, c: CallerId): LaunchSnapshot = { ...s,
    callers: s.callers.set(c, { ...s.callers.get(c), phase: Refused }), seen: s.seen.union(Set("blocked_refusal")),
  }
  pure def canRefuseMismatch(s: LaunchSnapshot, c: CallerId, b: BackendId): bool = s.callers.get(c).phase == LocalDiscovery and s.backends.get(b).phase == Accepting and s.callers.get(c).selection != s.backends.get(b).selection
  pure def refuseMismatchedCaller(s: LaunchSnapshot, c: CallerId, b: BackendId): LaunchSnapshot = { ...s,
    claim: if (launcherOwns(s, c)) Free else s.claim,
    callers: s.callers.set(c, { ...s.callers.get(c), phase: Refused }), seen: s.seen.union(Set("identity_refused")),
  }
  pure def canRejectStaleCleanup(s: LaunchSnapshot, b: BackendId, other: BackendId): bool = b != other and s.backends.get(b).phase == BackendRetired and s.publication.keys().contains(s.backends.get(b).generation) and s.backends.get(other).phase == Accepting and not(s.seen.contains("stale_cleanup_refused"))
  pure def receiptOwnsTarget(s: LaunchSnapshot, receiptGeneration: GenerationId, targetGeneration: GenerationId): bool =
    if (s.publication.keys().contains(receiptGeneration) and s.registry.keys().contains(targetGeneration)) match s.publication.get(receiptGeneration) {
      | ReceiptOwned(receipt) => match s.registry.get(targetGeneration) {
        | Current(target) => all {
          receiptGeneration == target.generation,
          receipt.backend == target.backend,
          receipt.capability == s.backends.get(target.backend).launcher,
        }
        | _ => false
      }
      | _ => false
    } else false
  pure def observeStaleCleanupRefusal(s: LaunchSnapshot, b: BackendId, other: BackendId): LaunchSnapshot = {
    val mayRemove = receiptOwnsTarget(s, s.backends.get(b).generation, s.backends.get(other).generation)
    { ...s,
      registry: if (mayRemove) removeRegistry(s, s.backends.get(other).generation) else s.registry,
      seen: s.seen.union(Set(if (mayRemove) "stale_cleanup_removed" else "stale_cleanup_refused")),
    }
  }
  pure def canKillCaller(s: LaunchSnapshot, c: CallerId): bool = match s.callers.get(c).phase { | Attached(_) => true | _ => false }
  pure def loseCallerProcess(s: LaunchSnapshot, c: CallerId): LaunchSnapshot = { ...interruptCaller(s, c),
    callers: s.callers.set(c, { ...s.callers.get(c), phase: CallerClosed, killAuthority: Set() }),
    backends: s.backends.keys().mapBy(b => if (s.backends.get(b).launcher == c) { ...s.backends.get(b), parentConnected: false } else s.backends.get(b)),
    seen: s.seen.union(Set("caller_killed")),
  }
  pure def canRefuseUnavailable(s: LaunchSnapshot, c: CallerId, b: BackendId): bool = launcherOwns(s, c) and s.callers.get(c).phase == LocalDiscovery and Set(BackendLost, BackendBlocked).contains(s.backends.get(b).phase) and s.callers.get(c).selection == s.backends.get(b).selection
  pure def refuseUnavailableOwner(s: LaunchSnapshot, c: CallerId, b: BackendId): LaunchSnapshot = { ...s, claim: Free,
    callers: s.callers.set(c, { ...s.callers.get(c), phase: Refused }), seen: s.seen.union(Set("unavailable_refused")),
  }
}
