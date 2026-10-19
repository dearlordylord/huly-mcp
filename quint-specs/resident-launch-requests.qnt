module resident_launch_requests {
  import resident_launch_types.* from "./resident-launch-types"
  import resident_launch_core.* from "./resident-launch-core"
  pure val INVOCATIONS: Set[InvocationId] = CALLERS.fold(Set(), (acc, c) => acc.union(Set({ adapter: c, ordinal: 0 }, { adapter: c, ordinal: 1 })))
  pure def resourceId(inv: InvocationId): int = inv.adapter * 2 + inv.ordinal
  pure def eligibleAttachment(s: LaunchSnapshot, c: CallerId): bool =
    if (s.attachments.keys().contains(c)) s.attachments.get(c).phase == LeaseLive and s.round < s.attachments.get(c).expires else false
  pure def requestBackend(s: LaunchSnapshot, inv: InvocationId): BackendId = s.resources.get(resourceId(inv)).backend
  pure def healthy(s: LaunchSnapshot, b: BackendId): bool = Set(Accepting, Draining).contains(s.backends.get(b).phase)
  pure def pendingCleanup(s: LaunchSnapshot, inv: InvocationId): LaunchSnapshot = { ...s,
    requests: s.requests.set(inv, { ...s.requests.get(inv), cleanup: CleanupPending }),
    resources: s.resources.set(resourceId(inv), { ...s.resources.get(resourceId(inv)), cleanup: CleanupPending }),
  }
  pure def uncertainWrite(w: Write): Write = match w.outcome {
    | DispatchAttempted(g) => { ...w, outcome: Uncertain(g) }
    | _ => w
  }
  pure def canQueueRead(s: LaunchSnapshot, inv: InvocationId, b: BackendId): bool =
    if (INVOCATIONS.contains(inv) and not(s.requests.keys().contains(inv))) all {
      s.callers.get(inv.adapter).phase == Attached(s.backends.get(b).generation),
      s.backends.get(b).phase == Accepting, eligibleAttachment(s, inv.adapter),
    } else false
  pure def admitRead(s: LaunchSnapshot, inv: InvocationId, b: BackendId): LaunchSnapshot = { ...s,
    requests: s.requests.put(inv, { wireId: 1, generation: s.backends.get(b).generation, phase: Queued, cleanup: Active }),
    resources: s.resources.put(resourceId(inv), { caller: inv.adapter, backend: b, generation: s.backends.get(b).generation, cleanup: Active, admitted: true }),
    seen: s.seen.union(Set("read_queued")),
  }
  pure def canQueueWrite(s: LaunchSnapshot, inv: InvocationId, b: BackendId): bool = canQueueRead(s, inv, b)
  pure def admitWrite(s: LaunchSnapshot, inv: InvocationId, b: BackendId): LaunchSnapshot = { ...admitRead(s, inv, b),
    writes: s.writes.put(inv, { outcome: NotDispatched, dispatches: 0, delivery: NoTerminal, remote: RemoteNotSubmitted }),
    seen: s.seen.union(Set("write_queued")),
  }
  pure def canWaitForModel(s: LaunchSnapshot, inv: InvocationId): bool = if (s.requests.keys().contains(inv)) all {
    s.requests.get(inv).phase == Queued, healthy(s, requestBackend(s, inv)),
    s.backends.get(requestBackend(s, inv)).model != ModelReady,
  } else false
  pure def waitModel(s: LaunchSnapshot, inv: InvocationId): LaunchSnapshot = {
    val b = requestBackend(s, inv)
    { ...s, requests: s.requests.set(inv, { ...s.requests.get(inv), phase: WaitingForModel }),
      backends: s.backends.set(b, { ...s.backends.get(b), model: Loading }), seen: s.seen.union(Set("model_waiting")) }
  }
  pure def canFinishModel(s: LaunchSnapshot, b: BackendId): bool = healthy(s, b) and s.backends.get(b).model == Loading
  pure def completeModel(s: LaunchSnapshot, b: BackendId): LaunchSnapshot = { ...s,
    backends: s.backends.set(b, { ...s.backends.get(b), model: ModelReady }), seen: s.seen.union(Set("model_ready")),
  }
  pure def canStartRequest(s: LaunchSnapshot, inv: InvocationId): bool = if (s.requests.keys().contains(inv)) all {
    Set(Queued, WaitingForModel).contains(s.requests.get(inv).phase), healthy(s, requestBackend(s, inv)),
    s.backends.get(requestBackend(s, inv)).model == ModelReady,
  } else false
  pure def runRequest(s: LaunchSnapshot, inv: InvocationId): LaunchSnapshot = { ...s,
    requests: s.requests.set(inv, { ...s.requests.get(inv), phase: Running }), seen: s.seen.union(Set("request_running")),
  }
  pure def canFinishRead(s: LaunchSnapshot, inv: InvocationId): bool = if (s.requests.keys().contains(inv)) all {
    s.requests.get(inv).phase == Running, not(s.writes.keys().contains(inv)), healthy(s, requestBackend(s, inv)),
  } else false
  pure def completeRead(s: LaunchSnapshot, inv: InvocationId): LaunchSnapshot = { ...pendingCleanup(s, inv),
    requests: s.requests.set(inv, { ...s.requests.get(inv), phase: Terminal, cleanup: CleanupPending }),
    seen: s.seen.union(Set("read_terminal")),
  }
  pure def canCancelRequest(s: LaunchSnapshot, inv: InvocationId): bool = if (s.requests.keys().contains(inv))
    Set(Queued, WaitingForModel, Running).contains(s.requests.get(inv).phase) else false
  pure def cancelRequestState(s: LaunchSnapshot, inv: InvocationId): LaunchSnapshot = { ...pendingCleanup(s, inv),
    requests: s.requests.set(inv, { ...s.requests.get(inv), phase: RequestCancelled, cleanup: CleanupPending }),
    writes: if (s.writes.keys().contains(inv)) s.writes.set(inv, uncertainWrite(s.writes.get(inv))) else s.writes,
    seen: s.seen.union(Set("request_cancelled")),
  }
  pure def canFinishCleanup(s: LaunchSnapshot, inv: InvocationId): bool = if (s.requests.keys().contains(inv))
    Set(Terminal, RequestCancelled).contains(s.requests.get(inv).phase) and s.requests.get(inv).cleanup == CleanupPending else false
  pure def cleanupRequest(s: LaunchSnapshot, inv: InvocationId): LaunchSnapshot = { ...s,
    requests: s.requests.set(inv, { ...s.requests.get(inv), cleanup: CleanupConfirmed }),
    resources: s.resources.set(resourceId(inv), { ...s.resources.get(resourceId(inv)), cleanup: CleanupConfirmed }),
    seen: s.seen.union(Set("cleanup_confirmed")),
  }
  pure def canFailCleanup(s: LaunchSnapshot, inv: InvocationId): bool = canFinishCleanup(s, inv)
  pure def blockRequestCleanup(s: LaunchSnapshot, inv: InvocationId): LaunchSnapshot = { ...s,
    requests: s.requests.set(inv, { ...s.requests.get(inv), cleanup: CleanupFailed }),
    resources: s.resources.set(resourceId(inv), { ...s.resources.get(resourceId(inv)), cleanup: CleanupFailed }),
    seen: s.seen.union(Set("cleanup_blocked")),
  }

  pure def requestResourcesMatch(s: LaunchSnapshot): bool = s.requests.keys().forall(inv =>
    if (s.resources.keys().contains(resourceId(inv))) all {
      s.resources.get(resourceId(inv)).caller == inv.adapter,
      s.resources.get(resourceId(inv)).generation == s.requests.get(inv).generation,
      s.backends.get(requestBackend(s, inv)).generation == s.requests.get(inv).generation,
      s.resources.get(resourceId(inv)).cleanup == s.requests.get(inv).cleanup,
    } else false)
  pure def writeHistoryIsSound(s: LaunchSnapshot): bool = s.writes.keys().forall(inv => {
    val w = s.writes.get(inv)
    all {
      s.requests.keys().contains(inv), w.dispatches >= 0 and w.dispatches <= 1,
      (w.remote == RemoteNotSubmitted) iff (w.dispatches == 0),
      (w.delivery == HostTerminalObserved) iff (w.outcome == TerminalObserved(s.requests.get(inv).generation)),
      Set(BackendTerminalProduced, AdapterTerminalReceived, AdapterTerminalQueued, HostTerminalObserved).contains(w.delivery) implies Set(RemoteCommitted, RemoteRejected).contains(w.remote),
      match w.outcome {
        | NotDispatched => w.dispatches == 0
        | DispatchAttempted(g) => w.dispatches == 1 and g == s.requests.get(inv).generation
        | Uncertain(g) => w.dispatches == 1 and g == s.requests.get(inv).generation
        | TerminalObserved(g) => w.dispatches == 1 and g == s.requests.get(inv).generation
        | Reconciled(g) => w.dispatches == 1 and g == s.requests.get(inv).generation and Set(RemoteCommitted, RemoteRejected).contains(w.remote)
      },
    }
  })
  pure def canDispatchWrite(s: LaunchSnapshot, inv: InvocationId): bool = if (s.writes.keys().contains(inv)) all {
    s.requests.get(inv).phase == Running, healthy(s, requestBackend(s, inv)),
    s.writes.get(inv).outcome == NotDispatched,
  } else false
  pure def submitWrite(s: LaunchSnapshot, inv: InvocationId): LaunchSnapshot = { ...s,
    writes: s.writes.set(inv, { ...s.writes.get(inv), outcome: DispatchAttempted(s.requests.get(inv).generation), dispatches: s.writes.get(inv).dispatches + 1, remote: RemotePending }),
    seen: s.seen.union(Set("write_dispatched")),
  }
  pure def canCommitRemote(s: LaunchSnapshot, inv: InvocationId): bool = if (s.writes.keys().contains(inv)) s.writes.get(inv).remote == RemotePending else false
  pure def commitRemoteEffect(s: LaunchSnapshot, inv: InvocationId): LaunchSnapshot = { ...s,
    writes: s.writes.set(inv, { ...s.writes.get(inv), remote: RemoteCommitted }), seen: s.seen.union(Set("remote_committed")),
  }
  pure def canRejectRemote(s: LaunchSnapshot, inv: InvocationId): bool = canCommitRemote(s, inv)
  pure def rejectRemoteEffect(s: LaunchSnapshot, inv: InvocationId): LaunchSnapshot = { ...s,
    writes: s.writes.set(inv, { ...s.writes.get(inv), remote: RemoteRejected }), seen: s.seen.union(Set("remote_rejected")),
  }
  pure def canProduceTerminal(s: LaunchSnapshot, inv: InvocationId): bool = if (s.writes.keys().contains(inv)) all {
    Set(RemoteCommitted, RemoteRejected).contains(s.writes.get(inv).remote), s.writes.get(inv).delivery == NoTerminal,
    healthy(s, requestBackend(s, inv)),
  } else false
  pure def produceWriteTerminal(s: LaunchSnapshot, inv: InvocationId): LaunchSnapshot = {
    val progress = if (s.requests.get(inv).phase == RequestCancelled) s else {
      ...pendingCleanup(s, inv), requests: s.requests.set(inv, { ...s.requests.get(inv), phase: Terminal, cleanup: CleanupPending }),
    }
    { ...progress, writes: s.writes.set(inv, { ...s.writes.get(inv), delivery: BackendTerminalProduced }), seen: s.seen.union(Set("terminal_produced")) }
  }
  pure def canReceiveTerminal(s: LaunchSnapshot, inv: InvocationId): bool = if (s.writes.keys().contains(inv)) all {
    s.writes.get(inv).delivery == BackendTerminalProduced, s.requests.get(inv).phase == Terminal,
    s.callers.get(inv.adapter).phase == Attached(s.requests.get(inv).generation),
  } else false
  pure def receiveWriteTerminal(s: LaunchSnapshot, inv: InvocationId): LaunchSnapshot = { ...s,
    writes: s.writes.set(inv, { ...s.writes.get(inv), delivery: AdapterTerminalReceived }), seen: s.seen.union(Set("terminal_received")),
  }
  pure def canQueueTerminal(s: LaunchSnapshot, inv: InvocationId): bool = if (s.writes.keys().contains(inv)) all {
    s.writes.get(inv).delivery == AdapterTerminalReceived,
    s.callers.get(inv.adapter).phase == Attached(s.requests.get(inv).generation),
  } else false
  pure def queueWriteTerminal(s: LaunchSnapshot, inv: InvocationId): LaunchSnapshot = { ...s,
    writes: s.writes.set(inv, { ...s.writes.get(inv), delivery: AdapterTerminalQueued }), seen: s.seen.union(Set("terminal_queued")),
  }
  pure def canObserveTerminal(s: LaunchSnapshot, inv: InvocationId): bool = if (s.writes.keys().contains(inv)) s.writes.get(inv).delivery == AdapterTerminalQueued else false
  pure def observeWriteTerminal(s: LaunchSnapshot, inv: InvocationId): LaunchSnapshot = { ...s,
    writes: s.writes.set(inv, { ...s.writes.get(inv), delivery: HostTerminalObserved, outcome: TerminalObserved(s.requests.get(inv).generation) }), seen: s.seen.union(Set("host_observed")),
  }
  pure def canReconcileWrite(s: LaunchSnapshot, inv: InvocationId): bool = if (s.writes.keys().contains(inv))
    (match s.writes.get(inv).outcome { | Uncertain(_) => true | _ => false }) and Set(RemoteCommitted, RemoteRejected).contains(s.writes.get(inv).remote) else false
  pure def reconcileOriginalWrite(s: LaunchSnapshot, inv: InvocationId): LaunchSnapshot = { ...s,
    writes: s.writes.set(inv, { ...s.writes.get(inv), outcome: Reconciled(s.requests.get(inv).generation) }), seen: s.seen.union(Set("write_reconciled")),
  }
}
