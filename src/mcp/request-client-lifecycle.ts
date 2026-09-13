import type { Server } from "@modelcontextprotocol/server"

import { observeHttpAdmission, admissionObservationsEnabled } from "./http-admission-observations.js"
import type { ClientBundle } from "../runtime/client-resolver.js"

export interface RequestClientLease<A = ClientBundle> {
  readonly bundle: A
  readonly close: () => void | Promise<void>
}

export interface RequestClientLifecycle<A = ClientBundle> {
  readonly resolve: () => Promise<A>
  readonly close: () => Promise<void>
}

export type RequestClientCleanupErrorHandler = (error: Error) => void

/**
 * Lazily acquires at most one request-scoped Huly client bundle and releases it
 * exactly once. Closing an unused lifecycle is intentionally a no-op.
 */
export const createRequestClientLifecycle = <A>(
  acquire: () => Promise<RequestClientLease<A>>
): RequestClientLifecycle<A> => {
  let leasePromise: Promise<RequestClientLease<A>> | undefined
  let closed = false
  let closePromise: Promise<void> | undefined
  observeHttpAdmission("createRequestClientLifecycle", {})

  const resolve = async (): Promise<A> => {
    if (closed) {
      observeHttpAdmission("RequestClientLifecycle_resolve", { closed: true })
      throw new Error("Request-scoped Huly clients are already closed")
    }
    observeHttpAdmission("RequestClientLifecycle_resolve", { closed: false })
    const startsAcquisition = leasePromise === undefined
    leasePromise ??= acquire()
    if (startsAcquisition && admissionObservationsEnabled()) {
      void leasePromise.then(
        () => observeHttpAdmission("RequestClientLifecycle_acquireSettles", { rejected: false }),
        () => observeHttpAdmission("RequestClientLifecycle_acquireSettles", { rejected: true })
      )
    }
    const lease = await leasePromise
    if (closed) {
      await closePromise
      throw new Error("Request-scoped Huly clients were closed during acquisition")
    }
    return lease.bundle
  }

  const close = (): Promise<void> => {
    if (closePromise !== undefined) {
      observeHttpAdmission("RequestClientLifecycle_close", { firstClose: false })
      return closePromise
    }
    closed = true
    observeHttpAdmission("RequestClientLifecycle_close", { firstClose: true })
    const pending = leasePromise
    closePromise =
      pending === undefined
        ? Promise.resolve()
        : pending.then(
            async (lease) => {
              try {
                await lease.close()
              } catch (error) {
                observeHttpAdmission("RequestClientLifecycle_leaseCloseSettles", { failed: true })
                throw error
              }
              observeHttpAdmission("RequestClientLifecycle_leaseCloseSettles", { failed: false })
            },
            () => {
              // A failed acquisition has no acquired resource to release.
            }
          )
    return closePromise
  }

  return { resolve, close }
}

/**
 * Binds request-client cleanup to the SDK-owned server lifecycle while
 * preserving any pre-existing close observer.
 */
export const attachRequestClientLifecycle = <A>(
  server: Server,
  lifecycle: RequestClientLifecycle<A>,
  onCleanupError: RequestClientCleanupErrorHandler,
  quiesceRequests: () => Promise<void> = () => Promise.resolve()
): void => {
  const previousOnClose = server.onclose
  const originalClose = server.close.bind(server)
  let serverClosePromise: Promise<void> | undefined
  let wrapperCloseInProgress = false
  let cleanupErrorReported = false
  const reportCleanupError = (error: unknown): void => {
    if (cleanupErrorReported) return
    cleanupErrorReported = true
    onCleanupError(error instanceof Error ? error : new Error(String(error)))
  }

  observeHttpAdmission("attachRequestClientLifecycle", {})

  server.onclose = () => {
    if (!wrapperCloseInProgress) {
      void server.close().catch(reportCleanupError)
      observeHttpAdmission("Server_onclose", {})
    }
    previousOnClose?.()
  }
  server.close = () => {
    observeHttpAdmission("Server_closeStarts", {})
    if (serverClosePromise !== undefined) return serverClosePromise
    wrapperCloseInProgress = true
    serverClosePromise = (async () => {
      const draining = quiesceRequests()
      const closeOriginal = async (): Promise<void> => {
        try {
          await originalClose()
        } finally {
          wrapperCloseInProgress = false
        }
      }
      const [serverResult] = await Promise.allSettled([closeOriginal()])
      await draining
      const [lifecycleResult] = await Promise.allSettled([lifecycle.close()])
      if (lifecycleResult.status === "rejected") reportCleanupError(lifecycleResult.reason)
      observeHttpAdmission("Server_close", {
        underlyingFails: serverResult.status === "rejected",
        leaseCloseFails: lifecycleResult.status === "rejected"
      })
      if (serverResult.status === "rejected" && lifecycleResult.status === "rejected") {
        throw new AggregateError(
          [serverResult.reason, lifecycleResult.reason],
          "MCP server and request-client cleanup both failed"
        )
      }
      if (serverResult.status === "rejected") throw serverResult.reason
      if (lifecycleResult.status === "rejected") throw lifecycleResult.reason
    })()
    return serverClosePromise
  }
}
