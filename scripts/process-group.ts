import { Result, Schema } from "effect"

const parseGroupRace = Schema.decodeUnknownResult(Schema.Struct({ code: Schema.Literals(["ESRCH", "EPERM"]) }))

// Internal kernel-control port; the schema owns errors received from the OS.
type SendSignal = (pid: number, signal: NodeJS.Signals | 0) => void
const sendKernelSignal: SendSignal = (pid, signal) => {
  process.kill(pid, signal)
}

export const signalProcessGroup = (pid: number, signal: NodeJS.Signals, send: SendSignal = sendKernelSignal): void => {
  try {
    send(-pid, signal)
  } catch (error) {
    // A signal attempt is never proof of cleanup. The caller must still prove ESRCH within its existing bound.
    if (Result.isFailure(parseGroupRace(error))) throw error
  }
}

export const isProcessGroupAbsent = (pid: number, send: SendSignal = sendKernelSignal): boolean => {
  try {
    send(-pid, 0)
    return false
  } catch (error) {
    const parsed = parseGroupRace(error)
    if (Result.isFailure(parsed)) throw error
    // Permission denial is not absence; only a later ESRCH can confirm cleanup.
    return parsed.success.code === "ESRCH"
  }
}
