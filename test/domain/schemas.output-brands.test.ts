import { describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { expect } from "vitest"

import {
  CreateWorkSlotResultSchema,
  CreateWorkspaceResultSchema,
  LogTimeResultSchema,
  StopTimerResultSchema,
  TimeSpendReportWireSchema,
  WorkSlotWireSchema,
  WorkspaceInfoSchema,
  WorkspaceMemberSchema
} from "../../src/domain/schemas.js"

describe("branded output schemas", () => {
  it.effect("keeps time output payloads JSON-compatible while validating branded IDs", () =>
    Effect.gen(function*() {
      const report = yield* Schema.decodeUnknown(TimeSpendReportWireSchema)({
        id: "report-1",
        identifier: "HULY-1",
        employee: "Alice",
        date: 1700000000000,
        value: 30,
        description: "Implementation"
      })
      const slot = yield* Schema.decodeUnknown(WorkSlotWireSchema)({
        id: "slot-1",
        todoId: "todo-1",
        date: 1700000000000,
        dueDate: 1700003600000,
        title: "Focus"
      })
      const logged = yield* Schema.decodeUnknown(LogTimeResultSchema)({
        reportId: "report-2",
        identifier: "HULY-2"
      })
      const createdSlot = yield* Schema.decodeUnknown(CreateWorkSlotResultSchema)({
        slotId: "slot-2"
      })
      const stopped = yield* Schema.decodeUnknown(StopTimerResultSchema)({
        identifier: "HULY-3",
        stoppedAt: 1700000000000,
        reportId: "report-3"
      })

      expect(report.id).toBe("report-1")
      expect(slot.id).toBe("slot-1")
      expect(logged.reportId).toBe("report-2")
      expect(createdSlot.slotId).toBe("slot-2")
      expect(stopped.reportId).toBe("report-3")
    }))

  it.effect("keeps workspace output payloads JSON-compatible while validating branded IDs", () =>
    Effect.gen(function*() {
      const member = yield* Schema.decodeUnknown(WorkspaceMemberSchema)({
        personId: "person-uuid-1",
        role: "OWNER",
        name: "Alice",
        email: "alice@example.test"
      })
      const workspace = yield* Schema.decodeUnknown(WorkspaceInfoSchema)({
        uuid: "workspace-uuid-1",
        name: "Product",
        url: "product",
        region: "us-east",
        createdOn: 1700000000000,
        allowReadOnlyGuest: true,
        allowGuestSignUp: false,
        version: "1.2.3",
        mode: "active"
      })
      const created = yield* Schema.decodeUnknown(CreateWorkspaceResultSchema)({
        uuid: "workspace-uuid-2",
        url: "new-product",
        name: "New Product"
      })

      expect(member.personId).toBe("person-uuid-1")
      expect(workspace.uuid).toBe("workspace-uuid-1")
      expect(workspace.region).toBe("us-east")
      expect(created.uuid).toBe("workspace-uuid-2")
      expect(created.url).toBe("new-product")
    }))
})
