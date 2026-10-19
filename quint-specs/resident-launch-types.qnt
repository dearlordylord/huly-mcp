module resident_launch_types {
  type CallerId = int
  type BackendId = int
  type GenerationId = int
  type CapabilityId = int
  type InvocationId = { adapter: CallerId, ordinal: int }
  type WireRequestId = int
  type SelectionKey = { authority: int, policy: int, implementation: int }
  type CallerPhase = Selecting | LocalDiscovery | Prepared(BackendId)
    | StartAttempted(BackendId) | Attached(GenerationId) | Refused | CallerClosed
  type Caller = {
    selection: SelectionKey,
    phase: CallerPhase,
    killAuthority: Set[BackendId],
  }
  type BackendPhase = BackendPrepared | Authorized | Listening | ApplicationReady
    | Accepting | Draining | BackendBlocked | BackendRetired | BackendLost
  type ModelPhase = Cold | Loading | ModelReady
  type Backend = {
    launcher: CallerId,
    generation: GenerationId,
    selection: SelectionKey,
    phase: BackendPhase,
    model: ModelPhase,
    parentConnected: bool,
  }
  type ClaimOwner = LauncherOwner(CallerId)
    | TransferOwner({ parent: CallerId, backend: BackendId }) | BackendOwner(BackendId)
  type Claim = Free | Held({ owner: ClaimOwner, capability: CapabilityId }) | Unresolved
  type Locator = {
    generation: GenerationId,
    backend: BackendId,
    selection: SelectionKey,
  }
  type RegistryEntry = PendingOwner({ backend: BackendId, selection: SelectionKey })
    | Current(Locator) | OpaqueIncompatible | UnknownRecord
  type PublicationReceipt = ReceiptAbsent
    | ReceiptOwned({ backend: BackendId, capability: CapabilityId }) | ReceiptLost
  type RetirementEvidence = RetirementUnverified | OwnedClosureConfirmed | OperatorRetirementVerified
  type Cleanup = Active | CleanupPending | CleanupFailed | CleanupConfirmed
  type OwnedResource = { caller: CallerId, backend: BackendId, generation: GenerationId, cleanup: Cleanup, admitted: bool }
  type StartMessage = { parent: CallerId, backend: BackendId, authenticated: bool, claim: CapabilityId }
  type AttachmentPhase = LeaseLive | LeaseExpired | LeaseReleased
  type Attachment = { caller: CallerId, generation: GenerationId, phase: AttachmentPhase, expires: int }
  type RequestPhase = Queued | WaitingForModel | Running | RequestCancelled | Terminal
  // The map key owns adapter identity; wire IDs may collide across incarnations.
  type Request = { wireId: WireRequestId, generation: GenerationId, phase: RequestPhase, cleanup: Cleanup }
  type WriteOutcome = NotDispatched | DispatchAttempted(GenerationId)
    | Uncertain(GenerationId) | TerminalObserved(GenerationId) | Reconciled(GenerationId)
  type TerminalDelivery = NoTerminal | BackendTerminalProduced | AdapterTerminalReceived
    | AdapterTerminalQueued | HostTerminalObserved
  // Remote effects are oracle facts, independent of what the original caller knows.
  type RemoteEffect = RemoteNotSubmitted | RemotePending | RemoteCommitted | RemoteRejected
  type Write = { outcome: WriteOutcome, dispatches: int, delivery: TerminalDelivery, remote: RemoteEffect }


  type LaunchSnapshot = {
    callers: CallerId -> Caller,
    backends: BackendId -> Backend,
    claim: Claim,
    registry: GenerationId -> RegistryEntry,
    publication: GenerationId -> PublicationReceipt,
    retirement: GenerationId -> RetirementEvidence,
    resources: int -> OwnedResource,
    starts: Set[StartMessage],
    attachments: int -> Attachment,
    requests: InvocationId -> Request,
    writes: InvocationId -> Write,
    round: int,
    seen: Set[str],
  }
}
