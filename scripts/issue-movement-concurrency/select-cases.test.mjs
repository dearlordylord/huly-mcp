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
 assert.deepEqual(selectCases({ profile: 'routine', selection: cases.join(', ') }),{scope: 'selected',cases  })
 })
test('unknown, duplicate, empty and historical prefix selections refuse',() => {
 for (const selection of ['', 'mcp:unknown', 'cli:verification-outage,cli:verification-outage', 'mcp:refuse-stale-child'])assert.throws(() => selectCases({ profile: 'routine',selection }))
 })
test('expanded default retains both complete transports',() => assert.equal(selectCases({ profile: 'expanded' }).cases.length,28))
