import { defineConfig } from 'vitest/config'
import { ORACLE_INFRASTRUCTURE_TAG } from './test/helpers/test-tags.js'
import { DeadlineFirstSequencer } from './test/helpers/deadline-first-sequencer.js'

const portTestFiles = [
  'test/domain/**/*.test.ts',
  'test/huly/**/*.test.ts',
  'test/config/**/*.test.ts',
  // These resident suites keep state in test-owned ports/scopes; entrypoint and process fixtures stay isolated.
  'test/resident/!(*-process|launch-model-alignment|configured-startup|managed-process|packaged-output-validation).test.ts',
  'test/utils/**/*.test.ts',
  'src/domain/**/*.test.ts',
  'src/huly/operations/**/*.test.ts',
  'src/utils/**/*.test.ts',
  'test/runtime/**/*.test.ts',
  // Subprocess stdio suites retain fresh module graphs in the boundaries project.
  'test/mcp/**/!(stdio-process-lifecycle|stdio-transport|stdio-output-drain|profile-startup-process|stdio-startup-network).test.ts',
]

const residentLaunchTestFiles = ['test/resident/managed-backend-process.test.ts']
const residentModelTestFiles = ['test/resident/launch-model-alignment.test.ts']
const residentWaitTestFiles = ['test/resident/model-wait-process.test.ts']
const residentFleetTestFiles = [
  'test/resident/ten-reader-process.test.ts',
  'test/resident/config-fault-process.test.ts',
  'test/resident/managed-version-process.test.ts',
  'test/resident/mixed-launch-process.test.ts',
]
const processTestFiles = [
  'test/resident/*-process.test.ts',
  'test/mcp/stdio-process-lifecycle.test.ts',
  'test/mcp/stdio-transport.test.ts',
  'test/mcp/stdio-output-drain.test.ts',
  'test/mcp/profile-startup-process.test.ts',
  'test/mcp/stdio-startup-network.test.ts',
  'test/helpers/stdio-build.test.ts',
  'test/cli/full-integration-adapter.test.ts',
]

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Keep ordinary I/O overlap bounded; intrinsic client fleets have a separate single-worker cohort.
    maxWorkers: 4,
    sequence: { sequencer: DeadlineFirstSequencer },
    // Persist transforms locally; every test still executes on each run.
    fsModuleCache: true,
    fsModuleCachePath: '.vitest-cache',
    // Keep real subprocesses and packed-artifact tests out of usage analytics.
    env: { HULY_MCP_TELEMETRY: '0', HULY_CLI_TELEMETRY: '0' },
    projects: [
      {
        test: {
          name: 'resident-model',
          include: residentModelTestFiles,
          isolate: true,
          // Keep each four-second Quint replay independent of native process-race CPU load.
          sequence: { groupOrder: 0 },
        },
      },
      {
        test: {
          name: 'resident-launch',
          globalSetup: ['./test/setup/coverage-stdio-artifact.ts'],
          include: residentLaunchTestFiles,
          isolate: true,
          // Ten independent parents already compete inside this fixture; keep unrelated suites out of its deadline.
          sequence: { groupOrder: 1 },
        },
      },
      {
        test: {
          name: 'resident-model-wait',
          globalSetup: ['./test/setup/coverage-stdio-artifact.ts'],
          include: residentWaitTestFiles,
          isolate: true,
          // Preserve held-request deadlines without competing test workers on small CI runners.
          sequence: { groupOrder: 2 },
        },
      },
      {
        test: {
          name: 'ports',
          include: portTestFiles,
          sequence: { groupOrder: 4 },
          // The oracle adapter registers its guard at import, so it needs a fresh module graph per file.
          isolate: Boolean(process.env.QUINT_ORACLE_URL?.trim()),
        },
      },
      {
        test: {
          name: 'units',
          globalSetup: ['./test/setup/coverage-stdio-artifact.ts'],
          include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
          exclude: [...portTestFiles, ...residentLaunchTestFiles, ...residentModelTestFiles, ...residentWaitTestFiles, ...processTestFiles],
          isolate: true,
          // Ordinary tests share workers and overlap process I/O; client fleets run separately.
          sequence: { groupOrder: 4 },
        },
      },
      {
        test: {
          name: 'resident-fleets',
          globalSetup: ['./test/setup/coverage-stdio-artifact.ts'],
          include: residentFleetTestFiles,
          isolate: true,
          // Keep intrinsic client fleets independent; their own concurrency remains unchanged.
          maxWorkers: 1,
          sequence: { groupOrder: 3 },
        },
      },
      {
        test: {
          name: 'boundaries',
          globalSetup: ['./test/setup/coverage-stdio-artifact.ts'],
          include: processTestFiles,
          exclude: [...residentLaunchTestFiles, ...residentWaitTestFiles, ...residentFleetTestFiles],
          isolate: true,
          sequence: { groupOrder: 4 },
        },
      },
    ],
    setupFiles: ['./test/setup/quint-oracle.ts'],
    tags: [{ name: ORACLE_INFRASTRUCTURE_TAG, description: 'Tests the observation channel itself without model forwarding.' }],
    // Report failures immediately without expanding successful gate output.
    reporters: process.env.CI ? ['dot', './test/helpers/ci-failure-reporter.ts'] : ['dot'],
    silent: 'passed-only',
    coverage: {
      provider: 'v8',
      reportOnFailure: true,
      reporter: ['text-summary', 'json', 'html'],
      skipFull: true,
      exclude: [
        'node_modules/**',
        'test/**',
        // Generated Quint Studio oracle client is test tooling, never imported by production code.
        // Our typed diagnostic publisher and its delivery/disabled behavior stay in the coverage gate.
        'quint-specs/oracle-client/**',
        '**/*.test.ts',
        '**/*.config.ts',
        'src/globals.d.ts',
        'src/reset.d.ts',
        'src/domain/schemas.ts',
        'src/domain/schemas/index.ts',
        'src/index.ts',
        // The dependency-light process shells are exercised as a built executable under Node 20 by package-smoke;
        // protocol parsing/routing and version decisions remain in the unit coverage gate.
        'src/launcher.ts',
        'src/unsupported-node-mcp-stdio.ts',
        'src/polyfills.ts',
        'src/version.ts',
        // Cross-platform process-tree control is an imperative quality-harness adapter. Dedicated tests cover
        // empty/mixed/forwarded output, spawn/nonzero/signal failures, and resistant-descendant cleanup.
        'scripts/run-bounded-command.ts',
        // Subprocess lifecycle control is an imperative adapter. A dedicated test proves bounded
        // SIGTERM-to-SIGKILL escalation and reaping; callers test the captured output contracts.
        'scripts/captured-process.ts',
        // Certification process wiring is an imperative shell over the tested workflow and secret ledger;
        // live local-Huly runs provide transport evidence for the built stdio and HTTP adapters.
        'scripts/api-token-certification-adapter.ts',
        'scripts/api-token-certification.ts',
        // @effect/cli command composition is an adapter over catalog metadata; command behavior is covered
        // through CLI smoke/unit tests while the catalog and input/runner logic remain in coverage.
        'packages/huly-cli/src/command-tree.ts',
        // Runner Node/Huly wiring is an imperative-shell adapter; behavior is covered through port-based
        // runner tests and local-Huly integration while parsing/rendering/catalog logic remains in coverage.
        'packages/huly-cli/src/runner.ts',
      ],
      // Final gate: keep all coverage metrics at or above 99%.
      thresholds: {
        lines: 99,
        functions: 99,
        branches: 99,
        statements: 99,
      },
    },
  },
})
