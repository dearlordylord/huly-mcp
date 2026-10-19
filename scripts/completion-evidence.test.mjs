import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
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
test('explicit report manifest preserves evidence and rejects rewrites', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'completion-manifest-'))
  try {
    const report = fixture()
    await writeFile(path.join(root, 'report.json'), JSON.stringify(report))
    const manifest = { report: 'report.json', frozenDraftSha256: '0'.repeat(64), immutableEvidenceSha256: evidenceFingerprint(report) }
    const manifestPath = path.join(root, 'integrity.json')
    await writeFile(manifestPath, JSON.stringify(manifest))
    assert.deepEqual(await verifyManifest(root, manifestPath), { criteria: 1, preserved: true })
    report.criteria[0].requirement = 'Changed requirement'
    await writeFile(path.join(root, 'report.json'), JSON.stringify(report))
    await assert.rejects(verifyManifest(root, manifestPath), /differs from its frozen projection/)
  } finally { await rm(root, { recursive: true }) }
})
