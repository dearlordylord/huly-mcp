import { spawn } from "node:child_process"
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test, expect } from "vitest"
import { integrationMcpCall } from "../../scripts/integration-mcp-call.js"

for (const isError of [false, true]) {
  test(`keeps stdin open until the actual ${isError ? "error" : "success"} tool reply`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "hulymcp-open-stdin-"))
    const server = join(directory, "server.cjs")
    const marker = join(directory, "reply-state")
    await writeFile(
      server,
      `
      const readline=require('node:readline'); const fs=require('node:fs');
      if(process.env.INTEGRATION_FIXTURE_VALUE!=='typed-private-value')process.exit(1);
      let ended=false; process.stdin.on('end',()=>{ended=true});
      readline.createInterface({input:process.stdin}).on('line',line=>{
        const req=JSON.parse(line); if(req.id===undefined)return;
        if(req.method==='server/discover') process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:req.id,result:{supportedVersions:['2026-07-28'],capabilities:{tools:{}},_meta:{'io.modelcontextprotocol/serverInfo':{name:'fixture',version:'1.0.0'},'io.modelcontextprotocol/serverCapabilities':{tools:{}}}}})+'\\n');
        else if(req.method==='tools/list') process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:req.id,result:{resultType:'complete',ttlMs:0,cacheScope:'private',tools:[{name:'move_issue',inputSchema:{type:'object'}}]}})+'\\n');
        else if(req.method==='tools/call') setImmediate(()=>{fs.writeFileSync(${JSON.stringify(marker)},String(ended));process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:req.id,result:{resultType:'complete',isError:${isError},content:[{type:'text',text:${JSON.stringify(isError ? "fixture failure" : '{"received":true}')}}]}})+'\\n')});
        else process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:req.id,result:{protocolVersion:'2025-11-25',serverInfo:{name:'fixture',version:'1.0.0'},capabilities:{tools:{}}}})+'\\n');
      });
    `
    )
    try {
      const reply = await integrationMcpCall(["move_issue", "{}"], {
        command: process.execPath,
        args: [server],
        environment: { INTEGRATION_FIXTURE_VALUE: "typed-private-value", ABSENT_FIXTURE_VALUE: undefined }
      })
      expect(reply.result.isError).toBe(isError)
      if (isError) expect(reply.result.content[0].text).toBe("fixture failure")
      else expect(JSON.parse(reply.result.content[0].text)).toEqual({ received: true })
      expect(await readFile(marker, "utf8")).toBe("false")
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
}

test("actual bundled entry rejects missing arguments without launching Huly", async () => {
  const child = spawn(process.execPath, ["scripts/run-bundled.mjs", "scripts/integration-mcp-call-main.ts"], {
    stdio: ["ignore", "pipe", "pipe"]
  })
  const stdout: Array<Buffer> = []
  const stderr: Array<Buffer> = []
  child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk))
  child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk))
  const deadline = setTimeout(() => child.kill("SIGKILL"), 10000)
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
})

test("invalid tool arguments fail at the boundary before any executable starts", async () => {
  await expect(
    integrationMcpCall(["move_issue", "[]"], { command: "/nonexistent-mcp-fixture", args: [], environment: {} })
  ).rejects.toThrow("failed during input")
})

for (const scenario of ["unknown-tool", "malformed-reply"] as const) {
  test(`${scenario} refuses without mutation retry and closes the real connection`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "hulymcp-negative-stdio-"))
    const server = join(directory, "server.cjs")
    const calls = join(directory, "calls")
    const closed = join(directory, "closed")
    await writeFile(
      server,
      `
      const fs=require('node:fs');const readline=require('node:readline');
      process.stdin.on('end',()=>fs.writeFileSync(${JSON.stringify(closed)},'closed'));
      readline.createInterface({input:process.stdin}).on('line',line=>{
        const req=JSON.parse(line);if(req.id===undefined)return;
        const send=result=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:req.id,result})+'\\n');
        if(req.method==='server/discover')send({supportedVersions:['2026-07-28'],capabilities:{tools:{}}});
        else if(req.method==='tools/list')send({resultType:'complete',ttlMs:0,cacheScope:'private',tools:${JSON.stringify(scenario === "unknown-tool" ? [] : [{ name: "move_issue", inputSchema: { type: "object" } }])}});
        else if(req.method==='tools/call'){fs.appendFileSync(${JSON.stringify(calls)},'call\\n');send({resultType:'complete',isError:false,content:[{type:'text',text:'not JSON'}]});}
      });
    `
    )
    try {
      await expect(
        integrationMcpCall(["move_issue", "{}"], { command: process.execPath, args: [server], environment: {} })
      ).rejects.toThrow(`failed during ${scenario === "unknown-tool" ? "call" : "reply"}`)
      expect(await readFile(closed, "utf8")).toBe("closed")
      if (scenario === "unknown-tool") await expect(readFile(calls)).rejects.toMatchObject({ code: "ENOENT" })
      else expect(await readFile(calls, "utf8")).toBe("call\n")
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
}
