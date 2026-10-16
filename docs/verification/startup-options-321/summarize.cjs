const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const median=a=>{const s=[...a].sort((a,b)=>a-b);return s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2};
const stats=a=>({n:a.length,median:median(a),min:Math.min(...a),max:Math.max(...a)});
const summary={};
for(const file of ['comparison.json','schema-comparison.json','final-comparison.json','baseline-final.json']){
 if(!fs.existsSync(path.join(__dirname,file)))continue;
 const rows=JSON.parse(fs.readFileSync(path.join(__dirname,file)));const groups={};
 for(const row of rows){const key=[row.variant,row.delay,row.network].join('/');(groups[key]??=[]).push(row)}
 summary[file]=Object.fromEntries(Object.entries(groups).map(([key,rows])=>[key,{catalogMs:stats(rows.map(x=>x.catalogMs)),...(rows[0].calls.length?{firstCallMs:stats(rows.map(x=>x.calls[0])),warmCallMs:stats(rows.flatMap(x=>x.calls.slice(1)))}:{}),...(rows[0].usage?{residentMiB:stats(rows.map(x=>Number(x.usage.split(/\s+/)[0])/1024))}:{})}]));
}
const model=JSON.parse(fs.readFileSync(path.join(__dirname,'model-parity.json')));
assert(model.some(r=>r.type==='parity'&&r.variant==='light'&&!r.equal));
assert(model.filter(r=>r.type==='parity'&&['lazy','narrow'].includes(r.variant)).every(r=>r.equal));
summary.modelParity=model.filter(r=>r.type==='parity');
const http=JSON.parse(fs.readFileSync(path.join(__dirname,'http-only.json'))).filter(r=>r.type==='http');
const direct=JSON.parse(fs.readFileSync(path.join(__dirname,'direct-read.json')));summary.directRead=Object.fromEntries(['direct','full'].map(mode=>[mode,stats(direct.filter(r=>r.mode===mode).map(r=>r.discoveryAndReadMs))]));
summary.http={firstCallMs:stats(http.filter(r=>r.connection===0).map(r=>r.callMs)),subsequentConnectionCallMs:stats(http.filter(r=>r.connection>0).map(r=>r.callMs)),subsequentConnectionCatalogMs:stats(http.filter(r=>r.connection>0).map(r=>r.catalogMs))};
fs.writeFileSync(path.join(__dirname,'summary.json'),JSON.stringify(summary,null,2));console.log('PASS evidence summary and parity assertions');
