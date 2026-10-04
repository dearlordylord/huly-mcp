import { it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { expect } from "vitest"
import { WorkspaceVersion } from "../../src/domain/schemas/shared.js"
import { FixtureBoundaryError } from "../../scripts/issue-movement-concurrency/fixture-errors.js"
import {
  DeploymentVersionSchema,
  makeServerVersionEvidence,
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
