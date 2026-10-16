import sys,importlib.util,subprocess,secrets,os,json,time,pathlib
mode=sys.argv[1];host=sys.argv[2];sys.argv=['qualify','support']
spec=importlib.util.spec_from_file_location('q','/tmp/hulymcp-pr318-completion/qualify.py');q=importlib.util.module_from_spec(spec);spec.loader.exec_module(q)
def sec(args):
 r=subprocess.run(['/usr/bin/security']+args,capture_output=True,text=True,timeout=15)
 if r.returncode:raise RuntimeError('security '+args[0]+' failed: '+r.stderr.strip())
 return r.stdout
original=sec(['default-keychain','-d','user']).strip().strip('"');search=[x.strip().strip('"') for x in sec(['list-keychains','-d','user']).splitlines()]
k=str(q.BASE/'qualification.keychain-db');password=secrets.token_hex(24);token=q.token();q.secrets.append(token)
rescue=q.BASE/'fixture-recovery.json'
with os.fdopen(os.open(rescue,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'w') as f:json.dump({'default':original,'search':search,'keychain':k,'password':password},f)
try:
 sec(['create-keychain','-p',password,k]);sec(['set-keychain-settings',k]);sec(['unlock-keychain','-p',password,k]);sec(['default-keychain','-d','user','-s',k]);sec(['list-keychains','-d','user','-s',*search,k])
 q.hidden(['auth','import-token','--profile',q.NAME],[(b'Huly token: ',token)])
 sec(['default-keychain','-d','user','-s',original]);sec(['list-keychains','-d','user','-s',*search,k]);q.run(['auth','check','--profile',q.NAME,'--json'])
 before=(q.ROOT/'credentials.json').read_bytes();profiles=(q.ROOT/'profiles.json').read_bytes();reference=json.loads(before)['native'][q.NAME]['key']
 if mode=='locked':sec(['lock-keychain',k])
 elif mode=='unavailable':sec(['list-keychains','-d','user','-s',*search])
 else:raise RuntimeError('unknown mode')
 q.record('START '+mode+' real CLI and fresh actual-host checks')
 status=json.loads(q.run(['auth','status','--profile',q.NAME,'--json']).stdout);assert status['configured'] and not status['verified'];q.record('PASS offline status in '+mode+' state')
 p=subprocess.run([q.CLI,'auth','check','--profile',q.NAME,'--json'],env=q.clean,capture_output=True,text=True,timeout=30)
 assert all(not s or s not in p.stdout+p.stderr for s in q.secrets)
 q.record(json.dumps({'scenario':mode+'-cli-read','exit':p.returncode,'diagnostic':(p.stdout+p.stderr).strip(),'metadataPreserved':before==(q.ROOT/'credentials.json').read_bytes()}))
 assert p.returncode!=0 and before==(q.ROOT/'credentials.json').read_bytes()
 p=subprocess.run(['/opt/homebrew/bin/node',str(q.BASE/'codex-host.cjs')],env=dict(q.clean,HULY_TEST_HOST_NAME=host),capture_output=True,text=True,timeout=60)
 (q.BASE/(mode+'-host.log')).write_text(p.stdout+p.stderr)
 stderr=q.BASE/'mcp-native-failure.stderr';diagnostic=stderr.read_text() if stderr.exists() else ''
 assert all(not s or s not in diagnostic+p.stdout+p.stderr for s in q.secrets)
 (q.BASE/(mode+'-server.stderr')).write_text(diagnostic)
 q.record(json.dumps({'scenario':mode+'-actual-Codex','exit':p.returncode,'serverDiagnostic':diagnostic.strip(),'metadataPreserved':before==(q.ROOT/'credentials.json').read_bytes()}))
 assert p.returncode!=0 and before==(q.ROOT/'credentials.json').read_bytes()
 if mode=='unavailable':
  p=subprocess.run([q.CLI,'auth','logout','--profile',q.NAME,'--json'],env=q.clean,capture_output=True,text=True,timeout=30)
  assert all(not s or s not in p.stdout+p.stderr for s in q.secrets)
  q.record(json.dumps({'scenario':'unavailable-logout','exit':p.returncode,'diagnostic':(p.stdout+p.stderr).strip(),'metadataPreserved':before==(q.ROOT/'credentials.json').read_bytes()}))
 sec(['unlock-keychain','-p',password,k]);sec(['list-keychains','-d','user','-s',*search,k])
 p=subprocess.run([q.CLI,'auth','check','--profile',q.NAME,'--json'],env=q.clean,capture_output=True,text=True,timeout=30)
 q.record(json.dumps({'scenario':mode+'-restored','exit':p.returncode,'originalEntryExists':subprocess.run(['/usr/bin/security','find-generic-password','-s','io.github.dearlordylord.huly-mcp','-a',reference,k],capture_output=True).returncode==0}))
finally:
 sec(['default-keychain','-d','user','-s',original]);sec(['unlock-keychain','-p',password,k]);sec(['list-keychains','-d','user','-s',*search,k])
 try:q.hidden(['auth','import-token','--profile',q.NAME],[(b'Huly token: ',token)])
 finally:sec(['list-keychains','-d','user','-s',*search]);sec(['delete-keychain',k]);rescue.unlink();q.record('CLEANUP '+mode+' fixture removed; original default/search list restored')
