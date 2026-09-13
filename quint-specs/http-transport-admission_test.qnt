// Deterministic reachability runs for the deep close-path and cache observations of http_transport_admission.
// Each run replays the action sequence a real test logs (see the oracle report's resolved paths).
module http_transport_admission_test {
  import http_transport_admission.* from "./http-transport-admission"

  /// An owned lease whose close rejects, released by a wrapped server close whose SDK close also rejects
  /// ("preserves both underlying-close and lease-cleanup failures").
  run bothCloseFailuresTest =
    init
      .then(createRequestClientLifecycle(0))
      .then(attachRequestClientLifecycle(0))
      .then(RequestClientLifecycle_resolve(0, false))
      .then(RequestClientLifecycle_acquireSettles(0, false, true, false))
      .then(Server_closeStarts(0))
      .then(RequestClientLifecycle_close(0, true, true))
      .then(RequestClientLifecycle_leaseCloseSettles(0, true))
      .then(Server_close(0, true, true))
      .expect(both_closes_failed_aggregate and underlying_close_failed_lease_released and lease_close_failed)

  /// A transport-triggered close reports the rejected lease cleanup once
  /// ("normalizes non-Error cleanup rejection before reporting it").
  run transportCloseReportsCleanupErrorTest =
    init
      .then(createRequestClientLifecycle(0))
      .then(attachRequestClientLifecycle(0))
      .then(RequestClientLifecycle_resolve(0, false))
      .then(RequestClientLifecycle_acquireSettles(0, false, true, false))
      .then(RequestClientLifecycle_close(0, true, true))
      .then(Server_onclose(0, true))
      .then(RequestClientLifecycle_leaseCloseSettles(0, true))
      .expect(transport_close_reported_cleanup_error and cleanup_error_reported_at_most_once)

  /// close() wins a pending acquisition and the late lease is released on arrival
  /// ("does not return a bundle when close wins a pending acquisition").
  run closeWinsPendingAcquisitionTest =
    init
      .then(createRequestClientLifecycle(0))
      .then(RequestClientLifecycle_resolve(0, false))
      .then(RequestClientLifecycle_close(0, true, false))
      .then(RequestClientLifecycle_acquireSettles(0, false, true, false))
      .then(RequestClientLifecycle_leaseCloseSettles(0, false))
      .expect(close_won_pending_acquisition and closed_lifecycle_released_owned_lease)

  /// Non-timeout shutdown cannot settle while a dispatched request is still in flight.
  run shutdownDoesNotSettleWithInFlightTest =
    init
      .then(createMountedMcpHttpHandler(true, NoToken))
      .then(createMountedMcpHttpHandler_fetch(0, true, true, NoBearer, true))
      .then(McpServerCloseTracker_closeSettles(0, false))
      .then(createMountedMcpHttpHandler_close)
      .then(createMountedMcpHttpHandler_closeSettles(false, false).fail())

  /// Non-timeout shutdown cannot settle while a tracked server close is still pending.
  run shutdownDoesNotSettleWithTrackedCloseTest =
    init
      .then(createMountedMcpHttpHandler(true, NoToken))
      .then(createMountedMcpHttpHandler_fetch(0, true, true, NoBearer, true))
      .then(createMountedMcpHttpHandler_fetchSettles(0))
      .then(createMountedMcpHttpHandler_close)
      .then(createMountedMcpHttpHandler_closeSettles(false, false).fail())

  /// Non-timeout shutdown settles only after both in-flight requests and tracked closes drain.
  run shutdownWaitsForInFlightAndTrackedCloseTest =
    init
      .then(createMountedMcpHttpHandler(true, NoToken))
      .then(createMountedMcpHttpHandler_fetch(0, true, true, NoBearer, true))
      .then(McpServerCloseTracker_closeSettles(0, false))
      .then(createMountedMcpHttpHandler_close)
      .then(createMountedMcpHttpHandler_fetchSettles(0))
      .then(createMountedMcpHttpHandler_closeSettles(false, false))
      .expect(shutdown_completed_cleanly and shutdown_success_waits_for_drain)

  /// A grace-period timeout may complete while request and tracked-close work remains pending.
  run shutdownTimeoutMayLeaveDrainPendingTest =
    init
      .then(createMountedMcpHttpHandler(true, NoToken))
      .then(createMountedMcpHttpHandler_fetch(0, true, true, NoBearer, true))
      .then(createMountedMcpHttpHandler_close)
      .then(createMountedMcpHttpHandler_closeSettles(true, false))
      .expect(shutdown_timed_out)

  /// Unsupported-only x-huly-* headers do not enter isolated header configuration mode.
  run unsupportedOnlyHulyHeadersUseEnvFallbackTest =
    init
      .then(createHttpClientLeaseResolver(0, NoHulyHeaders, true, true))
      .expect(env_shared_bundle_served and tenant_bundles_stay_isolated)

  /// A valid request is rejected after mounted-handler shutdown starts.
  run fetchRejectedDuringShutdownTest =
    init
      .then(createMountedMcpHttpHandler(true, NoToken))
      .then(createMountedMcpHttpHandler_close)
      .then(createMountedMcpHttpHandler_fetchRejectedDuringShutdown)
      .expect(fetch_rejected_during_shutdown)

  /// A non-recoverable acquisition failure stays cached and is served to the next resolve
  /// ("keeps non-unavailable failures cached").
  run fatalFailureServedFromCacheTest =
    init
      .then(createClientResolver)
      .then(ClientResolver_resolve(true))
      .then(buildScopedClientBundle(0, FailedFatal, false))
      .then(ClientResolver_resolve(false))
      .expect(fatal_failure_served_from_cache and active_acquisition_is_tracked)
}
