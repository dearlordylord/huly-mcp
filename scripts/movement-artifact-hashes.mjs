import {createHash} from 'node:crypto'
import {lstat,realpath,readdir,readFile} from 'node:fs/promises'
import {Schema} from 'effect'
const PERMISSION_BITS=0o777,PRIVATE_DIRECTORY_MODE=0o700,PRIVATE_FILE_MODE=0o600
export const MovementArtifactSnapshotSchema=Schema.Struct({
 files:Schema.Record(Schema.String,Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/))),
 directories:Schema.Array(Schema.Struct({path:Schema.String,mode:Schema.Literal(PRIVATE_DIRECTORY_MODE)}))
})
// Filesystem failures reject this imperative-shell operation; callers fail the
// evidence audit rather than interpreting missing artifacts as success.
export const snapshotEvidenceArtifacts=async directory=>{
 const root=await lstat(directory)
 if(!root.isDirectory()||root.isSymbolicLink()||root.uid!==process.getuid?.()||(root.mode&PERMISSION_BITS)!==PRIVATE_DIRECTORY_MODE||await realpath(directory)!==directory)throw new Error('Evidence directory unavailable')
 const files={},directories=[]
 const visit=async(current,prefix)=>{
  for(const name of (await readdir(current)).sort()){
   const file=`${current}/${name}`,relative=prefix+name,stat=await lstat(file)
   if(stat.isSymbolicLink()||stat.uid!==process.getuid?.())throw new Error('Evidence ownership unavailable')
   if(stat.isDirectory()){
    if((stat.mode&PERMISSION_BITS)!==PRIVATE_DIRECTORY_MODE)throw new Error('Evidence directory permissions unavailable')
    directories.push({path:relative,mode:PRIVATE_DIRECTORY_MODE})
    await visit(file,relative+'/')
   }else if(stat.isFile()&&(stat.mode&PERMISSION_BITS)===PRIVATE_FILE_MODE){
    files[relative]=createHash('sha256').update(await readFile(file)).digest('hex')
   }else throw new Error('Evidence file unavailable')
  }
 }
 await visit(directory,'')
 return Schema.decodeUnknownSync(MovementArtifactSnapshotSchema)({files,directories})
}
export const auditEvidenceArtifacts=async(directory,input)=>{
 const expected=Schema.decodeUnknownSync(MovementArtifactSnapshotSchema)(input)
 const actual=await snapshotEvidenceArtifacts(directory)
 return {filesStable:JSON.stringify(actual.files)===JSON.stringify(expected.files),directoriesStable:JSON.stringify(actual.directories)===JSON.stringify(expected.directories)}
}
