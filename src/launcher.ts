#!/usr/bin/env node

import { isUnsupportedNodeRuntime, parseUnsupportedNodeMcpConfig } from "./unsupported-node-mcp.js"
import { startUnsupportedNodeMcp } from "./unsupported-node-mcp-stdio.js"
import { publishNativeLocalBootstrap } from "./resident/native-bootstrap-output.js"

const nodeEngineRequirement = NODE_ENGINE_REQUIREMENT
const unsupportedRuntime = isUnsupportedNodeRuntime(process.versions.node, nodeEngineRequirement)

if (unsupportedRuntime) {
  if (process.env.MCP_TRANSPORT === "resident-bootstrap") publishNativeLocalBootstrap()
  const config = parseUnsupportedNodeMcpConfig({
    detectedNodeVersion: process.versions.node,
    executable: process.execPath,
    requiredNodeVersion: nodeEngineRequirement,
    serverVersion: PKG_VERSION
  })
  startUnsupportedNodeMcp(config)
} else if (process.env.MCP_TRANSPORT === "resident-child") {
  void import("./resident/managed-child-main.js")
} else if (process.env.MCP_TRANSPORT === "stdio-resident") {
  void import("./resident/native-exec.js").then(({ startNativeResident }) => startNativeResident())
} else if (process.env.MCP_TRANSPORT === "resident-bootstrap") {
  void import("./resident/native-bootstrap-main.js")
} else if (process.env.MCP_TRANSPORT === "stdio-http") {
  void import("./resident/manual-adapter-main.js")
} else {
  void import("./runtime/server-startup.js").then(async ({ main }) => {
    const { runMain } = await import("@effect/platform-node/NodeRuntime")
    runMain(main)
  })
}
