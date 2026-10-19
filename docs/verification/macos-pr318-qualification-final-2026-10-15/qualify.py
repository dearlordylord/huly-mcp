import os, pathlib, json, subprocess, pty, select, time, sys
BASE=pathlib.Path('/tmp/hulymcp-pr318-completion')
CLI='/tmp/hulymcp-pr318-installed/node_modules/.bin/huly'
ROOT=pathlib.Path.home()/'Library/Application Support/huly'
NAME='macos-pr318-completion'
env=dict(os.environ,HULY_MCP_TELEMETRY='0',HULY_CLI_TELEMETRY='0')
clean={k:v for k,v in env.items() if k not in ['HULY_URL','HULY_WORKSPACE','HULY_EMAIL','HULY_PASSWORD','HULY_TOKEN','HULY_PROFILE']}
secrets=[env.get('HULY_PASSWORD','')]
def record(s):
 print(s,flush=True)
 with (BASE/'qualification.log').open('a') as f:f.write(s+'\n')
def run(args,ok=True):
 p=subprocess.run([CLI]+args,env=clean,capture_output=True,text=True,timeout=35)
 assert all(not s or s not in p.stdout+p.stderr for s in secrets),'Secret output detected; suppressed'
 assert (p.returncode==0)==ok, 'Unexpected command outcome: '+str(args[:2])+'; diagnostics suppressed'
 return p

def hidden(args,answers):
 master,slave=pty.openpty()
 p=subprocess.Popen([CLI]+args,env=clean,stdin=slave,stdout=slave,stderr=slave)
 os.close(slave); data=b''; pending=b''; deadline=time.monotonic()+50
 while p.poll() is None and time.monotonic()<deadline:
  if select.select([master],[],[],.1)[0]:
   try:c=os.read(master,4096)
   except OSError:break
   data+=c;pending+=c
   if answers and answers[0][0] in pending:
    _,answer=answers.pop(0);os.write(master,(answer+'\n').encode());pending=b''
 try:p.wait(timeout=2)
 except subprocess.TimeoutExpired:p.kill();p.wait();raise AssertionError('Hidden prompt timed out')
 os.close(master)
 assert all(not s or s.encode() not in data for s in secrets),'Hidden input exposed; suppressed'
 if p.returncode!=0:
  safe=data.decode(errors='replace')
  for s in secrets:
   if s:safe=safe.replace(s,'[REDACTED]')
  record(safe)
 assert p.returncode==0 and not answers,'Hidden prompt command failed'

def token():
 meta=json.loads((ROOT/'credentials.json').read_text()); key=meta['native'][NAME]['key']
 p=subprocess.run(['/opt/homebrew/bin/node','-e',"const {AsyncEntry}=require('/tmp/hulymcp-macos-pr318/node_modules/@napi-rs/keyring');new AsyncEntry('io.github.dearlordylord.huly-mcp',process.argv[1]).getPassword().then(v=>process.stdout.write(v??''))",key],capture_output=True,text=True,timeout=15)
 assert p.returncode==0,'Native retrieval failed; suppressed'
 return json.loads(p.stdout)['token']

if sys.argv[1]=='login':
 if (ROOT/'profiles.json').exists():
  assert NAME not in json.loads((ROOT/'profiles.json').read_text())['profiles'],'Test profile already exists'
 run(['profile','create',NAME,'--url',env['HULY_URL'],'--workspace',env['HULY_WORKSPACE']])
 hidden(['auth','login','--profile',NAME,'--storage','os'],[(b'Huly email: ',env['HULY_EMAIL']),(b'Huly password: ',env['HULY_PASSWORD'])])
 record('PASS packaged CLI login through hidden password prompt; password absent from output')
 status=json.loads(run(['auth','status','--profile',NAME,'--json']).stdout)
 assert status['configured'] and status['verified']==False
 record('PASS offline status configured=true verified=false')
 assert json.loads(run(['auth','check','--profile',NAME,'--json']).stdout)['verified']
 record('PASS native auth check verified=true')
 t=token();secrets.append(t)
 hidden(['auth','import-token','--profile',NAME],[(b'Huly token: ',t)])
 assert json.loads(run(['auth','check','--profile',NAME,'--json']).stdout)['verified']
 record('PASS hidden token replacement; verified access retained; token absent from output')
 before=(ROOT/'credentials.json').read_bytes();profiles=(ROOT/'profiles.json').read_bytes()
 p=subprocess.run([CLI,'auth','import-token','--stdin','--profile',NAME],input='invalid-replacement-sentinel',text=True,env=clean,capture_output=True,timeout=30)
 assert p.returncode!=0 and 'invalid-replacement-sentinel' not in p.stdout+p.stderr
 assert before==(ROOT/'credentials.json').read_bytes() and profiles==(ROOT/'profiles.json').read_bytes()
 assert json.loads(run(['auth','check','--profile',NAME,'--json']).stdout)['verified']
 record('PASS invalid token rejected; metadata unchanged; previous credential still verified')
 for path in ROOT.glob('*.json'):
  content=path.read_text()
  assert all(not s or s not in content for s in secrets),'Secret persisted in application file'
 meta=json.loads((ROOT/'credentials.json').read_text())
 assert NAME not in meta['tokens']
 record('PASS application JSON files contain neither test token nor password; native profile has no file token')
 projects=json.loads(run(['projects','list','--profile',NAME,'--json']).stdout)
 (BASE/'cli-projects.json').write_text(json.dumps(sorted(x['identifier'] for x in projects['projects'])))
 record('PASS packaged CLI project read; count='+str(len(projects['projects'])))
if sys.argv[1]=='locked':
 import secrets as rand
 keychain='/tmp/hulymcp-pr318-completion/qualification.keychain-db'
 password=rand.token_hex(24)
 def security(args,check=True):
  p=subprocess.run(['/usr/bin/security']+args,capture_output=True,text=True,timeout=15)
  if check:assert p.returncode==0,'Security setup command failed: '+args[0]
  return p
 default=security(['default-keychain','-d','user']).stdout.strip().strip('"')
 search=[s.strip().strip('"') for s in security(['list-keychains','-d','user']).stdout.splitlines()]
 t=token();secrets.append(t)
 try:
  security(['create-keychain','-p',password,keychain])
  security(['set-keychain-settings',keychain])
  security(['unlock-keychain','-p',password,keychain])
  security(['list-keychains','-d','user','-s',*search,keychain])
  security(['default-keychain','-d','user','-s',keychain])
  hidden(['auth','import-token','--profile',NAME],[(b'Huly token: ',t)])
  security(['default-keychain','-d','user','-s',default])
  security(['list-keychains','-d','user','-s',*search,keychain])
  meta=json.loads((ROOT/'credentials.json').read_text());key=meta['native'][NAME]['key']
  security(['find-generic-password','-s','io.github.dearlordylord.huly-mcp','-a',key,keychain])
  record('PASS replacement entry located in disposable test keychain; original default restored')
  before=(ROOT/'credentials.json').read_bytes();profiles=(ROOT/'profiles.json').read_bytes()
  security(['lock-keychain',keychain]);record('Disposable keychain locked; testing offline status and access refusal')
  status=json.loads(run(['auth','status','--profile',NAME,'--json']).stdout)
  assert status['configured'] and status['verified']==False
  record('PASS offline status while disposable keychain locked')
  (BASE/'locked-ready').touch()
  for args in [['projects','list'],['auth','logout']]:
   p=subprocess.run([CLI]+args+['--profile',NAME,'--json'],env=clean,capture_output=True,text=True,timeout=35)
   record('Locked command exit code: '+str(p.returncode))
   record('Locked command sanitized outcome: '+(p.stdout+p.stderr).strip())
   if 'Keychain' not in p.stdout+p.stderr:record('FAIL locked read lacks Keychain-specific guidance')
   assert p.returncode!=0 and 'Keychain access failed' in p.stdout+p.stderr,'Locked operation must fail with Keychain guidance'
   assert before==(ROOT/'credentials.json').read_bytes() and profiles==(ROOT/'profiles.json').read_bytes(),'Locked operation changed metadata'
   record('PASS locked command refused; profile and credential files byte-identical')
  p=subprocess.run([CLI,'projects','list','--json'],env=env,capture_output=True,text=True,timeout=30)
  assert p.returncode==0,'Environment read failed with locked native keychain'
  record('PASS complete environment-backed live read while native keychain locked')
  p=subprocess.run([CLI,'auth','check','--profile','macos-pr318-completion-file','--json'],env=clean,capture_output=True,text=True,timeout=30)
  assert p.returncode==0,'File read failed with locked native keychain'
  record('PASS file-backed live read while native keychain locked')
  security(['default-keychain','-d','user','-s',keychain])
  p=subprocess.run([CLI,'auth','import-token','--stdin','--profile',NAME],input=t,text=True,env=clean,capture_output=True,timeout=35)
  assert all(not secret or secret not in p.stdout+p.stderr for secret in secrets),'Secret emitted'
  record('Locked default keychain import exit code: '+str(p.returncode))
  assert p.returncode!=0 and 'Keychain access failed' in p.stdout+p.stderr,'Locked import must fail'
  assert before==(ROOT/'credentials.json').read_bytes() and profiles==(ROOT/'profiles.json').read_bytes(),'Failed import changed metadata'
  record('PASS locked import refuses write and preserves selected credential')
  security(['default-keychain','-d','user','-s',default])
  security(['list-keychains','-d','user','-s',*search,keychain])
  security(['unlock-keychain','-p',password,keychain])
  saved=security(['find-generic-password','-s','io.github.dearlordylord.huly-mcp','-a',key,keychain],False)
  record('Original credential still in keychain after unlock: '+str(saved.returncode==0))
  p=subprocess.run([CLI,'auth','check','--profile',NAME,'--json'],env=clean,capture_output=True,text=True,timeout=30)
  assert p.returncode==0,'Unlock failed to restore access'
  record('PASS explicit unlock restores verified Huly access')
 finally:
  security(['default-keychain','-d','user','-s',default],False)
  security(['unlock-keychain','-p',password,keychain],False)
  # Move the selected credential back to the normal default through the real app.
  try:hidden(['auth','import-token','--profile',NAME],[(b'Huly token: ',t)])
  finally:
   security(['list-keychains','-d','user','-s',*search],False)
   security(['delete-keychain',keychain],False)
  record('Disposable keychain removed; original search list/default restored')
if sys.argv[1]=='fallback':
 p=subprocess.run([CLI,'projects','list','--json'],env=env,capture_output=True,text=True,timeout=30)
 assert p.returncode==0 and all(not s or s not in p.stdout+p.stderr for s in secrets)
 record('PASS complete environment-backed project read')
 name='macos-pr318-completion-file'
 if name not in json.loads((ROOT/'profiles.json').read_text())['profiles']:run(['profile','create',name,'--url',env['HULY_URL'],'--workspace',env['HULY_WORKSPACE']])
 hidden(['auth','login','--profile',name,'--storage','file'],[(b'Huly email: ',env['HULY_EMAIL']),(b'Huly password: ',env['HULY_PASSWORD'])])
 assert json.loads(run(['auth','check','--profile',name,'--json']).stdout)['verified']
 record('PASS explicit file-backed login and verified live read')
 record('File credential retained until locked fallback tests finish')
if sys.argv[1]=='logout':
 meta=json.loads((ROOT/'credentials.json').read_text());ref=meta['native'][NAME];profiles=(ROOT/'profiles.json').read_bytes()
 run(['auth','logout','--profile',NAME,'--json'])
 assert profiles==(ROOT/'profiles.json').read_bytes()
 meta=json.loads((ROOT/'credentials.json').read_text());assert NAME not in meta.get('native',{}) and NAME not in meta['tokens']
 p=subprocess.run(['/opt/homebrew/bin/node','-e',"const {AsyncEntry}=require('/tmp/hulymcp-macos-pr318/node_modules/@napi-rs/keyring');new AsyncEntry('io.github.dearlordylord.huly-mcp',process.argv[1]).getPassword().then(v=>console.log(v===null?'absent':'present'))",ref['key']],capture_output=True,text=True,timeout=15)
 assert p.returncode==0 and p.stdout.strip()=='absent'
 record('PASS normal logout removes native entry and retains profile metadata/selection')
 result=run(['projects','list','--profile',NAME,'--json'],ok=False)
 assert 'credentials' in result.stdout+result.stderr
 record('PASS fresh CLI read after logout requires credentials without terminal prompt')

if sys.argv[1]=='relogin':
 hidden(['auth','login','--profile',NAME,'--storage','os'],[(b'Huly email: ',env['HULY_EMAIL']),(b'Huly password: ',env['HULY_PASSWORD'])])
 assert json.loads(run(['auth','check','--profile',NAME,'--json']).stdout)['verified']
 record('PASS test profile reauthenticated and verified')
