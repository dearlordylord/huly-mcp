import { SdkError, SdkErrorCode } from "@modelcontextprotocol/client"
import { Schema } from "effect"
import { expect, it } from "vitest"

import { ModelWaitFailure, modelWaitFailure } from "./model-wait-failure.js"

it("retains an SDK timeout code without publishing its message or credential data", () => {
  const secret = "private-fixture-credential"
  const error = new SdkError(SdkErrorCode.RequestTimeout, secret, { token: secret })
  const result = modelWaitFailure("read", error)
  expect(result.code).toBe(SdkErrorCode.RequestTimeout)
  expect(Schema.encodeSync(Schema.fromJsonString(ModelWaitFailure))(result)).not.toContain(secret)
})

it("refuses arbitrary error codes at the diagnostic boundary", () => {
  const result = modelWaitFailure("driver", { code: "private-fixture-credential" })
  expect(result).toEqual({ stage: "driver", code: "UNCLASSIFIED" })
})
