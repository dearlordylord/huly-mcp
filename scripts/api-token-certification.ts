import { access } from "node:fs/promises"
import { randomUUID } from "node:crypto"

import { Redacted, Schema } from "effect"

import {
  CertificationConnectionConfigSchema,
  CertificationHttpPort,
  connectHttpCertificationPort,
  connectStdioCertificationPort
} from "./api-token-certification-adapter.js"
import {
  ActiveOrchestrationInputSchema,
  type CertificationOrchestrationInput,
  isCertificationSuccessful,
  RevokedOrchestrationInputSchema,
  runCertificationTransports
} from "./api-token-certification-orchestration.js"
import {
  CertificationCaptureLedger,
  CertificationSecretSafetySchema,
  redactCertificationSecret
} from "./api-token-certification-security.js"
import {
  ActiveHttpCertificationReportSchema,
  ActiveStdioCertificationReportSchema,
  CertificationRunId,
  RevokedHttpCertificationReportSchema,
  RevokedStdioCertificationReportSchema
} from "./api-token-certification-workflow.js"
import {
  AttachmentId,
  DocumentIdentifier,
  ProjectIdentifier,
  TeamspaceIdentifier
} from "../src/domain/schemas/shared.js"

const DEFAULT_PROJECT = ProjectIdentifier.make("HULY")
const DEFAULT_HTTP_PORT_VALUE = 19_889
const DEFAULT_HTTP_PORT = CertificationHttpPort.make(DEFAULT_HTTP_PORT_VALUE)
const PROCESS_ARGUMENT_OFFSET = 2
const JSON_INDENT_SPACES = 2

const HarnessEnvironmentSchema = Schema.Struct({
  ...CertificationConnectionConfigSchema.fields,
  token: Schema.RedactedFromValue(CertificationConnectionConfigSchema.fields.token.value),
  project: ProjectIdentifier,
  httpPort: CertificationHttpPort,
  attachmentId: Schema.optionalKey(AttachmentId),
  teamspace: Schema.optionalKey(TeamspaceIdentifier),
  document: Schema.optionalKey(DocumentIdentifier)
})
const HarnessPhaseSchema = Schema.Literals(["active", "revoked"])
const SummaryFields = {
  certification: Schema.Literal("legacy-token-harness"),
  personalApiTokenCompatibility: Schema.Literal("uncertified"),
  secretSafety: CertificationSecretSafetySchema
}
const ActiveHarnessSummarySchema = Schema.Struct({
  ...SummaryFields,
  phase: Schema.Literal("active"),
  reports: Schema.Tuple([ActiveStdioCertificationReportSchema, ActiveHttpCertificationReportSchema])
})
const RevokedHarnessSummarySchema = Schema.Struct({
  ...SummaryFields,
  phase: Schema.Literal("revoked"),
  reports: Schema.Tuple([RevokedStdioCertificationReportSchema, RevokedHttpCertificationReportSchema])
})
const HarnessSummarySchema = Schema.Union([ActiveHarnessSummarySchema, RevokedHarnessSummarySchema])

type HarnessPhase = Schema.Schema.Type<typeof HarnessPhaseSchema>
type HarnessEnvironment = Schema.Schema.Type<typeof HarnessEnvironmentSchema>

const usage = "Usage: pnpm certify:api-token --phase active|revoked"

const parsePhase = (arguments_: ReadonlyArray<string>): HarnessPhase => {
  const phaseFlagIndex = arguments_.indexOf("--phase")
  return Schema.decodeUnknownSync(HarnessPhaseSchema)(arguments_[phaseFlagIndex + 1], {
    errors: "all",
    onExcessProperty: "error"
  })
}

const parseHttpPort = (value: string | undefined): CertificationHttpPort => {
  if (value === undefined) return DEFAULT_HTTP_PORT
  return Schema.decodeUnknownSync(Schema.NumberFromString.pipe(Schema.decodeTo(CertificationHttpPort)))(value)
}

const loadEnvironment = (): HarnessEnvironment =>
  Schema.decodeUnknownSync(HarnessEnvironmentSchema)({
    url: process.env["HULY_URL"],
    workspace: process.env["HULY_WORKSPACE"],
    token: process.env["HULY_TOKEN"],
    project: process.env["HULY_CERT_PROJECT"] ?? DEFAULT_PROJECT,
    httpPort: parseHttpPort(process.env["HULY_CERT_HTTP_PORT"]),
    ...(process.env["HULY_CERT_ATTACHMENT_ID"] === undefined
      ? {}
      : { attachmentId: process.env["HULY_CERT_ATTACHMENT_ID"] }),
    ...(process.env["HULY_CERT_TEAMSPACE"] === undefined ? {} : { teamspace: process.env["HULY_CERT_TEAMSPACE"] }),
    ...(process.env["HULY_CERT_DOCUMENT"] === undefined ? {} : { document: process.env["HULY_CERT_DOCUMENT"] })
  })

const makeOrchestrationInput = (
  phase: HarnessPhase,
  environment: HarnessEnvironment
): CertificationOrchestrationInput =>
  phase === "active"
    ? ActiveOrchestrationInputSchema.make({
        phase,
        project: environment.project,
        runId: CertificationRunId.make(randomUUID())
      })
    : Schema.decodeUnknownSync(RevokedOrchestrationInputSchema)({
        phase,
        attachmentId: environment.attachmentId,
        teamspace: environment.teamspace,
        document: environment.document
      })

const main = async (): Promise<void> => {
  const phase = parsePhase(process.argv.slice(PROCESS_ARGUMENT_OFFSET))
  const environment = loadEnvironment()
  await access("dist/index.cjs")

  const connection = CertificationConnectionConfigSchema.make({
    url: environment.url,
    workspace: environment.workspace,
    token: environment.token
  })
  const ledger = new CertificationCaptureLedger(environment.token)
  const input = makeOrchestrationInput(phase, environment)
  const reports = await runCertificationTransports(
    {
      connect: (transport) =>
        transport === "stdio"
          ? connectStdioCertificationPort(connection, ledger)
          : connectHttpCertificationPort(connection, ledger, environment.httpPort)
    },
    input
  )
  const summary = Schema.decodeUnknownSync(HarnessSummarySchema)({
    certification: "legacy-token-harness",
    personalApiTokenCompatibility: "uncertified",
    phase,
    reports,
    secretSafety: ledger.summary()
  })

  process.stdout.write(`${JSON.stringify(summary, undefined, JSON_INDENT_SPACES)}\n`)
  if (!isCertificationSuccessful(summary.reports, summary.secretSafety)) process.exitCode = 1
}

const reportFailure = (error: unknown): void => {
  const rawToken = process.env["HULY_TOKEN"]
  const message = error instanceof Error ? error.message : String(error)
  const safeMessage =
    rawToken === undefined || rawToken.trim().length === 0
      ? message
      : redactCertificationSecret(message, Redacted.make(rawToken))
  process.stderr.write(`API-token certification harness failed. ${safeMessage}\n${usage}\n`)
  process.exitCode = 1
}

void main().catch(reportFailure)
