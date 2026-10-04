import { Clock, Effect } from 'effect'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'
import { realTime, runCertification, suites } from '../../scripts/run-movement-certification.mjs'

const now = () => Effect.runSync(Clock.currentTimeMillis)
const TEST_BUDGET_MS = 60_000
const TIMEOUT_EXIT = 124
const FAILURE_EXIT = 7

const fixture = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'movement-certification-'))
  await mkdir(path.join(root, 'scripts'))
  await mkdir(path.join(root, 'packages/huly-cli'), { recursive: true })
  await writeFile(path.join(root, 'packages/huly-cli/package.json'), '{}')
  for (const file of ['package.json', 'pnpm-lock.yaml', 'tsconfig.json']) await writeFile(path.join(root, file), '{}')
  for (const suite of suites) await writeFile(path.join(root, `scripts/integration_test_${suite}.sh`), '#!/bin/bash\necho ran >> launches\n')
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
    const time = { ...realTime, now: () => state.clock, schedule: (callback, milliseconds) => {
      state.scheduled++
      if (state.scheduled !== 1) return realTime.schedule(callback, TEST_BUDGET_MS)
      const waitForLaunch = async () => {
        try { await readFile(path.join(f.root, 'launches')); state.clock += milliseconds; callback() }
        catch (error) { if (error.code !== 'ENOENT') throw error; await realTime.pause(10); await waitForLaunch() }
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
