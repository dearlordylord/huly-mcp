// Type sketch only: no transition or verification claim until the shape is reviewed.
module resident_launch {
  type CallerId = int
  type ChildId = int
  type GenerationId = int
  type CapabilityId = int
  type SelectionKey = { authority: int, policy: int, implementation: int }
  type CallerPhase = Selecting | LocalDiscovery | Prepared(ChildId)
    | StartAttempted(ChildId) | Attached(GenerationId) | Refused | CallerClosed
  type Caller = { selection: SelectionKey, phase: CallerPhase, killAuthority: Set[ChildId] }
  type ChildPhase = ChildPrepared | Authorized | Listening | ApplicationReady
    | Accepting | Draining | Blocked | ChildRetired
  type ModelPhase = Cold | Loading | ModelReady
  type Child = {
    parent: CallerId,
    generation: GenerationId,
    selection: SelectionKey,
    phase: ChildPhase,
    model: ModelPhase,
    parentConnected: bool,
  }
  type ClaimOwner = ParentOwner(CallerId) | ChildOwner(ChildId)
  type Claim = Free | Held({ owner: ClaimOwner, capability: CapabilityId }) | Unresolved
  type Locator = {
    generation: GenerationId,
    child: ChildId,
    selection: SelectionKey,
  }
  type RegistryEntry = Current(Locator) | OpaqueIncompatible | UnknownRecord
  type PublicationReceipt = ReceiptAbsent | ReceiptOwned(CapabilityId) | ReceiptLost
  type Cleanup = Active | CleanupPending | CleanupFailed | CleanupConfirmed
  type OwnedResource = { child: ChildId, generation: GenerationId, cleanup: Cleanup, admitted: bool }
  type StartMessage = { parent: CallerId, child: ChildId, authenticated: bool }
  type WriteOutcome = NotDispatched | Dispatched(GenerationId) | Uncertain(GenerationId)
    | Reported(GenerationId) | Reconciled(GenerationId)
  type Write = { caller: CallerId, request: int, outcome: WriteOutcome, dispatches: int }

  var callers: CallerId -> Caller
  var children: ChildId -> Child
  var claim: Claim
  var registry: GenerationId -> RegistryEntry
  var publication: GenerationId -> PublicationReceipt
  var resources: int -> OwnedResource
  var starts: Set[StartMessage]
  var writes: int -> Write
  var round: int
  var seen: Set[str]
}
