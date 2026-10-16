const fs=require('node:fs');const assert=require('node:assert/strict');
const root='/tmp/hulymcp-perf-startup';const dir=__dirname;
const local=require('node:module').createRequire(root+'/package.json');
const {Client}=local('@modelcontextprotocol/client');
const {StdioClientTransport,getDefaultEnvironment}=local('@modelcontextprotocol/client/stdio');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const rows=[];const catalogs={};
async function run(variant,delay,trial,network=true){
 const started=performance.now();
 const env={...getDefaultEnvironment(),...(network?Object.fromEntries(['HULY_URL','HULY_WORKSPACE','HULY_EMAIL','HULY_PASSWORD','HULY_TOKEN'].filter(k=>process.env[k]).map(k=>[k,process.env[k]])):{HULY_URL:'http://127.0.0.1:9',HULY_TOKEN:'nonsecret-benchmark',HULY_WORKSPACE:'benchmark'}),HULY_TOOL_MODE:'auto',HULY_MCP_TELEMETRY:'0'};
 const transport=new StdioClientTransport({command:process.execPath,args:[dir+'/'+variant+'.cjs'],env,stderr:'pipe'});transport.stderr?.on('data',()=>{});
 const client=new Client({name:'codex',version:'0.163.0'},{versionNegotiation:{mode:'legacy'}});
 try{
  await client.connect(transport,{timeout:20000});const handshakeMs=performance.now()-started;
  const listing=await client.listTools();const catalogMs=performance.now()-started;assert.equal(listing.tools.length,6);
  if(catalogs.auto)assert.deepEqual(listing,catalogs.auto);else catalogs.auto=listing;
  const searches=await client.callTool({name:'search_tools',arguments:{query:'list projects',limit:5}});assert.notEqual(searches.isError,true);
  if(catalogs.search)assert.deepEqual(searches,catalogs.search);else catalogs.search=searches;
  await sleep(delay);const calls=[];
  for(let i=0;i<(network?3:0);i++){const t=performance.now();const result=await client.callTool({name:'invoke_tool',arguments:{toolName:'list_projects',arguments:{}}},{timeout:20000});assert.notEqual(result.isError,true);calls.push(performance.now()-t);}
  const usage=local('node:child_process').execFileSync('ps',['-p',String(transport.pid),'-o','rss=,time='],{encoding:'utf8'}).trim();
  const row={variant,delay,trial,network,handshakeMs,catalogMs,calls,usage};rows.push(row);console.log(JSON.stringify(row));return row;
 }finally{await transport.close()}
}
(async()=>{
 if(process.env.PERF_VARIANTS){for(let trial=0;trial<3;trial++)for(const delay of [0,2000])for(const variant of (trial%2?process.env.PERF_VARIANTS.split(',').reverse():process.env.PERF_VARIANTS.split(',')))await run(variant,delay,trial);fs.writeFileSync(dir+'/'+(process.env.PERF_OUTPUT||'narrow-comparison.json'),JSON.stringify(rows,null,2));return;}
 for(let trial=0;trial<3;trial++)for(const delay of [0,2000])for(const variant of (trial%2?['background-light','light','background','lazy','baseline']:['baseline','lazy','background','light','background-light']))await run(variant,delay,trial);
 fs.writeFileSync(dir+'/comparison.json',JSON.stringify(rows,null,2));
 for(const variant of ['baseline','lazy','background']){const t=performance.now();const results=await Promise.all(Array.from({length:10},(_,i)=>run(variant,0,i,false)));console.log(JSON.stringify({concurrent:variant,wallMs:performance.now()-t,catalogMs:results.map(r=>r.catalogMs)}));}
 fs.writeFileSync(dir+'/comparison.json',JSON.stringify(rows,null,2));
})().catch(()=>{fs.writeFileSync(dir+'/comparison.json',JSON.stringify(rows,null,2));console.error('Comparison failed; payload diagnostics suppressed');process.exitCode=1});
