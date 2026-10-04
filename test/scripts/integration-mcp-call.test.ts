import { spawn } from "node:child_process"
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test, expect } from "vitest"
import {
  integrationMcpCall,
  IntegrationMonotonicMilliseconds,
  type IntegrationElapsedMilliseconds,
  type IntegrationMcpPhase
} from "../../scripts/integration-mcp-call.js"

for (const isError of [false, true]) {
  test(`keeps stdin open until the actual ${isError ? "error" : "success"} tool reply`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "hulymcp-open-stdin-"))
    const server = join(directory, "server.cjs")
    const marker = join(directory, "reply-state")
    await writeFile(
      server,
      `
      const readline=require('node:readline'); const fs=require('node:fs');
      if(process.env.INTEGRATION_FIXTURE_VALUE!=='typed-private-value'||process.env.LAZY_ENVS!=='true')process.exit(1);
      let ended=false; process.stdin.on('end',()=>{ended=true});
      readline.createInterface({input:process.stdin}).on('line',line=>{
        const req=JSON.parse(line); if(req.id===undefined)return;
        if(req.method==='server/discover') process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:req.id,result:{supportedVersions:['2026-07-28'],capabilities:{tools:{}},_meta:{'io.modelcontextprotocol/serverInfo':{name:'fixture',version:'1.0.0'},'io.modelcontextprotocol/serverCapabilities':{tools:{}}}}})+'\\n');
        else if(req.method==='tools/list') process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:req.id,result:{resultType:'complete',ttlMs:0,cacheScope:'private',tools:[{name:'move_issue',inputSchema:{type:'object'}}]}})+'\\n');
        else if(req.method==='tools/call') setImmediate(()=>{fs.writeFileSync(${JSON.stringify(marker)},String(ended));process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:req.id,result:{resultType:'complete',isError:${isError},content:[{type:'text',text:${JSON.stringify(isError ? '{"code":"CONFIGURATION_ERROR","message":"Fixture client configuration unavailable"}' : '{"received":true}')}}]}})+'\\n')});
        else process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:req.id,result:{protocolVersion:'2025-11-25',serverInfo:{name:'fixture',version:'1.0.0'},capabilities:{tools:{}}}})+'\\n');
      });
    `
    )
    try {
      const events: Array<IntegrationMcpPhase> = []
      const clock = { value: 0 }
      const reply = await integrationMcpCall(
        ["move_issue", "{}"],
        {
          command: process.execPath,
          args: [server],
          environment: {
            INTEGRATION_FIXTURE_VALUE: "typed-private-value",
            ABSENT_FIXTURE_VALUE: undefined,
            LAZY_ENVS: "false"
          }
        },
        {
          now: () => {
            clock.value += 0.25
            return IntegrationMonotonicMilliseconds.make(clock.value)
          },
          publish: (event) => {
            events.push(event)
          }
        }
      )
      expect(events.map((event) => event.phase)).toEqual([
        "connect-start",
        "connect-ready",
        "list-start",
        "list-ready",
        "call-start",
        "call-reply",
        "close-start",
        "closed"
      ])
      expect(events.map((event) => event.elapsedMilliseconds)).toEqual([0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2])
      expect(JSON.stringify(events)).not.toContain("typed-private-value")
      expect(JSON.stringify(events)).not.toContain("move_issue")
      expect(reply.result.isError).toBe(isError)
      if (isError)
        expect(JSON.parse(reply.result.content[0].text)).toEqual({
          code: "CONFIGURATION_ERROR",
          message: "Fixture client configuration unavailable"
        })
      else expect(JSON.parse(reply.result.content[0].text)).toEqual({ received: true })
      expect(await readFile(marker, "utf8")).toBe("false")
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
}

const BUNDLED_ENTRY_TIMEOUT_MILLISECONDS = 10_000
const BUNDLED_ENTRY_TEST_TIMEOUT_MILLISECONDS = 15_000

test(
  "actual bundled entry rejects missing arguments without launching Huly",
  { timeout: BUNDLED_ENTRY_TEST_TIMEOUT_MILLISECONDS },
  async () => {
    const child = spawn(process.execPath, ["scripts/run-bundled.mjs", "scripts/integration-mcp-call-main.ts"], {
      stdio: ["ignore", "pipe", "pipe"]
    })
    const stdout: Array<Buffer> = []
    const stderr: Array<Buffer> = []
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk))
    const deadline = setTimeout(() => child.kill("SIGKILL"), BUNDLED_ENTRY_TIMEOUT_MILLISECONDS)
    try {
      const code = await new Promise<number | null>((done, fail) => {
        child.once("error", fail)
        child.once("close", done)
      })
      expect(code).toBe(1)
      expect(Buffer.concat(stdout).toString()).toBe("")
      expect(Buffer.concat(stderr).toString()).toContain(
        "Integration MCP call failed during input; no automatic mutation retry performed."
      )
    } finally {
      clearTimeout(deadline)
      if (child.exitCode === null) child.kill("SIGKILL")
    }
  }
)

test("invalid tool arguments fail at the boundary before any executable starts", async () => {
  await expect(
    integrationMcpCall(["move_issue", "[]"], { command: "/nonexistent-mcp-fixture", args: [], environment: {} })
  ).rejects.toThrow("failed during input")
})

for (const scenario of [
  "unknown-tool",
  "malformed-reply",
  "connect-timeout",
  "list-timeout",
  "call-timeout"
] as const) {
  test(`${scenario} refuses without mutation retry and closes the real connection`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "hulymcp-negative-stdio-"))
    const server = join(directory, "server.cjs")
    const calls = join(directory, "calls")
    const closed = join(directory, "closed")
    const requests = join(directory, "requests")
    const pidFile = join(directory, "server.pid")
    await writeFile(
      server,
      `
      const fs=require('node:fs');const readline=require('node:readline');fs.writeFileSync(${JSON.stringify(pidFile)},String(process.pid));
      process.stdin.on('end',()=>fs.writeFileSync(${JSON.stringify(closed)},'closed'));
      readline.createInterface({input:process.stdin}).on('line',line=>{
        const req=JSON.parse(line);if(req.id===undefined)return;
        fs.appendFileSync(${JSON.stringify(requests)},req.method+'\\n');
        if(req.method===${JSON.stringify(scenario === "connect-timeout" ? "server/discover" : scenario === "list-timeout" ? "tools/list" : "unused")})return;
        const send=result=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:req.id,result})+'\\n');
        if(req.method==='server/discover')send({supportedVersions:['2026-07-28'],capabilities:{tools:{}}});
        else if(req.method==='tools/list')send({resultType:'complete',ttlMs:0,cacheScope:'private',tools:${JSON.stringify(scenario === "unknown-tool" ? [] : [{ name: "move_issue", inputSchema: { type: "object" } }])}});
        else if(req.method==='tools/call'){fs.appendFileSync(${JSON.stringify(calls)},'call\\n');if(${scenario === "call-timeout"})return;send({resultType:'complete',isError:false,content:[{type:'text',text:'not JSON'}]});}
      });
    `
    )
    const timers = {
      schedule: (callback: () => void, milliseconds: IntegrationElapsedMilliseconds) => {
        const timer = setTimeout(callback, milliseconds)
        const target =
          scenario === "connect-timeout"
            ? "server/discover"
            : scenario === "list-timeout"
              ? "tools/list"
              : scenario === "call-timeout"
                ? "tools/call"
                : undefined
        if (target !== undefined) {
          const observe = async (): Promise<void> => {
            if (!timer.hasRef()) return
            const contents = await readFile(requests, "utf8").catch(() => "")
            if (contents.includes(target)) {
              clearTimeout(timer)
              timer.unref()
              callback()
            } else if (!timer.hasRef()) return
            else
              setTimeout(() => {
                void observe()
              }, 20)
          }
          void observe()
        }
        return timer
      },
      cancel: (timer: ReturnType<typeof setTimeout>) => {
        clearTimeout(timer)
        timer.unref()
      }
    }
    try {
      await expect(
        integrationMcpCall(
          ["move_issue", "{}"],
          { command: process.execPath, args: [server], environment: {} },
          undefined,
          timers
        )
      ).rejects.toThrow(
        `failed during ${scenario === "unknown-tool" || scenario === "list-timeout" ? "list" : scenario === "connect-timeout" ? "connect" : scenario === "call-timeout" ? "call" : "reply"}`
      )
      const pid = Number(await readFile(pidFile, "utf8"))
      await expect
        .poll(() => {
          try {
            process.kill(pid, 0)
            return true
          } catch (error) {
            if (error instanceof Error && "code" in error && error.code === "ESRCH") return false
            throw error
          }
        })
        .toBe(false)
      if (scenario !== "connect-timeout") expect(await readFile(closed, "utf8")).toBe("closed")
      if (scenario === "unknown-tool" || scenario === "connect-timeout" || scenario === "list-timeout")
        await expect(readFile(calls)).rejects.toMatchObject({ code: "ENOENT" })
      else expect(await readFile(calls, "utf8")).toBe("call\n")
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
}
