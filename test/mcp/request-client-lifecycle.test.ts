import { describe, expect, it } from "vitest"

import { createRequestClientLifecycle, type RequestClientLease } from "../../src/mcp/request-client-lifecycle.js"

const placeholderBundle = Symbol("request-client-bundle")

const deferred = <A>(): { readonly promise: Promise<A>; readonly resolve: (value: A) => void } => {
  let resolvePromise: ((value: A) => void) | undefined
  const promise = new Promise<A>((resolve) => {
    resolvePromise = resolve
  })
  return { promise, resolve: (value) => resolvePromise?.(value) }
}

describe("request-scoped Huly client lifecycle", () => {
  it("memoizes one acquisition and releases it exactly once", async () => {
    let acquisitions = 0
    let releases = 0
    const lifecycle = createRequestClientLifecycle(async () => {
      acquisitions++
      return {
        bundle: placeholderBundle,
        close: () => {
          releases++
        }
      }
    })

    const first = await lifecycle.resolve()
    const second = await lifecycle.resolve()
    expect(first).toBe(placeholderBundle)
    expect(second).toBe(first)
    expect(acquisitions).toBe(1)

    await Promise.all([lifecycle.close(), lifecycle.close()])
    expect(releases).toBe(1)
  })

  it("aborts an in-flight acquisition when the request closes", async () => {
    let acquisitionSignal: AbortSignal | undefined
    const lifecycle = createRequestClientLifecycle<symbol>((signal) => {
      acquisitionSignal = signal
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("acquisition interrupted")), { once: true })
      })
    })

    const resolving = lifecycle.resolve()
    await lifecycle.close()

    expect(acquisitionSignal?.aborted).toBe(true)
    await expect(resolving).rejects.toThrow("acquisition interrupted")
  })

  it("rejects resolution after close and keeps repeated close idempotent", async () => {
    let acquisitions = 0
    const lifecycle = createRequestClientLifecycle(async () => {
      acquisitions++
      return { bundle: placeholderBundle, close: () => {} }
    })

    await lifecycle.close()
    await lifecycle.close()

    await expect(lifecycle.resolve()).rejects.toThrow("already closed")
    expect(acquisitions).toBe(0)
  })

  it("does not attempt release when acquisition fails before close", async () => {
    const lifecycle = createRequestClientLifecycle<symbol>(() => Promise.reject(new Error("acquisition failed")))

    await expect(lifecycle.resolve()).rejects.toThrow("acquisition failed")
    await lifecycle.close()
    await expect(lifecycle.close()).resolves.toBeUndefined()
  })

  it("does not return a bundle when close wins a pending acquisition", async () => {
    const acquired = deferred<RequestClientLease<symbol>>()
    let releases = 0
    const lifecycle = createRequestClientLifecycle(() => acquired.promise)
    const resolution = lifecycle.resolve()
    const closing = lifecycle.close()

    acquired.resolve({
      bundle: placeholderBundle,
      close: () => {
        releases++
      }
    })

    await expect(resolution).rejects.toThrow("closed during acquisition")
    await expect(closing).resolves.toBeUndefined()
    expect(releases).toBe(1)
  })

  it("rejects a retained pending resolution without deadlocking close", async () => {
    const acquired = deferred<RequestClientLease<symbol>>()
    let releases = 0
    const lifecycle = createRequestClientLifecycle(() => acquired.promise)
    const releaseUse = lifecycle.retain()
    const resolution = lifecycle.resolve()
    const closing = lifecycle.close()

    acquired.resolve({
      bundle: placeholderBundle,
      close: () => {
        releases++
      }
    })

    await expect(resolution).rejects.toThrow("closed during acquisition")
    expect(releases).toBe(0)
    releaseUse()
    await expect(closing).resolves.toBeUndefined()
    expect(releases).toBe(1)
  })

  it("rejects new retained ownership after close", async () => {
    const lifecycle = createRequestClientLifecycle(async () => ({ bundle: placeholderBundle, close: () => {} }))

    await lifecycle.close()

    expect(() => lifecycle.retain()).toThrow("already closed")
  })

  it("waits for every retained user and ignores repeated release", async () => {
    let releases = 0
    const lifecycle = createRequestClientLifecycle(async () => ({
      bundle: placeholderBundle,
      close: () => {
        releases++
      }
    }))
    const releaseFirst = lifecycle.retain()
    const releaseSecond = lifecycle.retain()
    await lifecycle.resolve()
    const closing = lifecycle.close()

    releaseFirst()
    releaseFirst()
    await Promise.resolve()
    expect(releases).toBe(0)

    releaseSecond()
    await closing
    expect(releases).toBe(1)
  })

  it("surfaces asynchronous lease cleanup failures", async () => {
    const lifecycle = createRequestClientLifecycle(async () => ({
      bundle: placeholderBundle,
      close: () => Promise.reject(new Error("cleanup failed"))
    }))

    await lifecycle.resolve()
    await expect(lifecycle.close()).rejects.toThrow("cleanup failed")
  })
})
