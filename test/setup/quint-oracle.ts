import "../../quint-specs/oracle-client/typescript/vitest.js"

import { beforeEach } from "vitest"

import { enabled, log } from "../../quint-specs/oracle-client/typescript/index.js"
import { HTTP_ADMISSION_SCOPE } from "../../src/mcp/http-admission-observations.js"
import { subscribeHttpAdmissionObservations } from "../helpers/http-admission-observations.js"
import { ORACLE_INFRASTRUCTURE_TAG } from "../helpers/test-tags.js"

beforeEach((context) => {
  if (!enabled() || context.task.tags?.includes(ORACLE_INFRASTRUCTURE_TAG)) return
  const errors: unknown[] = []
  const unsubscribe = subscribeHttpAdmissionObservations(
    ({ _tag, ...fields }) => log(_tag, fields, [HTTP_ADMISSION_SCOPE]),
    (error) => errors.push(error)
  )
  context.onTestFinished(() => {
    unsubscribe()
    if (errors.length > 0) throw new AggregateError(errors, "Quint observation forwarding failed")
  })
})
