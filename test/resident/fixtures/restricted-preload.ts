import { spawn } from "node:child_process"
import { once } from "node:events"
import * as fs from "node:fs/promises"
import { writeFileSync, renameSync, unlinkSync } from "node:fs"
import { open, close } from "node:inspector"
import { Worker } from "node:worker_threads"
import { WASI } from "node:wasi"
import { Schema } from "effect"

import {
  RestrictedIpcChallenge,
  RestrictedIpcReply,
  RestrictedProbe,
  RestrictedProbeAttempt
} from "../restricted-observation.js"

const Denied = Schema.Struct({ code: Schema.Literal("ERR_ACCESS_DENIED"), permission: Schema.String })
const AddonDenied = Schema.Struct({ code: Schema.Literal("ERR_DLOPEN_DISABLED") })
const CHILD_PROBE_BOUND = 1_000
const denied = (run: () => void, permission: string) => {
  try {
    run()
    return false
  } catch (error) {
    return Schema.is(Denied)(error) && error.permission === permission
  }
}
const childDenied = async () => {
  try {
    const child = spawn(process.execPath, ["-e", "process.exitCode=0"], { stdio: "ignore" })
    await once(child, "close", { signal: AbortSignal.timeout(CHILD_PROBE_BOUND) })
    return false
  } catch (error) {
    return Schema.is(Denied)(error) && error.permission === "ChildProcess"
  }
}
const workerDenied = async () => {
  try {
    const worker = new Worker("", { eval: true })
    await worker.terminate()
    return false
  } catch (error) {
    return Schema.is(Denied)(error) && error.permission === "WorkerThreads"
  }
}
const addonDenied = () => {
  try {
    process.dlopen({ exports: {} }, "/nonexistent-resident-fixture-addon.node")
    return false
  } catch (error) {
    return Schema.is(AddonDenied)(error)
  }
}

const acknowledge = async () => {
  const [message] = await once(process, "message", { signal: AbortSignal.timeout(CHILD_PROBE_BOUND) })
  const challenge = Schema.decodeUnknownSync(RestrictedIpcChallenge)(message)
  const send = process.send?.bind(process)
  if (send === undefined) throw new Error("Missing owned IPC channel")
  await new Promise<void>((resolve, reject) => {
    send(Schema.encodeSync(RestrictedIpcReply)({ kind: "acknowledged", nonce: challenge.nonce }), (error) => {
      if (error === null) resolve()
      else reject(error)
    })
  })
}
await acknowledge()
process.stderr.write("Restricted preload: acknowledged\n")
const ownership = Schema.decodeUnknownSync(Schema.NonEmptyString)(process.env["RESIDENT_CONTAINMENT_OWNERSHIP"])
const file = Schema.decodeUnknownSync(Schema.NonEmptyString)(process.env["RESIDENT_CONTAINMENT_PROBE_FILE"])
const result = Schema.decodeUnknownSync(RestrictedProbeAttempt)({
  nodeVersion: process.versions.node,
  processId: process.pid,
  ipcAcknowledged: true,
  denied: {
    child: await childDenied(),
    worker: await workerDenied(),
    addon: addonDenied(),
    wasi: denied(() => void new WASI({ version: "preview1" }), "WASI"),
    ownershipWrite: denied(() => writeFileSync(`${ownership}/write`, "changed"), "FileSystemWrite"),
    ownershipRename: denied(() => renameSync(`${ownership}/rename`, `${ownership}/renamed`), "FileSystemWrite"),
    ownershipRemove: denied(() => unlinkSync(`${ownership}/remove`), "FileSystemWrite"),
    inspector: denied(() => {
      open(0, "127.0.0.1", false)
      close()
    }, "Inspector")
  }
})
process.stderr.write("Restricted preload: probes-completed\n")
await fs.writeFile(file, Schema.encodeSync(Schema.fromJsonString(RestrictedProbeAttempt))(result), {
  mode: 0o600,
  flag: "wx"
})
process.stderr.write("Restricted preload: receipt-written\n")
Schema.decodeUnknownSync(RestrictedProbe)(result)
