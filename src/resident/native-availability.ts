import { spawnSync } from "node:child_process"
import { dirname, join } from "node:path"

import { NATIVE_CHECK_ARGUMENT } from "./native-wire.js"

const NATIVE_PROBE_MILLIS = 1000

// Bootstrap uses Node-owned paths and runtime metadata before loading the Effect application.
export interface NativeAvailability {
  readonly platform: NodeJS.Platform
  readonly architecture: NodeJS.Architecture
  readonly packageFile: string
  readonly execveAvailable: boolean
}
export const nativeExecutableFor = (
  runtime: NativeAvailability,
  probe: (executable: string) => boolean = probeNativeExecutable
): string | undefined => {
  if (!runtime.execveAvailable) return undefined
  if (runtime.platform !== "linux" && runtime.platform !== "darwin") return undefined
  if (runtime.architecture !== "arm64" && runtime.architecture !== "x64") return undefined
  const executable = join(
    dirname(runtime.packageFile),
    "native",
    `huly-stdio-${runtime.platform}-${runtime.architecture}`
  )
  return probe(executable) ? executable : undefined
}

const probeNativeExecutable = (executable: string): boolean => {
  try {
    const result = spawnSync(executable, [NATIVE_CHECK_ARGUMENT], {
      stdio: "ignore",
      timeout: NATIVE_PROBE_MILLIS,
      killSignal: "SIGKILL"
    })
    return result.error === undefined && result.status === 0
  } catch {
    return false
  }
}
