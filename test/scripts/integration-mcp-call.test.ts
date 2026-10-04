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
        environment: {}
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
