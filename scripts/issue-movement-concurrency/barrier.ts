import type { GatewayAction, GatewayControl, GatewayEvent, GatewayPoint } from "./protocol.js"

// Internal transport control, not a serialized boundary shape.
interface Arm {
  readonly point: GatewayPoint
  readonly action: GatewayAction
  readonly persistent: boolean
}
export const makeGatewayBarrier = (emit: (event: GatewayEvent) => void) => {
  const state: { arm: Arm | undefined; release: (() => void) | undefined } = { arm: undefined, release: undefined }
  const control = (command: GatewayControl) => {
    if (command.command === "arm") state.arm = command
    if (command.command === "release" || command.command === "close") {
      state.release?.()
      state.release = undefined
    }
  }
  const visit = async (point: GatewayPoint): Promise<GatewayAction | undefined> => {
    const arm = state.arm
    if (arm?.point !== point) return undefined
    if (!arm.persistent) state.arm = undefined
    if (arm.action !== "pause") {
      emit({ event: "barrier", point, action: arm.action })
      return arm.action
    }
    const released = new Promise<void>((resolve) => { state.release = resolve })
    emit({ event: "barrier", point, action: arm.action })
    await released
    state.release = undefined
    return undefined
  }
  return { control, visit }
}
