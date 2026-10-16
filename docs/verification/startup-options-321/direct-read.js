// Read-only adapter experiment: no model acquisition on the direct REST branch.
import { Effect, Redacted, Schema } from 'effect';
import { HulyConfigService } from '../../../src/config/config.ts';
import { ProjectSummarySchema } from '../../../src/domain/schemas/projects.ts';
import { createRestClient,createRestTxOperations,getWorkspaceToken,loadServerConfig } from '@hcengineering/api-client';
import { tracker } from '../../../src/huly/huly-plugins.ts';
import { SortingOrder } from '@hcengineering/core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
async function main(){
 const config=await Effect.runPromise(HulyConfigService.pipe(Effect.provide(HulyConfigService.layer)));
 const rows=[];
 const parse=Schema.decodeUnknownSync(Schema.Array(ProjectSummarySchema));
 for(let trial=0;trial<3;trial++){
  const results=[];
  for(const mode of trial%2?['full','direct']:['direct','full']){
   const t=performance.now();const serverConfig=await loadServerConfig(config.url);
   const auth=config.auth._tag==='token'?{token:Redacted.value(config.auth.token),workspace:config.workspace}:{email:config.auth.email,password:Redacted.value(config.auth.password),workspace:config.workspace};
   const selected=await getWorkspaceToken(config.url,auth,serverConfig);
   const client=mode==='full'?await createRestTxOperations(selected.endpoint,selected.workspaceId,selected.token,true):createRestClient(selected.endpoint,selected.workspaceId,selected.token);
   try{
    const docs=await client.findAll(tracker.class.Project,{archived:false},{limit:200,sort:{name:SortingOrder.Ascending}});
    const parsed=parse(docs.map(p=>({identifier:p.identifier,name:p.name,description:p.description||undefined,archived:p.archived})));
    results.push(parsed);rows.push({mode,trial,discoveryAndReadMs:performance.now()-t,projectCount:parsed.length});
   }finally{await client.close?.()}
  }
  assert.deepEqual(results[0],results[1]);
 }
 fs.writeFileSync('docs/verification/startup-options-321/direct-read.json',JSON.stringify(rows,null,2));console.log('PASS direct REST and full-model project summaries match in 3 alternating pairs');
}
main().catch(()=>{console.error('Direct REST experiment failed; payload diagnostics suppressed');process.exitCode=1});
