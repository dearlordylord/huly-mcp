import { chmod, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { Client } from "@modelcontextprotocol/client"
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio"
import { expect, it } from "vitest"

import { buildIsolatedStdioServer } from "../helpers/stdio-build.js"
import { testStdioEnvironment } from "../helpers/stdio-environment.js"

const PROCESS_BOUND = 30_000
const REQUEST_BOUND = 5_000

it.each(["missing", "not-executable", "corrupt"])(
  "starts working ordinary stdio when the packaged native bridge is %s",
  { timeout: PROCESS_BOUND },
  async (mode) => {
    const bundle = await buildIsolatedStdioServer(PROCESS_BOUND)
    const executable = join(dirname(bundle.path), "native", `huly-stdio-${process.platform}-${process.arch}`)
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [bundle.path],
      stderr: "pipe",
      env: { ...testStdioEnvironment(), LAZY_ENVS: "true", MCP_TRANSPORT: "stdio-resident" }
    })
    const client = new Client(
      { name: "native-fallback-test", version: "1" },
      { versionNegotiation: { mode: { pin: "2026-07-28" } } }
    )
    const diagnostics: Array<string> = []
    transport.stderr?.on("data", (bytes: Buffer) => {
      diagnostics.push(bytes.toString())
    })
    try {
      if (mode === "missing") await rm(executable)
      else if (mode === "not-executable") await chmod(executable, 0o600)
      else await writeFile(executable, "invalid executable", { mode: 0o700 })
      await client.connect(transport, { timeout: REQUEST_BOUND })
      const catalog = await client.listTools(undefined, { timeout: REQUEST_BOUND })
      expect(catalog.tools.some((tool) => tool.name === "get_huly_context")).toBe(true)
      expect(diagnostics.join("")).toContain("Native resident bridge unavailable; starting ordinary stdio")
      expect(diagnostics.join("")).not.toContain("execve failed")
    } finally {
      await client.close()
      await bundle.cleanup()
    }
  }
)
