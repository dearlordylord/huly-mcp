const fs=require('node:fs');const assert=require('node:assert/strict');const local=require('node:module').createRequire('/tmp/hulymcp-perf-startup/package.json');const {Client}=local('@modelcontextprotocol/client');const {StdioClientTransport,getDefaultEnvironment}=local('@modelcontextprotocol/client/stdio');
const results=[];
(async()=>{
 for(const mode of ['auto','native']){
  const values=[];
  for(const variant of ['baseline','trace']){
   const trace=[];const env={...getDefaultEnvironment(),...Object.fromEntries(['HULY_URL','HULY_WORKSPACE','HULY_EMAIL','HULY_PASSWORD','HULY_TOKEN'].filter(k=>process.env[k]).map(k=>[k,process.env[k]])),HULY_TOOL_MODE:mode,HULY_MCP_TELEMETRY:'0'};
   const tr=new StdioClientTransport({command:process.execPath,args:[__dirname+'/'+variant+'.cjs'],env,stderr:'pipe'});tr.stderr?.on('data',b=>{for(const line of b.toString().split('\n'))if(line.startsWith('[GROUP321]'))trace.push(line.slice(11))});
   const c=new Client({name:'codex',version:'0.163.0'},{versionNegotiation:{mode:'legacy'}});
   try{await c.connect(tr);const tools=await c.listTools();const before=[...trace];const call=await c.callTool(mode==='auto'?{name:'invoke_tool',arguments:{toolName:'list_projects',arguments:{}}}:{name:'list_projects',arguments:{}});assert.notEqual(call.isError,true);values.push({tools,call});results.push({mode,variant,before,after:trace});}finally{await tr.close()}
  }
  assert.deepEqual(values[0],values[1]);console.log('PASS exact '+mode+' listing and project result parity');
 }
 const traces=results.filter(r=>r.variant==='trace');for(const r of traces){assert(!r.before.includes('projects.ts'));assert(r.after.includes('projects.ts'));assert(!r.after.includes('issues.ts'));}
 fs.writeFileSync(__dirname+'/trace-parity.json',JSON.stringify(results,null,2));console.log('PASS first project call does not evaluate Issues tool group');
})().catch(()=>{console.error('Trace/parity assertion failed; payloads suppressed');process.exitCode=1});
