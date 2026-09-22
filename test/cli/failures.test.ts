import { it } from "@effect/vitest"
import { Effect } from "effect"
import { TestConsole } from "effect/testing"
import { afterEach, describe, expect } from "vitest"

import { runCliFailureBoundary } from "../../packages/huly-cli/src/failure-boundary.js"
import { failureFromOperation, presentCliFailure } from "../../packages/huly-cli/src/failures.js"
import { CliInputError } from "../../packages/huly-cli/src/input.js"
import { CliRuntimeError } from "../../packages/huly-cli/src/render.js"

const isKnownCliError = (error: unknown): error is CliInputError | CliRuntimeError =>
  error instanceof CliInputError || error instanceof CliRuntimeError

const originalExitCode = process.exitCode

afterEach(() => {
  process.exitCode = originalExitCode
})

const runBoundary = <A>(
  program: Effect.Effect<A, CliInputError>
): Effect.Effect<{ readonly output: ReadonlyArray<string>; readonly value: A | void }> =>
  Effect.gen(function* () {
    const value = yield* runCliFailureBoundary(program, true, isKnownCliError)
    const output = (yield* TestConsole.errorLines).map(String)
    return { output, value }
  })

describe("CLI automation failure contract", () => {
  it.each([
    { error: new CliInputError({ message: "bad input" }), code: "INVALID_INPUT", exitStatus: 2, retryable: false },
    {
      error: new CliRuntimeError({ kind: "authentication", message: "Authentication failed.", retryable: false }),
      code: "AUTHENTICATION_FAILED",
      exitStatus: 3,
      retryable: false
    },
    {
      error: new CliRuntimeError({ kind: "authorization", message: "Permission denied.", retryable: false }),
      code: "AUTHORIZATION_DENIED",
      exitStatus: 4,
      retryable: false
    },
    {
      error: new CliRuntimeError({ kind: "lookup", message: "Issue not found.", retryable: false }),
      code: "NOT_FOUND",
      exitStatus: 5,
      retryable: false
    },
    {
      error: new CliRuntimeError({ kind: "ambiguity", message: "Multiple issues matched.", retryable: false }),
      code: "AMBIGUOUS_RESULT",
      exitStatus: 5,
      retryable: false
    },
    {
      error: new CliRuntimeError({ kind: "conflict", message: "Already exists.", retryable: false }),
      code: "CONFLICT",
      exitStatus: 5,
      retryable: false
    },
    {
      error: new CliRuntimeError({ kind: "integration", message: "Service unavailable.", retryable: true }),
      code: "INTEGRATION_FAILED",
      exitStatus: 1,
      retryable: true
    }
  ])("maps $code to stable JSON and exit status", ({ code, error, exitStatus, retryable }) => {
    const presentation = presentCliFailure(error, true, isKnownCliError)

    expect(presentation.exitStatus).toBe(exitStatus)
    expect(JSON.parse(presentation.stderr)).toMatchObject({ code, retryable })
  })

  it("keeps human failures actionable and emits no stdout payload", () => {
    const presentation = presentCliFailure(new CliInputError({ message: "Use --project." }), false, isKnownCliError)

    expect(presentation).toEqual({ exitStatus: 2, stderr: "Use --project." })
  })

  it("redacts unknown defect details and gives defects a distinct status", () => {
    const presentation = presentCliFailure(new Error("token=super-secret"), true, isKnownCliError)

    expect(presentation.exitStatus).toBe(70)
    expect(presentation.stderr).not.toContain("super-secret")
    expect(JSON.parse(presentation.stderr)).toEqual({
      code: "INTERNAL_ERROR",
      message: "The CLI encountered an internal error.",
      retryable: false
    })
  })

  it("includes safe typed detail tags when an operation provides one", () => {
    expect(
      failureFromOperation({ detailTag: "ProjectNotFoundError", kind: "lookup", message: "Missing.", retryable: false })
    ).toMatchObject({ details: { tag: "ProjectNotFoundError" } })
  })

  it.effect("returns successful values through the failure boundary", () =>
    Effect.gen(function* () {
      const result = yield* runBoundary(Effect.succeed("completed"))

      expect(result).toEqual({ output: [], value: "completed" })
      expect(process.exitCode).toBe(originalExitCode)
    })
  )

  it.effect("renders typed failures and assigns their stable process status", () =>
    Effect.gen(function* () {
      const result = yield* runBoundary(Effect.fail(new CliInputError({ message: "Invalid project." })))

      expect(result.value).toBeUndefined()
      expect(result.output).toHaveLength(1)
      expect(JSON.parse(result.output[0] ?? "")).toMatchObject({ code: "INVALID_INPUT", message: "Invalid project." })
      expect(process.exitCode).toBe(2)
    })
  )

  it.effect("redacts defects at the in-process failure boundary", () =>
    Effect.gen(function* () {
      const result = yield* runBoundary(Effect.die(new Error("token=do-not-print")))

      expect(result.value).toBeUndefined()
      expect(result.output).toHaveLength(1)
      expect(result.output[0]).not.toContain("do-not-print")
      expect(JSON.parse(result.output[0] ?? "")).toMatchObject({ code: "INTERNAL_ERROR" })
      expect(process.exitCode).toBe(70)
    })
  )
})
