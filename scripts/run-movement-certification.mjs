import { inspectPriorEnvironment, parseQualityReceipt, qualityFingerprint, qualityArtifactFingerprint, reusableQualityReceipt } from './movement-quality-receipt.mjs'
import { createHash } from 'node:crypto'
import { spawn, execFileSync } from 'node:child_process'
import { appendFile, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Clock, Effect, Redacted, Schema } from 'effect'

// Front-load unresolved feature boundaries; retain every required suite.
export const suites = ['issue_movement_concurrency', 'issue_tree', 'issue_movement', 'issue_transfer', 'issue_attributes']
const ReceiptSchema = Schema.Struct({ suite: Schema.NonEmptyString, fingerprint: Schema.NonEmptyString,
  sourceCommit: Schema.NonEmptyString, commonFingerprint: Schema.NonEmptyString, suiteFingerprint: Schema.NonEmptyString, environmentFingerprint: Schema.NonEmptyString, log: Schema.NonEmptyString, logHash: Schema.NonEmptyString, started: Schema.Number, ended: Schema.Number,
  exit: Schema.Number, clean: Schema.Boolean, inputsStable: Schema.Boolean, diagnostic: Schema.optionalKey(Schema.NonEmptyString) })
const MAX_CAMPAIGN_MS = 1_200_000
const CampaignSchema = Schema.Union([
  Schema.Struct({ deadline: Schema.Number.check(Schema.isFinite()), expired: Schema.Boolean }),
  Schema.Struct({ perSuiteTimeoutMs: Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(MAX_CAMPAIGN_MS)), expired: Schema.Boolean })
])
const parseReceipt = Schema.decodeUnknownSync(Schema.fromJsonString(ReceiptSchema))
const parseCampaign = Schema.decodeUnknownSync(Schema.fromJsonString(CampaignSchema))
const hash = value => createHash('sha256').update(value).digest('hex')
const TIMEOUT_EXIT = 124
const INTERRUPTED_EXIT = 130
const SIGNAL_EXIT = 128
const CLEANUP_POLL_MS = 50
const ARGV_START = 2
const JS_EXTENSION_LENGTH = 3
const now = () => Effect.runSync(Clock.currentTimeMillis)
const CLEANUP_MS = 10_000
export const realTime = { now, schedule: (callback, milliseconds) => setTimeout(() => callback(), milliseconds), cancel: timer => clearTimeout(timer), pause: milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)) }
const EnvironmentSchema = Schema.Record(Schema.String, Schema.RedactedFromValue(Schema.String))
const parseEnvironment = (environment = process.env) => Schema.decodeUnknownSync(EnvironmentSchema)(Object.fromEntries(Object.entries(environment).filter(([key]) => key.startsWith('HULY_') || ['NODE_OPTIONS', 'MCP_AUTO_EXIT', 'HULY_TOOL_MODE'].includes(key))))
const atomicState = async (file, state) => {
  const temporary = `${file}.${process.pid}.tmp`
  await writeFile(temporary, JSON.stringify(state))
  await rename(temporary, file)
}
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
const preparationFingerprint = async root => {
  const configurations = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json', 'vitest.config.ts',
    '.oxlintrc.json', 'oxlint.complexity.json', '.jscpd.json', 'dprint.json']
  const files = [...(await walk(path.join(root, 'scripts'))), ...(await walk(path.join(root, 'test')))].map(file => path.relative(root, file))
  for (const configuration of configurations)
    if (await optionalFile(path.join(root, configuration)) !== undefined) files.push(configuration)
  return byteFingerprint(root, files.sort((a, b) => a.localeCompare(b)))
}
export const movementTransportInputs = ['scripts/integration-mcp-adapter.sh', 'scripts/integration-mcp-adapter.test.mjs', 'scripts/integration-mcp-call.ts', 'scripts/integration-mcp-observer-status.ts', 'scripts/integration-mcp-call-main.ts', 'scripts/integration-mcp-prior.ts', 'scripts/integration-mcp-prior-prepare.ts', 'test/scripts/integration-mcp-call.test.ts', 'test/scripts/integration-mcp-observer-status.test.ts', 'test/mcp/movement-stage-observer.test.ts', 'test/mcp/movement-stage-report.test.ts', 'test/scripts/integration-mcp-prior.test.ts', 'test/integration-fixtures/movement-public-process.test.ts', 'test/integration-fixtures/movement-public-process-fixture.ts']
export const fingerprintSuite = async (root, suite, prepare, includeGenerated = true, environmentInput = process.env) => {
  const generatedFiles = includeGenerated
    ? [...await walk(path.join(root, 'dist')), ...await walk(path.join(root, 'packages/huly-cli/dist'))].filter(file => !file.endsWith('.tsbuildinfo')).map(file => path.relative(root, file))
    : []
  const commonFiles = [...movementTransportInputs, 'pnpm-lock.yaml', 'tsconfig.json', ...(await walk(path.join(root, 'src'))).map(file => path.relative(root, file)),
    ...(await walk(path.join(root, 'packages/huly-cli/src'))).map(file => path.relative(root, file)),
    ...generatedFiles]
  if (prepare !== undefined) commonFiles.push(...await dependencies(root, prepare))
  const environment = parseEnvironment(environmentInput)
  const packageData = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.JsonObject))(await readFile(path.join(root, 'package.json'), 'utf8'))
  const scripts = packageData['scripts']
  const buildScripts = typeof scripts === 'object' && scripts !== null && !Array.isArray(scripts)
    ? Object.fromEntries(Object.entries(scripts).filter(([key]) => key.startsWith('build') && !key.includes('readme'))) : {}
  const packageProjection = ['name', 'version', 'type', 'dependencies', 'devDependencies', 'engines', 'packageManager'].map(key => [key, packageData[key] ?? null])
  const cliPackage = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.JsonObject))(await readFile(path.join(root, 'packages/huly-cli/package.json'), 'utf8'))
  const cliProjection = cliPackage
  const commonFingerprint = hash(JSON.stringify({ packageProjection, cliProjection, buildScripts, bytes: await byteFingerprint(root, [...new Set(commonFiles)].sort((a, b) => a.localeCompare(b))) }))
  const suiteFingerprint = await byteFingerprint(root, await dependencies(root, `scripts/integration_test_${suite}.sh`))
  const environmentFingerprint = hash(JSON.stringify(Object.entries(environment).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, hash(Redacted.value(value))])))
  return { commonFingerprint, suiteFingerprint, environmentFingerprint, fingerprint: hash(JSON.stringify({ common: commonFingerprint, suite: suiteFingerprint, environment: environmentFingerprint, runtime: [process.version, process.platform, process.arch] })) }
}
const reusableLog = async (receipt, time) => {
  const content = await optionalFile(receipt.log)
  return content !== undefined && hash(content) === receipt.logHash && receipt.started <= receipt.ended && receipt.ended <= time.now()
}
const groupAlive = pid => { try { process.kill(-pid, 0); return true } catch (error) { if (error.code === 'ESRCH') return false; throw error } }
const signalGroup = (pid, signal) => { try { process.kill(-pid, signal) } catch (error) { if (error.code !== 'ESRCH') throw error } }
export const boundedProcess = async (root, script, log, deadline, time = realTime, preparationEnvironment = {}) => {
  if (time.now() >= deadline) return { exit: TIMEOUT_EXIT, clean: true, launched: false }
  const custodyDirectory = `${log}.custody`
  await mkdir(custodyDirectory, { recursive: true, mode: 0o700 })
  if ((await readdir(custodyDirectory)).length !== 0)
    return { exit: 1, clean: false, launched: false, custodyDirectory }
  const output = await import('node:fs').then(fs => fs.openSync(log, 'a'))
  const child = spawn('bash', [script], { cwd: root, detached: true, stdio: ['ignore', output, output],
    env: { ...process.env, MOVEMENT_VERIFIED_QUALITY_RECEIPT: '', MOVEMENT_QUALITY_CHECK_TIME: '', ...preparationEnvironment, MOVEMENT_CUSTODY_DIR: custodyDirectory } })
  let timedOut = false
  let interrupted = false
  let interruptionKill
  const interrupt = () => { interrupted = true; signalGroup(child.pid, 'SIGTERM'); interruptionKill ??= time.schedule(() => signalGroup(child.pid, 'SIGKILL'), CLEANUP_MS) }
  process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt)
  const timer = time.schedule(() => { timedOut = true; signalGroup(child.pid, 'SIGTERM') }, Math.max(1, deadline - time.now()))
  const killed = time.schedule(() => signalGroup(child.pid, 'SIGKILL'), Math.max(1, deadline - time.now()) + CLEANUP_MS)
  const exit = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code ?? SIGNAL_EXIT)) })
  time.cancel(timer)
  if (groupAlive(child.pid)) {
    signalGroup(child.pid, 'SIGTERM')
    const cleanupEnd = Math.min(deadline + CLEANUP_MS, time.now() + CLEANUP_MS)
    while (groupAlive(child.pid) && time.now() < cleanupEnd) await time.pause(CLEANUP_POLL_MS)
    if (groupAlive(child.pid)) signalGroup(child.pid, 'SIGKILL')
  }
  time.cancel(killed); time.cancel(interruptionKill)
  process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt)
  // A vanished preparation group does not prove its detached quality stages stopped.
  // Any retained record, including malformed/starting records, keeps custody fail-closed.
  const clean = !groupAlive(child.pid) && (await readdir(custodyDirectory)).length === 0
  const fs = await import('node:fs'); fs.closeSync(output)
  return { exit: timedOut ? TIMEOUT_EXIT : interrupted ? INTERRUPTED_EXIT : exit, clean, launched: true,
    ...(clean ? {} : { custodyDirectory }) }
}
export const runCertification = async (options) => {
  const root = path.resolve(options.root), lock = path.join(root, '.movement-certification.lock')
  try { await mkdir(lock) } catch (error) { if (error.code === 'EEXIST') return { exit: 1, expired: false, plan: [], locked: true }; throw error }
  const ownership = { clean: true }
  try { return await ownedCertification({ ...options, root, time: options.time ?? realTime }, ownership) }
  finally { if (ownership.clean) await rm(lock, { recursive: true }) }
}
export const selectedPolicy = (deadline, perSuiteTimeoutMs, time = realTime) => {
  const hasDeadline = deadline !== undefined && !Number.isNaN(deadline)
  if (hasDeadline === (perSuiteTimeoutMs !== undefined)) throw new Error('Choose exactly one of --deadline or --per-suite-timeout-ms')
  if (perSuiteTimeoutMs !== undefined) {
    if (!Number.isSafeInteger(perSuiteTimeoutMs) || perSuiteTimeoutMs <= 0 || perSuiteTimeoutMs > MAX_CAMPAIGN_MS) throw new Error('--per-suite-timeout-ms requires a positive finite safe integer no greater than 1200000 (20 minutes)')
    return { perSuiteTimeoutMs, expired: false }
  }
  if (!Number.isFinite(deadline)) throw new Error('--deadline requires a finite absolute deadline')
  return { deadline: Math.min(deadline, time.now() + MAX_CAMPAIGN_MS), expired: false }
}
export const parseArguments = args => {
  const flags = new Set(['--run', '--plan'])
  const values = new Set(['--state-dir', '--deadline', '--per-suite-timeout-ms', '--diagnostic', '--prepare'])
  const parsed = new Map()
  for (let index = 0; index < args.length; index++) {
    const key = args[index]
    if (parsed.has(key) || (!flags.has(key) && !values.has(key))) throw new Error(`Invalid or duplicate option: ${key}`)
    if (flags.has(key)) parsed.set(key, true)
    else {
      const value = args[++index]
      if (value === undefined || value.startsWith('--')) throw new Error(`Missing value: ${key}`)
      parsed.set(key, value)
    }
  }
  if (parsed.has('--run') === parsed.has('--plan')) throw new Error('Choose exactly one of --plan or --run')
  const deadline = parsed.has('--deadline') ? Date.parse(parsed.get('--deadline')) : undefined
  const perSuiteTimeoutMs = parsed.has('--per-suite-timeout-ms') ? Number(parsed.get('--per-suite-timeout-ms')) : undefined
  if (parsed.has('--deadline') && !Number.isFinite(deadline)) throw new Error('Invalid --deadline')
  if (parsed.has('--deadline') || parsed.has('--per-suite-timeout-ms') || parsed.has('--run')) selectedPolicy(deadline, perSuiteTimeoutMs)
  return { mode: parsed.has('--run') ? 'run' : 'plan', stateDir: parsed.get('--state-dir'), deadline, perSuiteTimeoutMs, diagnostic: parsed.get('--diagnostic'), prepare: parsed.get('--prepare') }
}
const ownedCertification = async ({ deadline, perSuiteTimeoutMs, diagnostic, mode, prepare, root, stateDir, time, environment = process.env }, ownership) => {
  stateDir = path.resolve(stateDir)
  const stateFile = path.join(stateDir, 'campaign.json'), receiptFile = path.join(stateDir, 'receipts.jsonl')
  const prior = await optionalFile(stateFile)
  const campaign = prior === undefined ? undefined : parseCampaign(prior)
  const receiptText = await optionalFile(receiptFile)
  const receipts = receiptText === undefined ? [] : receiptText.trim().split('\n').filter(Boolean).map(parseReceipt)
  if (mode === 'plan') {
    const plan = []
    for (const suite of suites) {
      const fingerprints = await fingerprintSuite(root, suite, prepare, true, environment)
      const { fingerprint } = fingerprints
      const receipt = receipts.findLast(value => value.suite === suite && value.fingerprint === fingerprint)
      const reusable = receipt?.exit === 0 && receipt.clean && receipt.inputsStable && await reusableLog(receipt, time)
      plan.push({ suite, status: reusable ? 'reuse' : receipt !== undefined ? 'blocked' : 'pending',
        ...(receipt === undefined ? {} : { sourceCommit: receipt.sourceCommit, log: receipt.log }) })
    }
    return { exit: 0, expired: campaign?.expired ?? false, policy: campaign ?? (deadline === undefined && perSuiteTimeoutMs === undefined ? undefined : selectedPolicy(deadline, perSuiteTimeoutMs, time)), plan }
  }
  const requested = selectedPolicy(deadline, perSuiteTimeoutMs, time)
  if (campaign !== undefined && (('perSuiteTimeoutMs' in campaign) !== ('perSuiteTimeoutMs' in requested) ||
    ('perSuiteTimeoutMs' in campaign && campaign.perSuiteTimeoutMs !== requested.perSuiteTimeoutMs)))
    throw new Error('Campaign timeout policy is immutable; use a new evidence directory')
  const state = campaign === undefined ? requested : 'deadline' in campaign
    ? { deadline: Math.min(requested.deadline, campaign.deadline), expired: campaign.expired }
    : campaign
  const campaignExpired = () => state.expired || ('deadline' in state && time.now() >= state.deadline)
  const processDeadline = () => 'deadline' in state ? state.deadline : time.now() + state.perSuiteTimeoutMs
  state.expired = campaignExpired()
  await mkdir(stateDir, { recursive: true })
  await atomicState(stateFile, parseCampaign(JSON.stringify(state)))
  if (state.expired) return { exit: TIMEOUT_EXIT, expired: true, plan: [] }
  let clean = true
  try {
    await writeFile(path.join(root, '.movement-certification.lock/owner.json'), JSON.stringify({ pid: process.pid, policy: state, stateDir }))
    if ((environment.HULY_MOVEMENT_CONCURRENCY_CASES ?? process.env.HULY_MOVEMENT_CONCURRENCY_CASES ?? '').trim() !== '')
      return { exit: 1, expired: false, plan: [], preflight: 'full-matrix-required' }
    if (!inspectPriorEnvironment(environment).supported) return { exit: 1, expired: false, plan: [], preflight: 'unsupported-prior-environment' }
    const sourceBaseline = await fingerprintSuite(root, suites[0], prepare, false, environment)
    if (prepare !== undefined) {
      await dependencies(root, prepare)
      const qualityFile = path.join(stateDir, 'quality-receipts.jsonl')
      const qualityText = await optionalFile(qualityFile)
      const qualities = qualityText === undefined ? [] : qualityText.trim().split('\n').filter(Boolean).map(parseQualityReceipt)
      const qualityInput = await qualityFingerprint(root, prepare)
      const previousQuality = qualities.findLast(receipt => receipt.fingerprint === qualityInput)
      const qualityReusable = await reusableQualityReceipt(root, previousQuality, time.now())
      if (previousQuality !== undefined && !qualityReusable && !diagnostic?.startsWith('quality:'))
        return { exit: 1, expired: false, plan: [], quality: 'blocked' }
      const allReusable = qualityReusable && (await Promise.all(suites.map(async suite => {
        const { fingerprint } = await fingerprintSuite(root, suite, prepare, true, environment)
        const receipt = receipts.findLast(value => value.suite === suite && value.fingerprint === fingerprint)
        return receipt?.exit === 0 && receipt.clean && receipt.inputsStable && await reusableLog(receipt, time)
      }))).every(Boolean)
      if (!allReusable) {
        const preparationBaseline = await preparationFingerprint(root)
        const started = time.now(), log = path.join(stateDir, `prepare-${started}.log`)
        const grantFile = path.join(stateDir, 'verified-quality.json')
        if (qualityReusable) await atomicState(grantFile, previousQuality)
        ownership.clean = false
        const result = await boundedProcess(root, prepare, log, processDeadline(), time,
          { ...environment, ...(qualityReusable ? { MOVEMENT_VERIFIED_QUALITY_RECEIPT: grantFile, MOVEMENT_QUALITY_CHECK_TIME: String(time.now()) } : {}) })
        clean = result.clean; ownership.clean = clean
        const stable = await qualityFingerprint(root, prepare) === qualityInput && await preparationFingerprint(root) === preparationBaseline
        if (!qualityReusable) await appendFile(qualityFile, JSON.stringify(parseQualityReceipt(JSON.stringify({ prepare, fingerprint: qualityInput,
          artifactFingerprint: await qualityArtifactFingerprint(root), sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
          log, logHash: hash(await readFile(log)), started, ended: time.now(), exit: result.exit, clean: result.clean, inputsStable: stable }))) + '\n')
        if (result.exit !== 0 || !result.clean) return { exit: result.exit || 1, expired: campaignExpired(), plan: [] }
        if (!stable) return { exit: 1, expired: false, plan: [], drift: true }
      }
    }
    if ((await fingerprintSuite(root, suites[0], prepare, false, environment)).fingerprint !== sourceBaseline.fingerprint) return { exit: 1, expired: false, plan: [], drift: true }
    const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
    const plan = []
    const accepted = new Map()
    for (const suite of suites) {
      if (campaignExpired()) { state.expired = true; return { exit: TIMEOUT_EXIT, expired: true, plan } }
      const fingerprints = await fingerprintSuite(root, suite, prepare, true, environment)
      const { fingerprint } = fingerprints
      const receipt = receipts.findLast(value => value.suite === suite && value.fingerprint === fingerprint)
      if (receipt?.exit === 0 && receipt.clean && receipt.inputsStable && await reusableLog(receipt, time)) { accepted.set(suite, fingerprint); plan.push({ suite, status: 'reuse', log: receipt.log, sourceCommit: receipt.sourceCommit }); continue }
      const admission = diagnostic?.startsWith(`${suite}:`) === true ? diagnostic.slice(suite.length + 1).trim() : undefined
      if (receipt !== undefined && !admission) return { exit: 1, expired: false, plan: [...plan, { suite, status: 'blocked', log: receipt.log }] }
      ownership.clean = false
      const started = time.now(), log = path.join(stateDir, `${suite}-${started}.log`)
      const result = await boundedProcess(root, `scripts/integration_test_${suite}.sh`, log, processDeadline(), time, environment)
      clean = result.clean
      ownership.clean = clean
      const sourceStable = (await fingerprintSuite(root, suites[0], prepare, false, environment)).fingerprint === sourceBaseline.fingerprint
      const inputsStable = sourceStable && (await fingerprintSuite(root, suite, prepare, true, environment)).fingerprint === fingerprint
      const evidence = parseReceipt(JSON.stringify({ suite, ...fingerprints, sourceCommit, log, logHash: hash(await readFile(log)), started, ended: time.now(), exit: result.exit, clean, inputsStable,
        ...(admission ? { diagnostic: admission } : {}) }))
      await appendFile(receiptFile, JSON.stringify(evidence) + '\n'); receipts.push(evidence)
      plan.push({ suite, status: result.exit === 0 && inputsStable ? 'passed' : 'failed', log })
      if (result.exit !== 0 || !clean || !inputsStable) { state.expired ||= 'deadline' in state && result.exit === TIMEOUT_EXIT; return { exit: result.exit || 1, expired: state.expired, plan } }
      accepted.set(suite, fingerprint)
    }
    if ((await fingerprintSuite(root, suites[0], prepare, false, environment)).fingerprint !== sourceBaseline.fingerprint) return { exit: 1, expired: false, plan, drift: true }
    for (const [suite, fingerprint] of accepted) {
      if ((await fingerprintSuite(root, suite, prepare, true, environment)).fingerprint !== fingerprint) return { exit: 1, expired: false, plan, drift: true }
    }
    return { exit: campaignExpired() ? TIMEOUT_EXIT : 0, expired: campaignExpired(), plan }
  } finally {
    ownership.clean = ownership.clean && clean
    state.expired ||= campaignExpired()
    await atomicState(stateFile, state)
  }
}
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.cwd()
  const options = parseArguments(process.argv.slice(ARGV_START))
  const result = await runCertification({ ...options, root, stateDir: options.stateDir ?? path.join(root, '.movement-certification') })
  process.stdout.write(JSON.stringify(result) + '\n'); process.exitCode = result.exit
}
