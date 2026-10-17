import { spawn } from "node:child_process"
import { once } from "node:events"
import * as fs from "node:fs/promises"
import { open, close } from "node:inspector"
import { Worker } from "node:worker_threads"
import { WASI } from "node:wasi"
import { Schema } from "effect"

import { RestrictedProbe, RestrictedProbeAttempt } from "../restricted-observation.js"

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

const file = Schema.decodeUnknownSync(Schema.NonEmptyString)(process.env["RESIDENT_CONTAINMENT_PROBE_FILE"])
const result = Schema.decodeUnknownSync(RestrictedProbeAttempt)({
  nodeVersion: process.versions.node,
  processId: process.pid,
  denied: {
    child: await childDenied(),
    worker: await workerDenied(),
    addon: addonDenied(),
    wasi: denied(() => void new WASI({ version: "preview1" }), "WASI"),
    inspector: denied(() => {
      open(0, "127.0.0.1", false)
      close()
    }, "Inspector")
  }
})
await fs.writeFile(file, Schema.encodeSync(Schema.fromJsonString(RestrictedProbeAttempt))(result), {
  mode: 0o600,
  flag: "wx"
})
Schema.decodeUnknownSync(RestrictedProbe)(result)
