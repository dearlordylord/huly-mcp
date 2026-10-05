import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Schema } from 'effect'
import { assertPublicationPreservesEvidence, evidenceFingerprint, parseCompletionEvidence } from './completion-evidence.mjs'

const Digest = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/))
const Manifest = Schema.Struct({
  report: Schema.NonEmptyString,
  frozenDraftSha256: Digest,
  immutableEvidenceSha256: Digest
})
export const verifyManifest = async (root, manifestPath) => {
  const manifest = Schema.decodeUnknownSync(Schema.fromJsonString(Manifest))(await readFile(manifestPath, 'utf8'))
  const report = parseCompletionEvidence(await readFile(path.resolve(root, manifest.report), 'utf8'))
  if (evidenceFingerprint(report) !== manifest.immutableEvidenceSha256)
    throw new Error('Completion evidence differs from its frozen projection')
  return { criteria: report.criteria.length, preserved: true }
}
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2)
    if (args.length === 3 && args[0] === '--compare') {
      const baseline = parseCompletionEvidence(await readFile(args[1], 'utf8'))
      const published = parseCompletionEvidence(await readFile(args[2], 'utf8'))
      process.stdout.write(JSON.stringify({ immutableEvidenceSha256: assertPublicationPreservesEvidence(baseline, published) }) + '\n')
    } else if (args.length === 0 || (args.length === 2 && args[0] === '--manifest')) {
      const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
      const manifestPath = args.length === 0 ? path.join(root, 'docs/implementation/completion-306-311.integrity.json') : path.resolve(args[1])
      process.stdout.write(JSON.stringify(await verifyManifest(root, manifestPath)) + '\n')
    } else throw new Error('Usage: verify-completion-evidence.mjs [--compare frozen.json published.json | --manifest integrity.json]')
  } catch {
    process.stderr.write('Completion evidence verification failed: check the frozen projection or --compare inputs.\n')
    process.exitCode = 1
  }
}
