import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { Schema } from 'effect'

const parseJson = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.JsonObject))
const CriterionSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  requirement: Schema.NonEmptyString,
  implementation: Schema.Array(Schema.JsonObject),
  controlledTests: Schema.Array(Schema.JsonObject),
  liveScenarios: Schema.Array(Schema.JsonObject),
  limitation: Schema.String,
  certified: Schema.Boolean,
  assessment: Schema.String,
  assessmentMeaning: Schema.String,
  adjudicationStatus: Schema.optionalKey(Schema.String)
})
const parseCriteria = Schema.decodeUnknownSync(Schema.Array(CriterionSchema), { onExcessProperty: 'error' })
const rootAdjudication = new Set(['kind', 'certified', 'pending', 'adjudication', 'chainDurationSeconds'])
const criterionAdjudication = new Set(['certified', 'adjudicationStatus'])
const oldLimitation = 'Controlled source evidence and mapped live assertions; final criterion audit pending.'
const finalLimitation = 'Controlled source evidence and mapped live assertions; final independent criterion audit passed.'
const pathnameKeys = new Set(['path', 'log', 'gateReceiptPath'])
const privatePrefix = '/tmp/hulymcp-dalph-306-311/takeover/'

// Normalize only known artifact locators, never source excerpts or historical statuses.
const canonical = (value, key = '') => {
  if (Array.isArray(value)) return value.map(item => canonical(item))
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(Object.keys(value).sort().map(name => [name, canonical(value[name], name)]))
  if (typeof value === 'string' && pathnameKeys.has(key) && value.startsWith(privatePrefix))
    return 'private-evidence/' + value.slice(privatePrefix.length)
  return value
}
const omit = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.has(key)))
export const parseCompletionEvidence = text => {
  const document = parseJson(text)
  const criteria = parseCriteria(document.criteria)
  if (criteria.length === 0 || new Set(criteria.map(row => row.id)).size !== criteria.length)
    throw new Error('Completion evidence requires unique, nonempty criteria')
  return { ...document, criteria }
}
export const immutableEvidenceProjection = document => {
  const criteria = document.criteria.map(row => {
    const preserved = omit(row, criterionAdjudication)
    if (preserved.limitation === finalLimitation) preserved.limitation = oldLimitation
    return preserved
  })
  return canonical({ ...omit(document, rootAdjudication), criteria })
}
export const evidenceFingerprint = document => createHash('sha256')
  .update(JSON.stringify(immutableEvidenceProjection(document))).digest('hex')
export const assertPublicationPreservesEvidence = (baseline, published) => {
  if (!isDeepStrictEqual(immutableEvidenceProjection(baseline), immutableEvidenceProjection(published)))
    throw new Error('Publication changed frozen evidence; preserve requirements, historical statuses and source/test/live proofs')
  return evidenceFingerprint(baseline)
}
