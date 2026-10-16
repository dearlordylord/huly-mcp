// Experimental build-time transformations only; production sources stay unchanged.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = '/tmp/hulymcp-perf-startup';
const out = path.join(root, 'docs/verification/startup-options-321');
const esbuild = require(path.join(root, 'node_modules/esbuild'));
const pkg = require(path.join(root, 'package.json'));
const common = {absWorkingDir:root,bundle:true,platform:'node',format:'cjs',logLevel:'warning',external:['ws','@napi-rs/keyring','dbus-next'],define:{PKG_VERSION:JSON.stringify(pkg.version),NODE_ENGINE_REQUIREMENT:JSON.stringify(pkg.engines.node)}};
(async()=>{
 await esbuild.build({...common,stdin:{contents:'import {allTools} from "./src/mcp/tools/index.ts"; console.log(JSON.stringify(allTools))',resolveDir:root},outfile:out+'/snapshot.cjs'});
 const catalog=JSON.parse(cp.execFileSync(process.execPath,[out+'/snapshot.cjs'],{maxBuffer:16e6}).toString());
 fs.writeFileSync(out+'/catalog.json',JSON.stringify(catalog));
 const original=fs.readFileSync(root+'/src/mcp/tools/index.ts','utf8');
 const imports=[...original.matchAll(/import \{ (\w+Tools) \} from "(.+)"/g)];
 const loaders=imports.map(([,name,file])=>`${JSON.stringify(name)}: () => import(${JSON.stringify(file)}).then(m=>m.${name})`).join(',\n');
 // Resolve each tool's group from the exact production exports rather than category guesses.
 await esbuild.build({...common,stdin:{contents:imports.map(([,name,file])=>`import {${name}} from ${JSON.stringify('./src/mcp/tools/'+file.replace('./','').replace('.js','.ts'))};`).join('\n')+'\nconsole.log(JSON.stringify({'+imports.map(([,name])=>`${name}:${name}.map(t=>t.name)`).join(',')+'}))',resolveDir:root},outfile:out+'/groups.cjs'});
 const groups=JSON.parse(cp.execFileSync(process.execPath,[out+'/groups.cjs'],{maxBuffer:16e6}).toString());
 const groupByName=Object.fromEntries(Object.entries(groups).flatMap(([g,names])=>names.map(n=>[n,g])));
 const schemaDir=root+'/src/domain/schemas';const exportsMap={};
 for(const file of fs.readdirSync(schemaDir).filter(f=>f.endsWith('.ts')&&!f.includes('.test.'))){const text=fs.readFileSync(schemaDir+'/'+file,'utf8');for(const match of text.matchAll(/export\s+(?:declare\s+)?(?:const|function|class|interface|type|enum)\s+(\w+)/g))exportsMap[match[1]]=schemaDir+'/'+file;}
 const narrow=(contents,filename)=>contents.replace(/import\s*\{([^}]+)\}\s*from\s*["']([^"']*domain\/schemas(?:\/index)?\.js|\.\/schemas(?:\/index)?\.js)["']/g,(whole,names)=>{const entries=names.split(',').map(s=>s.trim()).filter(Boolean);if(entries.some(n=>!exportsMap[n.replace(/^type\s+/,'').split(/\s+as\s+/)[0]]))return whole;return entries.map(n=>{const key=n.replace(/^type\s+/,'').split(/\s+as\s+/)[0];return `import {${n}} from ${JSON.stringify(exportsMap[key])};`;}).join('\n');});
 for(const variant of (process.env.BUILD_VARIANTS?.split(',')??['baseline','lazy','background','background-light','light','narrow','narrow-background'])){
  const plugins=[{name:'experiment-321',setup(build){
   if(!['baseline','light'].includes(variant)) build.onLoad({filter:/src\/mcp\/tools\/index\.ts$/},()=>({loader:'ts',contents:`
import {Effect} from 'effect';
import {createMissingArgumentsError,createUnexpectedArgumentsError,isEmptyArgumentsObject,isNoArgumentTool,requiresArgumentsObject,resolveAnnotations} from './registry.js';
const definitions=${JSON.stringify(catalog)};
const groupByName=${JSON.stringify(groupByName)};
const loaders={${loaders}};
const pending=new Map();
const load=(name)=>{const group=groupByName[name];if(!pending.has(group))pending.set(group,loaders[group]());return pending.get(group).then(ts=>ts.find(t=>t.name===name));};
globalThis.__perfPreload=()=>Promise.all(Object.keys(loaders).map(g=>load(groupsFirst[g])));
const groupsFirst=${JSON.stringify(Object.fromEntries(Object.entries(groups).map(([g,n])=>[g,n[0]])))};
export const allTools=definitions.map(d=>({...d,handler:async(...args)=>(await load(d.name)).handler(...args),operation:{...d,execute:(...args)=>Effect.flatMap(Effect.promise(()=>load(d.name)),t=>t.operation.execute(...args))}}));
${original.slice(original.indexOf('export type McpToolName'))}`}));
   if(variant.includes('light')) build.onLoad({filter:/src\/huly\/client\.ts$/},a=>({loader:'ts',contents:fs.readFileSync(a.path,'utf8').replace('LOAD_FULL_MODEL_FOR_AUTHORITATIVE_METADATA = true','LOAD_FULL_MODEL_FOR_AUTHORITATIVE_METADATA = false')}));
   if(variant.includes('background')) build.onLoad({filter:/src\/index\.ts$/},a=>({loader:'ts',contents:fs.readFileSync(a.path,'utf8').replace('yield* server.run()',`const timer=setTimeout(()=>{void resolveClients();${variant.includes('model-background')?'':'void globalThis.__perfPreload?.();'}},150);\n yield* server.run().pipe(Effect.ensuring(Effect.sync(()=>clearTimeout(timer))))`)}));
   if(variant.startsWith('narrow'))build.onLoad({filter:/src\/.*\.ts$/},a=>({loader:'ts',contents:narrow(fs.readFileSync(a.path,'utf8'),a.path)}));
   if(variant.startsWith('trace'))build.onLoad({filter:/src\/mcp\/tools\/.*\.ts$/},a=>({loader:'ts',contents:`process.stderr.write('[GROUP321] '+${JSON.stringify(path.basename(a.path))}+'\\n');\n`+fs.readFileSync(a.path,'utf8')}));
   if(variant.startsWith('trace'))build.onLoad({filter:/src\/huly\/sdk-deps\.ts$/},a=>({loader:'ts',contents:fs.readFileSync(a.path,'utf8').replace('    createRestTxOperations,',`    createRestTxOperations: (...args)=>{process.stderr.write('[ACQUIRE321] start\\n');return createRestTxOperations(...args).then(v=>{process.stderr.write('[ACQUIRE321] ready\\n');return v})},`)}));
  }}];
  await esbuild.build({...common,entryPoints:['src/launcher.ts'],outfile:out+'/'+variant+'.cjs',metafile:true,plugins}).then(r=>fs.writeFileSync(out+'/'+variant+'.meta.json',JSON.stringify(r.metafile)));
  console.log('built '+variant);
 }
})();
