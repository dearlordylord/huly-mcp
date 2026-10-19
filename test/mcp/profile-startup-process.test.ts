import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { beforeAll, afterAll, it } from "vitest"
import { buildIsolatedStdioServer } from "../helpers/stdio-build.js"
import { testStdioEnvironment } from "../helpers/stdio-environment.js"
import { cliProfilePaths } from "../../src/profiles/file-store.js"
import { profileProbeEnvironment, probeProfileStartup } from "../../scripts/probe-profile-startup.js"

let entry: string
let cleanup: (() => Promise<void>) | undefined
beforeAll(async () => {
  const built = await buildIsolatedStdioServer(30000)
  entry = built.path
  cleanup = built.cleanup
}, 30000)
afterAll(async () => {
  await cleanup?.()
})
// Each case owns its profile directory and child processes; no state is shared.
it.concurrent.each(
  ["stdio", "stdio-resident", "stdio-http"].flatMap((transport) =>
    ["missing", "logged-out", "unavailable"].map((state) => ({ transport, state }))
  )
)(
  "exposes $state profile failures through a real $transport MCP process",
  { timeout: 30000 },
  async ({ state, transport }) => {
    const directory = await mkdtemp(join(tmpdir(), "huly-profile-diagnostic-"))
    const environment = {
      ...testStdioEnvironment(),
      HOME: directory,
      XDG_CONFIG_HOME: directory,
      APPDATA: directory,
      HULY_PROFILE: "qualification",
      MCP_TRANSPORT: transport,
      DBUS_SESSION_BUS_ADDRESS: `unix:path=${directory}/missing-bus`
    }
    const paths = cliProfilePaths(process.platform, environment, directory)
    try {
      await mkdir(paths.directory, { recursive: true })
      if (state !== "missing") {
        const backend = process.platform === "darwin" ? "macos-keychain" : "linux-secret-service"
        const destination = { url: "https://huly.invalid", workspace: "qualification" }
        await writeFile(
          paths.profiles,
          JSON.stringify({
            version: 1,
            activeProfile: "qualification",
            profiles: { qualification: { ...destination, credentialStorage: backend } }
          })
        )
        await writeFile(
          paths.credentials,
          JSON.stringify({
            version: 1,
            tokens: {},
            ...(state === "unavailable"
              ? { native: { qualification: { backend, destination, key: `missing-${directory}` } } }
              : {})
          })
        )
      }
      await probeProfileStartup(
        entry,
        profileProbeEnvironment(environment),
        state === "unavailable" ? /Keychain|Secret Service/ : /profile|credentials/
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
)
