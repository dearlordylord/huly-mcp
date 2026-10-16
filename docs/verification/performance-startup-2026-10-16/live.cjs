const fs=require('node:fs');const {createRequire}=require('node:module');const assert=require('node:assert/strict');const local=createRequire('/tmp/hulymcp-perf-startup/package.json');const {Client}=local('@modelcontextprotocol/client');const {StdioClientTransport,getDefaultEnvironment}=local('@modelcontextprotocol/client/stdio');
const secrets=[process.env.HULY_PASSWORD,process.env.HULY_TOKEN].filter(Boolean);const all=[];
(async()=>{for(const version of ['baseline','optimized'])for(const mode of ['auto','native']){
const env={...getDefaultEnvironment(),HULY_URL:process.env.HULY_URL,HULY_WORKSPACE:process.env.HULY_WORKSPACE,HULY_EMAIL:process.env.HULY_EMAIL,HULY_PASSWORD:process.env.HULY_PASSWORD,HULY_TOOL_MODE:mode,HULY_MCP_TELEMETRY:'0'};
const transport=new StdioClientTransport({command:process.execPath,args:['/tmp/hulymcp-perf-startup/dist/'+(version==='baseline'?'perf-baseline.cjs':'index.cjs')],env,stderr:'pipe'});transport.stderr?.on('data',()=>{});
const client=new Client({name:'codex',version:'0.163.0'},{versionNegotiation:{mode:'legacy'}});try{const t=performance.now();await client.connect(transport,{timeout:30000});const handshakeMs=performance.now()-t;await client.listTools();const timings=[];
for(let i=0;i<6;i++){const start=performance.now();const result=await client.callTool(mode==='auto'?{name:'invoke_tool',arguments:{toolName:'list_projects',arguments:{}}}:{name:'list_projects',arguments:{}},{}, {timeout:60000});const raw=JSON.stringify(result);assert(secrets.every(s=>!raw.includes(s)));assert.notEqual(result.isError,true);timings.push(performance.now()-start)}
const row={version,mode,handshakeMs,firstReadMs:timings[0],warmReadMs:timings.slice(1)};all.push(row);console.log(JSON.stringify(row));
}finally{await transport.close()}}
fs.writeFileSync('/tmp/hulymcp-perf-evidence/live.json',JSON.stringify(all,null,2));})().catch(e=>{console.error('Live benchmark failed; secret-bearing diagnostics suppressed');process.exitCode=1});
