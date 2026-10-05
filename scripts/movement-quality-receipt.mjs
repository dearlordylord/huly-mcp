import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Schema } from 'effect'
const hash = value => createHash('sha256').update(value).digest('hex')
const optional = async file => { try { return await readFile(file) } catch (error) { if (error.code === 'ENOENT') return undefined; throw error } }
const walk = async directory => {
  let rows
  try { rows = await readdir(directory, { withFileTypes: true }) } catch (error) { if (error.code === 'ENOENT') return []; throw error }
  return (await Promise.all(rows.map(row => row.isDirectory() ? walk(path.join(directory, row.name)) : [path.join(directory, row.name)]))).flat()
}
export const QualityReceiptSchema = Schema.Struct({ prepare: Schema.NonEmptyString, fingerprint: Schema.NonEmptyString, artifactFingerprint: Schema.NonEmptyString,
  sourceCommit: Schema.NonEmptyString, log: Schema.NonEmptyString, logHash: Schema.NonEmptyString,
  started: Schema.Number, ended: Schema.Number, exit: Schema.Number, clean: Schema.Boolean, inputsStable: Schema.Boolean })
export const parseQualityReceipt = Schema.decodeUnknownSync(Schema.fromJsonString(QualityReceiptSchema))
const bytes = async (root, files) => hash(JSON.stringify(await Promise.all([...new Set(files)].sort().map(async file => [file, hash(await readFile(path.join(root, file)))]))))
export const qualityFingerprint = async (root, prepare) => {
  // Only stock live fixture shells are outside the gate input identity; their scoped checks remain mandatory.
  const directories = ['src', 'test', 'scripts', 'packages', 'patches', 'quint-specs']
  const files = (await Promise.all(directories.map(directory => walk(path.join(root, directory))))).flat()
    .map(file => path.relative(root, file)).filter(file => !file.includes('/dist/') && !file.includes('/node_modules/') && !file.endsWith('.tsbuildinfo') && !/^scripts\/integration_test_[^/]+\.sh$/.test(file))
  // Documentation consumed by registered checks belongs to the gate input identity.
  // Package README and packaged skill documents are already included by the packages walk.
  for (const file of ['README.md', 'server.json', '.husky/pre-commit', 'docs/implementation/completion-306-311.json', 'docs/implementation/completion-306-311.integrity.json', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json', 'vitest.config.ts', '.oxlintrc.json', 'oxlint.complexity.json', '.jscpd.json', 'dprint.json',
    'node_modules/.modules.yaml', 'node_modules/.pnpm/lock.yaml', 'node_modules/effect/package.json', 'node_modules/@effect/tsgo/package.json', 'node_modules/@typescript/native/package.json', 'node_modules/@hcengineering/api-client/package.json'])
    if (await optional(path.join(root, file)) !== undefined) files.push(file)
  return hash(JSON.stringify({ prepare, bytes: await bytes(root, files), runtime: [process.version, process.platform, process.arch] }))
}
export const qualityArtifactFingerprint = async root => bytes(root, (await Promise.all(['dist', 'packages/huly-cli/dist'].map(directory => walk(path.join(root, directory))))).flat().filter(file => !file.endsWith('.tsbuildinfo')).map(file => path.relative(root, file)))
export const reusableQualityReceipt = async (root, receipt, currentTime) => {
  if (!Number.isFinite(currentTime) || receipt === undefined || receipt.exit !== 0 || !receipt.clean || !receipt.inputsStable || receipt.started > receipt.ended || receipt.ended > currentTime) return false
  const log = await optional(receipt.log)
  return log !== undefined && hash(log) === receipt.logHash && await qualityFingerprint(root, receipt.prepare) === receipt.fingerprint && await qualityArtifactFingerprint(root) === receipt.artifactFingerprint
}
const PriorEnvironmentSchema = Schema.Struct({ NODE_OPTIONS: Schema.optionalKey(Schema.String), HULY_PROFILE: Schema.optionalKey(Schema.String) })
export const inspectPriorEnvironment = input => {
  const environment = Schema.decodeUnknownSync(PriorEnvironmentSchema)(input)
  return {
  supported: (environment['NODE_OPTIONS'] ?? '') === '' && (environment['HULY_PROFILE'] ?? '') === '',
  nodeOptionsConfigured: (environment['NODE_OPTIONS'] ?? '') !== '', profileConfigured: (environment['HULY_PROFILE'] ?? '') !== ''
  }
}
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2]
  if (mode === '--preflight') {
    if (!inspectPriorEnvironment(process.env).supported) { process.stderr.write('Native prior requires empty NODE_OPTIONS and HULY_PROFILE before preparation.\n'); process.exitCode = 1 }
  } else if (mode === '--verify') {
    const receipt = parseQualityReceipt(await readFile(process.argv[3], 'utf8'))
    if (!await reusableQualityReceipt(process.cwd(), receipt, Number(process.argv[4]))) process.exitCode = 1
  } else throw new Error('Choose --preflight or --verify')
}
