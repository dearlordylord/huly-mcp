import { createHash } from 'node:crypto'
import { spawn, execFileSync } from 'node:child_process'
import { appendFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Clock, Effect, Schema } from 'effect'

export const suites = ['issue_movement', 'issue_transfer', 'issue_attributes', 'issue_tree', 'issue_movement_concurrency']
const ReceiptSchema = Schema.Struct({ suite: Schema.NonEmptyString, fingerprint: Schema.NonEmptyString,
  sourceCommit: Schema.NonEmptyString, commonFingerprint: Schema.NonEmptyString, suiteFingerprint: Schema.NonEmptyString, environmentFingerprint: Schema.NonEmptyString, log: Schema.NonEmptyString, logHash: Schema.NonEmptyString, started: Schema.Number, ended: Schema.Number,
  exit: Schema.Number, clean: Schema.Boolean, diagnostic: Schema.optionalKey(Schema.NonEmptyString) })
const CampaignSchema = Schema.Struct({ deadline: Schema.Number, expired: Schema.Boolean })
const parseReceipt = Schema.decodeUnknownSync(Schema.fromJsonString(ReceiptSchema))
const parseCampaign = Schema.decodeUnknownSync(Schema.fromJsonString(CampaignSchema))
const hash = value => createHash('sha256').update(value).digest('hex')
const MAX_CAMPAIGN_MS = 1_200_000
const TIMEOUT_EXIT = 124
const INTERRUPTED_EXIT = 130
const SIGNAL_EXIT = 128
const QUEUE_POLL_MS = 100
const CLEANUP_POLL_MS = 50
const ARGV_START = 2
const JS_EXTENSION_LENGTH = 3
const now = () => Effect.runSync(Clock.currentTimeMillis)
const CLEANUP_MS = 10_000
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const missing = error => error?.code === 'ENOENT'
const optionalFile = async file => { try { return await readFile(file, 'utf8') } catch (error) { if (missing(error)) return undefined; throw error } }
const walk = async directory => {
  let entries
  try { entries = await readdir(directory, { withFileTypes: true }) } catch (error) { if (missing(error)) return []; throw error }
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]))).flat().sort((a, b) => a.localeCompare(b))
}
const dependencies = async (root, initial) => {
  const files = new Set()
  const visit = async relative => {
    if (files.has(relative)) return
    const absolute = path.resolve(root, relative)
    if (!absolute.startsWith(root + path.sep)) throw new Error('Dependency escapes worktree')
    const content = await optionalFile(absolute)
    if (content === undefined) throw new Error(`Missing certification dependency: ${relative}`)
    files.add(relative)
    for (const match of content.matchAll(/(?:from\s*|import\s*)["'](\.[^"']+)["']/g)) {
      let imported = path.relative(root, path.resolve(path.dirname(absolute), match[1]))
      if (imported.endsWith('.js')) imported = imported.slice(0, -JS_EXTENSION_LENGTH) + '.ts'
      await visit(imported)
    }
    if (relative.endsWith('.sh')) {
      for (const match of content.matchAll(/(?:scripts\/[\w./-]+\.(?:ts|mjs|sh|jq)|integration-[\w-]+\.ts|run-bundled\.mjs|test-telemetry-env\.sh|issue-transfer-record-preservation\.jq)/g))
        await visit(match[0].startsWith('scripts/') ? match[0] : `scripts/${match[0]}`)
    }
  }
  await visit(initial)
  return [...files].sort((a, b) => a.localeCompare(b))
}
const byteFingerprint = async (root, files) => hash(JSON.stringify(await Promise.all(files.map(async file => [file, hash(await readFile(path.join(root, file)))]))))
export const fingerprintSuite = async (root, suite, prepare) => {
  const commonFiles = ['pnpm-lock.yaml', 'tsconfig.json', ...(await walk(path.join(root, 'src'))).map(file => path.relative(root, file)),
    ...(await walk(path.join(root, 'packages/huly-cli/src'))).map(file => path.relative(root, file)),
    ...(await walk(path.join(root, 'dist'))).map(file => path.relative(root, file)),
    ...(await walk(path.join(root, 'packages/huly-cli/dist'))).map(file => path.relative(root, file))]
  if (prepare !== undefined) commonFiles.push(...await dependencies(root, prepare))
  const environment = Object.entries(process.env).filter(([key]) => key.startsWith('HULY_') || ['NODE_OPTIONS', 'MCP_AUTO_EXIT', 'HULY_TOOL_MODE'].includes(key)).sort(([a], [b]) => a.localeCompare(b))
  const packageData = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.JsonObject))(await readFile(path.join(root, 'package.json'), 'utf8'))
  const scripts = packageData['scripts']
  const buildScripts = typeof scripts === 'object' && scripts !== null && !Array.isArray(scripts)
    ? Object.fromEntries(Object.entries(scripts).filter(([key]) => key.startsWith('build') && !key.includes('readme'))) : {}
  const packageProjection = ['name', 'version', 'type', 'dependencies', 'devDependencies', 'engines', 'packageManager'].map(key => [key, packageData[key] ?? null])
  const commonFingerprint = hash(JSON.stringify({ packageProjection, buildScripts, bytes: await byteFingerprint(root, [...new Set(commonFiles)].sort((a, b) => a.localeCompare(b))) }))
  const suiteFingerprint = await byteFingerprint(root, await dependencies(root, `scripts/integration_test_${suite}.sh`))
  const environmentFingerprint = hash(JSON.stringify(environment))
  return { commonFingerprint, suiteFingerprint, environmentFingerprint, fingerprint: hash(JSON.stringify({ common: commonFingerprint, suite: suiteFingerprint, environment: environmentFingerprint, runtime: [process.version, process.platform, process.arch] })) }
}
const reusableLog = async receipt => {
  const content = await optionalFile(receipt.log)
  return content !== undefined && hash(content) === receipt.logHash && receipt.started <= receipt.ended && receipt.ended <= now()
}
const groupAlive = pid => { try { process.kill(-pid, 0); return true } catch (error) { if (error.code === 'ESRCH') return false; throw error } }
const signalGroup = (pid, signal) => { try { process.kill(-pid, signal) } catch (error) { if (error.code !== 'ESRCH') throw error } }
export const boundedProcess = async (root, script, log, deadline) => {
  if (now() >= deadline) return { exit: TIMEOUT_EXIT, clean: true, launched: false }
  const output = await import('node:fs').then(fs => fs.openSync(log, 'a'))
  const child = spawn('bash', [script], { cwd: root, detached: true, stdio: ['ignore', output, output] })
  let timedOut = false
  let interrupted = false
  let interruptionKill
  const interrupt = () => { interrupted = true; signalGroup(child.pid, 'SIGTERM'); interruptionKill ??= setTimeout(() => signalGroup(child.pid, 'SIGKILL'), CLEANUP_MS) }
  process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt)
  const timer = setTimeout(() => { timedOut = true; signalGroup(child.pid, 'SIGTERM') }, Math.max(1, deadline - now()))
  const killed = setTimeout(() => signalGroup(child.pid, 'SIGKILL'), Math.max(1, deadline - now()) + CLEANUP_MS)
  const exit = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code ?? SIGNAL_EXIT)) })
  clearTimeout(timer)
  if (groupAlive(child.pid)) {
    signalGroup(child.pid, 'SIGTERM')
    const cleanupEnd = Math.min(deadline + CLEANUP_MS, now() + CLEANUP_MS)
    while (groupAlive(child.pid) && now() < cleanupEnd) await pause(CLEANUP_POLL_MS)
    if (groupAlive(child.pid)) signalGroup(child.pid, 'SIGKILL')
  }
  clearTimeout(killed); clearTimeout(interruptionKill)
  process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt)
  const clean = !groupAlive(child.pid)
  const fs = await import('node:fs'); fs.closeSync(output)
  return { exit: timedOut ? TIMEOUT_EXIT : interrupted ? INTERRUPTED_EXIT : exit, clean, launched: true }
}
export const runCertification = async ({ deadline, diagnostic, mode, prepare, root, stateDir }) => {
  root = path.resolve(root); stateDir = path.resolve(stateDir)
  const stateFile = path.join(stateDir, 'campaign.json'), receiptFile = path.join(stateDir, 'receipts.jsonl')
  const prior = await optionalFile(stateFile)
  const campaign = prior === undefined ? undefined : parseCampaign(prior)
  const receiptText = await optionalFile(receiptFile)
  const receipts = receiptText === undefined ? [] : receiptText.trim().split('\n').filter(Boolean).map(parseReceipt)
  if (mode === 'plan') {
    const plan = []
    for (const suite of suites) {
      const fingerprints = await fingerprintSuite(root, suite, prepare)
      const { fingerprint } = fingerprints
      const receipt = receipts.findLast(value => value.suite === suite && value.fingerprint === fingerprint)
      const reusable = receipt?.exit === 0 && receipt.clean && await reusableLog(receipt)
      plan.push({ suite, status: reusable ? 'reuse' : receipt !== undefined ? 'blocked' : 'pending',
        ...(receipt === undefined ? {} : { sourceCommit: receipt.sourceCommit, log: receipt.log }) })
    }
    return { exit: 0, expired: campaign?.expired ?? false, plan }
  }
  if (!Number.isFinite(deadline)) throw new Error('Run requires an absolute deadline')
  const effectiveDeadline = Math.min(deadline, campaign?.deadline ?? now() + MAX_CAMPAIGN_MS)
  await mkdir(stateDir, { recursive: true })
  const state = { deadline: effectiveDeadline, expired: campaign?.expired === true || now() >= effectiveDeadline }
  await writeFile(stateFile, JSON.stringify(parseCampaign(JSON.stringify(state))))
  if (state.expired) return { exit: TIMEOUT_EXIT, expired: true, plan: [] }
  const lock = path.join(root, '.movement-certification.lock')
  while (true) {
    try { await mkdir(lock); break } catch (error) {
      if (error.code !== 'EEXIST') throw error
      if (now() >= effectiveDeadline) { await writeFile(stateFile, JSON.stringify({ ...state, expired: true })); return { exit: TIMEOUT_EXIT, expired: true, plan: [] } }
      await pause(Math.min(QUEUE_POLL_MS, effectiveDeadline - now()))
    }
  }
  let clean = true
  try {
    await writeFile(path.join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, deadline: effectiveDeadline, stateDir }))
    if (prepare !== undefined) {
      await dependencies(root, prepare)
      const result = await boundedProcess(root, prepare, path.join(stateDir, 'prepare.log'), effectiveDeadline)
      clean = result.clean
      if (result.exit !== 0) return { exit: result.exit, expired: result.exit === TIMEOUT_EXIT, plan: [] }
    }
    const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
    const plan = []
    for (const suite of suites) {
      if (now() >= effectiveDeadline) { state.expired = true; return { exit: TIMEOUT_EXIT, expired: true, plan } }
      const fingerprints = await fingerprintSuite(root, suite, prepare)
      const { fingerprint } = fingerprints
      const receipt = receipts.findLast(value => value.suite === suite && value.fingerprint === fingerprint)
      if (receipt?.exit === 0 && receipt.clean && await reusableLog(receipt)) { plan.push({ suite, status: 'reuse', log: receipt.log, sourceCommit: receipt.sourceCommit }); continue }
      const admission = diagnostic?.startsWith(`${suite}:`) === true ? diagnostic.slice(suite.length + 1).trim() : undefined
      if (receipt !== undefined && !admission) return { exit: 1, expired: false, plan: [...plan, { suite, status: 'blocked', log: receipt.log }] }
      const started = now(), log = path.join(stateDir, `${suite}-${started}.log`)
      const result = await boundedProcess(root, `scripts/integration_test_${suite}.sh`, log, effectiveDeadline)
      clean = result.clean
      const evidence = parseReceipt(JSON.stringify({ suite, ...fingerprints, sourceCommit, log, logHash: hash(await readFile(log)), started, ended: now(), exit: result.exit, clean,
        ...(admission ? { diagnostic: admission } : {}) }))
      await appendFile(receiptFile, JSON.stringify(evidence) + '\n'); receipts.push(evidence)
      plan.push({ suite, status: result.exit === 0 ? 'passed' : 'failed', log })
      if (result.exit !== 0 || !clean) { state.expired ||= result.exit === TIMEOUT_EXIT; return { exit: result.exit || 1, expired: state.expired, plan } }
    }
    return { exit: 0, expired: false, plan }
  } finally {
    state.expired ||= now() >= effectiveDeadline
    await writeFile(stateFile, JSON.stringify(state))
    if (clean) await rm(lock, { recursive: true })
  }
}
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(ARGV_START), value = key => { const index = args.indexOf(key); return index < 0 ? undefined : args[index + 1] }
  const root = process.cwd()
  const mode = args.includes('--run') ? 'run' : args.includes('--plan') ? 'plan' : undefined
  if (mode === undefined) throw new Error('Choose --plan or --run')
  const result = await runCertification({ root, mode, stateDir: value('--state-dir') ?? path.join(root, '.movement-certification'),
    deadline: Date.parse(value('--deadline') ?? ''), diagnostic: value('--diagnostic'), prepare: value('--prepare') })
  process.stdout.write(JSON.stringify(result) + '\n'); process.exitCode = result.exit
}
