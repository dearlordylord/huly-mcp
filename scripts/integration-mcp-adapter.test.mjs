import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { test } from "node:test"
const adapter = resolve("scripts/integration-mcp-adapter.sh")
const processTimeoutMilliseconds = 5000
const privateMarker = "PRIVATE_PAYLOAD_MUST_NOT_BE_LOGGED"
const envelope = (result) => JSON.stringify({ jsonrpc: "2.0", id: 2, result })
for (const [name, response, mode, expected, exit, processExit = 0] of [
  ["tool object", envelope({ content: [{ type: "text", text: '{"ok":true}' }] }), "call", '{"ok":true}', 0],
  ["false JSON", envelope({ isError: false, content: [{ type: "text", text: "false" }] }), "call", "false", 0],
  ["discovery", envelope({ tools: [{ name: "move_issue", inputSchema: { type: "object" } }] }), "list", undefined, 0],
  ["tool error", envelope({ isError: true, content: [{ type: "text", text: privateMarker }] }), "call", "", 1],
  ["process failure", envelope({ content: [{ type: "text", text: "{}" }] }), "call", "", 3, 3],
  ["nonboolean error", envelope({ isError: null, content: [{ type: "text", text: "{}" }] }), "call", "", 1],
  ["malformed", privateMarker, "call", "", 1],
  ["invalid inner JSON", envelope({ content: [{ type: "text", text: privateMarker }] }), "call", "", 1],
  ["multiple envelopes", `${envelope({ tools: [] })}\n${envelope({ tools: [] })}`, "list", "", 1],
  ["invalid discovery", envelope({ tools: [{ name: privateMarker }] }), "list", "", 1]
]) {
  test(`native Bash adapter ${name}`, (t) => {
    const directory = mkdtempSync(join(tmpdir(), "native-mcp-adapter-"))
    t.after(() => rmSync(directory, { recursive: true }))
    mkdirSync(join(directory, "scripts"))
    writeFileSync(join(directory, "response"), response)
    writeFileSync(join(directory, "scripts/run-bundled.mjs"), `import fs from 'node:fs'; fs.appendFileSync('calls', JSON.stringify(process.argv.slice(2))+'\\n'); process.stdout.write(fs.readFileSync('response')); process.exitCode=${processExit};`)
    const result = spawnSync("bash", ["-c", 'source "$1"; if [[ "$2" == list ]]; then movement_mcp_list_tools; else movement_mcp_call move_issue "{}"; fi', "adapter-test", adapter, mode], { cwd: directory, encoding: "utf8", timeout: processTimeoutMilliseconds })
    assert.equal(result.status, exit)
    if (expected !== undefined) assert.equal(result.stdout.trim(), expected)
    assert.ok(!result.stderr.includes(privateMarker))
    const calls = readFileSync(join(directory, "calls"), "utf8").trim().split("\n").map(JSON.parse)
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0], ["scripts/integration-mcp-call-main.ts", ...(mode === "list" ? ["--list-tools"] : ["move_issue", "{}"])])
  })
}
