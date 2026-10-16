const fs=require('node:fs');const cp=require('node:child_process');const assert=require('node:assert/strict');const net=require('node:net');
const local=require('node:module').createRequire('/tmp/hulymcp-perf-startup/package.json');
const {Client,StreamableHTTPClientTransport}=local('@modelcontextprotocol/client');const {StdioClientTransport,getDefaultEnvironment}=local('@modelcontextprotocol/client/stdio');
const out=__dirname;const results=[];const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const env={...getDefaultEnvironment(),...Object.fromEntries(['HULY_URL','HULY_WORKSPACE','HULY_EMAIL','HULY_PASSWORD','HULY_TOKEN'].filter(k=>process.env[k]).map(k=>[k,process.env[k]])),HULY_TOOL_MODE:'auto',HULY_MCP_TELEMETRY:'0'};
const mk=()=>new Client({name:'codex',version:'0.163.0'},{versionNegotiation:{mode:'legacy'}});
async function invoke(c,name){const t=performance.now();const r=await c.callTool({name:'invoke_tool',arguments:{toolName:name,arguments:{}}},{timeout:20000});return {ms:performance.now()-t,result:r};}
(async()=>{
 const models={};
 for(const variant of (process.env.HTTP_ONLY?[]:['baseline','light','lazy','narrow'])){
  const tr=new StdioClientTransport({command:process.execPath,args:[out+'/'+variant+'.cjs'],env,stderr:'pipe'});tr.stderr?.on('data',()=>{});const c=mk();
  try{await c.connect(tr);const t=performance.now();const resources=await c.listResources();const resourceMs=performance.now()-t;
   const ops={};for(const name of ['list_projects','list_notification_providers','list_notification_types','list_workbench_applications','list_viewlets','list_huly_classes']){const r=await invoke(c,name);ops[name]={isError:r.result.isError===true,bytes:JSON.stringify(r.result).length};models[variant]??={};models[variant][name]=r.result;}
   const row={type:'model-resource',variant,resourceMs,resourceCount:resources.resources.length,ops};results.push(row);console.log(JSON.stringify(row));
  }finally{await tr.close()}
 }
 for(const variant of ['light','lazy','narrow'])for(const [name,result] of Object.entries(models.baseline??{})) {try{assert.deepEqual(result,models[variant][name]);results.push({type:'parity',variant,name,equal:true})}catch{results.push({type:'parity',variant,name,equal:false})}}
 for(let trial=0;trial<(process.env.MODEL_ONLY?0:3);trial++){
  const port=18321+trial;const started=performance.now();const server=cp.spawn(process.execPath,[out+'/baseline.cjs'],{env:{...env,MCP_TRANSPORT:'http',MCP_HTTP_PORT:String(port)},stdio:'ignore'});
  try{
   await sleep(1500);
   const readinessWaitMs=performance.now()-started;
   for(let connection=0;connection<3;connection++){
    const endpoint='http://127.0.0.1:'+port+'/mcp';const protocol='2026-07-28';
    const post=async(method,params={})=>{const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':protocol,'mcp-method':method,...(params.name?{'mcp-name':params.name}:{})},body:JSON.stringify({jsonrpc:'2.0',id:connection+1,method,params:{...params,_meta:{'io.modelcontextprotocol/protocolVersion':protocol,'io.modelcontextprotocol/clientCapabilities':{},'io.modelcontextprotocol/clientInfo':{name:'codex',version:'0.163.0'}}}}),signal:AbortSignal.timeout(15000)});assert(response.ok);const reader=response.body.getReader();let text='';let parsed;try{for(;;){const chunk=await reader.read();if(chunk.done)break;text+=new TextDecoder().decode(chunk.value);const lines=text.split(/\r?\n/);const data=lines.find(l=>l.startsWith('data:'));try{parsed=JSON.parse(data?data.slice(5).trim():text);break}catch{}}}finally{await reader.cancel()}assert(parsed);assert.equal(parsed.error,undefined);return parsed.result;};
    const t=performance.now();await post('server/discover');await post('tools/list');const catalogMs=performance.now()-t;const start=performance.now();const result=await post('tools/call',{name:'invoke_tool',arguments:{toolName:'list_projects',arguments:{}}});assert.notEqual(result.isError,true);const row={type:'http',trial,connection,readinessWaitMs,catalogMs,callMs:performance.now()-start};results.push(row);console.log(JSON.stringify(row));
   }
  }finally{server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}
 }
 fs.writeFileSync(out+(process.env.HTTP_ONLY?'/http-only.json':process.env.MODEL_ONLY?'/model-parity.json':'/http-model.json'),JSON.stringify(results,null,2));
})().catch(e=>{fs.writeFileSync(out+(process.env.HTTP_ONLY?'/http-only.json':'/http-model.json'),JSON.stringify(results,null,2));console.error('HTTP/model experiment failed',e.name,String(e.message).slice(0,180));process.exitCode=1});
