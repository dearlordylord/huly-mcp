// Type sketch only: no transition or verification claim until the shape is reviewed.
module resident_launch {
  type CallerId = int
  type BackendId = int
  type GenerationId = int
  type CapabilityId = int
  type InvocationId = { adapter: CallerId, ordinal: int }
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
  type ClaimOwner = LauncherOwner(CallerId) | BackendOwner(BackendId)
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
  type OwnedResource = { backend: BackendId, generation: GenerationId, cleanup: Cleanup, admitted: bool }
  type StartMessage = { parent: CallerId, backend: BackendId, authenticated: bool }
  type AttachmentPhase = LeaseLive | LeaseExpired | LeaseReleased
  type Attachment = { caller: CallerId, generation: GenerationId, phase: AttachmentPhase, expires: int }
  type RequestPhase = Queued | WaitingForModel | Running | RequestCancelled | Terminal
  type Request = { caller: CallerId, generation: GenerationId, phase: RequestPhase }
  type WriteOutcome = NotDispatched | DispatchAttempted(GenerationId)
    | Uncertain(GenerationId) | TerminalObserved(GenerationId) | Reconciled(GenerationId)
  type TerminalDelivery = NoTerminal | BackendTerminalProduced | AdapterTerminalReceived
    | AdapterTerminalQueued | HostTerminalObserved
  type Write = { outcome: WriteOutcome, dispatches: int, delivery: TerminalDelivery }

  var callers: CallerId -> Caller
  var backends: BackendId -> Backend
  var claims: SelectionKey -> Claim
  var registry: GenerationId -> RegistryEntry
  var publication: GenerationId -> PublicationReceipt
  var retirement: GenerationId -> RetirementEvidence
  var resources: int -> OwnedResource
  var starts: Set[StartMessage]
  var attachments: int -> Attachment
  var requests: int -> Request
  // Specification/oracle history only; this map is not persisted by the application.
  var writes: InvocationId -> Write
  var round: int
  var seen: Set[str]
}
