import type { ClientBundle } from "../runtime/client-resolver.js"

export interface RequestClientLease<A = ClientBundle> {
  readonly bundle: A
  readonly close: () => void | Promise<void>
}

export interface RequestClientLifecycle<A = ClientBundle> {
  readonly resolve: () => Promise<A>
  readonly retain: () => () => void
  readonly close: () => Promise<void>
}

/**
 * Lazily acquires at most one request-scoped Huly client bundle and releases it
 * exactly once. Closing an unused lifecycle is intentionally a no-op.
 */
export const createRequestClientLifecycle = <A>(
  acquire: (signal: AbortSignal) => Promise<RequestClientLease<A>>
): RequestClientLifecycle<A> => {
  const acquisitionAbort = new AbortController()
  let leasePromise: Promise<RequestClientLease<A>> | undefined
  let closed = false
  let closePromise: Promise<void> | undefined
  let activeUsers = 0
  let resolveIdle: (() => void) | undefined

  const retain = (): (() => void) => {
    if (closed) throw new Error("Request-scoped Huly clients are already closed")
    activeUsers++
    let released = false
    return () => {
      if (released) return
      released = true
      activeUsers--
      if (activeUsers === 0) resolveIdle?.()
    }
  }

  const resolve = async (): Promise<A> => {
    if (closed) throw new Error("Request-scoped Huly clients are already closed")
    leasePromise ??= acquire(acquisitionAbort.signal)
    const lease = await leasePromise
    if (closed) {
      throw new Error("Request-scoped Huly clients were closed during acquisition")
    }
    return lease.bundle
  }

  const close = (): Promise<void> => {
    if (closePromise !== undefined) return closePromise
    closed = true
    acquisitionAbort.abort()
    const pending = leasePromise
    const idle =
      activeUsers === 0
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            resolveIdle = resolve
          })
    closePromise = idle.then(() =>
      pending === undefined
        ? undefined
        : pending.then(
            async (lease) => {
              await lease.close()
            },
            () => {
              // A failed acquisition has no acquired resource to release.
            }
          )
    )
    return closePromise
  }

  return { resolve, retain, close }
}
