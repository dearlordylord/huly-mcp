import { mkdtemp, readFile, writeFile, chmod, stat, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect, Schema } from "effect"
import { expect, test } from "vitest"
import { integrationMcpCall } from "../../scripts/integration-mcp-call.js"
import { prepareIntegrationMcpPrior } from "../../scripts/integration-mcp-prior-prepare.js"
import { makePriorIdentity, readPriorCache, PriorCacheSchema } from "../../scripts/integration-mcp-prior.js"

const fixture = async () => {
  const directory = await mkdtemp(join(tmpdir(), "hulymcp-native-prior-"))
  await chmod(directory, 0o700)
  const entry = join(directory, "server.cjs")
  const events = join(directory, "events")
  await writeFile(
    entry,
    `const fs=require('node:fs');const readline=require('node:readline');
fs.appendFileSync(${JSON.stringify(events)},JSON.stringify({event:'spawn',pid:process.pid})+'\\n');
let ended=false;process.stdin.on('end',()=>{ended=true});
readline.createInterface({input:process.stdin}).on('line',line=>{
 const request=JSON.parse(line);if(request.id===undefined)return;
 fs.appendFileSync(${JSON.stringify(events)},JSON.stringify({event:request.method,pid:process.pid})+'\\n');
 const result=request.method==='server/discover'?{supportedVersions:['2026-07-28'],capabilities:{tools:{}}}:request.method==='tools/list'?{resultType:'complete',ttlMs:0,cacheScope:'private',tools:[{name:'move_issue',inputSchema:{type:'object'}}]}:{resultType:'complete',content:[{type:'text',text:JSON.stringify({stdinEnded:ended})}]};
 process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,result})+'\\n');
});`
  )
  return {
    directory,
    entry,
    events,
    options: {
      command: process.execPath,
      args: [entry],
      environment: { HULY_TOOL_MODE: "native", HULY_TOKEN: "private-fixture-token" }
    }
  }
}
const parseEvents = (input: unknown) =>
  Schema.decodeUnknownSync(Schema.Array(Schema.Struct({ event: Schema.String, pid: Schema.Int })))(input)

test(
  "prepares once, skips disposable discovery, and retains a fresh closed stdio child per actual call",
  { timeout: 15_000 },
  async () => {
    const setup = await fixture()
    try {
      const cache = await Effect.runPromise(prepareIntegrationMcpPrior(setup.directory, setup.options))
      expect((await stat(cache)).mode & 0o777).toBe(0o600)
      const identity = await Effect.runPromise(makePriorIdentity(setup.options))
      const prior = await Effect.runPromise(readPriorCache(cache, identity))
      for (let index = 0; index < 2; index++) {
        const reply = await integrationMcpCall(["move_issue", "{}"], { ...setup.options, prior })
        expect(JSON.parse(reply.result.content[0].text)).toEqual({ stdinEnded: false })
      }
      const events = parseEvents(
        (await readFile(setup.events, "utf8"))
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
      )
      expect(events.filter((row) => row.event === "spawn")).toHaveLength(4)
      expect(events.filter((row) => row.event === "server/discover")).toHaveLength(1)
      expect(events.filter((row) => row.event === "tools/list")).toHaveLength(2)
      expect(events.filter((row) => row.event === "tools/call")).toHaveLength(2)
      expect(new Set(events.filter((row) => row.event === "tools/call").map((row) => row.pid)).size).toBe(2)
      for (const row of events.filter((row) => row.event === "spawn")) expect(() => process.kill(row.pid, 0)).toThrow()
      expect(await readFile(cache, "utf8")).not.toContain("private-fixture-token")
    } finally {
      await rm(setup.directory, { recursive: true, force: true })
    }
  }
)

for (const change of ["context", "artifact", "commit", "malformed", "version", "permissions"]) {
  test(`rejects ${change} cache before any tool call`, { timeout: 15_000 }, async () => {
    const setup = await fixture()
    try {
      const cache = await Effect.runPromise(prepareIntegrationMcpPrior(setup.directory, setup.options))
      const identity = await Effect.runPromise(makePriorIdentity(setup.options))
      const before = await readFile(setup.events, "utf8")
      if (change === "artifact") await writeFile(setup.entry, "// changed artifact")
      if (change === "malformed") await writeFile(cache, '{"private":"private-fixture-token"}')
      if (change === "permissions") await chmod(cache, 0o644)
      if (change === "commit" || change === "version") {
        const input: unknown = await readFile(cache, "utf8")
        const parsed = Schema.decodeUnknownSync(Schema.fromJsonString(PriorCacheSchema))(input)
        const updated =
          change === "commit"
            ? { ...parsed, identity: { ...parsed.identity, commit: "0".repeat(40) } }
            : { ...parsed, discover: { ...parsed.discover, supportedVersions: ["2025-11-25"] } }
        await writeFile(cache, JSON.stringify(updated))
      }
      const current =
        change === "context"
          ? await Effect.runPromise(
              makePriorIdentity({
                ...setup.options,
                environment: { ...setup.options.environment, HULY_TOKEN: "different-private-token" }
              })
            )
          : change === "artifact"
            ? await Effect.runPromise(makePriorIdentity(setup.options))
            : identity
      const failure = await Effect.runPromise(readPriorCache(cache, current).pipe(Effect.flip))
      expect(failure._tag).toBe("IntegrationMcpPriorError")
      expect(JSON.stringify(failure)).not.toContain("private-fixture-token")
      expect(await readFile(setup.events, "utf8")).toBe(before)
    } finally {
      await rm(setup.directory, { recursive: true, force: true })
    }
  })
}
