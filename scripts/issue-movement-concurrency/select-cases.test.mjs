import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {selectCases} from './select-cases.mjs'
test('default routine retains all fourteen MCP and four CLI cases',() => {
 const result=selectCases({ profile: 'routine' })
 assert.equal(result.scope,'full');assert.equal(result.cases.length,18)
 assert.equal(result.cases.filter(value => value.startsWith('mcp:')).length,14)
 assert.equal(result.cases.filter(value => value.startsWith('cli:')).length,4)
 assert.equal(new Set(result.cases).size,18)
 })
test('explicit continuation retains only the six requested transport cases',() => {
 const cases=['mcp:successful-batch-reply-lost', 'mcp:verification-outage', 'cli:refuse-stale-attribute', 'cli:allocated-reply-lost', 'cli:successful-batch-reply-lost', 'cli:verification-outage']
 assert.deepEqual(selectCases({ profile: 'routine', selection: cases.join(',') }),{scope: 'selected',cases  })
 })
test('unknown, duplicate, empty and historical prefix selections refuse',() => {
 for (const selection of ['', 'mcp:unknown', 'cli:verification-outage,cli:verification-outage', 'mcp:refuse-stale-child'])assert.throws(() => selectCases({ profile: 'routine',selection }))
 })
test('expanded default retains both complete transports',() => assert.equal(selectCases({ profile: 'expanded' }).cases.length,28))
test('CLI invalid selection returns a fixed error without private input', () => {
  const result = spawnSync(process.execPath, ['scripts/issue-movement-concurrency/select-cases.mjs'], { encoding: 'utf8', timeout: 5000, killSignal: 'SIGKILL', env: { ...process.env, HULY_MOVEMENT_CONCURRENCY_CASES: 'secret-like-invalid-selection' } })
  assert.equal(result.status, 1)
  assert.equal(result.stdout, '')
  assert.equal(result.stderr, 'Invalid concurrency case selection.\n')
})
test('shell consumes selection before removing it from native child environment', () => {
  const shell = readFileSync('scripts/integration_test_issue_movement_concurrency.sh', 'utf8')
  const start = shell.indexOf('CASE_SELECTION=$(node ')
  const end = shell.indexOf('select_concurrency_cases()')
  assert.ok(start >= 0 && end > start)
  const selection = 'mcp:verification-outage'
  const command = shell.slice(start, end) + `
node -e 'if (process.env.HULY_MOVEMENT_CONCURRENCY_CASES !== undefined) process.exit(1)'
printf '%s\\n' "$CASE_SELECTION"
`
  const result = spawnSync('bash', ['-c', command], { encoding: 'utf8', timeout: 5000, killSignal: 'SIGKILL', env: { ...process.env, HULY_MOVEMENT_CONCURRENCY_CASES: selection } })
  assert.equal(result.status, 0)
  const rows = result.stdout.trim().split('\n').map(value => JSON.parse(value))
  assert.deepEqual(rows.at(-1), { scope: 'selected', cases: [selection] })
})
