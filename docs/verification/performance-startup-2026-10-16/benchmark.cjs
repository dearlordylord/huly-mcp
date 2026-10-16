const {createRequire}=require('node:module');
const fs=require('node:fs');const assert=require('node:assert/strict');
const root='/tmp/hulymcp-perf-startup';const local=createRequire(root+'/package.json');
const {Client}=local('@modelcontextprotocol/client');const {StdioClientTransport,getDefaultEnvironment}=local('@modelcontextprotocol/client/stdio');
const entry=process.env.PERF_ENTRY||root+'/dist/index.cjs';const trials=Number(process.env.PERF_TRIALS||5);const phase=process.env.PERF_PHASE||'baseline';
(async()=>{
const all=[];
for(const mode of (process.env.PERF_MODE?[process.env.PERF_MODE]:['auto','native']))for(let trial=0;trial<trials;trial++){
 const started=performance.now();
 const transport=new StdioClientTransport({command:process.execPath,args:[...(process.env.PERF_CPU?['--cpu-prof','--cpu-prof-dir=/tmp/hulymcp-perf-evidence/profiles']:[]),entry],env:{...getDefaultEnvironment(),LAZY_ENVS:'false',...(process.env.PERF_AUTH==='profile'?{HULY_PROFILE:'macos-pr319-completion'}:{HULY_URL:'http://127.0.0.1:9',HULY_WORKSPACE:'startup-benchmark',HULY_TOKEN:'benchmark-nonsecret-sentinel'}),HULY_MCP_TELEMETRY:'0',HULY_TOOL_MODE:mode},stderr:'pipe'});
 let stderrBytes=0;transport.stderr?.on('data',b=>stderrBytes+=b.length);
 const client=new Client({name:'codex',version:'0.163.0'},{versionNegotiation:{mode:'legacy'}});
 try{
  await client.connect(transport,{timeout:30000});const handshake=performance.now()-started;
  const tools=await client.listTools();const listing=performance.now()-started;
  assert.equal(tools.tools.length,mode==='auto'?6:606);
  const times=[];if(mode==='auto')for(let i=0;i<10;i++){const t=performance.now();const result=await client.callTool({name:'search_tools',arguments:{query:'list projects',limit:5}});assert.notEqual(result.isError,true);times.push(performance.now()-t)}
  const row={mode,trial,handshakeMs:handshake,listMs:listing,tools:tools.tools.length,listBytes:Buffer.byteLength(JSON.stringify(tools)),searchMs:times,stderrBytes};all.push(row);console.log(JSON.stringify(row));
 }finally{await transport.close()}
}
fs.mkdirSync('/tmp/hulymcp-perf-evidence/'+phase,{recursive:true});fs.writeFileSync('/tmp/hulymcp-perf-evidence/'+phase+'/results.json',JSON.stringify(all,null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1});
