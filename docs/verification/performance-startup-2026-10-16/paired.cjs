const {spawnSync}=require('node:child_process');const fs=require('node:fs');const all=[];
for(let round=0;round<4;round++)for(const mode of ['auto','native'])for(const version of (round%2?['optimized','baseline']:['baseline','optimized'])){
 const phase='paired-'+round+'-'+mode+'-'+version;
 const env={...process.env,PERF_TRIALS:'1',PERF_MODE:mode,PERF_PHASE:phase,PERF_ENTRY:'/tmp/hulymcp-perf-startup/dist/'+(version==='baseline'?'perf-baseline.cjs':'index.cjs')};
 const p=spawnSync(process.execPath,['/tmp/hulymcp-perf-evidence/benchmark.cjs'],{env,encoding:'utf8'});if(p.status!==0)throw new Error(p.stderr+p.stdout);
 const row=JSON.parse(p.stdout.trim());all.push({...row,version,round});console.log(JSON.stringify(all.at(-1)));
}
fs.writeFileSync('/tmp/hulymcp-perf-evidence/paired.json',JSON.stringify(all,null,2));
