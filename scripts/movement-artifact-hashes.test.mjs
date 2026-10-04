import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,chmod,rm,symlink} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {snapshotEvidenceArtifacts,auditEvidenceArtifacts} from './movement-artifact-hashes.mjs'
const fixture=async check=>{const directory=await mkdtemp(`${tmpdir()}/movement-artifacts-`);await chmod(directory,0o700);try{await check(directory)}finally{await rm(directory,{recursive:true})}}
test('nested empty custody directory and regular file share one audited snapshot',()=>fixture(async directory=>{
 await mkdir(directory+'/custody',{mode:0o700})
 await writeFile(directory+'/report.json','report',{mode:0o600})
 const snapshot=await snapshotEvidenceArtifacts(directory)
 assert.deepEqual(snapshot.directories,[{path:'custody',mode:0o700}])
 assert.match(snapshot.files['report.json'],/^[a-f0-9]{64}$/)
 assert.deepEqual(await auditEvidenceArtifacts(directory,snapshot),{filesStable:true,directoriesStable:true})
 await writeFile(directory+'/report.json','changed')
 assert.deepEqual(await auditEvidenceArtifacts(directory,snapshot),{filesStable:false,directoriesStable:true})
}))
test('added and removed empty directories invalidate the directory audit',()=>fixture(async directory=>{
 const empty=await snapshotEvidenceArtifacts(directory)
 await mkdir(directory+'/custody',{mode:0o700})
 assert.deepEqual(await auditEvidenceArtifacts(directory,empty),{filesStable:true,directoriesStable:false})
 const populated=await snapshotEvidenceArtifacts(directory)
 await rm(directory+'/custody',{recursive:true})
 assert.deepEqual(await auditEvidenceArtifacts(directory,populated),{filesStable:true,directoriesStable:false})
}))
test('symlinks and public files cannot enter an owned private snapshot',()=>fixture(async directory=>{
 await writeFile(directory+'/report','report',{mode:0o600})
 await symlink(directory+'/report',directory+'/link')
 await assert.rejects(snapshotEvidenceArtifacts(directory),/ownership unavailable/)
 await rm(directory+'/link')
 await chmod(directory+'/report',0o644)
 await assert.rejects(snapshotEvidenceArtifacts(directory),/file unavailable/)
}))

test('prototype-shaped filename remains an own hashed artifact and tampering fails',()=>fixture(async directory=>{
 await writeFile(directory+'/__proto__','original',{mode:0o600})
 const snapshot=await snapshotEvidenceArtifacts(directory)
 assert.equal(Object.hasOwn(snapshot.files,'__proto__'),true)
 assert.equal(Object.keys(snapshot.files).length,1)
 assert.match(snapshot.files.__proto__,/^[a-f0-9]{64}$/)
 assert.deepEqual(await auditEvidenceArtifacts(directory,snapshot),{filesStable:true,directoriesStable:true})
 await writeFile(directory+'/__proto__','changed')
 assert.deepEqual(await auditEvidenceArtifacts(directory,snapshot),{filesStable:false,directoriesStable:true})
}))
