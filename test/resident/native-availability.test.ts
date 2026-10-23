import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, it } from "vitest"

import { nativeExecutableFor, type NativeAvailability } from "../../src/resident/native-availability.js"

const runtime: NativeAvailability = {
  platform: "linux",
  architecture: "arm64",
  packageFile: "/package/dist/index.cjs",
  execveAvailable: true
}

it.each([
  { ...runtime, platform: "win32" },
  { ...runtime, architecture: "ia32" },
  { ...runtime, execveAvailable: false }
] satisfies ReadonlyArray<NativeAvailability>)(
  "skips native launch without probing on unsupported runtime %j",
  (input) => {
    let probes = 0
    expect(
      nativeExecutableFor(input, () => {
        probes++
        return true
      })
    ).toBeUndefined()
    expect(probes).toBe(0)
  }
)

it.each(["linux", "darwin"] satisfies ReadonlyArray<NodeJS.Platform>)(
  "selects only an available packaged bridge on %s",
  (platform) => {
    const observed: Array<string> = []
    const selected = nativeExecutableFor({ ...runtime, platform }, (file) => {
      observed.push(file)
      return true
    })
    expect(selected).toBe(`/package/dist/native/huly-stdio-${platform}-arm64`)
    expect(observed).toEqual([selected])
    expect(nativeExecutableFor({ ...runtime, platform }, () => false)).toBeUndefined()
  }
)

it.skipIf(process.platform === "win32")(
  "probes missing, non-executable, corrupt and working files without consuming stdin",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "native-probe-"))
    const input = { ...runtime, packageFile: join(directory, "index.cjs") }
    const file = join(directory, "native", "huly-stdio-linux-arm64")
    try {
      expect(nativeExecutableFor(input)).toBeUndefined()
      await mkdir(join(directory, "native"), { recursive: true })
      await writeFile(file, "not an executable", { mode: 0o600 })
      expect(nativeExecutableFor(input)).toBeUndefined()
      await chmod(file, 0o700)
      expect(nativeExecutableFor(input)).toBeUndefined()
      await writeFile(file, '#!/bin/sh\n[ "$1" = "--check" ]\n')
      expect(nativeExecutableFor(input)).toBe(file)
      await writeFile(file, "#!/bin/sh\ntrap '' TERM\nwhile :; do :; done\n")
      expect(nativeExecutableFor(input)).toBeUndefined()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
)

it.skipIf(process.platform === "win32")("refuses an executable that fails its startup check", async () => {
  const directory = await mkdtemp(join(tmpdir(), "native-check-failure-"))
  const input = { ...runtime, packageFile: join(directory, "index.cjs") }
  try {
    await mkdir(join(directory, "native"))
    await writeFile(join(directory, "native", "huly-stdio-linux-arm64"), "#!/bin/sh\nexit 1\n", { mode: 0o700 })
    expect(nativeExecutableFor(input)).toBeUndefined()
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it("contains a malformed executable path without aborting bootstrap", () => {
  expect(nativeExecutableFor({ ...runtime, packageFile: "/invalid\0/index.cjs" })).toBeUndefined()
})

it("selects the x64 bridge independently of the host architecture", () => {
  expect(nativeExecutableFor({ ...runtime, architecture: "x64" }, () => true)).toBe(
    "/package/dist/native/huly-stdio-linux-x64"
  )
})
