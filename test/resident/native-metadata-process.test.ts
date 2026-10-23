import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { tmpdir } from "node:os"
import { Client } from "@modelcontextprotocol/client"
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio"
import { Schema } from "effect"
import { expect, it } from "vitest"

import { buildIsolatedStdioServer } from "../helpers/stdio-build.js"
import { testStdioEnvironment } from "../helpers/stdio-environment.js"

const PROCESS_BOUND = 30_000
const REQUEST_BOUND = 5_000
const UnavailableReply = Schema.Struct({
  isError: Schema.Literal(true),
  _meta: Schema.Struct({ errorTag: Schema.Literal("HulyUnavailableError") })
})
const LocalContext = Schema.Struct({
  result: Schema.Struct({ transport: Schema.Struct({ type: Schema.Literal("stdio") }) })
})

it.skipIf(process.platform === "win32")(
  "publishes the real MCP catalog while resident startup is blocked, then dispatches through local fallback",
  { timeout: PROCESS_BOUND },
  async () => {
    const bundle = await buildIsolatedStdioServer(PROCESS_BOUND)
    const root = await mkdtemp(join(tmpdir(), "resident-early-catalog-"))
    const wrapper = join(root, "node")
    const release = join(root, "release")
    // This executable is a process-level fault injector, not a replacement MCP server.
    await writeFile(
      wrapper,
      `#!/usr/bin/env python3
import os, pathlib, sys, time
root = pathlib.Path(__file__).parent
if os.environ.get('MCP_TRANSPORT') == 'resident-bootstrap':
    while not (root / 'release').exists():
        time.sleep(0.02)
    sys.exit(1)
node = os.environ['HULY_TEST_NODE_EXECUTABLE']
os.execv(node, [node, *sys.argv[1:]])
`
    )
    await chmod(wrapper, 0o700)
    const transport = new StdioClientTransport({
      command: join(dirname(bundle.path), "native", `huly-stdio-${process.platform}-${process.arch}`),
      args: [wrapper, bundle.path],
      stderr: "pipe",
      env: {
        ...testStdioEnvironment(),
        HULY_TEST_NODE_EXECUTABLE: process.execPath,
        LAZY_ENVS: "false",
        HULY_URL: "http://127.0.0.1:9",
        HULY_TOKEN: "fixture",
        HULY_WORKSPACE: "fixture",
        MCP_TRANSPORT: "stdio-resident",
        MCP_RESIDENT_STATE_DIRECTORY: join(root, "state")
      }
    })
    const client = new Client(
      { name: "codex", version: "early-catalog-fixture" },
      { versionNegotiation: { mode: { pin: "2026-07-28" } } }
    )
    try {
      await client.connect(transport, { timeout: REQUEST_BOUND })
      const catalog = await client.listTools(undefined, { timeout: REQUEST_BOUND })
      const contextTool = catalog.tools.find((tool) => tool.name === "get_huly_context")
      expect(contextTool).toBeDefined()
      // Startup remains blocked until after the client has received its real catalog.
      await writeFile(release, "release startup")
      const context = await client.callTool(
        { name: "get_huly_context", arguments: {} },
        { timeout: REQUEST_BOUND, ...(contextTool === undefined ? {} : { toolDefinition: contextTool }) }
      )
      expect(context.isError).not.toBe(true)
      expect(Schema.decodeUnknownSync(LocalContext)(context.structuredContent).result.transport.type).toBe("stdio")
      const failedRead = await client.callTool(
        { name: "invoke_tool", arguments: { toolName: "list_projects", arguments: {} } },
        { timeout: REQUEST_BOUND }
      )
      expect(Schema.decodeUnknownSync(UnavailableReply)(failedRead)._meta.errorTag).toBe("HulyUnavailableError")
      // A connection error is a tool result, not loss of the MCP catalog.
      expect((await client.listTools(undefined, { timeout: REQUEST_BOUND })).tools.length).toBe(catalog.tools.length)
    } finally {
      await client.close()
      await rm(root, { recursive: true, force: true })
      await bundle.cleanup()
    }
  }
)
