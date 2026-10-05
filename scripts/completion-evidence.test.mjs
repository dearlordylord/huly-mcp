import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { execFileSync, spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertPublicationPreservesEvidence, evidenceFingerprint, parseCompletionEvidence } from './completion-evidence.mjs'
import { verifyManifest } from './verify-completion-evidence.mjs'

const fixture = () => ({
  kind: 'draft', certified: false, pending: 'adjudication', sourceCommit: 'executed-source',
  criteria: [{ id: '306.1', requirement: 'Preserve identity', implementation: [{ sha256: 'source-hash' }],
    controlledTests: [{ declarations: [{ name: 'identity is preserved' }] }],
    liveScenarios: [{ source: 'assert_actual_identity', historicalRuntimeEvidence: [{
      finalInputAudit: 'pending', certified: false, logHash: 'log-hash',
      log: '/tmp/hulymcp-dalph-306-311/takeover/old.log'
    }] }], limitation: 'Scope remains explicit', certified: false, assessment: 'supported', assessmentMeaning: 'Mapped proof' }]
})
test('publication changes adjudication and declared paths while preserving historical evidence', () => {
  const baseline = fixture(), published = structuredClone(baseline)
  published.kind = 'final'; published.certified = true; published.pending = null
  published.adjudication = { spec: 'PASS' }; published.chainDurationSeconds = 42
  published.criteria[0].certified = true; published.criteria[0].adjudicationStatus = 'passed'
  published.criteria[0].liveScenarios[0].historicalRuntimeEvidence[0].log = 'private-evidence/old.log'
  assert.equal(assertPublicationPreservesEvidence(baseline, published), evidenceFingerprint(baseline))
})
test('historical pending-to-passed and nested certification rewrites are rejected', () => {
  for (const [key, value] of [['finalInputAudit', 'passed'], ['certified', true], ['logHash', 'changed']]) {
    const baseline = fixture(), published = structuredClone(baseline)
    published.criteria[0].liveScenarios[0].historicalRuntimeEvidence[0][key] = value
    assert.throws(() => assertPublicationPreservesEvidence(baseline, published), /changed frozen evidence/)
  }
})
test('requirement, source excerpt, test declaration and scope edits are rejected', () => {
  const mutations = [
    report => { report.criteria[0].requirement = 'Different requirement' },
    report => { report.criteria[0].liveScenarios[0].source = 'invented assertion' },
    report => { report.criteria[0].implementation[0].sha256 = 'different source' },
    report => { report.criteria[0].controlledTests[0].declarations[0].name = 'invented test' },
    report => { report.criteria[0].limitation = 'Unlimited guarantee' },
    report => { report.criteria = [] }
  ]
  for (const mutate of mutations) {
    const baseline = fixture(), published = structuredClone(baseline); mutate(published)
    assert.throws(() => assertPublicationPreservesEvidence(baseline, published), /changed frozen evidence/)
  }
})
test('boundary parser rejects missing, duplicate and unknown criterion fields', () => {
  const report = fixture()
  assert.equal(parseCompletionEvidence(JSON.stringify(report)).criteria.length, 1)
  report.criteria.push(structuredClone(report.criteria[0]))
  assert.throws(() => parseCompletionEvidence(JSON.stringify(report)), /unique/)
  report.criteria = []; assert.throws(() => parseCompletionEvidence(JSON.stringify(report)), /nonempty/)
  report.criteria = [fixture().criteria[0]]; report.criteria[0].unreviewedProof = 'new'
  assert.throws(() => parseCompletionEvidence(JSON.stringify(report)))
})
test('published 71-criterion artifact matches its frozen integrity manifest', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const result = await verifyManifest(root, fileURLToPath(new URL('../docs/implementation/completion-306-311.integrity.json', import.meta.url)))
  assert.deepEqual(result, { criteria: 71, preserved: true })
  const report = parseCompletionEvidence(await readFile(new URL('../docs/implementation/completion-306-311.json', import.meta.url), 'utf8'))
  const changed = structuredClone(report)
  const history = changed.criteria.flatMap(row => row.liveScenarios).flatMap(scenario => scenario.historicalRuntimeEvidence ?? [])
  assert.ok(history.some(item => item.finalInputAudit === 'pending'))
  for (const item of history) if (item.finalInputAudit === 'pending') item.finalInputAudit = 'passed'
  assert.throws(() => assertPublicationPreservesEvidence(report, changed), /changed frozen evidence/)
})
test('actual hook rejects a staged rewrite hidden behind a restored working-tree report', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'completion-staging-'))
  const reportPath = 'docs/implementation/completion-306-311.json'
  try {
    await mkdir(path.join(root, 'docs/implementation'), { recursive: true })
    const git = args => execFileSync('git', args, { cwd: root, timeout: 5000 })
    git(['init', '-q'])
    const valid = JSON.stringify(fixture())
    await writeFile(path.join(root, reportPath), valid)
    git(['add', reportPath])
    git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Frozen fixture'])
    const bad = fixture(); bad.criteria[0].liveScenarios[0].historicalRuntimeEvidence[0].finalInputAudit = 'passed'
    await writeFile(path.join(root, reportPath), JSON.stringify(bad)); git(['add', reportPath])
    await writeFile(path.join(root, reportPath), valid)
    const hook = (await readFile(new URL('../.husky/pre-commit', import.meta.url), 'utf8')).split('echo "Updating README')[0]
    const result = spawnSync('bash', ['-c', hook], { cwd: root, encoding: 'utf8', timeout: 5000 })
    assert.equal(result.status, 1)
    assert.match(result.stdout, /Stage the complete protected report/)
    assert.equal(result.signal, null)
  } finally { await rm(root, { recursive: true }) }
})
