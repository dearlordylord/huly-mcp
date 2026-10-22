import { closeSync, readSync, writeSync } from "node:fs"

import {
  NATIVE_ACK,
  NATIVE_CONFIGURED_HEADER,
  NATIVE_CONTROL_BYTES,
  NATIVE_CONTROL_FD,
  NATIVE_LOCAL_HEADER
} from "./native-wire.js"

const writeControl = (frame: string) => {
  const bytes = Buffer.from(frame)
  if (bytes.length > NATIVE_CONTROL_BYTES) throw new Error("Native bootstrap frame exceeded its budget")
  let offset = 0
  while (offset < bytes.length) {
    const written = writeSync(NATIVE_CONTROL_FD, bytes, offset, bytes.length - offset)
    if (written === 0) throw new Error("Native bootstrap control output is closed")
    offset += written
  }
}

export const publishNativeBootstrap = (frame: string) => {
  writeControl(frame)
  closeSync(NATIVE_CONTROL_FD)
}

export const awaitNativeStartupPermission = () => {
  writeControl(`${NATIVE_CONFIGURED_HEADER}\n`)
  const permission = Buffer.alloc(1)
  if (readSync(0, permission) !== permission.length || permission[0] !== NATIVE_ACK)
    throw new Error("Native resident input closed before startup authorization")
}

export const publishNativeLocalBootstrap = () => publishNativeBootstrap(`${NATIVE_LOCAL_HEADER}\n`)
