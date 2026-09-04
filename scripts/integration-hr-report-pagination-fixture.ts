import { NodeRuntime } from "@effect/platform-node"
import { Effect, Layer, Schema } from "effect"

import { HulyConfigService } from "../src/config/config.js"
import {
  HrReportParamsSchema,
  HrScheduleResultSchema,
  HrSummaryReportResultSchema,
  HrTableResultSchema
} from "../src/domain/schemas.js"
import { HulyClient } from "../src/huly/client.js"
import { HrPageSize } from "../src/huly/operations/hr-pagination.js"
import { getHrSchedule, getHrSummaryReport, getHrTable } from "../src/huly/operations/hr-reports.js"

const IntegrationReportResultSchema = Schema.Struct({
  schedule: HrScheduleResultSchema,
  table: HrTableResultSchema,
  summary: HrSummaryReportResultSchema
})

const parseInput = Effect.fn("IntegrationHrReportPagination.parseInput")(function* () {
  const [, , department, startDate, endDate] = process.argv
  return yield* Schema.decodeUnknownEffect(HrReportParamsSchema)({ department, startDate, endDate })
})

const runReports = Effect.fn("IntegrationHrReportPagination.runReports")(function* () {
  const params = yield* parseInput()
  const pageSize = yield* Schema.decodeUnknownEffect(HrPageSize)(1)
  return yield* Effect.all(
    {
      schedule: getHrSchedule(params, pageSize),
      table: getHrTable(params, pageSize),
      summary: getHrSummaryReport(params, pageSize)
    },
    { concurrency: 1 }
  )
})

const clientLayer = HulyClient.layer.pipe(Layer.provide(HulyConfigService.layer))

const program = runReports().pipe(
  Effect.flatMap(Schema.encodeUnknownEffect(IntegrationReportResultSchema)),
  Effect.flatMap((result) => Effect.sync(() => JSON.stringify(result))),
  Effect.tap((output) => Effect.sync(() => process.stdout.write(`${output}\n`))),
  Effect.provide(clientLayer),
  Effect.scoped
)

NodeRuntime.runMain(program)
