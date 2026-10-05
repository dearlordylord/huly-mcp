import { Schema } from 'effect'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
const names = ['refuse-stale-child', 'preserve-later-child', 'refuse-stale-comment', 'preserve-later-comment', 'refuse-stale-time', 'preserve-later-time', 'refuse-stale-attribute', 'preserve-later-attribute', 'refuse-stale-ancestry', 'preserve-later-ancestry', 'before-allocation-send', 'allocated-reply-lost', 'successful-batch-reply-lost', 'verification-outage']
const cliNames = ['refuse-stale-attribute', 'allocated-reply-lost', 'successful-batch-reply-lost', 'verification-outage']
const continuation = ['mcp:successful-batch-reply-lost', 'mcp:verification-outage', ...cliNames.map(name => `cli:${name}`)]
const Input = Schema.Struct({ profile: Schema.Literals(['routine', 'expanded']), selection: Schema.optionalKey(Schema.String) })
const allCaseKeys = names.flatMap(name => [`mcp:${name}`, `cli:${name}`])
export const SelectionSchema = Schema.Struct({ scope: Schema.Literals(['full', 'selected']), cases: Schema.Array(Schema.Literals(allCaseKeys)) })
const parseSelection = Schema.decodeUnknownSync(SelectionSchema)
export const selectCases = input => {
  const parsed = Schema.decodeUnknownSync(Input)(input)
  const full = [...names.map(name => `mcp:${name}`), ...(parsed.profile === 'expanded' ? names : cliNames).map(name => `cli:${name}`)]
  if (parsed.selection === undefined) return parseSelection({ scope: 'full', cases: full })
  const cases = parsed.selection.split(',')
  if (cases.length === 0 || new Set(cases).size !== cases.length || cases.some(value => !continuation.includes(value))) throw new Error('Invalid concurrency continuation selection')
  return parseSelection({ scope: 'selected', cases })
}
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const selection = process.env.HULY_MOVEMENT_CONCURRENCY_CASES
    const result = selectCases({ profile: process.env.HULY_MOVEMENT_CONCURRENCY_PROFILE ?? 'routine', ...(selection === undefined ? {} : { selection }) })
    process.stdout.write(Schema.encodeSync(Schema.fromJsonString(SelectionSchema))(result) + '\n')
  } catch {
    process.stderr.write('Invalid concurrency case selection.\n')
    process.exitCode = 1
  }
}
