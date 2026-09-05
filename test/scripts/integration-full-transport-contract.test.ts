import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

const script = readFileSync("scripts/integration_test_full.sh", "utf8")
const hrPaginationAdapter = readFileSync("scripts/integration-hr-report-pagination-fixture.ts", "utf8")

const functionBody = (name: string): string => {
  const match = script.match(new RegExp(`\\n${name}\\(\\) \\{([\\s\\S]*?)\\n\\}`))
  expect(match, `${name} must remain a top-level shell function`).not.toBeNull()
  return match?.[1] ?? ""
}

const shellFunction = (name: string): string => `${name}() {${functionBody(name)}\n}`

const toolResponseSucceeded = (response: unknown): boolean => {
  const encodedResponse = JSON.stringify(response)
  if (encodedResponse === undefined) return false
  try {
    execFileSync(
      "bash",
      ["-c", `${shellFunction("tool_response_succeeded")}\ntool_response_succeeded "$1"`, "predicate", encodedResponse],
      { stdio: "ignore" }
    )
    return true
  } catch {
    return false
  }
}

const leadLabelAbsenceSucceeded = (responseText: string, labelId: string, title: string): boolean => {
  const response = JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    result: { content: [{ type: "text", text: responseText }] }
  })
  try {
    execFileSync(
      "bash",
      [
        "-c",
        `${shellFunction("wait_for_tool_field_quiet")}\n${shellFunction("wait_for_lead_label_absence_quiet")}\njson_string() { jq -Rn --arg value "$1" '$value'; }\ncall_tool_fresh_session() { printf '%s\\n' "$RESPONSE"; }\nsleep() { :; }\nwait_for_lead_label_absence_quiet "$1" "$2" 1`,
        "label-readback",
        labelId,
        title
      ],
      { env: { ...process.env, RESPONSE: response }, stdio: "ignore" }
    )
    return true
  } catch {
    return false
  }
}

const expectRestartBeforeCapture = (body: string, capture: string): void => {
  const restartIndex = body.indexOf("restart_http_transport_if_needed")
  const captureIndex = body.indexOf(capture)
  expect(restartIndex).toBeGreaterThanOrEqual(0)
  expect(captureIndex).toBeGreaterThan(restartIndex)
}

describe("full integration HTTP fresh-session contract", () => {
  it("restarts in each parent-shell capture wrapper before entering command substitution", () => {
    expectRestartBeforeCapture(functionBody("wait_for_employee_position"), "text=$(run_capture_only_fresh")
    expectRestartBeforeCapture(functionBody("restore_employee_position"), "restore_result=$(call_tool")
    expectRestartBeforeCapture(functionBody("run_capture_to_var_fresh"), "run_capture_to_var_with_runner")
  })

  it("keeps the command-substitution runner free of transport lifecycle mutations", () => {
    const body = functionBody("run_capture_only_fresh")
    expect(body).toContain('result=$(call_tool "$payload")')
    expect(body).not.toContain("restart_http_transport_if_needed")
    expect(functionBody("run_capture_to_var_fresh")).toContain("run_capture_to_var_with_runner call_tool")
  })

  it("uses bounded one-shot transports for fresh-session cleanup and readback", () => {
    const freshSession = functionBody("call_tool_fresh_session")
    expect(freshSession).toContain('call_tool_cli "$payload"')
    expect(freshSession).toContain('call_tool_stdio "$payload"')
    expect(freshSession).not.toContain("call_tool_http")
    expect(freshSession).not.toContain("restart_http_transport_if_needed")
    expect(functionBody("call_tool_stdio")).toContain('timeout "$TOOL_TIMEOUT"')
    expect(functionBody("call_tool_cli")).toContain('timeout "$TOOL_TIMEOUT"')
  })

  it("retains employee cleanup state until fresh Person and Employee readback confirm deletion", () => {
    const body = functionBody("cleanup_employee_lifecycle_artifacts")
    const deleteIndex = body.indexOf("delete_result=$(call_tool_fresh_session")
    const personReadIndex = body.indexOf("read_result=$(call_tool_fresh_session")
    const employeeReadIndex = body.indexOf("employee_result=$(call_tool_fresh_session")
    const clearIndex = body.indexOf('EMPLOYEE_LIFECYCLE_CLEANUP_PERSON_ID=""')
    expect(deleteIndex).toBeGreaterThanOrEqual(0)
    expect(personReadIndex).toBeGreaterThan(deleteIndex)
    expect(employeeReadIndex).toBeGreaterThan(personReadIndex)
    expect(clearIndex).toBeGreaterThan(employeeReadIndex)
    expect(body).toContain('while [ "$attempt" -le 8 ]')
    expect(body.match(/test\("not found"; "i"\)/gu)).toHaveLength(2)
  })

  it("polls nested department readback with parent-owned fresh sessions", () => {
    const body = functionBody("wait_for_department_path")
    expectRestartBeforeCapture(body, 'result=$(call_tool "$payload"')
    expect(body).toContain('while [ "$attempt" -le "$attempts" ]')
    expect(body).toContain("jq -r '.id // empty'")
    expect(body).not.toContain("run_capture_to_var")
  })

  it("retains the person merge source cleanup marker until fresh readback confirms deletion", () => {
    const body = functionBody("cleanup_retained_merge_source")
    const readbackIndex = body.indexOf('if wait_for_error_contains "get_person(person merge retained source cleanup)"')
    const clearIndex = body.indexOf('PERSON_MERGE_SOURCE_CLEANUP_ID=""')
    expectRestartBeforeCapture(body, "run_test")
    expect(readbackIndex).toBeGreaterThanOrEqual(0)
    expect(clearIndex).toBeGreaterThan(readbackIndex)
    expect(body).toContain("cleanup marker retained")
  })

  it("waits for canonical lead-person projections and idempotent mixin visibility", () => {
    expect(functionBody("wait_for_person_detail")).toContain("call_tool_fresh_session")
    expect(functionBody("wait_for_person_customer_noop")).toContain("call_tool_fresh_session")
    expect(functionBody("wait_for_lead_update_noop")).toContain("call_tool_fresh_session")
    expect(script).toContain('LEAD_PERSON_ID_JSON=$(json_string "$LEAD_PERSON_ID")')
    expect(script).not.toContain('$(json_string \\"$LEAD_PERSON_ID\\")')
    expect(script).toContain("LEAD_PERSON_NAME=$(printf '%s\\n' \"$LEAD_PERSON_DETAIL\" | jq -r '.name // empty'")
    expect(script).toContain('[.unsupportedFields[].field] | sort | join(",")')
  })

  it("polls lead, person, and funnel cleanup readback before clearing exact markers", () => {
    const leadCleanup = functionBody("cleanup_lead_artifacts")
    const funnelCleanup = functionBody("cleanup_funnel_artifacts")
    expect(leadCleanup).toContain("wait_for_tool_error_quiet")
    expect(leadCleanup).toContain("call_tool_fresh_session")
    expect(funnelCleanup).toContain("wait_for_tool_field_quiet")
    expect(funnelCleanup).toContain("wait_for_tool_error_quiet")
    expect(functionBody("wait_for_tool_error_quiet")).toContain("sleep 0.5")
    expect(functionBody("wait_for_tool_field_quiet")).toContain("sleep 0.5")
  })

  it("accepts successful tool envelopes when isError is omitted and rejects structural failures", () => {
    expect(toolResponseSucceeded({ jsonrpc: "2.0", id: 2, result: { content: [] } })).toBe(true)
    expect(toolResponseSucceeded({ jsonrpc: "2.0", id: 2, result: { content: [], isError: false } })).toBe(true)
    expect(toolResponseSucceeded({ jsonrpc: "2.0", id: 2, result: { content: [], isError: true } })).toBe(false)
    expect(toolResponseSucceeded({ jsonrpc: "2.0", id: 2, error: { code: -32_603, message: "failure" } })).toBe(false)
    expect(toolResponseSucceeded({ jsonrpc: "2.0", id: 2 })).toBe(false)
    expect(toolResponseSucceeded("not-json")).toBe(false)
  })

  it("requires mutation success and readback before clearing lead cleanup markers", () => {
    const leadCleanup = functionBody("cleanup_lead_artifacts")
    const funnelCleanup = functionBody("cleanup_funnel_artifacts")
    expect(leadCleanup.match(/tool_response_succeeded/gu)).toHaveLength(4)
    expect(funnelCleanup.match(/tool_response_succeeded/gu)).toHaveLength(2)
    expect(leadCleanup).toContain("wait_for_lead_label_absence_quiet")
  })

  it("uses an exact, complete, bounded label-definition readback before normal-path marker clearing", () => {
    const labelId = "label-123"
    expect(leadLabelAbsenceSucceeded('{"labels":[],"total":0,"truncated":false}', labelId, "unique-title")).toBe(true)
    expect(
      leadLabelAbsenceSucceeded('{"labels":[{"id":"label-123"}],"total":1,"truncated":false}', labelId, "unique-title")
    ).toBe(false)
    expect(leadLabelAbsenceSucceeded('{"labels":[],"total":2,"truncated":true}', labelId, "unique-title")).toBe(false)
    expect(leadLabelAbsenceSucceeded('{"labels":[],"total":1,"truncated":false}', labelId, "unique-title")).toBe(false)
    const normalPath = script.slice(
      script.indexOf('LEAD_LABEL_TITLE="lead-label-'),
      script.indexOf("LEAD_RELATIONS_TEXT")
    )
    expect(normalPath.indexOf("wait_for_lead_label_absence_quiet")).toBeGreaterThanOrEqual(0)
    expect(normalPath.indexOf('LEAD_LABEL_DEFINITION_CLEANUP_ID=""')).toBeGreaterThan(
      normalPath.indexOf("wait_for_lead_label_absence_quiet")
    )
  })

  it("keeps page-size-one live HR report composition behind the internal adapter", () => {
    expect(script).toContain("scripts/integration-hr-report-pagination-fixture.ts")
    expect(script).not.toContain("scanPageSize")
    expect(hrPaginationAdapter).toContain("Schema.decodeUnknownEffect(HrPageSize)(1)")
    expect(hrPaginationAdapter).toContain("getHrSchedule(params, pageSize)")
    expect(hrPaginationAdapter).toContain("getHrTable(params, pageSize)")
    expect(hrPaginationAdapter).toContain("getHrSummaryReport(params, pageSize)")
  })

  it("makes the page-two holiday affect the live employee table", () => {
    expect(script).toContain('\\"title\\":\\"Child holiday\\",\\"date\\":\\"2026-09-07\\"')
    expect(script).toContain('"$HR_CHILD_ID" "2026-09-04" "2026-09-07"')
    expect(script).toContain('".table.rows[0].publicHolidayWorkdays" "2"')
  })
})
