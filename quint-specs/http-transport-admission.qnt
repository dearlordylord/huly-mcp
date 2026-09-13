// HTTP Transport, Admission & Client Leases.
//
// Covers:
//   - RequestAdmission (src/mcp/request-admission.ts): accepting/active counter, leases, quiesce drain.
//   - RequestClientLifecycle + attachRequestClientLifecycle (src/mcp/request-client-lifecycle.ts):
//     memoized acquisition, close-during-acquisition, SDK server close/onclose composition,
//     once-only cleanup error reporting, AggregateError on double failure.
//   - createHttpClientLeaseResolver (src/runtime/http-client-leases.ts): header class routing
//     (no supported x-huly-* config headers, including unsupported-only headers, -> shared env bundle;
//     complete supported config -> fresh scoped bundle; invalid or mixed config -> failed bundle).
//   - createClientResolver (src/runtime/huly-clients.ts): memoized process acquisition, recoverable-failure
//     eviction, idempotent close with interruption.
//   - createMountedMcpHttpHandler / startHttpTransport (src/mcp/http-transport.ts): loopback Host/Origin
//     guards, bearer auth, in-flight tracking, McpServerCloseTracker, shutdown drain with grace-period timeout.
//
// Replay grain (each action is logged where its transition completes in the code):
//   - a server close is logged when the close wrapper's allSettled results land; it stays Closing only in
//     simulation, while the request's acquisition is still in flight (Server_cleanupSettles is sim-side);
//   - the close tracker logs each tracked close when it settles, with its failure;
//   - a lease close's failure is observed by the close that runs it;
//   - request slots are reused once the previous request, its lifecycle and its tracked close are done.
//
// Does NOT cover: SDK wire protocol and JSON-RPC encoding; the 5s grace period's timing (a timeout is a
// nondeterministic event of the drain); Effect Cause internals (a failure is classified at settle time);
// error-message rendering.
// Identity bounds: one process resolver and one mounted handler per run; a server is attached once.
module http_transport_admission {
  import basicSpells.* from "./spells/basicSpells"

  // ---------------------------------------------------------------- domains

  /// Request slots: one HTTP request / SDK server / request-client lifecycle at a time per slot.
  pure val REQS: Set[int] = 0.to(2)
  /// Admission instances the model creates (one per SDK server built by createMcpServer).
  pure val MAX_ADMISSIONS: int = 6
  /// Admission picks (one past the created instances).
  pure val ADMISSION_PICKS: Set[int] = 0.to(MAX_ADMISSIONS)
  /// Lease picks for release (includes ids never issued).
  pure val LEASE_PICKS: Set[int] = 0.to(3)
  /// Process acquisition picks (includes ids never started).
  pure val ACQUISITION_PICKS: Set[int] = 0.to(3)
  /// Lifecycle slots picked at creation (the lifecycle tests hold at most two live lifecycles).
  pure val LIFECYCLE_PICKS: Set[int] = 0.to(1)
  /// The acquisition id carried by an env bundle served by an injected (non-process) env resolver.
  pure val INJECTED_ENV: int = -1

  // ---------------------------------------------------------------- types

  /// NoHulyHeaders means no supported x-huly-* config headers, including unsupported-only x-huly-* headers.
  type HeaderClass = NoHulyHeaders | ValidHulyHeaders | InvalidHulyHeaders
  /// What a resolved HTTP lease carries. EnvShared/HeaderScoped carry the owning acquisition/request slot.
  type Bundle = EnvShared(int) | HeaderScoped(int) | FailedBundle | DiedBundle
  type LeasePhase = NotStarted | Acquiring | Acquired | AcquireRejected

  type Admission = {
    accepting: bool,
    active: int,
    drainWaiting: bool,
    drainResolved: bool,
    // Ghost: number of leases issued (globally) when quiesce was first called.
    quiescedAtLease: Option[int],
  }
  type Lease = { admission: int, released: bool }
  type AdmissionState = { admissions: int -> Admission, leases: int -> Lease }

  type Lifecycle = {
    exists: bool,
    phase: LeasePhase,
    // The acquired lease's close releases a resource (a no-op close for shared env bundles).
    ownedLease: bool,
    // closed flag and closePromise are always set together by close().
    closed: bool,
    leaseCloses: int,
    leaseCloseFailed: bool,
    // The code confirmed the lease close outcome (the lease close settled).
    leaseCloseConfirmed: bool,
    pendingResolves: int,
    handouts: int,
  }

  type HttpLease = { headers: Option[HeaderClass], bundle: Option[Bundle] }

  type CloseState = NotClosing | Closing | Closed
  type Server = {
    // Created by the mounted handler's factory for a dispatched request.
    created: bool,
    attached: bool,
    // Wrapped by McpServerCloseTracker.
    tracked: bool,
    trackerSettled: bool,
    closeState: CloseState,
    underlyingFails: bool,
    closeFailed: bool,
    aggregateRaised: bool,
    cleanupReports: int,
    oncloseReportPending: bool,
  }
  type CloseStep = { server: Server, lifecycle: Lifecycle }

  type AcqStatus = Pending | Succeeded | FailedRecoverable | FailedFatal | Interrupted
  type Acquisition = { status: AcqStatus, scopeOpen: bool }
  type Resolver = { exists: bool, closed: bool, closeStarted: bool, active: Option[int], tracked: Set[int] }
  type Process = { resolver: Resolver, acquisitions: int -> Acquisition }

  type TokenConfig = NoToken | BlankToken | SecretToken
  type Bearer = NoBearer | MatchingBearer | WrongBearer | MalformedAuthorization
  type FetchOutcome = HostRejected | OriginRejected | Unauthorized | Dispatched
  type ShutdownPhase = Serving | Draining | ShutdownOk | ShutdownFailed | ShutdownTimedOut
  type Handler = {
    exists: bool,
    loopback: bool,
    token: TokenConfig,
    listening: bool,
    shutdown: ShutdownPhase,
    inFlight: Set[int],
    closeFailures: int,
  }
  type HttpRequest = { outcome: Option[FetchOutcome], hostOk: bool, originOk: bool, bearer: Bearer }
  type Http = { handler: Handler, requests: int -> HttpRequest }

  type Seen = {
    requestRefusedWhileQuiescing: bool,
    doubleReleaseIgnored: bool,
    quiesceDrainedImmediately: bool,
    quiesceDrainedAfterRelease: bool,
    resolveRejectedAfterClose: bool,
    acquisitionRejectionRethrown: bool,
    unusedLifecycleClosed: bool,
    closeWonPendingAcquisition: bool,
    serverCloseRepeated: bool,
    transportCloseReportedCleanupError: bool,
    recoverableFailureEvicted: bool,
    fatalFailureServedFromCache: bool,
    resolveDiedAfterClose: bool,
    resolverCloseInterruptedPending: bool,
    resolverCloseRepeated: bool,
    httpBindFailed: bool,
    fetchRejectedDuringShutdown: bool,
  }

  // ---------------------------------------------------------------- initial values

  pure val emptyLifecycle: Lifecycle = {
    exists: false, phase: NotStarted, ownedLease: false, closed: false, leaseCloses: 0, leaseCloseFailed: false,
    leaseCloseConfirmed: false, pendingResolves: 0, handouts: 0,
  }
  pure val emptyLease: HttpLease = { headers: None, bundle: None }
  pure val emptyServer: Server = {
    created: false, attached: false, tracked: false, trackerSettled: false, closeState: NotClosing,
    underlyingFails: false, closeFailed: false, aggregateRaised: false, cleanupReports: 0, oncloseReportPending: false,
  }
  pure val emptyRequest: HttpRequest = { outcome: None, hostOk: true, originOk: true, bearer: NoBearer }
  pure val noHandler: Handler = {
    exists: false, loopback: true, token: NoToken, listening: false, shutdown: Serving, inFlight: Set(),
    closeFailures: 0,
  }
  pure val noResolver: Resolver = { exists: false, closed: false, closeStarted: false, active: None, tracked: Set() }
  pure val initialSeen: Seen = {
    requestRefusedWhileQuiescing: false, doubleReleaseIgnored: false, quiesceDrainedImmediately: false,
    quiesceDrainedAfterRelease: false, resolveRejectedAfterClose: false, acquisitionRejectionRethrown: false,
    unusedLifecycleClosed: false, closeWonPendingAcquisition: false, serverCloseRepeated: false,
    transportCloseReportedCleanupError: false, recoverableFailureEvicted: false, fatalFailureServedFromCache: false,
    resolveDiedAfterClose: false, resolverCloseInterruptedPending: false, resolverCloseRepeated: false,
    httpBindFailed: false, fetchRejectedDuringShutdown: false,
  }

  // ---------------------------------------------------------------- pure logic: bundles

  pure def isEnvShared(b: Bundle): bool = match b {
    | EnvShared(_) => true
    | _ => false
  }
  pure def isHeaderScoped(b: Bundle): bool = match b {
    | HeaderScoped(_) => true
    | _ => false
  }
  pure def bundleSucceeded(b: Bundle): bool = match b {
    | EnvShared(_) => true
    | HeaderScoped(_) => true
    | _ => false
  }
  pure def leaseHas(l: HttpLease, f: (Bundle) => bool): bool = match l.bundle {
    | Some(b) => f(b)
    | None => false
  }
  pure def envAcquisitionOf(l: HttpLease): Option[int] = match l.bundle {
    | Some(b) => match b {
        | EnvShared(a) => Some(a)
        | _ => None
      }
    | None => None
  }
  pure def headerOwnerIsNot(b: Bundle, rid: int): bool = match b {
    | HeaderScoped(owner) => owner != rid
    | _ => false
  }

  // ---------------------------------------------------------------- pure logic: admission

  pure def enterAdmission(s: AdmissionState, a: int): AdmissionState = {
    val adm = s.admissions.get(a)
    if (not(adm.accepting)) s
    else {
      admissions: s.admissions.set(a, { ...adm, active: adm.active + 1 }),
      leases: s.leases.put(s.leases.keys().size(), { admission: a, released: false }),
    }
  }

  pure def releaseLease(s: AdmissionState, l: int): AdmissionState = {
    val lease = s.leases.get(l)
    val adm = s.admissions.get(lease.admission)
    val active = adm.active - 1
    val drains = active == 0
    if (lease.released) s
    else {
      admissions: s.admissions.set(lease.admission, {
        ...adm,
        active: active,
        drainResolved: adm.drainResolved or (drains and adm.drainWaiting),
        drainWaiting: adm.drainWaiting and not(drains),
      }),
      leases: s.leases.set(l, { ...lease, released: true }),
    }
  }

  pure def quiesceAdmission(s: AdmissionState, a: int): AdmissionState = {
    val adm = s.admissions.get(a)
    val idle = adm.active == 0
    {
      ...s,
      admissions: s.admissions.set(a, {
        ...adm,
        accepting: false,
        drainResolved: adm.drainResolved or idle,
        drainWaiting: adm.drainWaiting or not(idle),
        quiescedAtLease: if (adm.quiescedAtLease == None) Some(s.leases.keys().size()) else adm.quiescedAtLease,
      }),
    }
  }

  /// The owner admission's active count after releasing `l` (0 for an unissued lease id).
  pure def activeAfterRelease(s: AdmissionState, l: int): int =
    if (s.leases.has(l)) releaseLease(s, l).admissions.get(s.leases.get(l).admission).active else 0

  // ---------------------------------------------------------------- pure logic: request lifecycle

  pure def resolveLifecycle(l: Lifecycle): Lifecycle =
    if (l.closed) l
    else match l.phase {
      | NotStarted => { ...l, phase: Acquiring, pendingResolves: l.pendingResolves + 1 }
      | Acquiring => { ...l, pendingResolves: l.pendingResolves + 1 }
      | Acquired => { ...l, handouts: l.handouts + 1 }
      | AcquireRejected => l
    }

  pure def ownedAcquired(l: Lifecycle): bool = l.phase == Acquired and l.ownedLease

  /// close(): memoized; releases the lease now when already acquired, later (at settle) when pending.
  pure def closeLifecycle(l: Lifecycle, leaseCloseFails: bool): Lifecycle = {
    val releaseNow = ownedAcquired(l)
    if (l.closed) l
    else {
      ...l,
      closed: true,
      leaseCloses: if (releaseNow) l.leaseCloses + 1 else l.leaseCloses,
      leaseCloseFailed: l.leaseCloseFailed or (releaseNow and leaseCloseFails),
    }
  }

  /// The acquire() promise settles: pending resolves get the bundle, or throw when closed meanwhile.
  pure def settleLifecycle(l: Lifecycle, rejected: bool, owned: bool, leaseCloseFails: bool): Lifecycle = {
    val releaseNow = l.closed and not(rejected) and owned
    {
      ...l,
      phase: if (rejected) AcquireRejected else Acquired,
      ownedLease: not(rejected) and owned,
      leaseCloses: if (releaseNow) l.leaseCloses + 1 else l.leaseCloses,
      leaseCloseFailed: l.leaseCloseFailed or (releaseNow and leaseCloseFails),
      handouts: if (not(l.closed) and not(rejected)) l.handouts + l.pendingResolves else l.handouts,
      pendingResolves: 0,
    }
  }

  pure def lifecycleCloseSettled(l: Lifecycle): bool = l.closed and l.phase != Acquiring

  // ---------------------------------------------------------------- pure logic: server close composition

  /// allSettled results land: finish a pending close, report a lease-close failure once, raise AggregateError.
  pure def settleServer(s: Server, l: Lifecycle): Server = {
    val failedLease = s.attached and l.leaseCloseFailed
    val finishing = s.closeState == Closing
    val report = failedLease and s.cleanupReports == 0
    {
      ...s,
      closeState: if (finishing) Closed else s.closeState,
      closeFailed: if (finishing) s.underlyingFails or failedLease else s.closeFailed,
      aggregateRaised: s.aggregateRaised or (finishing and s.underlyingFails and failedLease),
      cleanupReports: if (report) s.cleanupReports + 1 else s.cleanupReports,
      oncloseReportPending: false,
    }
  }

  /// The onclose catch path (not the close wrapper) delivers the cleanup error.
  pure def oncloseReports(s: Server, l: Lifecycle): bool =
    s.oncloseReportPending and s.closeState != Closing and s.attached and l.leaseCloseFailed and s.cleanupReports == 0

  pure def beginServerClose(s: Server, l: Lifecycle, underlyingFails: bool, leaseCloseFails: bool): CloseStep = {
    val closing = { ...s, closeState: Closing, underlyingFails: underlyingFails }
    val lifecycle = closeLifecycle(l, leaseCloseFails)
    if (lifecycleCloseSettled(lifecycle))
      { server: settleServer(closing, lifecycle), lifecycle: lifecycle }
    else
      { server: closing, lifecycle: lifecycle }
  }

  // ---------------------------------------------------------------- pure logic: http lease routing

  pure def envReady(p: Process): bool =
    not(p.resolver.exists) or p.resolver.closed or (match p.resolver.active {
      | Some(a) => p.acquisitions.get(a).status != Pending
      | None => false
    })

  /// The env bundle a request with no supported x-huly-* config headers receives: from the process resolver when
  /// it exists, otherwise from the injected env resolver, whose success is the observed `succeeded`.
  pure def envBundle(p: Process, succeeded: bool): Bundle =
    if (not(p.resolver.exists)) (if (succeeded) EnvShared(INJECTED_ENV) else FailedBundle)
    else if (p.resolver.closed) DiedBundle
    else match p.resolver.active {
      | Some(a) => if (p.acquisitions.get(a).status == Succeeded) EnvShared(a) else FailedBundle
      | None => DiedBundle
    }

  pure def leaseBundle(rid: int, headers: HeaderClass, buildOk: bool, succeeded: bool, p: Process): Bundle =
    match headers {
      | NoHulyHeaders => envBundle(p, succeeded)
      | InvalidHulyHeaders => FailedBundle
      | ValidHulyHeaders => if (buildOk) HeaderScoped(rid) else FailedBundle
    }

  // ---------------------------------------------------------------- pure logic: process resolver

  pure def closeAcquisition(a: Acquisition): Acquisition =
    if (a.status == Pending) { ...a, status: Interrupted } else { ...a, scopeOpen: false }

  pure def resolveProcess(p: Process): Process = {
    val n = p.acquisitions.keys().size()
    if (p.resolver.closed or p.resolver.active != None) p
    else {
      resolver: { ...p.resolver, active: Some(n), tracked: p.resolver.tracked.union(Set(n)) },
      acquisitions: p.acquisitions.put(n, { status: Pending, scopeOpen: false }),
    }
  }

  pure def evicts(p: Process, acq: int, outcome: AcqStatus): bool =
    outcome == FailedRecoverable and p.resolver.active == Some(acq)

  pure def settleAcquisition(p: Process, acq: int, outcome: AcqStatus): Process = {
    val evict = evicts(p, acq, outcome)
    {
      resolver: if (evict) { ...p.resolver, active: None, tracked: p.resolver.tracked.exclude(Set(acq)) }
                else p.resolver,
      acquisitions: p.acquisitions.set(acq, { ...p.acquisitions.get(acq), status: outcome,
        // A close already requested releases a late success.
        scopeOpen: outcome == Succeeded and p.acquisitions.get(acq).status == Pending }),
    }
  }

  pure def closeProcess(p: Process): Process =
    if (p.resolver.closeStarted) { ...p, resolver: { ...p.resolver, closed: true } }
    else {
      resolver: { ...p.resolver, closed: true, closeStarted: true, active: None, tracked: Set() },
      acquisitions: p.acquisitions.keys().mapBy(k =>
        if (p.resolver.tracked.contains(k)) closeAcquisition(p.acquisitions.get(k)) else p.acquisitions.get(k)),
    }

  pure def activeStatusIs(p: Process, s: AcqStatus): bool = match p.resolver.active {
    | Some(a) => p.acquisitions.get(a).status == s
    | None => false
  }

  // ---------------------------------------------------------------- pure logic: http handler

  pure def fetchOutcome(h: Handler, hostOk: bool, originOk: bool, bearer: Bearer): FetchOutcome =
    if (h.loopback and not(hostOk)) HostRejected
    else if (h.loopback and not(originOk)) OriginRejected
    else if (h.token == SecretToken and bearer != MatchingBearer) Unauthorized
    else Dispatched

  pure def trackedServerClosesSettled(ss: int -> Server): bool =
    ss.keys().forall(r => not(ss.get(r).tracked) or ss.get(r).trackerSettled)

  pure def shutdownDrainComplete(h: Handler, ss: int -> Server): bool =
    h.inFlight.size() == 0 and trackedServerClosesSettled(ss)

  // ---------------------------------------------------------------- state

  var admission: AdmissionState
  var lifecycles: int -> Lifecycle
  var httpLeases: int -> HttpLease
  var servers: int -> Server
  var process: Process
  var http: Http
  var seen: Seen

  action init = all {
    admission' = { admissions: Map(), leases: Map() },
    lifecycles' = REQS.mapBy(_ => emptyLifecycle),
    httpLeases' = REQS.mapBy(_ => emptyLease),
    servers' = REQS.mapBy(_ => emptyServer),
    process' = { resolver: noResolver, acquisitions: Map() },
    http' = { handler: noHandler, requests: REQS.mapBy(_ => emptyRequest) },
    seen' = initialSeen,
  }

  // ---------------------------------------------------------------- admission actions

  /// `createRequestAdmission()` (request-admission.ts:10) — a fresh `{accepting: true, active: 0}` instance.
  action createRequestAdmission = all {
    admission.admissions.keys().size() < MAX_ADMISSIONS,
    admission' = { ...admission, admissions: admission.admissions.put(admission.admissions.keys().size(), {
      accepting: true, active: 0, drainWaiting: false, drainResolved: false, quiescedAtLease: None,
    }) },
    lifecycles' = lifecycles, httpLeases' = httpLeases, servers' = servers, process' = process, http' = http, seen' = seen,
  }

  /// `RequestAdmission.enter()` (request-admission.ts:20) — null when not accepting, else active++ and a lease.
  /// Conformance: `admitted` is whether a lease was returned.
  action RequestAdmission_enter(adm: int, admitted: bool): bool = all {
    admission.admissions.has(adm),
    admitted == admission.admissions.get(adm).accepting,
    admission' = enterAdmission(admission, adm),
    lifecycles' = lifecycles, httpLeases' = httpLeases, servers' = servers, process' = process, http' = http,
    seen' = { ...seen, requestRefusedWhileQuiescing: seen.requestRefusedWhileQuiescing or not(admitted) },
  }

  /// `RequestLease.release()` (request-admission.ts:26) — idempotent; resolves drain waiters at active 0.
  /// Conformance: `active` is the owner admission's active count after the call.
  action RequestLease_release(lease: int, active: int): bool = all {
    admission.leases.has(lease),
    active == activeAfterRelease(admission, lease),
    val owner = admission.leases.get(lease).admission
    val after = releaseLease(admission, lease)
    all {
      admission' = after,
      lifecycles' = lifecycles, httpLeases' = httpLeases, servers' = servers, process' = process, http' = http,
      seen' = { ...seen,
        doubleReleaseIgnored: seen.doubleReleaseIgnored or admission.leases.get(lease).released,
        quiesceDrainedAfterRelease: seen.quiesceDrainedAfterRelease or
          (not(admission.admissions.get(owner).drainResolved) and after.admissions.get(owner).drainResolved),
      },
    },
  }

  /// `RequestAdmission.quiesce()` (request-admission.ts:34) — stop accepting; resolve now if idle.
  /// Conformance: `drained` is whether the returned promise was already resolved (active was 0).
  action RequestAdmission_quiesce(adm: int, drained: bool): bool = all {
    admission.admissions.has(adm),
    drained == (admission.admissions.get(adm).active == 0),
    admission' = quiesceAdmission(admission, adm),
    lifecycles' = lifecycles, httpLeases' = httpLeases, servers' = servers, process' = process, http' = http,
    seen' = { ...seen, quiesceDrainedImmediately: seen.quiesceDrainedImmediately or drained },
  }

  // ---------------------------------------------------------------- request lifecycle actions

  /// `createRequestClientLifecycle(acquire)` (request-client-lifecycle.ts:21). Reuses a slot whose previous
  /// lifecycle is closed and whose server close is not pending.
  action createRequestClientLifecycle(rid: int): bool = all {
    not(lifecycles.get(rid).exists) or (lifecycles.get(rid).closed and servers.get(rid).closeState != Closing),
    val reuse = lifecycles.get(rid).exists
    all {
      lifecycles' = lifecycles.set(rid, { ...emptyLifecycle, exists: true }),
      servers' = if (reuse) servers.set(rid, emptyServer) else servers,
      admission' = admission, httpLeases' = httpLeases, process' = process, http' = http, seen' = seen,
    },
  }

  /// `RequestClientLifecycle.resolve()` (request-client-lifecycle.ts:28) — throws when closed; memoized acquire.
  /// Conformance: `closed` is whether the call threw because the lifecycle was already closed.
  action RequestClientLifecycle_resolve(rid: int, closed: bool): bool = all {
    lifecycles.get(rid).exists,
    closed == lifecycles.get(rid).closed,
    val l = lifecycles.get(rid)
    all {
      lifecycles' = lifecycles.set(rid, resolveLifecycle(l)),
      admission' = admission, httpLeases' = httpLeases, servers' = servers, process' = process, http' = http,
      seen' = { ...seen,
        resolveRejectedAfterClose: seen.resolveRejectedAfterClose or l.closed,
        acquisitionRejectionRethrown: seen.acquisitionRejectionRethrown or (not(l.closed) and l.phase == AcquireRejected),
      },
    },
  }

  /// The memoized acquire() promise settles (request-client-lifecycle.ts:31): rejected, or a lease whose close
  /// releases a resource (`ownedLease`); a lifecycle closed meanwhile releases it now.
  action RequestClientLifecycle_acquireSettles(rid: int, rejected: bool, ownedLease: bool, leaseCloseFails: bool): bool = all {
    lifecycles.get(rid).exists,
    lifecycles.get(rid).phase == Acquiring,
    val l = lifecycles.get(rid)
    all {
      lifecycles' = lifecycles.set(rid, settleLifecycle(l, rejected, ownedLease, leaseCloseFails)),
      admission' = admission, httpLeases' = httpLeases, servers' = servers, process' = process, http' = http,
      seen' = { ...seen, closeWonPendingAcquisition: seen.closeWonPendingAcquisition or (l.closed and not(rejected) and ownedLease) },
    },
  }

  /// `RequestClientLifecycle.close()` (request-client-lifecycle.ts:39) — idempotent; no-op when never resolved.
  /// Conformance: `firstClose` is whether this call created the close promise.
  action RequestClientLifecycle_close(rid: int, firstClose: bool, leaseCloseFails: bool): bool = all {
    lifecycles.get(rid).exists,
    firstClose == not(lifecycles.get(rid).closed),
    val l = lifecycles.get(rid)
    all {
      lifecycles' = lifecycles.set(rid, closeLifecycle(l, leaseCloseFails)),
      admission' = admission, httpLeases' = httpLeases, servers' = servers, process' = process, http' = http,
      seen' = { ...seen, unusedLifecycleClosed: seen.unusedLifecycleClosed or (firstClose and l.phase == NotStarted) },
    },
  }

  /// `attachRequestClientLifecycle(server, lifecycle, onCleanupError)` (request-client-lifecycle.ts:64).
  /// Identity bound: each server is attached once (server.ts:298 and every test).
  action attachRequestClientLifecycle(rid: int): bool = all {
    lifecycles.get(rid).exists,
    not(servers.get(rid).attached),
    // The lifecycle is attached while the server is built (server.ts:298), before any close can start.
    servers.get(rid).closeState == NotClosing,
    servers' = servers.set(rid, { ...servers.get(rid), attached: true }),
    admission' = admission, lifecycles' = lifecycles, httpLeases' = httpLeases, process' = process, http' = http, seen' = seen,
  }

  /// A released lease's close settles (request-client-lifecycle.ts:46-56) and confirms the outcome the closing
  /// action observed.
  action RequestClientLifecycle_leaseCloseSettles(rid: int, failed: bool): bool = all {
    lifecycles.get(rid).closed,
    lifecycles.get(rid).phase == Acquired,
    not(lifecycles.get(rid).leaseCloseConfirmed),
    failed == lifecycles.get(rid).leaseCloseFailed,
    lifecycles' = lifecycles.set(rid, { ...lifecycles.get(rid), leaseCloseConfirmed: true }),
    admission' = admission, httpLeases' = httpLeases, servers' = servers, process' = process, http' = http, seen' = seen,
  }

  /// A wrapped `server.close()` call (request-client-lifecycle.ts:84): the first call starts the close, a repeat
  /// returns the memoized close.
  action Server_closeStarts(rid: int): bool = all {
    servers.get(rid).attached,
    servers.get(rid).closeState != Closed,
    val repeated = servers.get(rid).closeState == Closing
    all {
      servers' = servers.set(rid, { ...servers.get(rid), closeState: Closing }),
      admission' = admission, lifecycles' = lifecycles, httpLeases' = httpLeases, process' = process, http' = http,
      seen' = { ...seen, serverCloseRepeated: seen.serverCloseRepeated or repeated },
    },
  }

  /// Wrapped `server.close()` completes (request-client-lifecycle.ts:92-107): SDK close then lifecycle close;
  /// `underlyingFails` / `leaseCloseFails` are the two allSettled results.
  /// Conformance: `leaseCloseFails` equals the lifecycle's lease-close outcome.
  action Server_close(rid: int, underlyingFails: bool, leaseCloseFails: bool): bool = all {
    servers.get(rid).attached,
    servers.get(rid).closeState != Closed,
    val closeStep = beginServerClose(servers.get(rid), lifecycles.get(rid), underlyingFails, leaseCloseFails)
    all {
      leaseCloseFails == closeStep.lifecycle.leaseCloseFailed,
      servers' = servers.set(rid, closeStep.server),
      lifecycles' = lifecycles.set(rid, closeStep.lifecycle),
      admission' = admission, httpLeases' = httpLeases, process' = process, http' = http, seen' = seen,
    },
  }

  /// Wrapped `server.onclose` (request-client-lifecycle.ts:77): transport-triggered lifecycle close, error reported via catch.
  action Server_onclose(rid: int, leaseCloseFails: bool): bool = all {
    servers.get(rid).attached,
    // onclose closes the lifecycle only while no wrapped close is in progress.
    servers.get(rid).closeState != Closing,
    val s = servers.get(rid)
    val wrapperInProgress = s.closeState == Closing
    val pending = { ...s, oncloseReportPending: true }
    val lifecycle = closeLifecycle(lifecycles.get(rid), leaseCloseFails)
    val settledNow = lifecycleCloseSettled(lifecycle)
    all {
      servers' = if (wrapperInProgress) servers
                 else servers.set(rid, if (settledNow) settleServer(pending, lifecycle) else pending),
      lifecycles' = if (wrapperInProgress) lifecycles else lifecycles.set(rid, lifecycle),
      admission' = admission, httpLeases' = httpLeases, process' = process, http' = http,
      seen' = { ...seen, transportCloseReportedCleanupError: seen.transportCloseReportedCleanupError or
        (not(wrapperInProgress) and settledNow and oncloseReports(pending, lifecycle)) },
    },
  }

  /// A pending server close (or onclose catch) settles after the request's acquisition settled. Sim-side:
  /// the code logs the completed close as Server_close.
  action Server_cleanupSettles(rid: int): bool = all {
    servers.get(rid).attached,
    servers.get(rid).closeState == Closing or servers.get(rid).oncloseReportPending,
    lifecycleCloseSettled(lifecycles.get(rid)),
    val s = servers.get(rid)
    val l = lifecycles.get(rid)
    all {
      servers' = servers.set(rid, settleServer(s, l)),
      admission' = admission, lifecycles' = lifecycles, httpLeases' = httpLeases, process' = process, http' = http,
      seen' = { ...seen, transportCloseReportedCleanupError: seen.transportCloseReportedCleanupError or oncloseReports(s, l) },
    },
  }

  /// `McpServerCloseTracker` records a tracked server close settling (http-transport.ts:165-171). An unattached
  /// SDK server's close completes here; an attached server's wrapper close already completed with `closeFailed`.
  action McpServerCloseTracker_closeSettles(rid: int, failed: bool): bool = all {
    servers.get(rid).tracked,
    not(servers.get(rid).trackerSettled),
    not(servers.get(rid).attached) or servers.get(rid).closeState == Closed,
    servers.get(rid).attached implies failed == servers.get(rid).closeFailed,
    val s = servers.get(rid)
    all {
      servers' = servers.set(rid, if (s.attached) { ...s, trackerSettled: true }
                                  else { ...s, trackerSettled: true, closeState: Closed, underlyingFails: failed, closeFailed: failed }),
      http' = if (failed) { ...http, handler: { ...http.handler, closeFailures: http.handler.closeFailures + 1 } } else http,
      admission' = admission, lifecycles' = lifecycles, httpLeases' = httpLeases, process' = process, seen' = seen,
    },
  }

  // ---------------------------------------------------------------- lease routing

  /// `createHttpClientLeaseResolver(layer, resolveEnvClients)(request)` (http-client-leases.ts:10) resolving a lease
  /// for request slot `rid`: no supported config headers (including unsupported-only headers) use the env-shared
  /// bundle; valid supported config uses a scoped bundle; invalid or mixed config returns a failed bundle.
  /// Conformance: `succeeded` is whether the lease's bundle Exit is a success.
  action createHttpClientLeaseResolver(rid: int, headers: HeaderClass, buildOk: bool, succeeded: bool): bool = all {
    // No supported config headers use the process resolver, so wait for its acquisition to be ready.
    headers != NoHulyHeaders or envReady(process),
    succeeded == bundleSucceeded(leaseBundle(rid, headers, buildOk, succeeded, process)),
    httpLeases' = httpLeases.set(rid, { headers: Some(headers), bundle: Some(leaseBundle(rid, headers, buildOk, succeeded, process)) }),
    admission' = admission, lifecycles' = lifecycles, servers' = servers, process' = process, http' = http, seen' = seen,
  }

  // ---------------------------------------------------------------- process resolver

  /// `createClientResolver(layer)` (huly-clients.ts:117). One resolver identity per run.
  action createClientResolver = all {
    not(process.resolver.exists),
    process' = { ...process, resolver: { ...noResolver, exists: true } },
    admission' = admission, lifecycles' = lifecycles, httpLeases' = httpLeases, servers' = servers, http' = http, seen' = seen,
  }

  /// A process acquisition's `buildScopedClientBundle` fiber completes uninterrupted (huly-clients.ts:132-137).
  /// Conformance: `evicted` is whether the resolver cleared its active acquisition.
  action buildScopedClientBundle(acq: int, outcome: AcqStatus, evicted: bool): bool = all {
    process.acquisitions.has(acq),
    // A fiber that finished before a close interrupt still delivers its real exit.
    Set(Pending, Interrupted).contains(process.acquisitions.get(acq).status),
    Set(Succeeded, FailedRecoverable, FailedFatal).contains(outcome),
    evicted == evicts(process, acq, outcome),
    process' = settleAcquisition(process, acq, outcome),
    admission' = admission, lifecycles' = lifecycles, httpLeases' = httpLeases, servers' = servers, http' = http,
    seen' = { ...seen, recoverableFailureEvicted: seen.recoverableFailureEvicted or evicted },
  }

  /// `resolver.resolve()` (huly-clients.ts:121) — dies when closed; starts or reuses the memoized acquisition.
  /// Conformance: `startedAcquisition` is whether this call started a new acquisition.
  action ClientResolver_resolve(startedAcquisition: bool): bool = all {
    process.resolver.exists,
    startedAcquisition == (not(process.resolver.closed) and process.resolver.active == None),
    process' = resolveProcess(process),
    admission' = admission, lifecycles' = lifecycles, httpLeases' = httpLeases, servers' = servers, http' = http,
    seen' = { ...seen,
      resolveDiedAfterClose: seen.resolveDiedAfterClose or process.resolver.closed,
      fatalFailureServedFromCache: seen.fatalFailureServedFromCache or
        (not(process.resolver.closed) and activeStatusIs(process, FailedFatal)),
    },
  }

  /// `resolver.close()` (huly-clients.ts:154) — idempotent via closePromise; closes every tracked acquisition.
  /// Conformance: `firstClose` is whether this call created the close promise.
  action ClientResolver_close(firstClose: bool): bool = all {
    process.resolver.exists,
    firstClose == not(process.resolver.closeStarted),
    process' = closeProcess(process),
    admission' = admission, lifecycles' = lifecycles, httpLeases' = httpLeases, servers' = servers, http' = http,
    seen' = { ...seen,
      resolverCloseRepeated: seen.resolverCloseRepeated or not(firstClose),
      resolverCloseInterruptedPending: seen.resolverCloseInterruptedPending or
        (firstClose and process.resolver.tracked.exists(a => process.acquisitions.get(a).status == Pending)),
    },
  }

  // ---------------------------------------------------------------- http handler

  /// `createMountedMcpHttpHandler(createServer, authToken, writeError, host)` (http-transport.ts:184); also
  /// reached from startHttpTransport.
  action createMountedMcpHttpHandler(loopback: bool, token: TokenConfig): bool = all {
    not(http.handler.exists),
    http' = { ...http, handler: { ...noHandler, exists: true, loopback: loopback, token: token } },
    admission' = admission, lifecycles' = lifecycles, httpLeases' = httpLeases, servers' = servers, process' = process, seen' = seen,
  }

  /// `startHttpTransport` binds its listener (http-transport.ts:261); a bind failure then runs the scope
  /// finalizer's mounted.close.
  action startHttpTransport(bindOk: bool): bool = all {
    http.handler.exists,
    not(http.handler.listening),
    http.handler.shutdown == Serving,
    http' = { ...http, handler: { ...http.handler, listening: bindOk } },
    admission' = admission, lifecycles' = lifecycles, httpLeases' = httpLeases, servers' = servers, process' = process,
    seen' = { ...seen, httpBindFailed: seen.httpBindFailed or not(bindOk) },
  }

  /// `mounted.fetch(request)` (http-transport.ts:200) — loopback Host/Origin checks, bearer auth, dispatch to a
  /// factory-created, close-tracked SDK server in a free request slot.
  /// Conformance: `dispatched` is whether the request reached the MCP handler.
  action createMountedMcpHttpHandler_fetch(rid: int, hostOk: bool, originOk: bool, bearer: Bearer, dispatched: bool): bool = all {
    http.handler.exists,
    not(http.handler.inFlight.contains(rid)),
    not(servers.get(rid).created) or servers.get(rid).trackerSettled,
    servers.get(rid).closeState != Closing,
    not(lifecycles.get(rid).exists) or lifecycles.get(rid).closed,
    dispatched == (fetchOutcome(http.handler, hostOk, originOk, bearer) == Dispatched),
    dispatched implies http.handler.shutdown == Serving,
    val outcome = fetchOutcome(http.handler, hostOk, originOk, bearer)
    all {
      http' = {
        handler: if (dispatched) { ...http.handler, inFlight: http.handler.inFlight.union(Set(rid)) } else http.handler,
        requests: http.requests.set(rid, { outcome: Some(outcome), hostOk: hostOk, originOk: originOk, bearer: bearer }),
      },
      servers' = if (dispatched) servers.set(rid, { ...emptyServer, created: true, tracked: true }) else servers,
      lifecycles' = if (dispatched) lifecycles.set(rid, emptyLifecycle) else lifecycles,
      httpLeases' = if (dispatched) httpLeases.set(rid, emptyLease) else httpLeases,
      admission' = admission, process' = process, seen' = seen,
    },
  }

  /// The dispatched SDK response settles (http-transport.ts:212-215): activeRequests.delete.
  action createMountedMcpHttpHandler_fetchSettles(rid: int): bool = all {
    http.handler.inFlight.contains(rid),
    http' = { ...http, handler: { ...http.handler, inFlight: http.handler.inFlight.exclude(Set(rid)) } },
    admission' = admission, lifecycles' = lifecycles, httpLeases' = httpLeases, servers' = servers, process' = process, seen' = seen,
  }

  /// A guarded request is rejected with 503 once mounted-handler shutdown has started.
  action createMountedMcpHttpHandler_fetchRejectedDuringShutdown = all {
    http.handler.exists,
    http.handler.shutdown != Serving,
    http' = http,
    admission' = admission, lifecycles' = lifecycles, httpLeases' = httpLeases, servers' = servers, process' = process,
    seen' = { ...seen, fetchRejectedDuringShutdown: true },
  }

  /// `mounted.close` starts (http-transport.ts:218): the SDK handler closes its servers, each close logged as it
  /// completes.
  action createMountedMcpHttpHandler_close = all {
    http.handler.exists,
    http.handler.shutdown == Serving,
    http' = { ...http, handler: { ...http.handler, shutdown: Draining } },
    admission' = admission, lifecycles' = lifecycles, httpLeases' = httpLeases, servers' = servers, process' = process, seen' = seen,
  }

  /// A successful mounted.close completes after in-flight responses and tracked closes drain; failures may settle
  /// immediately, while a grace-period timeout only logs and leaves the drain pending.
  /// Conformance: `failed` is whether the drain rejected.
  action createMountedMcpHttpHandler_closeSettles(timedOut: bool, failed: bool): bool = all {
    http.handler.shutdown == Draining,
    timedOut or failed or shutdownDrainComplete(http.handler, servers),
    failed == (not(timedOut) and http.handler.closeFailures > 0),
    http' = { ...http, handler: { ...http.handler, shutdown:
      if (timedOut) ShutdownTimedOut else if (failed) ShutdownFailed else ShutdownOk } },
    admission' = admission, lifecycles' = lifecycles, httpLeases' = httpLeases, servers' = servers, process' = process, seen' = seen,
  }

  // ---------------------------------------------------------------- step

  action step = any {
    createRequestAdmission,
    { nondet adm = ADMISSION_PICKS.oneOf()
      nondet admitted = Set(true, false).oneOf()
      RequestAdmission_enter(adm, admitted) },
    { nondet lease = LEASE_PICKS.oneOf()
      nondet active = Set(activeAfterRelease(admission, lease)).oneOf()
      RequestLease_release(lease, active) },
    { nondet adm = ADMISSION_PICKS.oneOf()
      nondet drained = Set(true, false).oneOf()
      RequestAdmission_quiesce(adm, drained) },
    { nondet rid = LIFECYCLE_PICKS.oneOf()
      createRequestClientLifecycle(rid) },
    { nondet rid = REQS.oneOf()
      nondet closed = Set(lifecycles.get(rid).closed).oneOf()
      RequestClientLifecycle_resolve(rid, closed) },
    { nondet rid = REQS.oneOf()
      nondet rejected = Set(true, false).oneOf()
      nondet ownedLease = Set(true, false).oneOf()
      nondet leaseCloseFails = Set(true, false).oneOf()
      RequestClientLifecycle_acquireSettles(rid, rejected, ownedLease, leaseCloseFails) },
    { nondet rid = REQS.oneOf()
      nondet firstClose = Set(not(lifecycles.get(rid).closed)).oneOf()
      nondet leaseCloseFails = Set(true, false).oneOf()
      RequestClientLifecycle_close(rid, firstClose, leaseCloseFails) },
    { nondet rid = REQS.oneOf()
      attachRequestClientLifecycle(rid) },
    { nondet rid = REQS.oneOf()
      nondet underlyingFails = Set(true, false).oneOf()
      nondet leaseCloseFails = Set(true, false).oneOf()
      Server_close(rid, underlyingFails, leaseCloseFails) },
    { nondet rid = REQS.oneOf()
      Server_closeStarts(rid) },
    { nondet rid = REQS.oneOf()
      nondet failed = Set(true, false).oneOf()
      RequestClientLifecycle_leaseCloseSettles(rid, failed) },
    { nondet rid = REQS.oneOf()
      nondet leaseCloseFails = Set(true, false).oneOf()
      Server_onclose(rid, leaseCloseFails) },
    { nondet rid = REQS.oneOf()
      Server_cleanupSettles(rid) },
    { nondet rid = REQS.oneOf()
      nondet failed = Set(true, false).oneOf()
      McpServerCloseTracker_closeSettles(rid, failed) },
    { nondet rid = REQS.oneOf()
      nondet headers = Set(NoHulyHeaders, ValidHulyHeaders, InvalidHulyHeaders).oneOf()
      nondet buildOk = Set(true, false).oneOf()
      nondet succeeded = Set(true, false).oneOf()
      createHttpClientLeaseResolver(rid, headers, buildOk, succeeded) },
    createClientResolver,
    { nondet acq = ACQUISITION_PICKS.oneOf()
      nondet outcome = Set(Succeeded, FailedRecoverable, FailedFatal, Pending, Interrupted).oneOf()
      nondet evicted = Set(true, false).oneOf()
      buildScopedClientBundle(acq, outcome, evicted) },
    { nondet startedAcquisition = Set(true, false).oneOf()
      ClientResolver_resolve(startedAcquisition) },
    { nondet firstClose = Set(true, false).oneOf()
      ClientResolver_close(firstClose) },
    { nondet loopback = Set(true, false).oneOf()
      nondet token = Set(NoToken, BlankToken, SecretToken).oneOf()
      createMountedMcpHttpHandler(loopback, token) },
    { nondet bindOk = Set(true, false).oneOf()
      startHttpTransport(bindOk) },
    { nondet rid = REQS.oneOf()
      nondet hostOk = Set(true, false).oneOf()
      nondet originOk = Set(true, false).oneOf()
      nondet bearer = Set(NoBearer, MatchingBearer, WrongBearer, MalformedAuthorization).oneOf()
      nondet dispatched = Set(true, false).oneOf()
      createMountedMcpHttpHandler_fetch(rid, hostOk, originOk, bearer, dispatched) },
    { nondet rid = REQS.oneOf()
      createMountedMcpHttpHandler_fetchSettles(rid) },
    createMountedMcpHttpHandler_fetchRejectedDuringShutdown,
    createMountedMcpHttpHandler_close,
    { nondet timedOut = Set(true, false).oneOf()
      nondet failed = Set(true, false).oneOf()
      createMountedMcpHttpHandler_closeSettles(timedOut, failed) },
  }

  // ---------------------------------------------------------------- correctness properties

  /// An admission's active counter equals the number of its unreleased leases.
  val admission_active_matches_unreleased_leases: bool =
    admission.admissions.keys().forall(a =>
      admission.admissions.get(a).active ==
        admission.leases.keys().filter(l => admission.leases.get(l).admission == a and not(admission.leases.get(l).released)).size())

  /// An admission's active counter never goes below zero, even under double release.
  val admission_active_never_negative: bool =
    admission.admissions.keys().forall(a => admission.admissions.get(a).active >= 0)

  /// A quiesce drain resolves only once no admitted request is still active.
  val drain_resolves_only_when_idle: bool =
    admission.admissions.keys().forall(a =>
      admission.admissions.get(a).drainResolved implies admission.admissions.get(a).active == 0)

  /// No lease is issued by an admission after quiesce() was called on it.
  val no_lease_issued_after_quiesce: bool =
    admission.leases.keys().forall(l => match admission.admissions.get(admission.leases.get(l).admission).quiescedAtLease {
      | Some(q) => l < q
      | None => true
    })

  /// A request-scoped client lease is released at most once.
  val lease_released_at_most_once: bool =
    REQS.forall(r => lifecycles.get(r).leaseCloses <= 1)

  /// A closed lifecycle that holds an owned lease has released it exactly once.
  val closed_lifecycle_released_owned_lease: bool =
    REQS.forall(r => {
      val l = lifecycles.get(r)
      (l.closed and ownedAcquired(l)) implies l.leaseCloses == 1
    })

  /// A server whose close completed has a closed, settled lifecycle with its owned lease released.
  val closed_server_released_its_lease: bool =
    REQS.forall(r => {
      val l = lifecycles.get(r)
      (servers.get(r).closeState == Closed and servers.get(r).attached) implies
        (lifecycleCloseSettled(l) and (ownedAcquired(l) implies l.leaseCloses == 1))
    })

  /// A successful mounted-handler shutdown completes only after all in-flight responses and tracked closes settle.
  val shutdown_success_waits_for_drain: bool =
    http.handler.shutdown == ShutdownOk implies
      shutdownDrainComplete(http.handler, servers)

  /// A server reports a request-client cleanup failure at most once.
  val cleanup_error_reported_at_most_once: bool =
    REQS.forall(r => servers.get(r).cleanupReports <= 1)

  /// Requests with supported x-huly-* config headers never get the shared env bundle. Requests with no supported
  /// config headers, including unsupported-only x-huly-* headers, use the env bundle; no request gets another's
  /// scoped bundle.
  val tenant_bundles_stay_isolated: bool =
    REQS.forall(r => {
      val l = httpLeases.get(r)
      and {
        (l.headers == Some(ValidHulyHeaders) or l.headers == Some(InvalidHulyHeaders)) implies not(leaseHas(l, isEnvShared)),
        l.headers == Some(NoHulyHeaders) implies not(leaseHas(l, isHeaderScoped)),
        not(leaseHas(l, b => headerOwnerIsNot(b, r))),
      }
    })

  /// The resolver's active acquisition is always one it tracks for closing.
  val active_acquisition_is_tracked: bool = match process.resolver.active {
    | Some(a) => process.resolver.tracked.contains(a)
    | None => true
  }

  /// A recoverable (HulyUnavailableError) failure never stays cached as the active acquisition.
  val active_acquisition_never_recoverable_failure: bool =
    not(activeStatusIs(process, FailedRecoverable))

  /// The resolver never serves a succeeded acquisition whose scope is already closed.
  val active_client_scope_is_open: bool = match process.resolver.active {
    | Some(a) => process.acquisitions.get(a).status == Succeeded implies process.acquisitions.get(a).scopeOpen
    | None => true
  }

  /// After resolver.close() no process acquisition keeps an open client scope.
  val closed_resolver_owns_no_open_scope: bool =
    process.resolver.closed implies process.acquisitions.keys().forall(a => not(process.acquisitions.get(a).scopeOpen))

  /// Failed or interrupted acquisitions hold no open client scope.
  val failed_acquisition_holds_no_scope: bool =
    process.acquisitions.keys().forall(a =>
      process.acquisitions.get(a).status != Succeeded implies not(process.acquisitions.get(a).scopeOpen))

  /// While the resolver is open, an in-flight request's shared env bundle is never closed under it.
  val live_request_env_bundle_stays_open: bool =
    process.resolver.closed or REQS.forall(r =>
      match envAcquisitionOf(httpLeases.get(r)) {
        | Some(a) => (http.handler.inFlight.contains(r) and process.acquisitions.has(a)) implies process.acquisitions.get(a).scopeOpen
        | None => true
      })

  /// A dispatched request passed the loopback Host/Origin checks and the configured bearer token.
  val dispatched_requests_passed_guards: bool =
    REQS.forall(r => {
      val q = http.requests.get(r)
      q.outcome == Some(Dispatched) implies and {
        http.handler.loopback implies (q.hostOk and q.originOk),
        http.handler.token == SecretToken implies q.bearer == MatchingBearer,
      }
    })

  // ---------------------------------------------------------------- observations

  /// An admission issued a lease.
  val request_admitted: bool = admission.leases.keys().size() > 0
  /// enter() returned null because the admission was quiescing.
  val request_refused_while_quiescing: bool = seen.requestRefusedWhileQuiescing
  /// A lease was released twice and the second release was ignored.
  val double_release_ignored: bool = seen.doubleReleaseIgnored
  /// quiesce() resolved immediately with no active request.
  val quiesce_drained_immediately: bool = seen.quiesceDrainedImmediately
  /// A pending quiesce drain resolved on the last lease release.
  val quiesce_drained_after_last_release: bool = seen.quiesceDrainedAfterRelease

  /// resolve() handed a request-scoped bundle to a caller.
  val bundle_handed_to_caller: bool = REQS.exists(r => lifecycles.get(r).handouts > 0)
  /// resolve() threw because the lifecycle was already closed.
  val resolve_rejected_after_close: bool = seen.resolveRejectedAfterClose
  /// A rejected acquisition was rethrown from the memoized lease promise.
  val acquisition_rejection_rethrown: bool = seen.acquisitionRejectionRethrown
  /// A lifecycle that never resolved was closed (no-op release).
  val unused_lifecycle_closed: bool = seen.unusedLifecycleClosed
  /// close() won a pending acquisition and the late lease was released on arrival.
  val close_won_pending_acquisition: bool = seen.closeWonPendingAcquisition
  /// A lease close rejected.
  val lease_close_failed: bool = REQS.exists(r => lifecycles.get(r).leaseCloseFailed)

  /// A request with complete supported x-huly-* config headers got its own scoped bundle.
  val header_scoped_bundle_acquired: bool = REQS.exists(r => leaseHas(httpLeases.get(r), isHeaderScoped))
  /// A header-configured scoped build failed and returned a failed bundle.
  val header_scoped_build_failed: bool =
    REQS.exists(r => httpLeases.get(r).headers == Some(ValidHulyHeaders) and httpLeases.get(r).bundle == Some(FailedBundle))
  /// Invalid or mixed supported x-huly-* config headers produced a failed bundle.
  val invalid_headers_failed_bundle: bool = REQS.exists(r => httpLeases.get(r).headers == Some(InvalidHulyHeaders))
  /// A request with no supported x-huly-* config headers, including unsupported-only headers, was served the shared env bundle.
  val env_shared_bundle_served: bool = REQS.exists(r => leaseHas(httpLeases.get(r), isEnvShared))
  /// A request with no supported x-huly-* config headers got a cached failed env acquisition.
  val env_failure_served_to_request: bool =
    REQS.exists(r => httpLeases.get(r).headers == Some(NoHulyHeaders) and httpLeases.get(r).bundle == Some(FailedBundle))
  /// A request with no supported x-huly-* config headers got a died bundle from a closed resolver.
  val env_bundle_died_after_resolver_close: bool = REQS.exists(r => httpLeases.get(r).bundle == Some(DiedBundle))

  /// A second server.close() returned the memoized close.
  val server_close_repeated: bool = seen.serverCloseRepeated
  /// A transport-triggered close reported a cleanup error.
  val transport_close_reported_cleanup_error: bool = seen.transportCloseReportedCleanupError
  /// The underlying SDK server close failed and the close still completed.
  val underlying_server_close_failed: bool =
    REQS.exists(r => servers.get(r).closeState == Closed and servers.get(r).underlyingFails)
  /// The SDK server close failed but the attached lease was still released.
  val underlying_close_failed_lease_released: bool =
    REQS.exists(r => servers.get(r).closeState == Closed and servers.get(r).attached and servers.get(r).underlyingFails and lifecycles.get(r).leaseCloses == 1)
  /// Both SDK server close and lease cleanup failed (AggregateError).
  val both_closes_failed_aggregate: bool = REQS.exists(r => servers.get(r).aggregateRaised)

  /// A process acquisition succeeded.
  val resolver_acquisition_succeeded: bool =
    process.acquisitions.keys().exists(a => process.acquisitions.get(a).status == Succeeded)
  /// A recoverable failure evicted the active acquisition.
  val recoverable_failure_evicted: bool = seen.recoverableFailureEvicted
  /// resolve() served a cached non-recoverable failure.
  val fatal_failure_served_from_cache: bool = seen.fatalFailureServedFromCache
  /// resolve() died because the resolver was closed.
  val resolve_died_after_close: bool = seen.resolveDiedAfterClose
  /// resolver.close() interrupted a pending acquisition.
  val resolver_close_interrupted_pending: bool = seen.resolverCloseInterruptedPending
  /// resolver.close() was called again and returned the memoized close.
  val resolver_close_repeated: bool = seen.resolverCloseRepeated

  /// A loopback-bound handler rejected a spoofed Host header.
  val host_header_rejected: bool = REQS.exists(r => http.requests.get(r).outcome == Some(HostRejected))
  /// A loopback-bound handler rejected a foreign Origin.
  val origin_rejected: bool = REQS.exists(r => http.requests.get(r).outcome == Some(OriginRejected))
  /// A request without the matching bearer token got 401.
  val unauthorized_rejected: bool = REQS.exists(r => http.requests.get(r).outcome == Some(Unauthorized))
  /// A request with the matching bearer token was dispatched.
  val authorized_request_dispatched: bool =
    http.handler.token == SecretToken and REQS.exists(r => http.requests.get(r).outcome == Some(Dispatched))
  /// A blank configured token let a request without a bearer through.
  val blank_token_served_unauthenticated: bool =
    http.handler.token == BlankToken and
      REQS.exists(r => http.requests.get(r).outcome == Some(Dispatched) and http.requests.get(r).bearer != MatchingBearer)
  /// A public-interface binding dispatched a request with a foreign Host or Origin.
  val public_binding_skipped_host_origin_checks: bool =
    not(http.handler.loopback) and
      REQS.exists(r => http.requests.get(r).outcome == Some(Dispatched) and not(http.requests.get(r).hostOk and http.requests.get(r).originOk))
  /// Binding the HTTP listener failed.
  val http_bind_failed: bool = seen.httpBindFailed
  /// A guarded request was rejected with 503 after mounted-handler shutdown started.
  val fetch_rejected_during_shutdown: bool = seen.fetchRejectedDuringShutdown
  /// Mounted-handler shutdown drained cleanly with no in-flight response or tracked close pending.
  val shutdown_completed_cleanly: bool =
    http.handler.shutdown == ShutdownOk and not(seen.httpBindFailed) and shutdownDrainComplete(http.handler, servers)
  /// Mounted-handler shutdown surfaced tracked server close failures.
  val shutdown_surfaced_close_failures: bool = http.handler.shutdown == ShutdownFailed
  /// Mounted-handler shutdown hit the grace period and only logged.
  val shutdown_timed_out: bool = http.handler.shutdown == ShutdownTimedOut
}
