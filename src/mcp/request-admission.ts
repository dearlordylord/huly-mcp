export interface RequestLease {
  readonly release: () => void
}

export interface RequestAdmission {
  readonly enter: () => RequestLease | null
  readonly quiesce: () => Promise<void>
}

export const createRequestAdmission = (): RequestAdmission => {
  const state = { accepting: true, active: 0 }
  const drainWaiters = new Set<() => void>()

  const releaseDrains = (): void => {
    if (state.active !== 0) return
    for (const resolve of drainWaiters) resolve()
    drainWaiters.clear()
  }

  const enter = (): RequestLease | null => {
    if (!state.accepting) return null
    state.active++
    const leaseState = { released: false }
    return {
      release: () => {
        if (leaseState.released) return
        leaseState.released = true
        state.active--
        releaseDrains()
      }
    }
  }

  const quiesce = (): Promise<void> => {
    state.accepting = false
    if (state.active === 0) return Promise.resolve()
    return new Promise((resolve) => drainWaiters.add(resolve))
  }

  return { enter, quiesce }
}
