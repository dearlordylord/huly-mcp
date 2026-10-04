import { spawn } from "node:child_process"
import { once } from "node:events"
import { createServer } from "node:http"
import { createInterface } from "node:readline"
import { gzipSync } from "node:zlib"
import { Schema } from "effect"
import { expect, it } from "vitest"
import { GatewayEvent } from "../../scripts/issue-movement-concurrency/protocol.js"

for (const encoding of ["gzip", "snappy"]) {
  it(`preserves REST response semantics for a real HTTP ${encoding} upstream`, async () => {
    const json = Buffer.from('{"success":true}')
    // Snappy raw block: length varint followed by one literal tag and its bytes.
    const compressed = encoding === "gzip" ? gzipSync(json) : Buffer.concat([Buffer.from([json.length, (json.length - 1) * 4]), json])
    const upstream = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json", "content-encoding": encoding })
      response.end(compressed)
    })
    await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve))
    const address = upstream.address()
    if (address === null || typeof address === "string") throw new Error("Fixture upstream address unavailable")
    const gateway = spawn(process.execPath, [
      "node_modules/tsx/dist/cli.mjs", "scripts/issue-movement-concurrency/gateway.ts",
      JSON.stringify({ upstream: `http://127.0.0.1:${address.port}` })
    ], { stdio: ["pipe", "pipe", "ignore"] })
    const events = createInterface({ input: gateway.stdout })
    try {
      const [line] = await once(events, "line")
      const event = Schema.decodeUnknownSync(Schema.fromJsonString(GatewayEvent))(line)
      if (event.event !== "ready") throw new Error("Gateway did not become ready")
      const response = await fetch(`${event.url}/api/v1/find-all/workspace`)
      expect(response.status).toBe(200)
      expect(response.headers.get("content-encoding")).toBe(encoding === "snappy" ? "snappy" : null)
      expect(Buffer.from(await response.arrayBuffer())).toEqual(encoding === "snappy" ? compressed : json)
    } finally {
      gateway.stdin.write('{"command":"close"}\n')
      gateway.stdin.end()
      await once(gateway, "exit")
      events.close()
      upstream.closeAllConnections()
      await new Promise<void>((resolve, reject) => upstream.close((error) => error === undefined ? resolve() : reject(error)))
    }
  })
}
