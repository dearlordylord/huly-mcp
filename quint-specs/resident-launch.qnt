// Type sketch only: no transition or verification claim until the shape is reviewed.
module resident_launch {
  type CallerId = int
  type GuardianId = int
  type ChildId = int
  type GenerationId = int
  type CapabilityId = int
  type OperationId = int
  type SelectionKey = { authority: int, policy: int, implementation: int }
  type CallerPhase = Selecting | LocalDiscovery | Prepared(GuardianId)
    | StartAttempted(GuardianId) | Attached(GenerationId) | Refused | CallerClosed
  type Caller = {
    selection: SelectionKey,
    phase: CallerPhase,
    killAuthority: Set[GuardianId],
  }
  type GuardianPhase = GuardianPrepared | WorkerStarting | Serving | Recovering
    | GuardianBlocked | GuardianRetired | GuardianLost
  type WorkerHandle = NoWorker | RetainedWorker({ child: ChildId, generation: GenerationId })
    | LostWorker({ child: ChildId, generation: GenerationId })
  type Guardian = {
    launcher: CallerId,
    selection: SelectionKey,
    phase: GuardianPhase,
    worker: WorkerHandle,
    parentConnected: bool,
  }
  type ChildPhase = ChildPrepared | Authorized | Listening | ApplicationReady
    | Accepting | Draining | Blocked | ChildRetired
  type ModelPhase = Cold | Loading | ModelReady
  type Confinement = Unqualified | RestrictedBeforeImports
  type Child = {
    guardian: GuardianId,
    generation: GenerationId,
    selection: SelectionKey,
    phase: ChildPhase,
    model: ModelPhase,
    confinement: Confinement,
    guardianConnected: bool,
  }
  type ClaimOwner = ParentOwner(CallerId) | GuardianOwner(GuardianId)
  type Claim = Free | Held({ owner: ClaimOwner, capability: CapabilityId }) | Unresolved
  type Locator = {
    generation: GenerationId,
    guardian: GuardianId,
    child: ChildId,
    selection: SelectionKey,
  }
  type RegistryEntry = PendingOwner({ guardian: GuardianId, selection: SelectionKey })
    | Current(Locator) | OpaqueIncompatible | UnknownRecord
  type PublicationReceipt = ReceiptAbsent
    | ReceiptOwned({ guardian: GuardianId, capability: CapabilityId }) | ReceiptLost
  type Cleanup = Active | CleanupPending | CleanupFailed | CleanupConfirmed
  type OwnedResource = { child: ChildId, generation: GenerationId, cleanup: Cleanup, admitted: bool }
  type StartMessage = { parent: CallerId, guardian: GuardianId, authenticated: bool }
  type WorkerStartMessage = { guardian: GuardianId, child: ChildId, authenticated: bool }
  type AttachmentPhase = LeaseLive | LeaseExpired | LeaseReleased
  type Attachment = { caller: CallerId, generation: GenerationId, phase: AttachmentPhase, expires: int }
  type RequestPhase = Queued | WaitingForModel | Running | RequestCancelled | Terminal
  type Request = { caller: CallerId, generation: GenerationId, phase: RequestPhase }
  type WriteOutcome = NotDispatched | Reserving(GenerationId) | ReservationAcknowledged(GenerationId)
    | Dispatched(GenerationId) | Uncertain(GenerationId) | Reported(GenerationId) | Reconciled(GenerationId)
  type Write = { caller: CallerId, request: int, outcome: WriteOutcome, dispatches: int }
  type JournalPhase = DurableReservation | DurableTerminal | DurableReconciliation
  type JournalEntry = { generation: GenerationId, phase: JournalPhase }
  type Journal = IntactJournal({ capacity: int, entries: OperationId -> JournalEntry })
    | CorruptJournal | LostJournal

  var callers: CallerId -> Caller
  var guardians: GuardianId -> Guardian
  var children: ChildId -> Child
  var claims: SelectionKey -> Claim
  var registry: GenerationId -> RegistryEntry
  var publication: GenerationId -> PublicationReceipt
  var resources: int -> OwnedResource
  var starts: Set[StartMessage]
  var workerStarts: Set[WorkerStartMessage]
  var attachments: int -> Attachment
  var requests: int -> Request
  var writes: OperationId -> Write
  var journals: GuardianId -> Journal
  var round: int
  var seen: Set[str]
}
