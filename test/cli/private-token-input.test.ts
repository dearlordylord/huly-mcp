import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { Effect } from "effect"
import { expect, it } from "vitest"

import { runCapturedProcess } from "../../scripts/captured-process.js"
import { cliProfilePaths, makeCliProfileStore } from "../../src/profiles/file-store.js"
import { parseProfileName } from "../../src/profiles/model.js"

const sentinel = "private-token-process-sentinel"
const cases = [
  { args: ["--stdin"], input: sentinel.repeat(4096), error: "64 KiB" },
  { args: [], input: sentinel, error: "privately from a terminal" },
  { args: ["--token", sentinel], input: "", error: "Invalid private authentication arguments" },
  { args: [sentinel], input: "", error: "Invalid private authentication arguments" },
  { args: [sentinel, "--json"], input: "", error: "Invalid private authentication arguments" }
]

it.each(cases)("rejects private token input safely: $error", async ({ args, error, input }) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "huly-private-input-"))
  const store = makeCliProfileStore(cliProfilePaths("linux", { XDG_CONFIG_HOME: directory }, directory))
  try {
    const name = await Effect.runPromise(parseProfileName("work"))
    await Effect.runPromise(
      store.writeProfiles({
        version: 1,
        activeProfile: name,
        profiles: { [name]: { url: "http://127.0.0.1:1", workspace: "unreachable" } }
      })
    )
    const result = await runCapturedProcess(
      process.execPath,
      ["packages/huly-cli/dist/index.cjs", "auth", "import-token", ...args],
      { XDG_CONFIG_HOME: directory, HOME: directory, HULY_CLI_TELEMETRY: "0" },
      input
    )
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr).toContain(error)
    expect(result.stdout + result.stderr).not.toContain(sentinel)
    await expect(fs.access(store.paths.credentials)).rejects.toMatchObject({ code: "ENOENT" })
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})
