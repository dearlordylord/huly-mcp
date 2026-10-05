import { Clock, Effect, Schema } from 'effect'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
import { realTime, runCertification, suites, movementTransportInputs, fingerprintSuite } from '../../scripts/run-movement-certification.mjs'

const now = () => Effect.runSync(Clock.currentTimeMillis)
const TEST_BUDGET_MS = 60_000
const TIMEOUT_EXIT = 124
const FAILURE_EXIT = 7
const LAUNCH_POLL_MS = 10
const DESCENDANT_STOP_BUDGET_MS = 5_000
const DESCENDANT_READY_BUDGET_MS = 5_000
const CLEANUP_CLOCK_ADVANCE_MS = 10_000
const DescendantSchema = Schema.Struct({
  pid: Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0)).pipe(Schema.brand('CustodyFixtureProcessId')),
  ready: Schema.Boolean
})
const readDescendant = async file => {
  try { return Schema.decodeUnknownSync(Schema.fromJsonString(DescendantSchema))(await readFile(file, 'utf8')) }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw error }
}
const descendantStopped = async pid => {
  try {
    const stat = await readFile(`/proc/${pid}/stat`, 'utf8')
    // A killed orphan may remain unreaped under the container init; it cannot execute.
    return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[0] === 'Z'
  } catch (error) { if (error.code === 'ENOENT') return true; throw error }
}
const stopOwnedDescendant = async file => {
  const owned = await readDescendant(file)
  if (owned === undefined) return
  try { process.kill(owned.pid, 'SIGKILL') } catch (error) { if (error.code !== 'ESRCH') throw error }
  const deadline = realTime.now() + DESCENDANT_STOP_BUDGET_MS
  while (!(await descendantStopped(owned.pid)) && realTime.now() < deadline) await realTime.pause(LAUNCH_POLL_MS)
  assert.equal(await descendantStopped(owned.pid), true, 'Known owned descendant must stop')
}

const fixture = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'movement-certification-'))
  await mkdir(path.join(root, 'scripts'))
  await mkdir(path.join(root, 'packages/huly-cli'), { recursive: true })
  await writeFile(path.join(root, 'packages/huly-cli/package.json'), '{}')
  for (const file of ['package.json', 'pnpm-lock.yaml', 'tsconfig.json']) await writeFile(path.join(root, file), '{}')
  for (const suite of suites) await writeFile(path.join(root, `scripts/integration_test_${suite}.sh`), '#!/bin/bash\necho ran >> launches\n')
  for (const file of movementTransportInputs) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true })
    await writeFile(path.join(root, file), 'transport dependency')
  }
  execFileSync('git', ['init', '-q', root])
  execFileSync('git', ['-C', root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-qm', 'Fixture'])
  return { root, stateDir: path.join(root, 'evidence'), mode: 'run', deadline: now() + TEST_BUDGET_MS }
}

test('expired campaign never launches and cannot be extended', async () => {
  const f = await fixture()
  try {
    const result = await runCertification({ ...f, deadline: now() - 1 })
    assert.equal(result.exit, TIMEOUT_EXIT)
    assert.equal((await runCertification({ ...f, deadline: now() + TEST_BUDGET_MS })).exit, TIMEOUT_EXIT)
    await assert.rejects(readFile(path.join(f.root, 'launches')), { code: 'ENOENT' })
  } finally { await rm(f.root, { recursive: true }) }
})

test('passes reuse unchanged inputs; only changed suite invalidates', async () => {
  const f = await fixture()
  try {
    assert.equal((await runCertification(f)).exit, 0)
    const original = await readFile(path.join(f.root, 'launches'), 'utf8')
    await mkdir(path.join(f.root, 'docs'))
    await writeFile(path.join(f.root, 'docs/notes.md'), 'Unrelated documentation')
    await writeFile(path.join(f.root, 'package.json'), JSON.stringify({ scripts: { 'movement-certification': 'node runner.mjs' } }))
    const reused = await runCertification(f)
    assert.ok(reused.plan.every(step => step.status === 'reuse'))
    assert.equal(await readFile(path.join(f.root, 'launches'), 'utf8'), original)
    await writeFile(path.join(f.root, 'scripts/integration_test_issue_tree.sh'), '#!/bin/bash\necho changed >> launches\n')
    const changed = await runCertification(f)
    assert.equal(changed.plan.filter(step => step.status === 'passed').length, 1)
    assert.equal(changed.plan.find(step => step.status === 'passed').suite, 'issue_tree')
  } finally { await rm(f.root, { recursive: true }) }
})

test('failed unchanged suite blocks without explicit named diagnostic', async () => {
  const f = await fixture()
  try {
    await writeFile(path.join(f.root, `scripts/integration_test_${suites[0]}.sh`), '#!/bin/bash\necho failed >> launches\nexit 7\n')
    assert.equal((await runCertification(f)).exit, FAILURE_EXIT)
    const launches = await readFile(path.join(f.root, 'launches'), 'utf8')
    const blocked = await runCertification(f)
    assert.equal(blocked.exit, 1)
    assert.equal(blocked.plan[0].status, 'blocked')
    assert.equal(await readFile(path.join(f.root, 'launches'), 'utf8'), launches)
    assert.equal((await runCertification({ ...f, diagnostic: `${suites[0]}:explicit failure inspection` })).exit, FAILURE_EXIT)
  } finally { await rm(f.root, { recursive: true }) }
})

test('malformed receipts fail closed and plan does not launch', async () => {
  const f = await fixture()
  try {
    await mkdir(f.stateDir)
    await writeFile(path.join(f.stateDir, 'receipts.jsonl'), '{"exit":0}\n')
    await assert.rejects(runCertification({ ...f, mode: 'plan' }))
    await assert.rejects(readFile(path.join(f.root, 'launches')), { code: 'ENOENT' })
  } finally { await rm(f.root, { recursive: true }) }
})

test('exclusive lock fails fast without reading state or removing another owner lock', async () => {
  const f = await fixture()
  try {
    await mkdir(path.join(f.root, '.movement-certification.lock'))
    const result = await runCertification(f)
    assert.equal(result.locked, true)
    await assert.rejects(readFile(path.join(f.stateDir, 'campaign.json')), { code: 'ENOENT' })
    await assert.rejects(readFile(path.join(f.root, 'launches')), { code: 'ENOENT' })
    await (await import('node:fs/promises')).stat(path.join(f.root, '.movement-certification.lock'))
  } finally { await rm(f.root, { recursive: true }) }
})

test('deadline terminates real process group and permits bounded fixture cleanup', async () => {
  const f = await fixture()
  try {
    await writeFile(path.join(f.root, `scripts/integration_test_${suites[0]}.sh`), '#!/bin/bash\ntrap \'echo cleaned >> cleanup; exit 0\' TERM\necho running >> launches\nsleep 30\n')
    const state = { clock: now(), scheduled: 0 }
    const time = { ...realTime, now: () => state.clock,
      pause: async milliseconds => { state.clock += milliseconds; await realTime.pause(milliseconds) },
      schedule: (callback, milliseconds) => {
      state.scheduled++
      if (state.scheduled !== 1) return realTime.schedule(callback, TEST_BUDGET_MS)
      const waitForLaunch = async () => {
        try { await readFile(path.join(f.root, 'launches')); state.clock += milliseconds; callback() }
        catch (error) { if (error.code !== 'ENOENT') throw error; await realTime.pause(LAUNCH_POLL_MS); await waitForLaunch() }
      }
      void waitForLaunch()
      return undefined
    } }
    const result = await runCertification({ ...f, time, deadline: state.clock + TEST_BUDGET_MS })
    assert.equal(result.exit, TIMEOUT_EXIT)
    assert.equal((await readFile(path.join(f.root, 'cleanup'), 'utf8')).trim(), 'cleaned')
    assert.equal((await runCertification(f)).exit, TIMEOUT_EXIT)
  } finally { await rm(f.root, { recursive: true }) }
})

test('modified historical log refuses reuse rather than inventing passed evidence', async () => {
  const f = await fixture()
  try {
    const passed = await runCertification(f)
    await writeFile(passed.plan[0].log, 'tampered evidence')
    assert.equal((await runCertification(f)).plan[0].status, 'blocked')
  } finally { await rm(f.root, { recursive: true }) }
})

test('changed suite inputs during child execution never create reusable pass evidence', async () => {
  const f = await fixture()
  try {
    const changedScript = `scripts/integration_test_${suites[0]}.sh`
    await writeFile(path.join(f.root, changedScript), `#!/bin/bash\necho changed >> ${changedScript}\nexit 0\n`)
    const result = await runCertification(f)
    assert.equal(result.exit, 1)
    const receipt = JSON.parse((await readFile(path.join(f.stateDir, 'receipts.jsonl'), 'utf8')).trim())
    assert.equal(receipt.exit, 0)
    assert.equal(receipt.inputsStable, false)
  } finally { await rm(f.root, { recursive: true }) }
})

test('preparation cannot qualify source changed during its execution', async () => {
  const f = await fixture()
  try {
    await mkdir(path.join(f.root, 'src'))
    await writeFile(path.join(f.root, 'scripts/prepare.sh'), '#!/bin/bash\necho changed >> src/main.ts\n')
    const result = await runCertification({ ...f, prepare: 'scripts/prepare.sh' })
    assert.equal(result.exit, 1)
    assert.equal(result.drift, true)
    await assert.rejects(readFile(path.join(f.root, 'launches')), { code: 'ENOENT' })
  } finally { await rm(f.root, { recursive: true }) }
})

test('successful preparation with retained detached-stage custody cannot launch live suites or release the lock', async () => {
  const f = await fixture()
  try {
    await writeFile(path.join(f.root, 'scripts/prepare.sh'), '#!/bin/bash\nprintf unconfirmed > "$MOVEMENT_CUSTODY_DIR/stage.json"\nexit 0\n')
    const result = await runCertification({ ...f, prepare: 'scripts/prepare.sh' })
    assert.equal(result.exit, 1)
    await assert.rejects(readFile(path.join(f.root, 'launches')), { code: 'ENOENT' })
    assert.match(await readFile(path.join(f.stateDir, 'prepare.log.custody/stage.json'), 'utf8'), /unconfirmed/)
    assert.equal((await runCertification({ ...f, mode: 'plan' })).locked, true)
  } finally { await rm(f.root, { recursive: true }) }
})

test('preparation cannot qualify a harness changed during its execution', async () => {
  const f = await fixture()
  try {
    await writeFile(path.join(f.root, 'scripts/quality-helper.ts'), '// original\n')
    await writeFile(path.join(f.root, 'scripts/prepare.sh'), '#!/bin/bash\nprintf -v target "scripts/%s.ts" quality-helper\necho changed >> "$target"\n')
    const result = await runCertification({ ...f, prepare: 'scripts/prepare.sh' })
    assert.equal(result.exit, 1)
    assert.equal(result.drift, true)
    await assert.rejects(readFile(path.join(f.root, 'launches')), { code: 'ENOENT' })
  } finally { await rm(f.root, { recursive: true }) }
})


test('real detached quality-stage custody survives a successful preparation leader and blocks live work', async () => {
  const f = await fixture()
  const descendantFile = path.join(f.root, 'owned-descendant.json')
  try {
    const runner = new URL('../../scripts/run-bounded-command.ts', import.meta.url).href
    const loader = createRequire(import.meta.url).resolve('tsx')
    const parent = path.join(f.root, 'scripts/parent.mjs')
    const descendant = "process.on('SIGTERM',()=>{});setInterval(()=>{},1000);process.send('ready')"
    const leader = `
      const {spawn}=require('node:child_process');
      const {writeFileSync}=require('node:fs');
      const file=${JSON.stringify(descendantFile)};
      const child=spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{stdio:['ignore','ignore','ignore','ipc']});
      writeFileSync(file,JSON.stringify({pid:child.pid,ready:false}),{mode:0o600});
      const timer=setTimeout(()=>{child.kill('SIGKILL');process.exitCode=1},${DESCENDANT_READY_BUDGET_MS});
      child.once('message',message=>{
        if(message!=='ready'){child.kill('SIGKILL');process.exitCode=1;return}
        writeFileSync(file,JSON.stringify({pid:child.pid,ready:true}),{mode:0o600});
        clearTimeout(timer);child.disconnect();child.unref();
      });
    `
    await writeFile(parent, `
      import {runBoundedCommand, Milliseconds} from ${JSON.stringify(runner)};
      const clock={value:0};
      try { await runBoundedCommand({ executable:process.execPath,args:['-e',${JSON.stringify(leader)}],name:'nested custody',timeoutMilliseconds:Milliseconds.make(30000),cleanup:{now:()=>clock.value,pause:async()=>{clock.value+=${CLEANUP_CLOCK_ADVANCE_MS}}} }); }
      catch(error) { console.log(error.message); }
    `)
    const quote = value => "'" + value.replaceAll("'", "'\\''") + "'"
    await writeFile(path.join(f.root, 'scripts/prepare.sh'), `#!/bin/bash\n${quote(process.execPath)} --import ${quote(loader)} ${quote(parent)}\n`)
    const result = await runCertification({ ...f, prepare: 'scripts/prepare.sh' })
    assert.equal((await readDescendant(descendantFile))?.ready, true)
    assert.equal(result.exit, 1)
    await assert.rejects(readFile(path.join(f.root, 'launches')), { code: 'ENOENT' })
    const custody = path.join(f.stateDir, 'prepare.log.custody')
    const entries = await (await import('node:fs/promises')).readdir(custody)
    assert.equal(entries.length, 1)
    assert.equal(JSON.parse(await readFile(path.join(custody, entries[0]), 'utf8')).state, 'unconfirmed')
    assert.equal((await runCertification({ ...f, mode: 'plan' })).locked, true)
  } finally { await stopOwnedDescendant(descendantFile); await rm(f.root, { recursive: true }) }
})

test('shared transport source and fixture dependency changes invalidate every suite', async () => {
  const f = await fixture()
  try {
    let before = await Promise.all(suites.map(suite => fingerprintSuite(f.root, suite)))
    for (const dependency of ['scripts/integration-mcp-adapter.sh', 'test/integration-fixtures/movement-public-process-fixture.ts']) {
      await writeFile(path.join(f.root, dependency), `changed ${dependency}`)
      const after = await Promise.all(suites.map(suite => fingerprintSuite(f.root, suite)))
      assert.ok(after.every((entry, index) => entry.fingerprint !== before[index].fingerprint))
      before = after
    }
  } finally { await rm(f.root, { recursive: true }) }
})

test('compiler build-info cache mutations do not invalidate live runtime evidence', async () => {
  const f = await fixture()
  try {
    for (const directory of ['dist', 'packages/huly-cli/dist']) await mkdir(path.join(f.root, directory), {recursive: true})
    for (const file of ['dist/index.cjs', 'packages/huly-cli/dist/index.cjs', 'dist/runtime.json']) await writeFile(path.join(f.root, file), 'runtime original')
    await writeFile(path.join(f.root, 'dist/tsconfig.tsbuildinfo'), 'cache original')
    const original = await fingerprintSuite(f.root, 'issue_tree')
    await writeFile(path.join(f.root, 'dist/tsconfig.tsbuildinfo'), 'cache changed')
    await writeFile(path.join(f.root, 'packages/huly-cli/dist/other.tsbuildinfo'), 'new compiler cache')
    assert.equal((await fingerprintSuite(f.root, 'issue_tree')).fingerprint, original.fingerprint)
    let before = original
    for (const file of ['dist/index.cjs', 'packages/huly-cli/dist/index.cjs', 'dist/runtime.json']) {
      await writeFile(path.join(f.root, file), 'runtime changed')
      const after = await fingerprintSuite(f.root, 'issue_tree')
      assert.notEqual(after.fingerprint, before.fingerprint)
      before = after
    }
  } finally { await rm(f.root, {recursive: true}) }
})

test('qualification checks the concurrency frontier first while retaining every feature suite', () => {
  assert.deepEqual(suites, ['issue_movement_concurrency', 'issue_tree', 'issue_movement', 'issue_transfer', 'issue_attributes'])
  assert.equal(new Set(suites).size, suites.length)
})
