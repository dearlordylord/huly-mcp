import { it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { expect, it as plainIt } from "vitest"
import { WorkspaceVersion } from "../../src/domain/schemas/shared.js"
import { withHttpFixture } from "../helpers/http-fixture.js"
import { FixtureBoundaryError } from "../../scripts/issue-movement-concurrency/fixture-errors.js"
import {
  DeploymentVersionSchema,
  makeServerVersionEvidence,
  readDeploymentVersion,
  ServerVersionEvidenceSchema
} from "../../scripts/issue-movement-concurrency/version-evidence.js"

it.effect("distinguishes deployment release from matching model reports without asserting image identity", () =>
  Effect.gen(function* () {
    const deployment = Schema.decodeUnknownSync(DeploymentVersionSchema)({
      VERSION: "0.7.409",
      MODEL_VERSION: "0.7.343",
      privateSetting: "fixture-secret"
    })
    const evidence = yield* makeServerVersionEvidence(deployment, WorkspaceVersion.make("0.7.343"))
    expect(evidence.deployment).toEqual({
      source: "/config.json",
      reportedRelease: "0.7.409",
      reportedModelVersion: "0.7.343"
    })
    expect(evidence.workspace).toEqual({ source: "huly workspace info get", reportedModelVersion: "0.7.343" })
    expect(evidence.imageIdentity).toBe("not-established-by-these-APIs")
    expect(JSON.stringify(evidence)).not.toContain("fixture-secret")
  })
)

plainIt(
  "reads only reported release/model fields from ordinary config HTTP and discards unrelated secrets",
  async () => {
    const paths: Array<string | undefined> = []
    await withHttpFixture(
      (request, response) => {
        paths.push(request.url)
        response.end(JSON.stringify({ VERSION: "0.7.409", MODEL_VERSION: "0.7.343", token: "private-fixture-token" }))
      },
      async (url) => {
        const deployment = await Effect.runPromise(readDeploymentVersion(url))
        expect(deployment).toEqual({ VERSION: "0.7.409", MODEL_VERSION: "0.7.343" })
        expect(JSON.stringify(deployment)).not.toContain("private-fixture-token")
        expect(paths).toEqual(["/config.json"])
      }
    )
  }
)

for (const body of ["truncated {", '{"VERSION":"0.7.409"}', '{"VERSION":"","MODEL_VERSION":"0.7.343"}']) {
  plainIt(`returns typed config-parse context for malformed or incomplete HTTP config ${body}`, async () => {
    await withHttpFixture(
      (_request, response) => response.end(body),
      async (url) => {
        const result = await Effect.runPromise(Effect.result(readDeploymentVersion(url)))
        expect(result._tag).toBe("Failure")
        if (result._tag === "Failure") {
          expect(result.failure).toBeInstanceOf(FixtureBoundaryError)
          expect(result.failure.stage).toBe("config-parse")
          expect(result.failure.httpStatus).toBeUndefined()
          expect(JSON.stringify(result.failure)).not.toContain(body)
        }
      }
    )
  })
}

plainIt("preserves non-success HTTP status in typed version context without exposing its body", async () => {
  await withHttpFixture(
    (_request, response) => {
      response.writeHead(503)
      response.end("private-fixture-token")
    },
    async (url) => {
      const result = await Effect.runPromise(Effect.result(readDeploymentVersion(url)))
      expect(result._tag).toBe("Failure")
      if (result._tag === "Failure") {
        expect(result.failure.stage).toBe("config-read")
        expect(result.failure.httpStatus).toBe(503)
        expect(JSON.stringify(result.failure)).not.toContain("private-fixture-token")
      }
    }
  )
})

for (const action of ["redirect", "disconnect"]) {
  plainIt(`refuses a config ${action} without fabricating release/model evidence`, async () => {
    const paths: Array<string | undefined> = []
    await withHttpFixture(
      (request, response) => {
        paths.push(request.url)
        if (action === "disconnect") request.socket.destroy()
        else {
          response.writeHead(302, { location: "/private-fixture-token" })
          response.end()
        }
      },
      async (url) => {
        const result = await Effect.runPromise(Effect.result(readDeploymentVersion(url)))
        expect(result._tag).toBe("Failure")
        if (result._tag === "Failure") {
          expect(result.failure.stage).toBe("config-read")
          expect(result.failure.httpStatus).toBeUndefined()
          expect(JSON.stringify(result.failure)).not.toContain("private-fixture-token")
        }
        expect(paths).toEqual(["/config.json"])
      }
    )
  })
}

it.effect("rejects differing ordinary model reports rather than claiming consistent version evidence", () =>
  Effect.gen(function* () {
    const deployment = Schema.decodeUnknownSync(DeploymentVersionSchema)({
      VERSION: "0.7.409",
      MODEL_VERSION: "0.7.343"
    })
    const result = yield* Effect.result(makeServerVersionEvidence(deployment, WorkspaceVersion.make("0.7.342")))
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") expect(result.failure).toBeInstanceOf(FixtureBoundaryError)
    expect(
      Schema.decodeUnknownOption(ServerVersionEvidenceSchema)({
        deployment: { source: "/config.json", reportedRelease: "0.7.409", reportedModelVersion: "0.7.343" },
        workspace: { source: "huly workspace info get", reportedModelVersion: "0.7.342" },
        modelVersionsAgree: true,
        imageIdentity: "not-established-by-these-APIs"
      })._tag
    ).toBe("None")
  })
)
