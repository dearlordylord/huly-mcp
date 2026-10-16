import sys,importlib.util,subprocess,secrets,os,signal,time,json
sys.argv=['qualify','support']
spec=importlib.util.spec_from_file_location('q','/tmp/hulymcp-pr318-completion/qualify.py');q=importlib.util.module_from_spec(spec);spec.loader.exec_module(q)
def sec(args):
 r=subprocess.run(['/usr/bin/security']+args,capture_output=True,text=True,timeout=15)
 if r.returncode!=0:
  q.record('Fixture security failure '+args[0]+': exit='+str(r.returncode)+' stderr='+r.stderr.strip())
  raise AssertionError('Security fixture operation failed: '+args[0])
 return r.stdout
original=sec(['default-keychain','-d','user']).strip().strip('"')
search=[x.strip().strip('"') for x in sec(['list-keychains','-d','user']).splitlines()]
k=str(q.BASE/'qualification.keychain-db');password=secrets.token_hex(24);token=q.token();q.secrets.append(token)
q.BASE.chmod(0o700)
rescue=q.BASE/'fixture-recovery.json'
with os.fdopen(os.open(rescue,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'w') as f:json.dump({'default':original,'search':search,'keychain':k,'password':password},f)
try:
 sec(['create-keychain','-p',password,k]);sec(['set-keychain-settings',k]);sec(['unlock-keychain','-p',password,k]);sec(['default-keychain','-d','user','-s',k]);sec(['list-keychains','-d','user','-s',*search,k])
 q.hidden(['auth','import-token','--profile',q.NAME],[(b'Huly token: ',token)])
 before=(q.ROOT/'credentials.json').read_bytes();profiles=(q.ROOT/'profiles.json').read_bytes()
 sec(['lock-keychain',k]);q.record('START locked-default import: cancel the qualification unlock dialog if macOS displays it; no password required')
 start=time.monotonic();p=subprocess.Popen([q.CLI,'auth','import-token','--stdin','--profile',q.NAME],env=q.clean,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,start_new_session=True)
 timedout=False
 try:out,err=p.communicate(token,timeout=35)
 except subprocess.TimeoutExpired:
  timedout=True;os.killpg(p.pid,signal.SIGKILL);out,err=p.communicate()
 assert all(not s or s not in out+err for s in q.secrets),'Secret appeared; suppressed'
 preserved=before==(q.ROOT/'credentials.json').read_bytes() and profiles==(q.ROOT/'profiles.json').read_bytes()
 q.record(json.dumps({'scenario':'locked-import','seconds':round(time.monotonic()-start,2),'exit':p.returncode,'harnessTimeout':timedout,'keychainGuidance':'Keychain access failed' in out+err,'metadataPreserved':preserved}))
 sec(['unlock-keychain','-p',password,k]);sec(['default-keychain','-d','user','-s',original]);sec(['list-keychains','-d','user','-s',*search,k])
 assert json.loads(q.run(['auth','check','--profile',q.NAME,'--json']).stdout)['verified']
 q.record('PASS prior credential verified after explicit unlock following denied/timed-out import')
 assert not timedout and p.returncode!=0 and preserved and 'Keychain access failed' in out+err,'Locked import did not complete as bounded actionable refusal'
 q.record('PASS locked import failure preserves credential and metadata')
finally:
 sec(['unlock-keychain','-p',password,k]);sec(['default-keychain','-d','user','-s',original]);sec(['list-keychains','-d','user','-s',*search,k])
 try:q.hidden(['auth','import-token','--profile',q.NAME],[(b'Huly token: ',token)])
 finally:sec(['list-keychains','-d','user','-s',*search]);sec(['delete-keychain',k]);rescue.unlink();q.record('CLEANUP disposable keychain removed; original default/search list restored')
