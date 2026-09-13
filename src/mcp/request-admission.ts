import { observeHttpAdmission } from "./http-admission-observations.js"

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
  observeHttpAdmission("createRequestAdmission", {})

  const releaseDrains = (): void => {
    if (state.active !== 0) return
    for (const resolve of drainWaiters) resolve()
    drainWaiters.clear()
  }

  const enter = (): RequestLease | null => {
    if (!state.accepting) {
      observeHttpAdmission("RequestAdmission_enter", { admitted: false })
      return null
    }
    state.active++
    observeHttpAdmission("RequestAdmission_enter", { admitted: true })
    const leaseState = { released: false }
    return {
      release: () => {
        if (leaseState.released) {
          observeHttpAdmission("RequestLease_release", { active: state.active })
          return
        }
        leaseState.released = true
        state.active--
        releaseDrains()
        observeHttpAdmission("RequestLease_release", { active: state.active })
      }
    }
  }

  const quiesce = (): Promise<void> => {
    state.accepting = false
    observeHttpAdmission("RequestAdmission_quiesce", { drained: state.active === 0 })
    if (state.active === 0) return Promise.resolve()
    return new Promise((resolve) => drainWaiters.add(resolve))
  }

  return { enter, quiesce }
}
