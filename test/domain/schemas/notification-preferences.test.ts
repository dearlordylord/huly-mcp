import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { expect } from "vitest"

import {
  parseSubscribeToObjectNotificationsParams,
  parseUpdateNotificationTypeSettingParams
} from "../../../src/domain/schemas.js"

describe("notification preference schemas", () => {
  it.effect("parses notification type settings and object subscriptions", () =>
    Effect.gen(function*() {
      const typeSetting = yield* parseUpdateNotificationTypeSettingParams({
        providerId: "notification:providers:InboxNotificationProvider",
        typeId: "notification:type:IssueUpdate",
        enabled: false
      })
      const subscription = yield* parseSubscribeToObjectNotificationsParams({
        objectId: "issue-1",
        objectClass: "tracker:class:Issue"
      })

      expect(typeSetting.enabled).toBe(false)
      expect(subscription.objectId).toBe("issue-1")
    }))
})
